import { Hono } from "hono";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth, requireOwner } from "../middleware/auth";
import { debts, debtPayments, notifications, saleItems, auditLog } from "@workspace/db/schema";
import { kvDel, CK } from "../lib/cache";

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
  let itemsByHuman: Record<string, { productName: string; qty: number; unitPrice: number; totalPrice: number; totalProfit?: number | null }[]> = {};
  if (saleIds.length > 0) {
    const allItems = await db
      .select({
        saleId: saleItems.saleId,
        productName: saleItems.productName,
        qty: saleItems.qty,
        unitPrice: saleItems.unitPrice,
        totalPrice: saleItems.totalPrice,
        totalProfit: saleItems.totalProfit,
      })
      .from(saleItems)
      .where(inArray(saleItems.saleId, saleIds))
      .all();

    for (const item of allItems) {
      if (!item.saleId) continue;
      if (!itemsByHuman[item.saleId]) itemsByHuman[item.saleId] = [];
      itemsByHuman[item.saleId]!.push({
        productName: item.productName,
        qty: item.qty,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        totalProfit: item.totalProfit,
      });
    }
  }

  const result = rows.map(r => ({
    ...r,
    items: r.saleId ? (itemsByHuman[r.saleId] ?? []) : [],
  }));

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
  if (debt.shopId !== c.get("session").shopId) return c.json({ error: "Forbidden" }, 403);

  // Fetch sale items if this debt is linked to a sale
  let items: { productName: string; qty: number; unitPrice: number; totalPrice: number }[] = [];
  if (debt.saleId) {
    const rows = await db
      .select({
        productName: saleItems.productName,
        qty: saleItems.qty,
        unitPrice: saleItems.unitPrice,
        totalPrice: saleItems.totalPrice,
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
    note?: string | null;
  }>();
  const db = createDb(c.env.DB);
  const debtId = c.req.param("debtId");
  const debt = await db.select().from(debts).where(eq(debts.id, debtId)).get();
  if (!debt) return c.json({ error: "Not found" }, 404);
  if (debt.shopId !== c.get("session").shopId) return c.json({ error: "Forbidden" }, 403);
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: "Payment amount must be greater than zero" }, 400);
  }
  if (amount > debt.balance + 0.005) {
    return c.json({ error: "Payment cannot be greater than the remaining balance" }, 400);
  }

  const now = new Date().toISOString();
  const paymentId = crypto.randomUUID();
  await db.insert(debtPayments).values({
    id: paymentId,
    debtId,
    amount,
    recordedBy: body.recordedBy ?? c.get("session").userName ?? null,
    paidAt: now,
    paymentType: "payment",
    reversalOfId: null,
    note: body.note ?? null,
  });

  // Fully atomic — all four columns derive from the DB's current values plus the
  // payment delta, so concurrent payments cannot overwrite each other.
  await db
    .update(debts)
    .set({
      amountPaid: sql`amount_paid + ${amount}`,
      balance: sql`MAX(0, total_amount - amount_paid - ${amount})`,
      status: sql`CASE WHEN MAX(0, total_amount - amount_paid - ${amount}) = 0 THEN 'paid' WHEN amount_paid + ${amount} > 0 THEN 'partial' ELSE 'unpaid' END`,
      paidAt: sql`CASE WHEN MAX(0, total_amount - amount_paid - ${amount}) = 0 THEN ${now} ELSE NULL END`,
    })
    .where(eq(debts.id, debtId));

  // Re-read updated status to drive notification cleanup
  const updatedDebt = await db.select({ status: debts.status }).from(debts).where(eq(debts.id, debtId)).get();
  const newStatus = updatedDebt?.status;

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

