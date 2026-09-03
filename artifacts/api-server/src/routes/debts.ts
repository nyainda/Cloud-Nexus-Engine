import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { eq, and, inArray, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth, requireOwner } from "../middleware/auth";
import { debts, debtPayments, notifications, saleItems, auditLog } from "@workspace/db/schema";
import { kvDel, CK } from "../lib/cache";
import { normalizeCustomerName } from "../lib/normalize";

const debtsRouter = new Hono<AppEnv>();

type DebtItem = {
  productName: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
};

function parseDebtItems(itemsJson: string | null | undefined): DebtItem[] | null {
  if (itemsJson == null) return null;
  try {
    const parsed = JSON.parse(itemsJson);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map((item): DebtItem | null => {
        const productName = String(item?.productName ?? "").trim();
        const qty = Number(item?.qty);
        const unitPrice = Number(item?.unitPrice);
        const totalPrice = Number(item?.totalPrice);
        if (!productName || !Number.isFinite(qty) || !Number.isFinite(unitPrice) || !Number.isFinite(totalPrice)) {
          return null;
        }
        return { productName, qty, unitPrice, totalPrice };
      })
      .filter((item): item is DebtItem => item !== null);
  } catch {
    return null;
  }
}

async function loadDebtItems(db: ReturnType<typeof createDb>, debt: typeof debts.$inferSelect): Promise<DebtItem[]> {
  const savedItems = parseDebtItems(debt.itemsJson);
  if (savedItems !== null) return savedItems;
  if (!debt.saleId) return [];

  return db
    .select({
      productName: saleItems.productName,
      qty: saleItems.qty,
      unitPrice: saleItems.unitPrice,
      totalPrice: saleItems.totalPrice,
    })
    .from(saleItems)
    .where(eq(saleItems.saleId, debt.saleId))
    .all();
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

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
    items: parseDebtItems(r.itemsJson) ?? (r.saleId ? (itemsByHuman[r.saleId] ?? []) : []),
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
    customerName: normalizeCustomerName(body.customerName),
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

  const items = await loadDebtItems(db, debt);

  return c.json({ ...debt, payments, items });
});

