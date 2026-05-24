import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { returns, returnItems, products, inventoryMovements, debts, auditLog } from "@workspace/db/schema";

const returnsRouter = new Hono<AppEnv>();

returnsRouter.get("/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const status = c.req.query("status");

  const rows = await db
    .select()
    .from(returns)
    .where(
      and(
        eq(returns.shopId, shopId),
        status ? eq(returns.status, status) : undefined,
      ),
    )
    .orderBy(desc(returns.createdAt))
    .limit(200)
    .all();

  const allReturnItems = await db.select().from(returnItems).all();
  const itemsByReturn: Record<string, typeof allReturnItems> = {};
  for (const item of allReturnItems) {
    if (!itemsByReturn[item.returnId]) itemsByReturn[item.returnId] = [];
    itemsByReturn[item.returnId].push(item);
  }

  return c.json(rows.map((r) => ({ ...r, items: itemsByReturn[r.id] ?? [] })));
});

returnsRouter.post("/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const body = await c.req.json<{
    originalSaleId?: string;
    customerName?: string;
    customerPhone?: string;
    reason: string;
    notes?: string;
    items: Array<{
      productId?: string;
      productName: string;
      qty: number;
      unitPrice: number;
      condition: "resaleable" | "damaged" | "expired";
    }>;
  }>();

  if (!body.reason?.trim()) return c.json({ error: "reason is required" }, 400);
  if (!body.items?.length) return c.json({ error: "at least one item required" }, 400);

  const VALID_REASONS = ["customer_complaint", "damaged", "wrong_item", "expired", "other"];
  if (!VALID_REASONS.includes(body.reason)) {
    return c.json({ error: `reason must be one of: ${VALID_REASONS.join(", ")}` }, 400);
  }

  for (const item of body.items) {
    if (!item.productName?.trim()) return c.json({ error: "each item needs a productName" }, 400);
    if (!item.qty || item.qty <= 0) return c.json({ error: "item qty must be positive" }, 400);
    if (item.unitPrice < 0) return c.json({ error: "item unitPrice cannot be negative" }, 400);
    if (!["resaleable", "damaged", "expired"].includes(item.condition)) {
      return c.json({ error: "item condition must be resaleable, damaged, or expired" }, 400);
    }
  }

  const now = new Date().toISOString();
  const returnId = crypto.randomUUID();

  // Generate return number: RET-YYYYMMDD-XXXX
  const datePart = now.slice(0, 10).replace(/-/g, "");
  const seq = Math.floor(1000 + Math.random() * 9000);
  const returnNumber = `RET-${datePart}-${seq}`;

  const totalRefund = body.items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  await db.insert(returns).values({
    id: returnId,
    shopId,
    returnNumber,
    originalSaleId: body.originalSaleId ?? null,
    customerName: body.customerName?.trim() ?? "",
    customerPhone: body.customerPhone?.trim() ?? "",
    totalRefund,
    status: "pending",
    reason: body.reason,
    notes: body.notes?.trim() ?? null,
    handledBy: null,
    handledAt: null,
    createdBy: session.role ?? "cashier",
    createdAt: now,
    updatedAt: now,
  });

  for (const item of body.items) {
    await db.insert(returnItems).values({
      id: crypto.randomUUID(),
      returnId,
      productId: item.productId ?? null,
      productName: item.productName.trim(),
      qty: item.qty,
      unitPrice: item.unitPrice,
      total: item.qty * item.unitPrice,
      condition: item.condition,
    });
  }

  const ret = await db.select().from(returns).where(eq(returns.id, returnId)).get();
  const items = await db.select().from(returnItems).where(eq(returnItems.returnId, returnId)).all();
  return c.json({ ...ret, items }, 201);
});

returnsRouter.get("/returns/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const id = c.req.param("id");

  const ret = await db
    .select()
    .from(returns)
    .where(and(eq(returns.id, id), eq(returns.shopId, shopId)))
    .get();
  if (!ret) return c.json({ error: "Not found" }, 404);

  const items = await db
    .select()
    .from(returnItems)
    .where(eq(returnItems.returnId, id))
    .all();

  return c.json({ ...ret, items });
});

