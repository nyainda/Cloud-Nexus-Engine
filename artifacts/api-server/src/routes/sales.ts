import { Hono } from "hono";
import { eq, and, gte, lte, sql, inArray } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { sales, saleItems, products, debts, debtPayments, inventoryMovements, notifications, saleReturns, auditLog } from "@workspace/db/schema";
import { kvDel, CK } from "../lib/cache";
import { normalizeCustomerName } from "../lib/normalize";
import { allocateCredit, getCustomerCreditSources } from "../lib/debt-credit";
import { chunk } from "../lib/chunk";

const salesRouter = new Hono<AppEnv>();

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

salesRouter.get("/sales", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);
  const limit = parseInt(c.req.query("limit") ?? "50");
  const offset = parseInt(c.req.query("offset") ?? "0");
  const includeVoided = c.req.query("includeVoided") === "true";

  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  const rows = await db
    .select()
    .from(sales)
    .where(
      and(
        shopId ? eq(sales.shopId, shopId) : undefined,
        includeVoided ? undefined : eq(sales.isDeleted, false),
        gte(sales.createdAt, startOfDay),
        lte(sales.createdAt, endOfDay),
      ),
    )
    .limit(limit)
    .offset(offset)
    .orderBy(sql`created_at DESC`)
    .all();

  // Batch-fetch all sale items for this page in one query — embed in each sale
  let result: any[] = rows;
  if (rows.length > 0) {
    const saleIds = rows.map(r => r.id);
    const saleIdChunks = chunk(saleIds);

    const [itemChunks, debtChunks] = await Promise.all([
      Promise.all(
        saleIdChunks.map(ids =>
          db
            .select({
              saleId: saleItems.saleId,
              productId: saleItems.productId,
              productName: saleItems.productName,
              qty: saleItems.qty,
              unitPrice: saleItems.unitPrice,
              unitCost: saleItems.unitCost,
              totalPrice: saleItems.totalPrice,
              totalProfit: saleItems.totalProfit,
            })
            .from(saleItems)
            .where(inArray(saleItems.saleId, ids))
            .all(),
        ),
      ),
      Promise.all(
        saleIdChunks.map(ids =>
          db
            .select({
              saleId: debts.saleId,
              customerName: debts.customerName,
              customerPhone: debts.customerPhone,
            })
            .from(debts)
            .where(inArray(debts.saleId, ids))
            .all(),
        ),
      ),
    ]);

    const allItems = itemChunks.flat();
    const linkedDebts = debtChunks.flat();

    const itemsBySaleId: Record<string, any[]> = {};
    for (const item of allItems) {
      if (!item.saleId) continue;
      if (!itemsBySaleId[item.saleId]) itemsBySaleId[item.saleId] = [];
      itemsBySaleId[item.saleId]!.push(item);
    }
    const debtBySaleId: Record<string, {
      customerName: string;
      customerPhone: string;
    }> = {};
    for (const debt of linkedDebts) {
      if (!debt.saleId) continue;
      debtBySaleId[debt.saleId] = {
        customerName: debt.customerName,
        customerPhone: debt.customerPhone,
      };
    }
    result = rows.map(r => ({
      ...r,
      items: itemsBySaleId[r.id] ?? [],
      ...(debtBySaleId[r.id]
        ? {
            debtCustomerName: debtBySaleId[r.id]!.customerName,
            debtCustomerPhone: debtBySaleId[r.id]!.customerPhone,
          }
        : {}),
    }));
  }

  return c.json(result);
});