// Corrections never delete financial history. Instead, an owner creates a
// linked reversal entry that restores the balance and leaves both events visible.
debtsRouter.post("/debts/:debtId/payments/:paymentId/reverse", requireAuth, requireOwner, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const debtId = c.req.param("debtId");
  const paymentId = c.req.param("paymentId");
  const body = await c.req.json<{ reason?: string }>().catch(() => ({} as { reason?: string }));

  const debt = await db.select().from(debts).where(eq(debts.id, debtId)).get();
  if (!debt) return c.json({ error: "Debt not found" }, 404);
  if (debt.shopId !== session.shopId) return c.json({ error: "Forbidden" }, 403);

  const original = await db.select().from(debtPayments)
    .where(and(eq(debtPayments.id, paymentId), eq(debtPayments.debtId, debtId)))
    .get();
  if (!original) return c.json({ error: "Payment not found" }, 404);
  if (original.paymentType === "reversal" || original.amount <= 0) {
    return c.json({ error: "Only an original payment can be reversed" }, 400);
  }
  const existingReversal = await db.select({ id: debtPayments.id })
    .from(debtPayments)
    .where(and(eq(debtPayments.debtId, debtId), eq(debtPayments.reversalOfId, paymentId)))
    .get();
  if (existingReversal) return c.json({ error: "This payment has already been reversed" }, 409);

  const now = new Date().toISOString();
  const reversalId = crypto.randomUUID();
  const reason = body.reason?.trim() || "Payment correction";
  await db.insert(debtPayments).values({
    id: reversalId,
    debtId,
    amount: -original.amount,
    recordedBy: session.userName ?? "Owner",
    paidAt: now,
    paymentType: "reversal",
    reversalOfId: original.id,
    note: reason,
  });

  await db.update(debts).set({
    amountPaid: sql`MAX(0, amount_paid - ${original.amount})`,
    balance: sql`MIN(total_amount, total_amount - MAX(0, amount_paid - ${original.amount}))`,
    status: sql`CASE WHEN MAX(0, amount_paid - ${original.amount}) = 0 THEN 'unpaid' WHEN MAX(0, amount_paid - ${original.amount}) >= total_amount THEN 'paid' ELSE 'partial' END`,
    paidAt: sql`CASE WHEN MAX(0, amount_paid - ${original.amount}) >= total_amount THEN paid_at ELSE NULL END`,
  }).where(eq(debts.id, debtId));

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    shopId: debt.shopId,
    action: "debt_payment_reversed",
    entityType: "debt_payment",
    entityId: original.id,
    oldValueJson: JSON.stringify({ amount: original.amount, debtId }),
    newValueJson: JSON.stringify({ reversalId, reason }),
    performedBy: session.userName ?? "Owner",
    createdAt: now,
  });

  const today = now.slice(0, 10);
  await kvDel(c.env.SESSIONS, CK.debts(debt.shopId), CK.dashboard(debt.shopId, today));
  const reversal = await db.select().from(debtPayments).where(eq(debtPayments.id, reversalId)).get();
  return c.json(reversal!, 201);
});

debtsRouter.delete("/debts/:debtId", requireOwner, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const debtId = c.req.param("debtId");

  const debt = await db.select().from(debts).where(eq(debts.id, debtId)).get();
  if (!debt) return c.json({ error: "Not found" }, 404);
  if (debt.shopId !== session.shopId) return c.json({ error: "Forbidden" }, 403);
  const paymentRows = await db
    .select({ id: debtPayments.id })
    .from(debtPayments)
    .where(eq(debtPayments.debtId, debtId))
    .all();
  if (debt.saleId || paymentRows.length > 0 || debt.amountPaid > 0) {
    return c.json({
      error: "This financial record cannot be deleted. Void the linked sale or reverse its payments instead.",
    }, 409);
  }

  // Delete associated notifications first
  await db.delete(notifications).where(eq(notifications.debtId, debtId));

  // Delete debt — cascade rule handles debt_payments rows
  await db.delete(debts).where(eq(debts.id, debtId));

  const today = new Date().toISOString().slice(0, 10);
  // Also bust the sales list cache for the day the linked sale occurred
  const saleDate = debt.createdAt?.slice(0, 10) ?? today;
  await kvDel(
    c.env.SESSIONS,
    CK.debts(debt.shopId),
    CK.dashboard(debt.shopId, today),
    `c:sales:${debt.shopId}:${saleDate}:100`,
    `c:sales:${debt.shopId}:${saleDate}:50`,
  );

  return c.json({ ok: true });
});

export default debtsRouter;