// OWNER ONLY — approve a return
returnsRouter.patch("/returns/:id/approve", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");

  if (session.role !== "owner") return c.json({ error: "Owner only" }, 403);

  const shopId = session.shopId;
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const ret = await db
    .select()
    .from(returns)
    .where(and(eq(returns.id, id), eq(returns.shopId, shopId)))
    .get();
  if (!ret) return c.json({ error: "Not found" }, 404);
  if (ret.status !== "pending") {
    return c.json({ error: `Cannot approve a return with status '${ret.status}'` }, 409);
  }

  const items = await db
    .select()
    .from(returnItems)
    .where(eq(returnItems.returnId, id))
    .all();

  // ── Stock restoration for resaleable items ───────────────────────────────
  for (const item of items) {
    if (item.condition !== "resaleable") continue;
    if (!item.productId) continue;

    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, item.productId))
      .get();
    if (!product) continue;

    const beforeQty = product.stockQty ?? 0;
    const afterQty = beforeQty + item.qty;

    await db
      .update(products)
      .set({ stockQty: afterQty, updatedAt: now })
      .where(eq(products.id, item.productId));

    await db.insert(inventoryMovements).values({
      id: crypto.randomUUID(),
      productId: item.productId,
      productName: item.productName,
      movementType: "return",
      qtyChange: item.qty,
      beforeQty,
      afterQty,
      source: "return",
      referenceId: id,
      createdBy: session.role ?? "owner",
      createdAt: now,
    });
  }

  // ── If linked to a debt sale — reduce the debt balance ───────────────────
  if (ret.originalSaleId) {
    const linkedDebt = await db
      .select()
      .from(debts)
      .where(
        and(
          eq(debts.saleId, ret.originalSaleId),
          eq(debts.shopId, shopId),
        ),
      )
      .get();

    if (linkedDebt && linkedDebt.balance > 0) {
      const deduction = Math.min(ret.totalRefund, linkedDebt.balance);
      const newBalance = Math.max(0, linkedDebt.balance - deduction);
      const newPaid = linkedDebt.amountPaid + deduction;
      const newStatus =
        newBalance === 0 ? "paid" : newPaid > 0 ? "partial" : "unpaid";
      await db
        .update(debts)
        .set({
          balance: newBalance,
          amountPaid: newPaid,
          status: newStatus as "paid" | "partial" | "unpaid",
          paidAt: newBalance === 0 ? now : null,
        })
        .where(eq(debts.id, linkedDebt.id));
    }
  }

  // ── Mark return as approved ───────────────────────────────────────────────
  await db
    .update(returns)
    .set({
      status: "approved",
      handledBy: session.role ?? "owner",
      handledAt: now,
      updatedAt: now,
    })
    .where(eq(returns.id, id));

  // ── Audit log ─────────────────────────────────────────────────────────────
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    shopId,
    action: "return_approved",
    entityType: "return",
    entityId: id,
    oldValueJson: JSON.stringify({ status: "pending" }),
    newValueJson: JSON.stringify({ status: "approved", totalRefund: ret.totalRefund }),
    performedBy: session.role ?? "owner",
    createdAt: now,
  });

  const updated = await db.select().from(returns).where(eq(returns.id, id)).get();
  const updatedItems = await db.select().from(returnItems).where(eq(returnItems.returnId, id)).all();
  return c.json({ ...updated, items: updatedItems });
});

// OWNER ONLY — reject a return
returnsRouter.patch("/returns/:id/reject", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");

  if (session.role !== "owner") return c.json({ error: "Owner only" }, 403);

  const shopId = session.shopId;
  const id = c.req.param("id");
  const now = new Date().toISOString();
  const body = await c.req.json<{ notes?: string }>().catch(() => ({}));

  const ret = await db
    .select()
    .from(returns)
    .where(and(eq(returns.id, id), eq(returns.shopId, shopId)))
    .get();
  if (!ret) return c.json({ error: "Not found" }, 404);
  if (ret.status !== "pending") {
    return c.json({ error: `Cannot reject a return with status '${ret.status}'` }, 409);
  }

  await db
    .update(returns)
    .set({
      status: "rejected",
      handledBy: session.role ?? "owner",
      handledAt: now,
      notes: body.notes?.trim() ?? ret.notes,
      updatedAt: now,
    })
    .where(eq(returns.id, id));

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    shopId,
    action: "return_rejected",
    entityType: "return",
    entityId: id,
    oldValueJson: JSON.stringify({ status: "pending" }),
    newValueJson: JSON.stringify({ status: "rejected" }),
    performedBy: session.role ?? "owner",
    createdAt: now,
  });

  const updated = await db.select().from(returns).where(eq(returns.id, id)).get();
  const items = await db.select().from(returnItems).where(eq(returnItems.returnId, id)).all();
  return c.json({ ...updated, items });
});

export default returnsRouter;