salesRouter.post("/sales", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    saleType: "cash" | "debt";
    paymentMethod?: "cash" | "bank";
    servedBy?: string;
    discount?: number;
    discountOverrideBy?: string;
    items: Array<{
      productId: string;
      qty: number;
      unitPrice: number;
      discount?: number;
    }>;
    debtCustomerName?: string;
    debtCustomerPhone?: string;
  }>();

  // A debt sale without a customer cannot be reconciled later: it would appear
  // in sales history but never be discoverable in the debt ledger or CRM.
  // Reject it before writing the sale so those two records cannot drift apart.
  const debtCustomerName = body.debtCustomerName?.trim()
    ? normalizeCustomerName(body.debtCustomerName)
    : undefined;
  if (body.saleType === "debt" && !debtCustomerName) {
    return c.json({ error: "Customer name is required for debt sales" }, 400);
  }

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const saleId = crypto.randomUUID();

  let totalAmount = 0;
  let totalCost = 0;
  let totalProfit = 0;
  const lineItems: Array<{
    id: string;
    saleId: string;
    productId: string | null;
    productName: string;
    qty: number;
    unitPrice: number;
    unitCost: number | null;
    unitProfit: number | null;
    totalPrice: number;
    totalProfit: number | null;
  }> = [];

  // Collect products during the first loop — reused in the stock-deduction loop
  // to eliminate the N+1 re-fetch (one DB hit per item instead of two).
  const productMap = new Map<string, typeof products.$inferSelect>();

  for (const item of body.items) {
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, item.productId))
      .get();
    if (product) productMap.set(item.productId, product);

    const lineTotal = item.unitPrice * item.qty;
    const unitCost = product?.purchasePrice ?? null;
    const unitProfit = unitCost !== null ? item.unitPrice - unitCost : null;
    const lineProfit = unitProfit !== null ? unitProfit * item.qty : null;

    totalAmount += lineTotal;
    if (unitCost !== null) totalCost += unitCost * item.qty;
    if (lineProfit !== null) totalProfit += lineProfit;

    lineItems.push({
      id: crypto.randomUUID(),
      saleId,
      productId: item.productId,
      productName: product?.canonicalName ?? item.productId,
      qty: item.qty,
      unitPrice: item.unitPrice,
      unitCost,
      unitProfit,
      totalPrice: lineTotal,
      totalProfit: lineProfit,
    });
  }

  const discount = body.discount ?? 0;
  totalAmount = Math.max(0, totalAmount - discount);

  const creditSources = debtCustomerName
    ? await getCustomerCreditSources(db, body.shopId, debtCustomerName)
    : [];
  const creditAllocations = allocateCredit(creditSources, totalAmount);
  const creditApplied = money(creditAllocations.reduce((sum, allocation) => sum + allocation.amount, 0));
  const newDebtBalance = money(totalAmount - creditApplied);
  const newDebtStatus = newDebtBalance <= 0.005
    ? "paid"
    : creditApplied > 0
    ? "partial"
    : "unpaid";
  const debtPaymentId = creditApplied > 0 ? crypto.randomUUID() : null;

  const saleValues = {
    id: saleId,
    shopId: body.shopId,
    totalAmount,
    totalCost: totalCost > 0 ? totalCost : null,
    totalProfit: totalProfit > 0 ? totalProfit : null,
    discount,
    saleType: body.saleType,
    paymentMethod: body.saleType === "debt" ? "cash" : (body.paymentMethod ?? "cash"),
    servedBy: body.servedBy ?? null,
    syncStatus: "synced",
    isDeleted: false,
    createdAt: now,
  } as const;

  // Keep the sale and its debt ledger entry atomic. Previously the sale was
  // inserted first and the debt row was inserted much later, after sale items,
  // stock movements, and notifications. Any failure in that path left a valid
  // debt sale in Sale History with no customer/debt record behind it.
  const debtId = body.saleType === "debt" ? crypto.randomUUID() : null;
  await db.batch([
    db.insert(sales).values(saleValues),
    ...(debtId && debtCustomerName
      ? [
          db.insert(debts).values({
            id: debtId,
            shopId: body.shopId,
            saleId,
            customerName: debtCustomerName,
            customerPhone: body.debtCustomerPhone?.trim() ?? "",
            totalAmount,
            amountPaid: creditApplied,
            balance: newDebtBalance,
            status: newDebtStatus,
            notes: null,
            paidAt: newDebtStatus === "paid" ? now : null,
            createdAt: now,
          }),
        ]
      : []),
    ...creditAllocations.map(({ source, amount }) =>
      db.update(debts).set({
        balance: money(Number(source.balance) + amount),
      }).where(eq(debts.id, source.id)),
    ),
    ...(debtPaymentId
      ? [
          db.insert(debtPayments).values({
            id: debtPaymentId,
            debtId: debtId!,
            amount: creditApplied,
            recordedBy: body.servedBy ?? null,
            paidAt: now,
            paymentType: "credit_applied",
            reversalOfId: null,
            note: "Applied from customer overpayment credit",
          }),
        ]
      : []),
  ]);

  for (const item of lineItems) {
    await db.insert(saleItems).values(item);
  }

  for (const item of body.items) {
    const product = productMap.get(item.productId);
    if (product) {
      const beforeQty = product.stockQty;
      const afterQty = Math.max(0, beforeQty - item.qty);
      // Atomic decrement — MAX(0, ...) prevents going below zero even under concurrency.
      // Never write a pre-calculated absolute value; always apply the delta atomically.
      await db
        .update(products)
        .set({
          stockQty: sql`MAX(0, ${products.stockQty} - ${item.qty})`,
          lastSoldAt: now,
          updatedAt: now,
        })
        .where(eq(products.id, item.productId));

      await db.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        productId: item.productId,
        productName: product.canonicalName,
        movementType: "sale",
        qtyChange: -item.qty,
        beforeQty,
        afterQty,
        source: "sale",
        referenceId: saleId,
        createdBy: body.servedBy ?? null,
        createdAt: now,
      });

      if (afterQty <= product.alertQty) {
        // Keep one unread low-stock alert per product. Without this guard,
        // every sale below the threshold creates another identical unread
        // row and steadily inflates D1 writes/storage.
        await c.env.DB.prepare(`
          INSERT INTO notifications
            (id, shop_id, type, title, message, product_id, debt_id, is_read, created_at)
          SELECT ?, ?, 'low_stock', ?, ?, ?, NULL, 0, ?
          WHERE NOT EXISTS (
            SELECT 1
            FROM notifications
            WHERE product_id = ? AND type = 'low_stock' AND is_read = 0
          )
        `).bind(
          crypto.randomUUID(),
          body.shopId,
          "Low Stock Alert",
          `${product.canonicalName} is running low (${afterQty} remaining)`,
          product.id,
          now,
          product.id,
        ).run();
      }
    }
  }

  // Bust products + today's dashboard cache
  const today = new Date().toISOString().slice(0, 10);
  await kvDel(
    c.env.SESSIONS,
    CK.products(body.shopId),
    CK.debts(body.shopId),
    CK.dashboard(body.shopId, today),
  );

  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  return c.json(sale!, 201);
});

