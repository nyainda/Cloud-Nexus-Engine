import { Hono } from "hono";
import { eq, and, inArray } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { debts, debtPayments, notifications, saleItems } from "@workspace/db/schema";
import { kvGet, kvSet, kvDel, CK, CACHE_TTL } from "../lib/cache";

const debtsRouter = new Hono<AppEnv>();

// ─── Customer autocomplete — distinct names/phones from debts ─────────────────
debtsRouter.get("/customers", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const q = (c.req.query("q") ?? "").toLowerCase().trim();

  const rows = await db
    .select({ customerName: debts.customerName, customerPhone: debts.customerPhone })
    .from(debts)
    .where(shopId ? eq(debts.shopId, shopId) : undefined)
    .all();

  // Deduplicate by lowercased name
  const seen = new Set<string>();
  const unique = rows.filter(r => {
    const key = r.customerName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const filtered = q
    ? unique.filter(r =>
        r.customerName.toLowerCase().includes(q) ||
        (r.customerPhone ?? "").includes(q)
      )
    : unique;

  return c.json(filtered.slice(0, 12));
});

debtsRouter.get("/debts", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const status = c.req.query("status");
  const q = c.req.query("q");

  // Cache the full unfiltered list per shop — status/search filters are applied in-memory below
  if (shopId && !status && !q) {
    const cached = await kvGet<object[]>(c.env.SESSIONS, CK.debts(shopId));
    if (cached) return c.json(cached);
  }

  let rows = await db
    .select()
    .from(debts)
    .where(
      and(
        shopId ? eq(debts.shopId, shopId) : undefined,
        status ? eq(debts.status, status as "unpaid" | "partial" | "paid") : undefined,
      ),
    )
    .all();

  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(
      (d) =>
        d.customerName.toLowerCase().includes(lower) ||
        d.customerPhone.includes(q),
    );
  }

  // Batch-fetch sale items for all debts that have a saleId — single query, no N+1
  const saleIds = rows.map(r => r.saleId).filter((id): id is string => !!id);
  let itemsByHuman: Record<string, { productName: string; quantity: number; unitPrice: number; totalPrice: number; discount?: number | null }[]> = {};
  if (saleIds.length > 0) {
    const allItems = await db
      .select({
        saleId: saleItems.saleId,
        productName: saleItems.productName,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        totalPrice: saleItems.totalPrice,
        discount: saleItems.discount,
      })
      .from(saleItems)
      .where(inArray(saleItems.saleId, saleIds))
      .all();

    for (const item of allItems) {
      if (!item.saleId) continue;
      if (!itemsByHuman[item.saleId]) itemsByHuman[item.saleId] = [];
      itemsByHuman[item.saleId].push({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        discount: item.discount,
      });
    }
  }

  const result = rows.map(r => ({
    ...r,
    items: r.saleId ? (itemsByHuman[r.saleId] ?? []) : [],
  }));

  // Write the unfiltered full list to KV so subsequent reads are instant
  if (shopId && !status && !q) {
    await kvSet(c.env.SESSIONS, CK.debts(shopId), result, CACHE_TTL.debts);
  }

  return c.json(result);
});

debtsRouter.post("/debts", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    saleId?: string;
    customerName: string;
    customerPhone: string;
    totalAmount: number;
    notes?: string;
  }>();
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(debts).values({
    id,
    shopId: body.shopId,
    saleId: body.saleId ?? null,
    customerName: body.customerName,
    customerPhone: body.customerPhone,
    totalAmount: body.totalAmount,
    amountPaid: 0,
    balance: body.totalAmount,
    status: "unpaid",
    notes: body.notes ?? null,
    paidAt: null,
    createdAt: now,
  });
  const debt = await db.select().from(debts).where(eq(debts.id, id)).get();
  const today = new Date().toISOString().slice(0, 10);
  await kvDel(c.env.SESSIONS, CK.debts(body.shopId), CK.dashboard(body.shopId, today));
  return c.json(debt!, 201);
});

debtsRouter.get("/debts/:debtId", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const debtId = c.req.param("debtId");
  const [debt, payments] = await Promise.all([
    db.select().from(debts).where(eq(debts.id, debtId)).get(),
    db.select().from(debtPayments).where(eq(debtPayments.debtId, debtId)).all(),
  ]);
  if (!debt) return c.json({ error: "Not found" }, 404);

  // Fetch sale items if this debt is linked to a sale
  let items: { productName: string; quantity: number; unitPrice: number; totalPrice: number; discount?: number | null }[] = [];
  if (debt.saleId) {
    const rows = await db
      .select({
        productName: saleItems.productName,
        quantity: saleItems.quantity,
        unitPrice: saleItems.unitPrice,
        totalPrice: saleItems.totalPrice,
        discount: saleItems.discount,
      })
      .from(saleItems)
      .where(eq(saleItems.saleId, debt.saleId))
      .all();
    items = rows;
  }

  return c.json({ ...debt, payments, items });
});