// Move selected unpaid item quantities to a new customer while keeping the
// original debt date, prices, and payment history. This is one D1 batch so the
// source and receiving records cannot get out of sync.
debtsRouter.post("/debts/:debtId/transfer", requireAuth, requireOwner, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const debtId = c.req.param("debtId");
  const body = await c.req.json<{
    shopId?: string;
    customerName?: string;
    customerPhone?: string;
    items?: Array<{ itemIndex?: number; qty?: number }>;
    operationId?: string;
  }>().catch(() => ({})) as {
    shopId?: string;
    customerName?: string;
    customerPhone?: string;
    items?: Array<{ itemIndex?: number; qty?: number }>;
    operationId?: string;
  };

  if (body.shopId && body.shopId !== session.shopId) {
    return c.json({ error: "Shop mismatch" }, 403);
  }

  const customerName = body.customerName?.trim()
    ? normalizeCustomerName(body.customerName)
    : "";
  const customerPhone = body.customerPhone?.trim() ?? "";
  if (!customerName) return c.json({ error: "Receiving customer name is required" }, 400);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return c.json({ error: "Select at least one item to move" }, 400);
  }

  const source = await db
    .select()
    .from(debts)
    .where(and(eq(debts.id, debtId), eq(debts.shopId, session.shopId)))
    .get();
  if (!source) return c.json({ error: "Debt not found" }, 404);

  const operationId = body.operationId?.trim() || crypto.randomUUID();
  if (!/^[0-9a-f-]{20,}$/i.test(operationId)) {
    return c.json({ error: "Invalid operation id" }, 400);
  }

  // The operation id is also the receiving debt id. A client retry therefore
  // returns the already-created record instead of creating a duplicate,
  // including when the first operation settled the source balance completely.
  const existingTarget = await db.select().from(debts).where(eq(debts.id, operationId)).get();
  if (existingTarget) {
    if (existingTarget.shopId !== session.shopId) return c.json({ error: "Operation already exists" }, 409);
    return c.json({
      sourceDebtId: debtId,
      targetDebt: { ...existingTarget, items: parseDebtItems(existingTarget.itemsJson) ?? [] },
      alreadyApplied: true,
    });
  }

  if (source.status === "cancelled") return c.json({ error: "Cancelled debts cannot be moved" }, 409);
  if (Number(source.balance) <= 0) return c.json({ error: "This debt has no outstanding balance to move" }, 409);

  const sourceItems = await loadDebtItems(db, source);
  if (sourceItems.length === 0) {
    return c.json({ error: "This debt has no item details to move" }, 409);
  }

  const selections = new Map<number, number>();
  for (const selection of body.items) {
    const itemIndex = Number(selection.itemIndex);
    const qty = Number(selection.qty);
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= sourceItems.length) {
      return c.json({ error: "Invalid item selection" }, 400);
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      return c.json({ error: "Selected quantities must be greater than zero" }, 400);
    }
    selections.set(itemIndex, money((selections.get(itemIndex) ?? 0) + qty));
  }

  const movedItems: DebtItem[] = [];
  const remainingItems: DebtItem[] = [];
  let movedTotal = 0;
  for (let i = 0; i < sourceItems.length; i++) {
    const item = sourceItems[i]!;
    const movedQty = selections.get(i) ?? 0;
    if (movedQty > item.qty) {
      return c.json({ error: `Cannot move more than the available quantity of ${item.productName}` }, 400);
    }
    const movedLineTotal = money(movedQty * item.unitPrice);
    const remainingQty = money(item.qty - movedQty);
    if (movedQty > 0) {
      movedItems.push({
        productName: item.productName,
        qty: movedQty,
        unitPrice: item.unitPrice,
        totalPrice: movedLineTotal,
      });
      movedTotal = money(movedTotal + movedLineTotal);
    }
    if (remainingQty > 0) {
      remainingItems.push({
        productName: item.productName,
        qty: remainingQty,
        unitPrice: item.unitPrice,
        totalPrice: money(remainingQty * item.unitPrice),
      });
    }
  }

  if (movedItems.length === 0 || movedTotal <= 0) {
    return c.json({ error: "Select a quantity greater than zero" }, 400);
  }
  if (movedTotal > Number(source.balance) + 0.01) {
    return c.json({
      error: `You can move up to ${money(Number(source.balance))} of this debt's outstanding balance`,
    }, 400);
  }

  const now = new Date().toISOString();
  const remainingTotal = money(Math.max(0, Number(source.totalAmount) - movedTotal));
  const remainingBalance = money(Math.max(0, Number(source.balance) - movedTotal));
  const remainingPaid = money(Number(source.amountPaid));
  const sourceIsSettled = remainingBalance <= 0.01;
  const sourceStatus = sourceIsSettled ? "paid" : remainingPaid > 0 ? "partial" : "unpaid";
  const targetDebt = {
    id: operationId,
    shopId: session.shopId,
    // This is a new debt ownership record, not a second sale entry.
    saleId: null,
    customerName,
    customerPhone,
    totalAmount: movedTotal,
    amountPaid: 0,
    balance: movedTotal,
    status: "unpaid",
    notes: source.notes ?? null,
    createdAt: source.createdAt,
    paidAt: null,
    itemsJson: JSON.stringify(movedItems),
  } as const;

  const auditPayload = {
    operationId,
    sourceDebtId: debtId,
    targetDebtId: operationId,
    movedItems,
    movedTotal,
    originalCreatedAt: source.createdAt,
    receivingCustomerName: customerName,
    receivingCustomerPhone: customerPhone,
  };

  await db.batch([
    db.update(debts)
      .set({
        totalAmount: remainingTotal,
        amountPaid: remainingPaid,
        balance: remainingBalance,
        status: sourceStatus,
        paidAt: sourceIsSettled ? now : source.paidAt,
        itemsJson: JSON.stringify(remainingItems),
      })
      .where(and(eq(debts.id, debtId), eq(debts.shopId, session.shopId))),
    db.insert(debts).values(targetDebt),
    db.insert(auditLog).values({
      id: crypto.randomUUID(),
      shopId: session.shopId,
      action: "debt_items_transferred",
      entityType: "debt",
      entityId: debtId,
      performedBy: session.role,
      oldValueJson: JSON.stringify({
        customerName: source.customerName,
        customerPhone: source.customerPhone,
        totalAmount: source.totalAmount,
        balance: source.balance,
        items: sourceItems,
      }),
      newValueJson: JSON.stringify(auditPayload),
      createdAt: now,
    }),
    db.insert(auditLog).values({
      id: crypto.randomUUID(),
      shopId: session.shopId,
      action: "debt_items_received",
      entityType: "debt",
      entityId: operationId,
      performedBy: session.role,
      oldValueJson: null,
      newValueJson: JSON.stringify(auditPayload),
      createdAt: now,
    }),
  ]);

  await kvDel(c.env.SESSIONS, CK.debts(session.shopId));
  return c.json({
    sourceDebtId: debtId,
    targetDebt: { ...targetDebt, items: movedItems },
    sourceDebt: {
      ...source,
      totalAmount: remainingTotal,
      amountPaid: remainingPaid,
      balance: remainingBalance,
      status: sourceStatus,
      paidAt: sourceIsSettled ? now : source.paidAt,
      items: remainingItems,
    },
  }, 201);
});