// ── Orphaned debt sales (Sales History vs. Customer Debts drift) ────────────
// A debt sale saved before server-side validation existed can appear in
// Sales History with no matching row in the `debts` table, which is why it
// never shows up under Customer Debts. The customer's identity is not
// recoverable from the sale or audit tables, so this is a review-and-confirm
// flow: list the affected sales, let a human attach the right customer to
// each one, and only then create the missing debt record.
// MUST be registered before /sales/:saleId, or "orphaned-debts" is captured
// as a :saleId param instead of matching this route.
salesRouter.get("/sales/orphaned-debts", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  if (!shopId) return c.json({ error: "shopId is required" }, 400);

  const debtSales = await db
    .select()
    .from(sales)
    .where(and(eq(sales.shopId, shopId), eq(sales.saleType, "debt"), eq(sales.isDeleted, false)))
    .orderBy(sql`created_at DESC`)
    .all();

  if (debtSales.length === 0) return c.json([]);

  const saleIds = debtSales.map((s) => s.id);
  const linkedDebtSaleIds = new Set<string>();
  for (const batch of chunk(saleIds, 90)) {
    const rows = await db.select({ saleId: debts.saleId }).from(debts).where(inArray(debts.saleId, batch)).all();
    for (const r of rows) if (r.saleId) linkedDebtSaleIds.add(r.saleId);
  }

  const orphaned = debtSales.filter((s) => !linkedDebtSaleIds.has(s.id));
  if (orphaned.length === 0) return c.json([]);

  const orphanedIds = orphaned.map((s) => s.id);
  const items = await db.select().from(saleItems).where(inArray(saleItems.saleId, orphanedIds)).all();
  const itemsBySaleId: Record<string, typeof items> = {};
  for (const it of items) (itemsBySaleId[it.saleId] ??= []).push(it);

  return c.json(
    orphaned.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      totalAmount: s.totalAmount,
      servedBy: s.servedBy,
      items: itemsBySaleId[s.id] ?? [],
    })),
  );
});