debtsRouter.patch("/debts/:debtId", requireAuth, async (c) => {
  const body = await c.req.json<{
    notes?: string;
    customerName?: string;
    customerPhone?: string;
    status?: "unpaid" | "partial" | "paid";
  }>();
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const debtRecord = await db.select({ shopId: debts.shopId }).from(debts).where(eq(debts.id, c.req.param("debtId"))).get();
  if (!debtRecord) return c.json({ error: "Not found" }, 404);
  if (debtRecord.shopId !== session.shopId) return c.json({ error: "Forbidden" }, 403);
  const patch: Partial<typeof debts.$inferInsert> = {};
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.customerName) patch.customerName = body.customerName;
  if (body.customerPhone) patch.customerPhone = body.customerPhone;
  if (body.status && ["unpaid", "partial", "paid"].includes(body.status)) {
    patch.status = body.status;
    patch.paidAt = body.status === "paid" ? new Date().toISOString() : null;
  }
  if (Object.keys(patch).length === 0) return c.json({ error: "No fields to update" }, 400);
  await db.update(debts).set(patch).where(eq(debts.id, c.req.param("debtId")));
  const debt = await db
    .select()
    .from(debts)
    .where(eq(debts.id, c.req.param("debtId")))
    .get();
  if (!debt) return c.json({ error: "Not found" }, 404);
  const today = new Date().toISOString().slice(0, 10);
  await kvDel(c.env.SESSIONS, CK.debts(debtRecord.shopId), CK.dashboard(debtRecord.shopId, today));
  return c.json(debt);
});

debtsRouter.post("/debts/:debtId/payments", requireAuth, async (c) => {
  const body = await c.req.json<{
    amount: number;
    recordedBy?: string;
  }>();
  const db = createDb(c.env.DB);
  const debtId = c.req.param("debtId");
  const debt = await db.select().from(debts).where(eq(debts.id, debtId)).get();
  if (!debt) return c.json({ error: "Not found" }, 404);

  const now = new Date().toISOString();
  const paymentId = crypto.randomUUID();
  await db.insert(debtPayments).values({
    id: paymentId,
    debtId,
    amount: body.amount,
    recordedBy: body.recordedBy ?? null,
    paidAt: now,
  });

  const newAmountPaid = debt.amountPaid + body.amount;
  const newBalance = Math.max(0, debt.totalAmount - newAmountPaid);
  const newStatus: "unpaid" | "partial" | "paid" =
    newBalance === 0 ? "paid" : newAmountPaid > 0 ? "partial" : "unpaid";

  await db
    .update(debts)
    .set({
      amountPaid: newAmountPaid,
      balance: newBalance,
      status: newStatus,
      paidAt: newStatus === "paid" ? now : null,
    })
    .where(eq(debts.id, debtId));

  if (newStatus === "paid") {
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.debtId, debtId),
          eq(notifications.type, "debt_reminder"),
        ),
      );
  }

  const today = new Date().toISOString().slice(0, 10);
  await kvDel(c.env.SESSIONS, CK.debts(debt.shopId), CK.dashboard(debt.shopId, today));

  const payment = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.id, paymentId))
    .get();
  return c.json(payment!, 201);
});

debtsRouter.delete("/debts/:debtId", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const debtId = c.req.param("debtId");

  const debt = await db.select().from(debts).where(eq(debts.id, debtId)).get();
  if (!debt) return c.json({ error: "Not found" }, 404);
  if (debt.shopId !== session.shopId) return c.json({ error: "Forbidden" }, 403);

  // Delete associated notifications first
  await db.delete(notifications).where(eq(notifications.debtId, debtId));

  // Delete debt — cascade rule handles debt_payments rows
  await db.delete(debts).where(eq(debts.id, debtId));

  const today = new Date().toISOString().slice(0, 10);
  await kvDel(c.env.SESSIONS, CK.debts(debt.shopId), CK.dashboard(debt.shopId, today));

  return c.json({ ok: true });
});

export default debtsRouter;