debtsRouter.patch("/debts/:debtId", requireAuth, async (c) => {
  const body = await c.req.json<{
    notes?: string;
    customerName?: string;
    customerPhone?: string;
    status?: "unpaid" | "partial" | "paid";
    items?: { productName: string; qty: number; unitPrice: number }[];
  }>();
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const debtRecord = await db.select().from(debts).where(eq(debts.id, c.req.param("debtId"))).get();
  if (!debtRecord) return c.json({ error: "Not found" }, 404);
  if (debtRecord.shopId !== session.shopId) return c.json({ error: "Forbidden" }, 403);
  const patch: Partial<typeof debts.$inferInsert> = {};
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.customerName) patch.customerName = normalizeCustomerName(body.customerName);
  if (body.customerPhone) patch.customerPhone = body.customerPhone;
  if (body.status && ["unpaid", "partial", "paid"].includes(body.status)) {
    patch.status = body.status;
    patch.paidAt = body.status === "paid" ? new Date().toISOString() : null;
  }
  let priceEditAudit: { oldItems: DebtItem[]; newItems: DebtItem[]; oldTotal: number; newTotal: number } | null = null;
  if (body.items !== undefined) {
    if (session.role !== "owner") return c.json({ error: "Owner access required to edit debt item prices" }, 403);
    if (debtRecord.status === "cancelled") return c.json({ error: "Voided debt records cannot be edited" }, 409);
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return c.json({ error: "At least one debt item is required" }, 400);
    }

    const newItems: DebtItem[] = [];
    for (const item of body.items) {
      const productName = String(item?.productName ?? "").trim();
      const qty = Number(item?.qty);
      const unitPrice = Number(item?.unitPrice);
      if (!productName || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return c.json({ error: "Each debt item needs a valid name, quantity, and non-negative price" }, 400);
      }
      newItems.push({
        productName,
        qty,
        unitPrice: money(unitPrice),
        totalPrice: money(qty * unitPrice),
      });
    }

    const paymentRows = await db
      .select({ amount: debtPayments.amount })
      .from(debtPayments)
      .where(eq(debtPayments.debtId, debtRecord.id))
      .all();
    const amountPaid = money(Math.max(0, paymentRows.reduce((sum, payment) => sum + Number(payment.amount || 0), 0)));
    const totalAmount = money(newItems.reduce((sum, item) => sum + item.totalPrice, 0));
    if (totalAmount + 0.005 < amountPaid) {
      return c.json({
        error: `The new total cannot be less than payments already recorded (${amountPaid.toFixed(2)})`,
      }, 400);
    }

    const oldItems = (await loadDebtItems(db, debtRecord)) ?? [];
    const balance = money(Math.max(0, totalAmount - amountPaid));
    const status = totalAmount > 0 && amountPaid >= totalAmount - 0.005
      ? "paid"
      : amountPaid > 0
      ? "partial"
      : "unpaid";
    patch.itemsJson = JSON.stringify(newItems);
    patch.totalAmount = totalAmount;
    patch.amountPaid = amountPaid;
    patch.balance = balance;
    patch.status = status;
    patch.paidAt = status === "paid" ? debtRecord.paidAt ?? new Date().toISOString() : null;
    priceEditAudit = {
      oldItems,
      newItems,
      oldTotal: debtRecord.totalAmount,
      newTotal: totalAmount,
    };
  }
  if (Object.keys(patch).length === 0) return c.json({ error: "No fields to update" }, 400);
  await db.update(debts).set(patch).where(eq(debts.id, c.req.param("debtId")));
  const debt = await db
    .select()
    .from(debts)
    .where(eq(debts.id, c.req.param("debtId")))
    .get();
  if (!debt) return c.json({ error: "Not found" }, 404);
  if (priceEditAudit) {
    const now = new Date().toISOString();
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      shopId: debt.shopId,
      action: "debt_items_updated",
      entityType: "debt",
      entityId: debt.id,
      oldValueJson: JSON.stringify({
        totalAmount: priceEditAudit.oldTotal,
        items: priceEditAudit.oldItems,
      }),
      newValueJson: JSON.stringify({
        totalAmount: priceEditAudit.newTotal,
        items: priceEditAudit.newItems,
      }),
      performedBy: session.userName ?? "Owner",
      createdAt: now,
    });
  }
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
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return c.json({ error: "Payment amount must be greater than zero" }, 400);
  }
  const session = c.get("session");

  // NOTE: Cloudflare D1 does not support interactive SQL transactions
  // (BEGIN/COMMIT/SAVEPOINT) over the Workers binding — only single
  // statements or the batch() API. drizzle-orm/d1's db.transaction()
  // sends a raw "begin" statement, which D1 rejects, surfacing as
  // "Failed query: begin". (Local `wrangler dev` uses a real SQLite
  // engine that *does* support BEGIN, which is why this can appear to
  // work in dev and then 500 in production.) See:
  // https://github.com/drizzle-team/drizzle-orm/issues/758
  //
  // Instead, we get the same race-condition protection the old code's
  // comment describes by making the balance check part of the UPDATE's
  // WHERE clause itself. A single UPDATE statement is atomic on D1, so
  // two concurrent "Mark Paid" requests can no longer both succeed
  // against the same stale balance — the second one's WHERE clause will
  // simply match zero rows once the first has applied.
  const debtBefore = await db.select().from(debts).where(eq(debts.id, debtId)).get();
  if (!debtBefore) throw new HTTPException(404, { message: "Not found" });
  if (debtBefore.shopId !== session.shopId) throw new HTTPException(403, { message: "Forbidden" });
  if (amount > debtBefore.balance + 0.005) {
    throw new HTTPException(400, { message: "Payment cannot be greater than the remaining balance" });
  }

  const now = new Date().toISOString();

  const updateResult = await db
    .update(debts)
    .set({
      amountPaid: sql`amount_paid + ${amount}`,
      balance: sql`MAX(0, total_amount - amount_paid - ${amount})`,
      status: sql`CASE WHEN MAX(0, total_amount - amount_paid - ${amount}) = 0 THEN 'paid' WHEN amount_paid + ${amount} > 0 THEN 'partial' ELSE 'unpaid' END`,
      paidAt: sql`CASE WHEN MAX(0, total_amount - amount_paid - ${amount}) = 0 THEN ${now} ELSE NULL END`,
    })
    .where(
      and(
        eq(debts.id, debtId),
        sql`${amount} <= (total_amount - amount_paid) + 0.005`,
      ),
    )
    .run();

  const rowsChanged = (updateResult as unknown as { meta?: { changes?: number } }).meta?.changes ?? 0;
  if (rowsChanged === 0) {
    // Lost the race to a concurrent payment/reversal, or balance moved
    // between the read above and this write.
    throw new HTTPException(409, { message: "Balance changed — please refresh and try again" });
  }

  const paymentId = crypto.randomUUID();
  await db.insert(debtPayments).values({
    id: paymentId,
    debtId,
    amount,
    recordedBy: body.recordedBy ?? session.userName ?? null,
    paidAt: now,
    paymentType: "payment",
    reversalOfId: null,
    note: body.note ?? null,
  });

  const updatedDebt = await db
    .select({ status: debts.status, shopId: debts.shopId })
    .from(debts)
    .where(eq(debts.id, debtId))
    .get();
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

  const payment = await db
    .select()
    .from(debtPayments)
    .where(eq(debtPayments.id, paymentId))
    .get();

  const today = now.slice(0, 10);
  await kvDel(c.env.SESSIONS, CK.debts(debtBefore.shopId), CK.dashboard(debtBefore.shopId, today));

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