// Attach the confirmed customer to an orphaned debt sale, creating the
// missing `debts` row so it finally appears in Customer Debts / CRM.
// MUST also be registered before /sales/:saleId for the same reason.
salesRouter.post("/sales/:id/link-debt", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const saleId = c.req.param("id");
  const body = await c.req.json<{ shopId: string; customerName: string; customerPhone?: string }>();

  if (!body.shopId || !body.customerName?.trim()) {
    return c.json({ error: "shopId and customerName are required" }, 400);
  }

  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  if (!sale || sale.shopId !== body.shopId) return c.json({ error: "Sale not found" }, 404);
  if (sale.saleType !== "debt") return c.json({ error: "This sale is not a debt sale" }, 400);

  const existing = await db.select().from(debts).where(eq(debts.saleId, saleId)).get();
  if (existing) return c.json({ error: "This sale is already linked to a debt record", debt: existing }, 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(debts).values({
    id,
    shopId: body.shopId,
    saleId,
    customerName: normalizeCustomerName(body.customerName),
    customerPhone: body.customerPhone?.trim() ?? "",
    totalAmount: sale.totalAmount,
    amountPaid: 0,
    balance: sale.totalAmount,
    status: "unpaid",
    notes: "Linked retroactively — sale predates customer-name validation",
    createdAt: sale.createdAt,
  }).run();

  await kvDel(c.env.SESSIONS, CK.debts(body.shopId), CK.dashboard(body.shopId, now.slice(0, 10)));

  const created = await db.select().from(debts).where(eq(debts.id, id)).get();
  return c.json(created, 201);
});

salesRouter.get("/sales/:saleId", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const saleId = c.req.param("saleId");
  const [sale, items] = await Promise.all([
    db.select().from(sales).where(eq(sales.id, saleId)).get(),
    db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all(),
  ]);
  if (!sale) return c.json({ error: "Not found" }, 404);
  return c.json({ ...sale, items });
});

salesRouter.delete("/sales/:saleId", requireAuth, async (c) => {
  const body = await c.req.json<{
    reason?: string;
    performedBy?: string;
  }>().catch(() => ({})) as { reason?: string; performedBy?: string };
  const db = createDb(c.env.DB);
  const saleId = c.req.param("saleId");
  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  if (!sale) return c.json({ error: "Not found" }, 404);
  if (sale.isDeleted) return c.json({ error: "Sale already voided" }, 409);
  const now = new Date().toISOString();

  await db
    .update(sales)
    .set({
      isDeleted: true,
      deletedAt: now,
      deleteReason: body.reason ?? null,
      deletedBy: body.performedBy ?? null,
    })
    .where(eq(sales.id, saleId));

  const items = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  for (const item of items) {
    if (!item.productId) continue;
    const product = await db.select().from(products).where(eq(products.id, item.productId)).get();
    if (product) {
      const beforeQty = product.stockQty;
      const afterQty = beforeQty + item.qty;
      // Atomic increment — prevents overwrite race on concurrent voids
      await db.update(products).set({ stockQty: sql`stock_qty + ${item.qty}`, updatedAt: now }).where(eq(products.id, item.productId));
      await db.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        productId: item.productId,
        productName: product.canonicalName,
        movementType: "sale_reversal",
        qtyChange: item.qty,
        beforeQty,
        afterQty,
        source: "void",
        referenceId: saleId,
        createdBy: body.performedBy ?? null,
        createdAt: now,
      });
    }
  }

  if (sale.saleType === "debt") {
    const linkedDebt = await db.select().from(debts).where(eq(debts.saleId, saleId)).get();
    if (linkedDebt) {
      // Keep the debt and its payment history for audit purposes, but remove
      // the voided sale from outstanding customer balances. Do not rewrite the
      // original total into a fake "paid" debt.
      await db.update(debts)
        .set({
          status: "cancelled",
          balance: 0,
          paidAt: now,
          notes: `${linkedDebt.notes ? `${linkedDebt.notes} · ` : ""}Sale voided${body.reason ? `: ${body.reason}` : ""}`,
        })
        .where(eq(debts.saleId, saleId));
    }
  }

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    shopId: sale.shopId,
    action: "sale_voided",
    entityType: "sale",
    entityId: saleId,
    performedBy: body.performedBy ?? "unknown",
    newValueJson: JSON.stringify({ reason: body.reason ?? null, totalAmount: sale.totalAmount, saleType: sale.saleType }),
    createdAt: now,
  });

  const today = new Date().toISOString().slice(0, 10);
  await kvDel(
    c.env.SESSIONS,
    CK.products(sale.shopId),
    CK.dashboard(sale.shopId, today),
    CK.debts(sale.shopId),
  );
  return c.body(null, 204);
});

// ─── POST /returns  (standalone — no original sale required) ─────────────────
salesRouter.post("/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const body = await c.req.json<{
    shopId: string;
    productId: string;
    productName: string;
    qty: number;
    unitPrice?: number;
    reason?: string;
    processedBy?: string;
  }>();

  if (!body.productId || !body.qty || body.qty <= 0)
    return c.json({ error: "productId and qty > 0 required" }, 400);

  const now = new Date().toISOString();
  const returnId = crypto.randomUUID();

  const product = await db.select().from(products).where(eq(products.id, body.productId)).get();
  if (!product) return c.json({ error: "Product not found" }, 404);

  const beforeQty = product.stockQty;
  const afterQty = beforeQty + body.qty;
  const unitPrice = body.unitPrice ?? product.sellingPrice ?? 0;
  const refundAmount = body.qty * unitPrice;

  // Atomic increment — prevents overwrite race on concurrent restocks
  await db.update(products)
    .set({ stockQty: sql`stock_qty + ${body.qty}`, updatedAt: now })
    .where(eq(products.id, body.productId));

  await db.insert(inventoryMovements).values({
    id: crypto.randomUUID(),
    productId: body.productId,
    productName: product.canonicalName,
    movementType: "return",
    qtyChange: body.qty,
    beforeQty,
    afterQty,
    source: "standalone_return",
    referenceId: returnId,
    createdBy: body.processedBy ?? null,
    createdAt: now,
  });

  // SQLite does not enforce FK by default — "standalone" is a valid TEXT value
  await db.insert(saleReturns).values({
    id: returnId,
    shopId: body.shopId,
    saleId: "standalone",
    itemsJson: JSON.stringify([{
      productId: body.productId,
      productName: product.canonicalName,
      qty: body.qty,
      unitPrice,
      refundAmount,
    }]),
    totalRefund: refundAmount,
    reason: body.reason ?? null,
    processedBy: body.processedBy ?? null,
    createdAt: now,
  });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    shopId: body.shopId,
    action: "standalone_return",
    entityType: "sale_return",
    entityId: returnId,
    oldValueJson: null,
    newValueJson: JSON.stringify({
      productId: body.productId,
      productName: product.canonicalName,
      qty: body.qty,
      refundAmount,
      reason: body.reason,
    }),
    performedBy: body.processedBy ?? null,
    createdAt: now,
  });

  const today = new Date().toISOString().slice(0, 10);
  await kvDel(
    c.env.SESSIONS,
    CK.products(body.shopId),
    CK.dashboard(body.shopId, today),
    `c:sales:${body.shopId}:${today}:100`,
    `c:sales:${body.shopId}:${today}:50`,
  );

  return c.json({ id: returnId, totalRefund: refundAmount, beforeQty, afterQty, productName: product.canonicalName }, 201);
});

// ─── GET /sales/:saleId/returns ──────────────────────────────────────────────
salesRouter.get("/sales/:saleId/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const saleId = c.req.param("saleId");
  const rows = await db
    .select()
    .from(saleReturns)
    .where(eq(saleReturns.saleId, saleId))
    .all();
  return c.json(rows);
});

// ─── POST /sales/:saleId/returns ─────────────────────────────────────────────
// ─── List all returns for a shop on a date ───────────────────────────────────
salesRouter.get("/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const date = c.req.query("date") ?? new Date().toISOString().slice(0, 10);

  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay   = `${date}T23:59:59.999Z`;

  const rows = await db
    .select()
    .from(saleReturns)
    .where(
      and(
        shopId ? eq(saleReturns.shopId, shopId) : undefined,
        gte(saleReturns.createdAt, startOfDay),
        lte(saleReturns.createdAt, endOfDay),
      )
    )
    .orderBy(sql`${saleReturns.createdAt} DESC`)
    .all();

  return c.json(rows);
});

salesRouter.post("/sales/:saleId/returns", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const saleId = c.req.param("saleId");

  const body = await c.req.json<{
    shopId: string;
    reason?: string;
    processedBy?: string;
    items: Array<{
      productId?: string | null;
      productName: string;
      qty: number;
      unitPrice: number;
      refundAmount: number;
    }>;
  }>();

  const sale = await db.select().from(sales).where(eq(sales.id, saleId)).get();
  if (!sale) return c.json({ error: "Sale not found" }, 404);
  if (sale.isDeleted) return c.json({ error: "Cannot return items from a voided sale" }, 400);
  if (!body.items || body.items.length === 0) return c.json({ error: "No items to return" }, 400);

  // ── Guard: compute already-returned qty per product for this sale ────────────
  const existingReturnRows = await db
    .select()
    .from(saleReturns)
    .where(eq(saleReturns.saleId, saleId))
    .all();

  const alreadyReturned: Record<string, number> = {};
  for (const r of existingReturnRows) {
    const ritems: any[] = (() => { try { return JSON.parse(r.itemsJson ?? "[]"); } catch { return []; } })();
    for (const ri of ritems) {
      if (ri.productId) alreadyReturned[ri.productId] = (alreadyReturned[ri.productId] ?? 0) + (ri.qty ?? 0);
    }
  }

  // ── Fetch original sold quantities ───────────────────────────────────────────
  const soldRows = await db.select().from(saleItems).where(eq(saleItems.saleId, saleId)).all();
  const soldQty: Record<string, number> = {};
  for (const si of soldRows) {
    if (si.productId) soldQty[si.productId] = (soldQty[si.productId] ?? 0) + si.qty;
  }

  // ── Validate each return item ────────────────────────────────────────────────
  for (const item of body.items) {
    if (!item.productId) continue;
    const originalQty = soldQty[item.productId] ?? 0;
    const prevReturned = alreadyReturned[item.productId] ?? 0;
    const maxReturnable = originalQty - prevReturned;
    if (item.qty > maxReturnable) {
      return c.json({
        error: `Cannot return ${item.qty}× "${item.productName}" — only ${maxReturnable} can be returned (${prevReturned} already returned of ${originalQty} sold)`,
      }, 400);
    }
  }

  const now = new Date().toISOString();
  const returnId = crypto.randomUUID();

  const totalRefund = body.items.reduce((sum, it) => sum + it.refundAmount, 0);

  // Restore stock for each returned product
  for (const item of body.items) {
    if (!item.productId) continue;
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, item.productId))
      .get();
    if (!product) continue;

    const beforeQty = product.stockQty;
    const afterQty = beforeQty + item.qty;

    // Atomic increment — prevents overwrite race on concurrent sale returns
    await db
      .update(products)
      .set({ stockQty: sql`stock_qty + ${item.qty}`, updatedAt: now })
      .where(eq(products.id, item.productId));

    await db.insert(inventoryMovements).values({
      id: crypto.randomUUID(),
      productId: item.productId,
      productName: product.canonicalName,
      movementType: "return",
      qtyChange: item.qty,
      beforeQty,
      afterQty,
      source: "sale_return",
      referenceId: returnId,
      createdBy: body.processedBy ?? null,
      createdAt: now,
    });
  }

  // Persist the return record
  await db.insert(saleReturns).values({
    id: returnId,
    shopId: body.shopId,
    saleId,
    itemsJson: JSON.stringify(body.items),
    totalRefund,
    reason: body.reason ?? null,
    processedBy: body.processedBy ?? null,
    createdAt: now,
  });

  // Audit trail
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    shopId: body.shopId,
    action: "sale_return",
    entityType: "sale_return",
    entityId: returnId,
    oldValueJson: null,
    newValueJson: JSON.stringify({ saleId, totalRefund, items: body.items, reason: body.reason }),
    performedBy: body.processedBy ?? null,
    createdAt: now,
  });

  // ── Update sale totals to reflect the return ────────────────────────────────
  const newTotal = Math.max(0, (sale.totalAmount ?? 0) - totalRefund);
  // Estimate profit reduction: refund * (totalProfit / totalAmount) if ratio available
  const profitRatio = (sale.totalAmount ?? 0) > 0
    ? (sale.totalProfit ?? 0) / (sale.totalAmount ?? 1) : 0;
  const newProfit = Math.max(0, (sale.totalProfit ?? 0) - totalRefund * profitRatio);
  await db.update(sales)
    .set({ totalAmount: newTotal, totalProfit: newProfit })
    .where(eq(sales.id, saleId));

  // ── Auto-credit debt balance when this is a debt sale ──────────────────────
  if (sale.saleType === "debt") {
    const debt = await db.select().from(debts).where(eq(debts.saleId, saleId)).get();
    if (debt) {
      const newBalance = Math.max(0, (debt.balance ?? 0) - totalRefund);
      const newTotalAmount = Math.max(0, (debt.totalAmount ?? 0) - totalRefund);
      const newStatus: "unpaid" | "partial" | "paid" = newBalance <= 0
        ? "paid"
        : (debt.amountPaid ?? 0) > 0
          ? "partial"
          : "unpaid";
      await db.update(debts)
        .set({
          balance: newBalance,
          totalAmount: newTotalAmount,
          status: newStatus,
          paidAt: newStatus === "paid" ? now : (debt.paidAt ?? null),
        })
        .where(eq(debts.id, debt.id));
      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        shopId: body.shopId,
        action: "debt_return_credit",
        entityType: "debt",
        entityId: debt.id,
        oldValueJson: JSON.stringify({ balance: debt.balance, totalAmount: debt.totalAmount, status: debt.status }),
        newValueJson: JSON.stringify({ balance: newBalance, totalAmount: newTotalAmount, status: newStatus, returnId }),
        performedBy: body.processedBy ?? null,
        createdAt: now,
      });
    }
  }

  // Bust cache so dashboard/products/sales list reflect restored stock + updated totals
  const today = new Date().toISOString().slice(0, 10);
  const saleDateStr = sale.createdAt.slice(0, 10);
  await kvDel(
    c.env.SESSIONS,
    CK.products(body.shopId),
    CK.dashboard(body.shopId, today),
    `c:sales:${body.shopId}:${saleDateStr}:100`,
    `c:sales:${body.shopId}:${saleDateStr}:50`,
  );

  const result = await db
    .select()
    .from(saleReturns)
    .where(eq(saleReturns.id, returnId))
    .get();
  return c.json(result!, 201);
});

export default salesRouter;
