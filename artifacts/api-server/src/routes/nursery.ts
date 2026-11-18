import { Hono } from "hono";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { CK, kvDel } from "../lib/cache";
import {
  INITIAL_SWEEP_SOURCE_KEY,
  buildCreditOwnerStatements,
  buildDebitOwnerAdjustmentStatements,
  computeCollectedPlantTotals,
  getNurserySyncConfig,
  runCollectedPlantSweep,
  saveNurserySyncConfig,
} from "../lib/nursery-sync";

const nurseryRouter = new Hono<AppEnv>();
const paymentMethods = new Set(["cash", "mpesa", "credit"]);

function normalizedPhone(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.startsWith("254") ? `0${digits.slice(3)}` : digits;
}

function normalizedName(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

const normalizedPhoneSql = (column: string) =>
  `CASE WHEN substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(${column}, '')), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', ''), 1, 3) = '254'
    THEN '0' || substr(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(${column}, '')), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', ''), 4)
    ELSE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(${column}, '')), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') END`;

async function ensureSupplierCustomer(
  db: AppEnv["Bindings"]["DB"],
  shopId: string,
  customerId: string | null | undefined,
  rawName: string | null | undefined,
  rawPhone: string | null | undefined,
  now: string,
): Promise<string | null> {
  if (customerId) {
    const existing = await db.prepare("SELECT id FROM customers WHERE id = ? AND shop_id = ?")
      .bind(customerId, shopId).first<{ id: string }>();
    if (!existing) throw new Error("Choose a customer belonging to this shop.");
    return existing.id;
  }
  const name = rawName?.trim().replace(/\s+/g, " ") ?? "";
  const phone = rawPhone?.trim() ?? "";
  if (!name) return null;
  const phoneKey = normalizedPhone(phone);
  const existing = phoneKey
    ? await db.prepare(
      `SELECT id FROM customers WHERE shop_id = ? AND ${normalizedPhoneSql("phone")} = ? LIMIT 1`
    ).bind(shopId, phoneKey).first<{ id: string }>()
    : await db.prepare("SELECT id FROM customers WHERE shop_id = ? AND lower(trim(name)) = lower(trim(?)) LIMIT 1")
      .bind(shopId, name).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO customers (id, shop_id, name, phone, email, notes, credit_limit, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, ?)"
  ).bind(id, shopId, name, phone, now, now).run();
  return id;
}

type SupplierSaleForPosting = {
  entryId: string;
  supplierId: string;
  varietyName: string;
  quantity: number;
  totalAmountCents: number;
};

async function buildSupplierProceedsStatements(
  db: AppEnv["Bindings"]["DB"],
  shopId: string,
  sales: SupplierSaleForPosting[],
  now: string,
): Promise<D1PreparedStatement[]> {
  const supplierIds = [...new Set(sales.map(sale => sale.supplierId))];
  if (!supplierIds.length) return [];
  const marks = supplierIds.map(() => "?").join(", ");
  const suppliers = await db.prepare(
    `SELECT s.id, s.name, c.name AS customerName, c.phone AS customerPhone
     FROM suppliers s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.shop_id = s.shop_id
     WHERE s.shop_id = ? AND s.id IN (${marks})`
  ).bind(shopId, ...supplierIds).all<{
    id: string; name: string; customerName: string | null; customerPhone: string | null;
  }>();
  const supplierById = new Map((suppliers.results ?? []).map(row => [row.id, row]));
  if (supplierById.size !== supplierIds.length) throw new Error("A selected nursery supplier is no longer available.");

  const debtRows = await db.prepare(
    `SELECT id, customer_name AS customerName, customer_phone AS customerPhone,
       balance, amount_paid AS amountPaid, total_amount AS totalAmount, created_at AS createdAt
     FROM debts
     WHERE shop_id = ? AND status IN ('unpaid', 'partial') AND balance > 0
     ORDER BY created_at ASC, id ASC`
  ).bind(shopId).all<{
    id: string; customerName: string; customerPhone: string; balance: number;
    amountPaid: number; totalAmount: number; createdAt: string;
  }>();
  const openDebts = debtRows.results ?? [];
  const availableCents = new Map(openDebts.map(debt => [debt.id, Math.max(0, Math.round(Number(debt.balance || 0) * 100))]));
  const statements: D1PreparedStatement[] = [];

  for (const sale of sales) {
    const supplier = supplierById.get(sale.supplierId)!;
    const saleNote = `Nursery sale — ${sale.varietyName} × ${sale.quantity} from ${supplier.name}`;
    statements.push(db.prepare(
      `INSERT INTO nursery_supplier_ledger
        (id, shop_id, supplier_id, sale_entry_id, entry_type, amount_cents, quantity, variety_name, note, created_at)
       VALUES (?, ?, ?, ?, 'sale_proceeds', ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), shopId, supplier.id, sale.entryId, sale.totalAmountCents, sale.quantity, sale.varietyName, saleNote, now));

    const customerName = supplier.customerName ?? "";
    const customerPhone = supplier.customerPhone ?? "";
    const phoneKey = normalizedPhone(customerPhone);
    const nameKey = normalizedName(customerName);
    if (!nameKey && !phoneKey) continue;

    const supplierDebts = openDebts.filter(debt => {
      const debtPhone = normalizedPhone(debt.customerPhone);
      if (phoneKey) return debtPhone === phoneKey || (!debtPhone && normalizedName(debt.customerName) === nameKey);
      return normalizedName(debt.customerName) === nameKey;
    });
    let remaining = Math.max(0, sale.totalAmountCents);
    for (const debt of supplierDebts) {
      if (remaining <= 0) break;
      const balanceCents = availableCents.get(debt.id) ?? 0;
      const appliedCents = Math.min(remaining, balanceCents);
      if (appliedCents <= 0) continue;
      const amount = appliedCents / 100;
      const paymentId = crypto.randomUUID();
      const offsetNote = `Nursery sale proceeds applied to supplier debt — ${supplier.name}`;

      statements.push(db.prepare(
        `UPDATE debts
         SET amount_paid = MIN(total_amount, amount_paid + ?),
             balance = MAX(0, balance - ?),
             status = CASE WHEN MAX(0, balance - ?) <= 0.005 THEN 'paid'
               WHEN MIN(total_amount, amount_paid + ?) <= 0.005 THEN 'unpaid' ELSE 'partial' END,
             paid_at = CASE WHEN MAX(0, balance - ?) <= 0.005 THEN ? ELSE NULL END
         WHERE id = ? AND shop_id = ? AND balance > 0 AND balance + 0.005 >= ?`
      ).bind(amount, amount, amount, amount, amount, now, debt.id, shopId, amount));
      statements.push(db.prepare(
        `INSERT INTO debt_payments (id, debt_id, amount, recorded_by, paid_at, payment_type, note)
         SELECT ?, ?, ?, 'Nursery', ?, 'payment', ? WHERE changes() > 0`
      ).bind(paymentId, debt.id, amount, now, offsetNote));
      statements.push(db.prepare(
        `INSERT INTO nursery_supplier_ledger
          (id, shop_id, supplier_id, sale_entry_id, entry_type, amount_cents, quantity, variety_name, debt_id, debt_payment_id, note, created_at)
         SELECT ?, ?, ?, ?, 'debt_offset', ?, ?, ?, ?, ?, ?, ? WHERE changes() > 0`
      ).bind(crypto.randomUUID(), shopId, supplier.id, sale.entryId, -appliedCents, sale.quantity, sale.varietyName, debt.id, paymentId, offsetNote, now));

      availableCents.set(debt.id, balanceCents - appliedCents);
      remaining -= appliedCents;
    }
  }
  return statements;
}

async function invalidateDebtViews(bindings: AppEnv["Bindings"], shopId: string) {
  await kvDel(bindings.SESSIONS, CK.debts(shopId), CK.dashboard(shopId, new Date().toISOString().slice(0, 10)));
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

nurseryRouter.get("/nursery/auto-sync", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const [config, totals] = await Promise.all([
    getNurserySyncConfig(c.env.DB, c.env.SESSIONS, shopId),
    computeCollectedPlantTotals(c.env.DB, shopId),
  ]);
  return c.json({ config, totals });
});

nurseryRouter.put("/nursery/auto-sync", requireAuth, async (c) => {
  const session = c.get("session");
  if (session.role !== "owner") {
    return c.json({ error: "Owner access required to change automatic nursery sync rules." }, 403);
  }
  const shopId = session.shopId;
  const body = await c.req.json<{
    enabled?: boolean;
    ownerCustomerName?: string;
    ownerCustomerPhone?: string;
    commissionPct?: number;
    sweepRemaining?: boolean;
  }>();

  const ownerCustomerName = String(body.ownerCustomerName ?? "Nursery").trim().slice(0, 120) || "Nursery";
  const ownerCustomerPhone = String(body.ownerCustomerPhone ?? "").trim().slice(0, 40);
  const commissionPct = Number(body.commissionPct ?? 0);
  if (!Number.isFinite(commissionPct) || commissionPct < 0 || commissionPct > 95) {
    return c.json({ error: "Shop profit split must be between 0% and 95%." }, 400);
  }

  const config = await saveNurserySyncConfig(c.env.DB, c.env.SESSIONS, shopId, {
    enabled: Boolean(body.enabled),
    ownerCustomerName,
    ownerCustomerPhone,
    commissionPct,
    updatedBy: session.userName ?? "Owner",
  });

  let sweep = null;
  if (config.enabled && body.sweepRemaining !== false) {
    sweep = await runCollectedPlantSweep({
      d1: c.env.DB,
      db: createDb(c.env.DB),
      kv: c.env.SESSIONS,
      shopId,
      recordedBy: "Nursery Auto-Sync",
      sourceKey: `enable-sweep:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`,
    });
  }
  const totals = await computeCollectedPlantTotals(c.env.DB, shopId);
  return c.json({ config, totals, sweep });
});

nurseryRouter.post("/nursery/auto-sync/sweep", requireAuth, async (c) => {
  const session = c.get("session");
  const shopId = session.shopId;
  const body = await c.req.json<{ mode?: "initial" | "manual" }>().catch(() => ({} as { mode?: "initial" | "manual" }));
  const mode = body.mode === "manual" ? "manual" : "initial";
  const sourceKey =
    mode === "manual"
      ? `manual-sweep:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`
      : INITIAL_SWEEP_SOURCE_KEY;

  const sweep = await runCollectedPlantSweep({
    d1: c.env.DB,
    db: createDb(c.env.DB),
    kv: c.env.SESSIONS,
    shopId,
    recordedBy: session.userName ?? "Nursery Auto-Sync",
    sourceKey,
  });
  const [config, totals] = await Promise.all([
    getNurserySyncConfig(c.env.DB, c.env.SESSIONS, shopId),
    computeCollectedPlantTotals(c.env.DB, shopId),
  ]);
  return c.json({ sweep, config, totals });
});

nurseryRouter.get("/nursery/supplier-customers", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const search = (c.req.query("q") ?? "").trim().slice(0, 80);
  if (search.length < 2) return c.json({ rows: [] });
  const like = `%${search}%`;
  const [customerRows, debtRows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT c.id, c.name, c.phone,
         CAST(ROUND(COALESCE((
           SELECT SUM(d.balance) FROM debts d
           WHERE d.shop_id = c.shop_id AND d.status IN ('unpaid', 'partial') AND d.balance > 0
             AND ((TRIM(COALESCE(c.phone, '')) != '' AND ${normalizedPhoneSql("d.customer_phone")} = ${normalizedPhoneSql("c.phone")}) OR
               (TRIM(COALESCE(d.customer_phone, '')) = '' AND lower(trim(d.customer_name)) = lower(trim(c.name))))
         ), 0) * 100) AS INTEGER) AS outstandingDebtCents
       FROM customers c
       WHERE c.shop_id = ? AND (lower(c.name) LIKE lower(?) OR c.phone LIKE ?)
       ORDER BY outstandingDebtCents DESC, c.name COLLATE NOCASE
       LIMIT 50`
    ).bind(shopId, like, like).all<SupplierCustomer>(),
    c.env.DB.prepare(
      `SELECT customer_name AS name, customer_phone AS phone,
         CAST(ROUND(SUM(balance) * 100) AS INTEGER) AS outstandingDebtCents
       FROM debts
       WHERE shop_id = ? AND status IN ('unpaid', 'partial') AND balance > 0
         AND (lower(customer_name) LIKE lower(?) OR customer_phone LIKE ?)
       GROUP BY lower(trim(customer_name)), ${normalizedPhoneSql("customer_phone")}
       ORDER BY outstandingDebtCents DESC, name COLLATE NOCASE
       LIMIT 50`
    ).bind(shopId, like, like).all<Omit<SupplierCustomer, "id"> & { name: string; phone: string }>(),
  ]);
  const merged = new Map<string, SupplierCustomer>();
  for (const row of customerRows.results ?? []) {
    const key = normalizedPhone(row.phone) ? `phone:${normalizedPhone(row.phone)}` : `name:${normalizedName(row.name)}`;
    merged.set(key, { ...row, id: row.id, outstandingDebtCents: Number(row.outstandingDebtCents ?? 0) });
  }
  for (const row of debtRows.results ?? []) {
    const key = normalizedPhone(row.phone) ? `phone:${normalizedPhone(row.phone)}` : `name:${normalizedName(row.name)}`;
    const existing = merged.get(key);
    if (existing) {
      existing.outstandingDebtCents = Math.max(existing.outstandingDebtCents, Number(row.outstandingDebtCents ?? 0));
    } else {
      merged.set(key, { id: null, name: row.name, phone: row.phone, outstandingDebtCents: Number(row.outstandingDebtCents ?? 0) });
    }
  }
  return c.json({ rows: [...merged.values()].sort((a, b) => Number(b.outstandingDebtCents) - Number(a.outstandingDebtCents) || a.name.localeCompare(b.name)).slice(0, 20) });
});

nurseryRouter.get("/nursery/suppliers", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.phone, s.notes, s.customer_id AS customerId,
       c.name AS customerName, c.phone AS customerPhone,
       COALESCE((SELECT SUM(r.quantity) FROM nursery_supplier_receipts r
         WHERE r.shop_id = s.shop_id AND r.supplier_id = s.id), 0) AS receivedPlants,
       COALESCE((SELECT SUM(r.quantity) FROM nursery_supplier_receipts r
         WHERE r.shop_id = s.shop_id AND r.supplier_id = s.id), 0) -
       COALESCE((SELECT SUM(e.quantity) FROM nursery_sale_entries e
         WHERE e.shop_id = s.shop_id AND e.source_supplier_id = s.id), 0) AS onHandPlants,
       CAST(ROUND(COALESCE((SELECT SUM(l.amount_cents) FROM nursery_supplier_ledger l
         WHERE l.shop_id = s.shop_id AND l.supplier_id = s.id), 0)) AS INTEGER) AS supplierCreditCents,
       CAST(ROUND(COALESCE((SELECT SUM(d.balance) FROM debts d
         WHERE d.shop_id = s.shop_id AND d.status IN ('unpaid', 'partial') AND d.balance > 0
           AND ((TRIM(COALESCE(c.phone, '')) != '' AND ${normalizedPhoneSql("d.customer_phone")} = ${normalizedPhoneSql("c.phone")}) OR
             (TRIM(COALESCE(d.customer_phone, '')) = '' AND lower(trim(d.customer_name)) = lower(trim(c.name))))
       ), 0) * 100) AS INTEGER) AS customerDebtCents
     FROM suppliers s
     LEFT JOIN customers c ON c.id = s.customer_id AND c.shop_id = s.shop_id
     WHERE s.shop_id = ?
     ORDER BY s.name COLLATE NOCASE`
  ).bind(shopId).all();
  return c.json({ rows: rows.results ?? [] });
});

nurseryRouter.post("/nursery/suppliers", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const body = await c.req.json<{ name?: string; phone?: string; notes?: string; customerId?: string | null; customerName?: string; customerPhone?: string }>();
  const name = body.name?.trim().replace(/\s+/g, " ") ?? "";
  const phone = body.phone?.trim() ?? "";
  const notes = body.notes?.trim() ?? "";
  if (!name || name.length > 120 || phone.length > 40 || notes.length > 500 ||
      (body.customerName?.trim().length ?? 0) > 120 || (body.customerPhone?.trim().length ?? 0) > 40) {
    return c.json({ error: "Enter a supplier name up to 120 characters, a phone up to 40 characters, and notes up to 500 characters." }, 400);
  }
  const now = new Date().toISOString();
  let customerId: string | null;
  try {
    customerId = await ensureSupplierCustomer(c.env.DB, shopId, body.customerId, body.customerName, body.customerPhone, now);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Choose a customer belonging to this shop." }, 400);
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO suppliers (id, shop_id, name, phone, notes, created_at, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, shopId, name, phone || null, notes || null, now, customerId).run();
  return c.json({ id, name, phone, notes, customerId, createdAt: now }, 201);
});

nurseryRouter.patch("/nursery/suppliers/:id", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string; phone?: string | null; notes?: string | null; customerId?: string | null; customerName?: string; customerPhone?: string }>();
  const old = await c.env.DB.prepare("SELECT id FROM suppliers WHERE id = ? AND shop_id = ?").bind(id, shopId).first();
  if (!old) return c.json({ error: "Supplier not found." }, 404);
  const updates: string[] = [];
  const values: Array<string | null> = [];
  if (body.name !== undefined) {
    const name = body.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 120) return c.json({ error: "Supplier names must be 1–120 characters." }, 400);
    updates.push("name = ?"); values.push(name);
  }
  if (body.phone !== undefined) {
    const phone = body.phone?.trim() ?? "";
    if (phone.length > 40) return c.json({ error: "Supplier phone numbers must be 40 characters or fewer." }, 400);
    updates.push("phone = ?"); values.push(phone || null);
  }
  if (body.notes !== undefined) {
    const notes = body.notes?.trim() ?? "";
    if (notes.length > 500) return c.json({ error: "Supplier notes must be 500 characters or fewer." }, 400);
    updates.push("notes = ?"); values.push(notes || null);
  }
  if (body.customerName !== undefined && body.customerName.trim().length > 120) {
    return c.json({ error: "Customer names must be 120 characters or fewer." }, 400);
  }
  if (body.customerPhone !== undefined && body.customerPhone.trim().length > 40) {
    return c.json({ error: "Customer phone numbers must be 40 characters or fewer." }, 400);
  }
  if (body.customerId !== undefined || body.customerName !== undefined || body.customerPhone !== undefined) {
    let customerId: string | null;
    try {
      customerId = await ensureSupplierCustomer(
        c.env.DB, shopId, body.customerId, body.customerName, body.customerPhone, new Date().toISOString(),
      );
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "Choose a customer belonging to this shop." }, 400);
    }
    updates.push("customer_id = ?"); values.push(customerId);
  }
  if (!updates.length) return c.json({ error: "Choose a supplier field to update." }, 400);
  await c.env.DB.prepare(`UPDATE suppliers SET ${updates.join(", ")} WHERE id = ? AND shop_id = ?`)
    .bind(...values, id, shopId).run();
  return c.json({ ok: true });
});

nurseryRouter.post("/nursery/receipts", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const userName = c.get("session").userName ?? "User";
  const body = await c.req.json<{
    requestId?: string; supplierId?: string; varietyId?: string; quantity?: number;
    receivedAt?: string; notes?: string;
  }>();
  const requestId = body.requestId ?? "";
  const quantity = Number(body.quantity);
  const receivedAt = body.receivedAt ?? "";
  const notes = body.notes?.trim() ?? "";
  if (!/^[\w-]{8,80}$/.test(requestId) || !body.supplierId || !body.varietyId ||
      !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000000 ||
      !validDate(receivedAt) || notes.length > 500) {
    return c.json({ error: "Check the supplier, variety, quantity, received date and notes." }, 400);
  }
  const prior = await c.env.DB.prepare(
    "SELECT id FROM nursery_supplier_receipts WHERE shop_id = ? AND request_id = ?"
  ).bind(shopId, requestId).first<{ id: string }>();
  if (prior) return c.json({ ok: true, id: prior.id, duplicate: true });
  const [supplier, variety] = await Promise.all([
    c.env.DB.prepare("SELECT id FROM suppliers WHERE id = ? AND shop_id = ?").bind(body.supplierId, shopId).first(),
    c.env.DB.prepare("SELECT id, name FROM nursery_varieties WHERE id = ? AND shop_id = ? AND is_active = 1")
      .bind(body.varietyId, shopId).first<{ id: string; name: string }>(),
  ]);
  if (!supplier || !variety) return c.json({ error: "Choose a supplier and active variety belonging to this shop." }, 400);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `INSERT INTO nursery_supplier_receipts
      (id, request_id, shop_id, supplier_id, variety_id, variety_name, quantity, received_at, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, requestId, shopId, body.supplierId, body.varietyId, variety.name, quantity, receivedAt, notes, userName, now).run();
  return c.json({ ok: true, id, supplierId: body.supplierId, varietyId: body.varietyId, quantity, receivedAt }, 201);
});

nurseryRouter.get("/nursery/sale-sources", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const varietyIds = [...new Set((c.req.query("varietyIds") ?? "").split(",").map(value => value.trim()).filter(Boolean))];
  if (!varietyIds.length) return c.json({ rows: [] });
  if (varietyIds.length > 18 || varietyIds.some(id => id.length > 80)) {
    return c.json({ error: "Choose up to 18 valid varieties." }, 400);
  }
  const marks = varietyIds.map(() => "?").join(", ");
  const rows = await c.env.DB.prepare(
    `SELECT r.variety_id AS varietyId, r.supplier_id AS supplierId, s.name AS supplierName,
       SUM(r.quantity) - COALESCE((
         SELECT SUM(e.quantity) FROM nursery_sale_entries e
         WHERE e.shop_id = r.shop_id AND e.source_supplier_id = r.supplier_id AND e.variety_id = r.variety_id
       ), 0) AS availableQuantity
     FROM nursery_supplier_receipts r
     JOIN suppliers s ON s.id = r.supplier_id AND s.shop_id = r.shop_id
     WHERE r.shop_id = ? AND r.variety_id IN (${marks})
     GROUP BY r.variety_id, r.supplier_id, s.name
     HAVING availableQuantity > 0
     ORDER BY r.variety_id, s.name COLLATE NOCASE`
  ).bind(shopId, ...varietyIds).all();
  return c.json({ rows: rows.results ?? [] });
});

nurseryRouter.get("/nursery/suppliers/:id/records", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const supplierId = c.req.param("id");
  const supplier = await c.env.DB.prepare("SELECT id FROM suppliers WHERE id = ? AND shop_id = ?")
    .bind(supplierId, shopId).first();
  if (!supplier) return c.json({ error: "Supplier not found." }, 404);
  const limit = Math.min(100, Math.max(1, Math.floor(Number(c.req.query("limit") ?? 50) || 50)));
  const rows = await c.env.DB.prepare(
    `SELECT 'receipt' AS recordType, id, received_at AS recordedAt, variety_name AS varietyName,
       quantity, 0 AS amountCents, notes AS note
     FROM nursery_supplier_receipts WHERE shop_id = ? AND supplier_id = ?
     UNION ALL
     SELECT entry_type AS recordType, id, created_at AS recordedAt, variety_name AS varietyName,
       quantity, amount_cents AS amountCents, note
     FROM nursery_supplier_ledger WHERE shop_id = ? AND supplier_id = ?
     ORDER BY recordedAt DESC LIMIT ?`
  ).bind(shopId, supplierId, shopId, supplierId, limit).all();
  return c.json({ rows: rows.results ?? [] });
});

nurseryRouter.get("/nursery/varieties", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const hasPageParams = ["page", "pageSize", "search", "status", "category"].some(key => c.req.query(key) !== undefined);
  const search = (c.req.query("search") ?? "").trim().slice(0, 80);
  const status = c.req.query("status") ?? "all";
  const category = (c.req.query("category") ?? "").trim().slice(0, 60);
  if (!["active", "archived", "all"].includes(status)) {
    return c.json({ error: "Choose a valid variety status." }, 400);
  }

  const page = Math.max(1, Math.floor(Number(c.req.query("page") ?? 1) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(c.req.query("pageSize") ?? 30) || 30)));
  const offset = (page - 1) * pageSize;
  const filters = ["shop_id = ?"];
  const values: Array<string | number> = [shopId];
  if (status !== "all") {
    filters.push("is_active = ?");
    values.push(status === "active" ? 1 : 0);
  }
  if (category) {
    if (category.toLowerCase() === "uncategorized") {
      filters.push("(category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'uncategorized')");
    } else {
      filters.push("category = ? COLLATE NOCASE");
      values.push(category);
    }
  }
  if (search) {
    filters.push("name LIKE ? COLLATE NOCASE");
    values.push(`${search}%`);
  }
  const where = filters.join(" AND ");
  const [rows, count, categories] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, name,
        CASE WHEN category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'uncategorized'
          THEN 'Uncategorized' ELSE TRIM(category) END AS category,
        (default_price / 100.0) AS defaultPrice,
        is_active AS isActive, created_at AS createdAt
       FROM nursery_varieties WHERE ${where}
       ORDER BY is_active DESC, name COLLATE NOCASE LIMIT ? OFFSET ?`
    ).bind(...values, pageSize, offset).all(),
    c.env.DB.prepare(`SELECT COUNT(*) AS total FROM nursery_varieties WHERE ${where}`)
      .bind(...values).first<{ total: number }>(),
    c.env.DB.prepare(
      `SELECT DISTINCT
        CASE WHEN category IS NULL OR TRIM(category) = '' OR LOWER(TRIM(category)) = 'uncategorized'
          THEN 'Uncategorized' ELSE TRIM(category) END AS category
       FROM nursery_varieties WHERE shop_id = ? ORDER BY category COLLATE NOCASE`
    ).bind(shopId).all<{ category: string }>(),
  ]);
  const result = {
    rows: rows.results ?? [],
    total: Number(count?.total ?? 0),
    page,
    pageSize,
    categories: (categories.results ?? []).map(row => row.category),
  };

  // Keep the original unpaged response for older installed clients.
  return c.json(hasPageParams ? result : result.rows);
});

nurseryRouter.post("/nursery/varieties", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const body = await c.req.json<{ name?: string; category?: string; defaultPrice?: number }>();
  const name = body.name?.trim().replace(/\s+/g, " ");
  const category = body.category?.trim().replace(/\s+/g, " ") || "Uncategorized";
  const price = Number(body.defaultPrice);
  if (!name || name.length > 80 || category.length > 60 || !Number.isFinite(price) || price < 0 || price > 1000000) {
    return c.json({ error: "Enter a variety name, category up to 60 characters, and a valid non-negative price." }, 400);
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await c.env.DB.prepare(
      "INSERT INTO nursery_varieties (id, shop_id, name, category, default_price, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)"
    ).bind(id, shopId, name, category, Math.round(price * 100), now, now).run();
  } catch {
    return c.json({ error: "A variety with that name may already exist in this shop." }, 409);
  }
  return c.json({ id, name, category, defaultPrice: Math.round(price * 100) / 100, isActive: 1, createdAt: now }, 201);
});

nurseryRouter.get("/nursery/monthly-summary", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const month = c.req.query("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return c.json({ error: "Choose a valid month." }, 400);
  }
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;

  // This report reads the compact per-day aggregates, never the raw sale ledger.
  const [categories, summary] = await Promise.all([
    c.env.DB.prepare(
      `SELECT CASE
          WHEN v.category IS NULL OR TRIM(v.category) = '' OR LOWER(TRIM(v.category)) = 'uncategorized'
          THEN 'Uncategorized' ELSE TRIM(v.category)
        END AS category,
        SUM(s.quantity) AS seedlingsSold,
        SUM(s.total_amount_cents) AS totalRevenueCents,
        COUNT(DISTINCT v.id) AS varietyCount,
        SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount_cents ELSE 0 END) AS cashCents,
        SUM(CASE WHEN s.payment_method = 'mpesa' THEN s.total_amount_cents ELSE 0 END) AS mpesaCents,
        SUM(CASE WHEN s.payment_method = 'credit' THEN s.total_amount_cents ELSE 0 END) AS creditCents
       FROM nursery_daily_sales s
       JOIN nursery_varieties v ON v.id = s.variety_id AND v.shop_id = s.shop_id
       WHERE s.shop_id = ? AND s.business_date >= ? AND s.business_date <= ?
       GROUP BY CASE
          WHEN v.category IS NULL OR TRIM(v.category) = '' OR LOWER(TRIM(v.category)) = 'uncategorized'
          THEN 'Uncategorized' ELSE TRIM(v.category)
        END COLLATE NOCASE
       ORDER BY seedlingsSold DESC, category COLLATE NOCASE`
    ).bind(shopId, from, to).all(),
    c.env.DB.prepare(
      `SELECT COALESCE(SUM(quantity), 0) AS seedlingsSold,
        COALESCE(SUM(total_amount_cents), 0) AS totalRevenueCents
       FROM nursery_daily_sales WHERE shop_id = ? AND business_date >= ? AND business_date <= ?`
    ).bind(shopId, from, to).first(),
  ]);
  return c.json({ month, from, to, categories: categories.results ?? [], summary });
});

nurseryRouter.patch("/nursery/varieties/:id", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const id = c.req.param("id");
  const body = await c.req.json<{ name?: string; category?: string; defaultPrice?: number; isActive?: boolean }>();
  const updates: string[] = [];
  const values: Array<string | number> = [];
  if (body.name !== undefined) {
    const name = body.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 80) return c.json({ error: "Variety name must be 1–80 characters." }, 400);
    updates.push("name = ?");
    values.push(name);
  }
  if (body.category !== undefined) {
    const category = body.category.trim().replace(/\s+/g, " ") || "Uncategorized";
    if (category.length > 60) return c.json({ error: "Category names must be 1–60 characters." }, 400);
    updates.push("category = ?");
    values.push(category);
  }
  if (body.defaultPrice !== undefined) {
    const price = Number(body.defaultPrice);
    if (!Number.isFinite(price) || price < 0 || price > 1000000) return c.json({ error: "Enter a valid price." }, 400);
    updates.push("default_price = ?");
    values.push(Math.round(price * 100));
  }
  if (body.isActive !== undefined) {
    updates.push("is_active = ?");
    values.push(body.isActive ? 1 : 0);
  }
  if (!updates.length) return c.json({ error: "Choose at least one variety field to update." }, 400);
  updates.push("updated_at = ?");
  values.push(new Date().toISOString(), id, shopId);
  let row;
  try {
    row = await c.env.DB.prepare(
      `UPDATE nursery_varieties SET ${updates.join(", ")} WHERE id = ? AND shop_id = ?
       RETURNING id, name, category, (default_price / 100.0) AS defaultPrice,
         is_active AS isActive, created_at AS createdAt`
    ).bind(...values).first();
  } catch {
    return c.json({ error: "A variety with that name may already exist." }, 409);
  }
  if (!row) return c.json({ error: "Variety not found." }, 404);
  return c.json(row);
});

nurseryRouter.delete("/nursery/varieties/:id", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const id = c.req.param("id");
  const variety = await c.env.DB.prepare(
    "SELECT id FROM nursery_varieties WHERE id = ? AND shop_id = ?"
  ).bind(id, shopId).first<{ id: string }>();
  if (!variety) return c.json({ error: "Variety not found." }, 404);

  // Keep historical reports and sale entries intact: used varieties are archived,
  // while varieties with no recorded sales can be permanently removed.
  const [daily, customerDaily, entries] = await Promise.all([
    c.env.DB.prepare("SELECT 1 AS found FROM nursery_daily_sales WHERE shop_id = ? AND variety_id = ? LIMIT 1").bind(shopId, id).first(),
    c.env.DB.prepare("SELECT 1 AS found FROM nursery_customer_daily_sales WHERE shop_id = ? AND variety_id = ? LIMIT 1").bind(shopId, id).first(),
    c.env.DB.prepare("SELECT 1 AS found FROM nursery_sale_entries WHERE shop_id = ? AND variety_id = ? LIMIT 1").bind(shopId, id).first(),
  ]);
  if (daily || customerDaily || entries) {
    await c.env.DB.prepare("UPDATE nursery_varieties SET is_active = 0, updated_at = ? WHERE id = ? AND shop_id = ?")
      .bind(new Date().toISOString(), id, shopId).run();
    return c.json({ deleted: false, archived: true });
  }

  await c.env.DB.prepare("DELETE FROM nursery_varieties WHERE id = ? AND shop_id = ?").bind(id, shopId).run();
  return c.json({ deleted: true, archived: false });
});

nurseryRouter.post("/nursery/entries/batch", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const userName = c.get("session").userName ?? "User";
  const body = await c.req.json<{
    businessDate?: string;
    paymentMethod?: string;
    customerName?: string;
    customerPhone?: string;
    transactionId?: string;
    items?: Array<{ requestId?: string; varietyId?: string; quantity?: number; unitPrice?: number; sourceSupplierId?: string | null }>;
  }>();
  const businessDate = body.businessDate ?? "";
  const paymentMethod = body.paymentMethod ?? "";
  const customerName = body.customerName?.trim().replace(/\s+/g, " ") ?? "";
  const customerPhone = body.customerPhone?.trim() ?? "";
  const transactionId = body.transactionId ?? "";
  const items = body.items ?? [];
  if (!validDate(businessDate) || !paymentMethods.has(paymentMethod) ||
      (transactionId !== "" && !/^[\w-]{8,80}$/.test(transactionId)) ||
      customerName.length > 120 || customerPhone.length > 40 ||
      (paymentMethod === "credit" && !customerName) ||
      items.length < 1 || items.length > 18) {
    return c.json({ error: "Check the sale date, customer and payment details. Save between 1 and 18 varieties at a time." }, 400);
  }

  const requestIds = new Set<string>();
  for (const item of items) {
    const quantity = Number(item.quantity);
    const unitPrice = Number(item.unitPrice);
    if (!/^[\w-]{8,80}$/.test(item.requestId ?? "") || requestIds.has(item.requestId ?? "") ||
        !item.varietyId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000000 ||
        !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000 ||
        (item.sourceSupplierId != null && (typeof item.sourceSupplierId !== "string" || item.sourceSupplierId.length < 1 || item.sourceSupplierId.length > 120)) ||
        (paymentMethod === "credit" && unitPrice <= 0)) {
      return c.json({ error: "Check every variety, request ID, quantity and unit price. Credit entries require a price above zero." }, 400);
    }
    requestIds.add(item.requestId!);
  }

  const requestIdList = [...requestIds];
  const requestMarks = requestIdList.map(() => "?").join(", ");
  const priorResult = await c.env.DB.prepare(
    `SELECT id FROM nursery_entry_requests WHERE shop_id = ? AND id IN (${requestMarks})`
  ).bind(shopId, ...requestIdList).all<{ id: string }>();
  const priorIds = new Set((priorResult.results ?? []).map(row => row.id));
  const newItems = items.filter(item => !priorIds.has(item.requestId!));
  if (!newItems.length) {
    return c.json({ ok: true, processedItems: items.length, duplicateItems: items.length });
  }

  const varietyIds = [...new Set(newItems.map(item => item.varietyId!))];
  const varietyMarks = varietyIds.map(() => "?").join(", ");
  const varietyResult = await c.env.DB.prepare(
    `SELECT id, name FROM nursery_varieties WHERE shop_id = ? AND is_active = 1 AND id IN (${varietyMarks})`
  ).bind(shopId, ...varietyIds).all<{ id: string; name: string }>();
  const varietiesById = new Map((varietyResult.results ?? []).map(row => [row.id, row]));
  if (varietiesById.size !== varietyIds.length) {
    return c.json({ error: "Choose active seedling varieties belonging to this shop." }, 400);
  }

  const sourceSupplierIds = [...new Set(newItems.map(item => item.sourceSupplierId?.trim()).filter((id): id is string => !!id))];
  const suppliersById = new Map<string, string>();
  if (sourceSupplierIds.length) {
    const supplierMarks = sourceSupplierIds.map(() => "?").join(", ");
    const sourceSuppliers = await c.env.DB.prepare(
      `SELECT id, name FROM suppliers WHERE shop_id = ? AND id IN (${supplierMarks})`
    ).bind(shopId, ...sourceSupplierIds).all<{ id: string; name: string }>();
    for (const supplier of sourceSuppliers.results ?? []) suppliersById.set(supplier.id, supplier.name);
    if (suppliersById.size !== sourceSupplierIds.length) {
      return c.json({ error: "Choose a nursery source belonging to this shop." }, 400);
    }

    const sourcePairs = new Map<string, { supplierId: string; varietyId: string; quantity: number }>();
    for (const item of newItems) {
      const supplierId = item.sourceSupplierId?.trim();
      if (!supplierId) continue;
      const key = `${supplierId}\u0000${item.varietyId}`;
      const existing = sourcePairs.get(key);
      if (existing) existing.quantity += Number(item.quantity);
      else sourcePairs.set(key, { supplierId, varietyId: item.varietyId!, quantity: Number(item.quantity) });
    }
    const pairs = [...sourcePairs.values()];
    const pairFilters = pairs.map(() => "(r.supplier_id = ? AND r.variety_id = ?)").join(" OR ");
    const stockRows = await c.env.DB.prepare(
      `SELECT r.supplier_id AS supplierId, r.variety_id AS varietyId,
        SUM(r.quantity) - COALESCE((
          SELECT SUM(e.quantity) FROM nursery_sale_entries e
          WHERE e.shop_id = r.shop_id AND e.source_supplier_id = r.supplier_id AND e.variety_id = r.variety_id
        ), 0) AS availableQuantity
       FROM nursery_supplier_receipts r
       WHERE r.shop_id = ? AND (${pairFilters})
       GROUP BY r.shop_id, r.supplier_id, r.variety_id`
    ).bind(shopId, ...pairs.flatMap(pair => [pair.supplierId, pair.varietyId])).all<{
      supplierId: string; varietyId: string; availableQuantity: number;
    }>();
    const availableByPair = new Map((stockRows.results ?? []).map(row => [
      `${row.supplierId}\u0000${row.varietyId}`, Number(row.availableQuantity),
    ]));
    const insufficient = pairs.find(pair => (availableByPair.get(`${pair.supplierId}\u0000${pair.varietyId}`) ?? 0) < pair.quantity);
    if (insufficient) {
      const name = varietiesById.get(insufficient.varietyId)?.name ?? "this variety";
      return c.json({ error: `Not enough recorded stock from ${suppliersById.get(insufficient.supplierId)} for ${name}. Refresh the source stock and adjust the quantity.` }, 409);
    }
  }

  const now = new Date().toISOString();
  const customerKey = customerName.toLocaleLowerCase().replace(/\s+/g, " ");
  const statements = [] as D1PreparedStatement[];
  const supplierSales: SupplierSaleForPosting[] = [];
  if (customerName) {
    statements.push(c.env.DB.prepare(
      `INSERT INTO customers (id, shop_id, name, phone, email, notes, credit_limit, created_at, updated_at)
       SELECT ?, ?, ?, ?, NULL, NULL, NULL, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM customers WHERE shop_id = ? AND lower(trim(name)) = ?)`
    ).bind(crypto.randomUUID(), shopId, customerName, customerPhone, now, now, shopId, customerKey));
  }

  for (const item of newItems) {
    const variety = varietiesById.get(item.varietyId!)!;
    const quantity = Number(item.quantity);
    const unitPriceCents = Math.round(Number(item.unitPrice) * 100);
    const totalAmountCents = quantity * unitPriceCents;
    const requestId = item.requestId!;
    const debtId = paymentMethod === "credit" ? crypto.randomUUID() : null;
    const sale = {
      id: crypto.randomUUID(),
      requestId,
      shopId,
      businessDate,
      varietyId: variety.id,
      varietyName: variety.name,
      customerName,
      customerPhone,
      quantity,
      unitPriceCents,
      totalAmountCents,
      paymentMethod,
      debtId,
      createdAt: now,
    };
    const sourceSupplierId = item.sourceSupplierId?.trim() || null;

    statements.push(c.env.DB.prepare(
      `INSERT INTO nursery_daily_sales
        (id, shop_id, business_date, variety_id, unit_price_cents, payment_method, quantity, total_amount_cents, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)
       ON CONFLICT(shop_id, business_date, variety_id, unit_price_cents, payment_method)
       DO UPDATE SET quantity = nursery_daily_sales.quantity + excluded.quantity,
         total_amount_cents = nursery_daily_sales.total_amount_cents + excluded.total_amount_cents,
         updated_at = excluded.updated_at`
    ).bind(crypto.randomUUID(), shopId, businessDate, variety.id, unitPriceCents, paymentMethod,
      quantity, totalAmountCents, now, now, requestId, shopId));

    if (customerName) {
      statements.push(c.env.DB.prepare(
        `INSERT INTO nursery_customer_daily_sales
          (id, shop_id, business_date, customer_key, customer_name, customer_phone, variety_id, unit_price_cents, payment_method, quantity, total_amount_cents, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)
         ON CONFLICT(shop_id, business_date, customer_key, variety_id, unit_price_cents, payment_method)
         DO UPDATE SET quantity = nursery_customer_daily_sales.quantity + excluded.quantity,
           total_amount_cents = nursery_customer_daily_sales.total_amount_cents + excluded.total_amount_cents,
           customer_name = excluded.customer_name,
           customer_phone = CASE WHEN excluded.customer_phone != '' THEN excluded.customer_phone ELSE nursery_customer_daily_sales.customer_phone END,
           updated_at = excluded.updated_at`
      ).bind(crypto.randomUUID(), shopId, businessDate, customerKey, customerName, customerPhone,
        variety.id, unitPriceCents, paymentMethod, quantity, totalAmountCents, now, now, requestId, shopId));
    }

    if (debtId) {
      const unitPrice = unitPriceCents / 100;
      const totalAmount = totalAmountCents / 100;
      const itemsJson = JSON.stringify([{
        productName: `Nursery seedlings — ${variety.name}`,
        qty: quantity,
        unitPrice,
        totalPrice: totalAmount,
      }]);
      statements.push(c.env.DB.prepare(
        `INSERT INTO debts
          (id, shop_id, sale_id, customer_name, customer_phone, total_amount, amount_paid, balance, status, notes, items_json, paid_at, created_at)
         SELECT ?, ?, NULL, ?, ?, ?, 0, ?, 'unpaid', ?, ?, NULL, ?
         WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)`
      ).bind(debtId, shopId, customerName, customerPhone, totalAmount, totalAmount,
        "Nursery register credit sale", itemsJson, now, requestId, shopId));
    }

    statements.push(c.env.DB.prepare(
      `INSERT INTO nursery_sale_entries
        (id, request_id, shop_id, business_date, variety_id, variety_name, customer_name, customer_phone, quantity, unit_price_cents, total_amount_cents, payment_method, debt_id, transaction_id, source_supplier_id, source_supplier_name, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)`
    ).bind(sale.id, requestId, shopId, businessDate, variety.id, variety.name,
      customerName, customerPhone, quantity, unitPriceCents, totalAmountCents,
      paymentMethod, debtId, transactionId || requestId, sourceSupplierId,
      sourceSupplierId ? suppliersById.get(sourceSupplierId) ?? "" : null, now, requestId, shopId));
    if (sourceSupplierId) {
      supplierSales.push({ entryId: sale.id, supplierId: sourceSupplierId, varietyName: variety.name, quantity, totalAmountCents });
    }

    statements.push(c.env.DB.prepare(
      "INSERT OR IGNORE INTO nursery_entry_requests (id, shop_id, created_at, debt_id) VALUES (?, ?, ?, ?)"
    ).bind(requestId, shopId, now, debtId));
  }

  statements.push(...await buildSupplierProceedsStatements(c.env.DB, shopId, supplierSales, now));

  const autoSyncItems = paymentMethod !== "credit"
    ? newItems.filter((item) => !item.sourceSupplierId?.trim() && Math.round(Number(item.unitPrice) * 100) > 0)
    : [];
  const autoSyncGrossCents = autoSyncItems.reduce(
    (sum, item) => sum + Number(item.quantity) * Math.round(Number(item.unitPrice) * 100),
    0,
  );
  let autoSyncApplied = false;
  if (autoSyncGrossCents > 0) {
    const syncConfig = await getNurserySyncConfig(c.env.DB, c.env.SESSIONS, shopId);
    if (syncConfig.enabled) {
      const varietySummary = autoSyncItems
        .slice(0, 2)
        .map((i) => `${varietiesById.get(i.varietyId!)?.name ?? "Seedlings"} × ${Number(i.quantity)}`)
        .join(", ");
      const moreSuffix = autoSyncItems.length > 2 ? ` +${autoSyncItems.length - 2} more` : "";
      const built = await buildCreditOwnerStatements({
        d1: c.env.DB,
        db: createDb(c.env.DB),
        shopId,
        config: syncConfig,
        grossCents: autoSyncGrossCents,
        sourceKey: `nursery-batch:${newItems[0]!.requestId!}`,
        sourceType: "nursery_sale",
        label: `${paymentMethod.toUpperCase()} · ${varietySummary}${moreSuffix}`,
        recordedBy: "Nursery Auto-Sync",
        now,
      });
      if (built.statements.length > 0) {
        statements.push(...built.statements);
        autoSyncApplied = true;
      }
    }
  }

  try {
    await c.env.DB.batch(statements);
  } catch (error) {
    if (String(error).includes("Insufficient nursery supplier stock")) {
      return c.json({ error: "Supplier stock changed while the sale was being saved. Refresh the source stock and try again." }, 409);
    }
    throw error;
  }
  if (supplierSales.length || autoSyncApplied || paymentMethod === "credit") {
    await invalidateDebtViews(c.env, shopId);
  }
  return c.json({ ok: true, processedItems: items.length, duplicateItems: priorIds.size });
});

nurseryRouter.post("/nursery/entries", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const body = await c.req.json<{
    requestId?: string; businessDate?: string; varietyId?: string;
    quantity?: number; unitPrice?: number; paymentMethod?: string;
    customerName?: string; customerPhone?: string; transactionId?: string;
  }>();
  const businessDate = body.businessDate ?? "";
  const quantity = Number(body.quantity);
  const unitPrice = Number(body.unitPrice);
  const paymentMethod = body.paymentMethod ?? "";
  const requestId = body.requestId ?? "";
  const transactionId = body.transactionId ?? requestId;
  const customerName = body.customerName?.trim().replace(/\s+/g, " ") ?? "";
  const customerPhone = body.customerPhone?.trim() ?? "";
  if (!/^[\w-]{8,80}$/.test(requestId) || !/^[\w-]{8,80}$/.test(transactionId) || !validDate(businessDate) ||
      !body.varietyId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000000 ||
      !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000 ||
      !paymentMethods.has(paymentMethod) || customerName.length > 120 || customerPhone.length > 40 ||
      (paymentMethod === "credit" && (!customerName || unitPrice <= 0))) {
    return c.json({ error: paymentMethod === "credit"
      ? "Credit sales need a customer name, a valid phone if available, and a price above zero."
      : "Check the date, variety, quantity, price, customer details and payment method." }, 400);
  }
  const prior = await c.env.DB.prepare(
    "SELECT id, debt_id AS debtId FROM nursery_entry_requests WHERE id = ? AND shop_id = ?"
  ).bind(requestId, shopId).first<{ id: string; debtId: string | null }>();
  if (prior) {
    const existingEntry = await c.env.DB.prepare(
      "SELECT id, created_at AS createdAt FROM nursery_sale_entries WHERE shop_id = ? AND request_id = ?"
    ).bind(shopId, requestId).first<{ id: string; createdAt: string }>();
    return c.json({ ok: true, id: existingEntry?.id ?? null, requestId, debtId: prior.debtId, createdAt: existingEntry?.createdAt ?? null, duplicate: true });
  }

  const variety = await c.env.DB.prepare(
    "SELECT id, name FROM nursery_varieties WHERE id = ? AND shop_id = ? AND is_active = 1"
  ).bind(body.varietyId, shopId).first<{ id: string; name: string }>();
  if (!variety) return c.json({ error: "Choose an active seedling variety for this shop." }, 400);

  const unitPriceCents = Math.round(unitPrice * 100);
  const totalCents = quantity * unitPriceCents;
  const totalAmount = totalCents / 100;
  const now = new Date().toISOString();
  const entryId = crypto.randomUUID();
  const debtId = paymentMethod === "credit" ? crypto.randomUUID() : null;
  const customerKey = customerName.toLocaleLowerCase().replace(/\s+/g, " ");
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO nursery_daily_sales
        (id, shop_id, business_date, variety_id, unit_price_cents, payment_method, quantity, total_amount_cents, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)
       ON CONFLICT(shop_id, business_date, variety_id, unit_price_cents, payment_method)
       DO UPDATE SET quantity = nursery_daily_sales.quantity + excluded.quantity,
         total_amount_cents = nursery_daily_sales.total_amount_cents + excluded.total_amount_cents,
         updated_at = excluded.updated_at`
    ).bind(crypto.randomUUID(), shopId, businessDate, variety.id, unitPriceCents, paymentMethod,
      quantity, totalCents, now, now, requestId, shopId),
  ];

  if (customerName) {
    statements.push(c.env.DB.prepare(
      `INSERT INTO customers (id, shop_id, name, phone, email, notes, credit_limit, created_at, updated_at)
       SELECT ?, ?, ?, ?, NULL, NULL, NULL, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM customers WHERE shop_id = ? AND lower(trim(name)) = ?)`
    ).bind(crypto.randomUUID(), shopId, customerName, customerPhone, now, now, shopId, customerKey));
    statements.push(c.env.DB.prepare(
      `INSERT INTO nursery_customer_daily_sales
        (id, shop_id, business_date, customer_key, customer_name, customer_phone, variety_id, unit_price_cents, payment_method, quantity, total_amount_cents, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)
       ON CONFLICT(shop_id, business_date, customer_key, variety_id, unit_price_cents, payment_method)
       DO UPDATE SET quantity = nursery_customer_daily_sales.quantity + excluded.quantity,
         total_amount_cents = nursery_customer_daily_sales.total_amount_cents + excluded.total_amount_cents,
         customer_name = excluded.customer_name,
         customer_phone = CASE WHEN excluded.customer_phone != '' THEN excluded.customer_phone ELSE nursery_customer_daily_sales.customer_phone END,
         updated_at = excluded.updated_at`
    ).bind(crypto.randomUUID(), shopId, businessDate, customerKey, customerName, customerPhone,
      variety.id, unitPriceCents, paymentMethod, quantity, totalCents, now, now, requestId, shopId));
  }

  if (debtId) {
    const itemsJson = JSON.stringify([{
      productName: `Nursery seedlings — ${variety.name}`,
      qty: quantity,
      unitPrice,
      totalPrice: totalAmount,
    }]);
    statements.push(c.env.DB.prepare(
      `INSERT INTO debts
        (id, shop_id, sale_id, customer_name, customer_phone, total_amount, amount_paid, balance, status, notes, items_json, paid_at, created_at)
       SELECT ?, ?, NULL, ?, ?, ?, 0, ?, 'unpaid', ?, ?, NULL, ?
       WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)`
    ).bind(debtId, shopId, customerName, customerPhone, totalAmount, totalAmount,
      "Nursery register credit sale", itemsJson, now, requestId, shopId));
  }

  statements.push(c.env.DB.prepare(
    `INSERT INTO nursery_sale_entries
      (id, request_id, shop_id, business_date, variety_id, variety_name, customer_name, customer_phone, quantity, unit_price_cents, total_amount_cents, payment_method, debt_id, transaction_id, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE NOT EXISTS (SELECT 1 FROM nursery_entry_requests WHERE id = ? AND shop_id = ?)`
  ).bind(entryId, requestId, shopId, businessDate, variety.id, variety.name,
    customerName, customerPhone, quantity, unitPriceCents, totalCents, paymentMethod, debtId, transactionId, now, requestId, shopId));

  statements.push(c.env.DB.prepare(
    "INSERT OR IGNORE INTO nursery_entry_requests (id, shop_id, created_at, debt_id) VALUES (?, ?, ?, ?)"
  ).bind(requestId, shopId, now, debtId));

  let autoSyncApplied = false;
  if (paymentMethod !== "credit" && totalCents > 0) {
    const syncConfig = await getNurserySyncConfig(c.env.DB, c.env.SESSIONS, shopId);
    if (syncConfig.enabled) {
      const built = await buildCreditOwnerStatements({
        d1: c.env.DB,
        db: createDb(c.env.DB),
        shopId,
        config: syncConfig,
        grossCents: totalCents,
        sourceKey: `nursery-entry:${requestId}`,
        sourceType: "nursery_sale",
        label: `${paymentMethod.toUpperCase()} · ${variety.name} × ${quantity}`,
        recordedBy: "Nursery Auto-Sync",
        now,
      });
      if (built.statements.length > 0) {
        statements.push(...built.statements);
        autoSyncApplied = true;
      }
    }
  }

  await c.env.DB.batch(statements);
  if (debtId || autoSyncApplied) await invalidateDebtViews(c.env, shopId);
  const saved = await c.env.DB.prepare(
    "SELECT debt_id AS debtId FROM nursery_entry_requests WHERE id = ? AND shop_id = ?"
  ).bind(requestId, shopId).first<{ debtId: string | null }>();
  return c.json({ ok: true, id: entryId, requestId, businessDate, varietyId: variety.id, varietyName: variety.name, customerName, customerPhone, quantity, unitPriceCents, totalAmountCents: totalCents, paymentMethod, debtId: saved?.debtId ?? null, createdAt: now });
});


function adjustNurseryAggregateStatements(
  db: AppEnv["Bindings"]["DB"],
  shopId: string,
  sale: { businessDate: string; varietyId: string; unitPriceCents: number; paymentMethod: string; quantity: number; totalAmountCents: number; customerName: string; customerPhone: string },
  direction: 1 | -1,
  now: string,
) {
  const quantity = sale.quantity * direction;
  const total = sale.totalAmountCents * direction;
  const statements = [];
  if (direction < 0) {
    // Remove a one-entry aggregate before decrementing it; the table requires
    // quantity > 0, so updating it to zero would fail before a later DELETE.
    statements.push(db.prepare(
      "DELETE FROM nursery_daily_sales WHERE shop_id = ? AND business_date = ? AND variety_id = ? AND unit_price_cents = ? AND payment_method = ? AND quantity = ?"
    ).bind(shopId, sale.businessDate, sale.varietyId, sale.unitPriceCents, sale.paymentMethod, sale.quantity));
  }
  statements.push(db.prepare(
    direction < 0
      ? "UPDATE nursery_daily_sales SET quantity = quantity + ?, total_amount_cents = total_amount_cents + ?, updated_at = ? WHERE shop_id = ? AND business_date = ? AND variety_id = ? AND unit_price_cents = ? AND payment_method = ? AND quantity > ?"
      : "UPDATE nursery_daily_sales SET quantity = quantity + ?, total_amount_cents = total_amount_cents + ?, updated_at = ? WHERE shop_id = ? AND business_date = ? AND variety_id = ? AND unit_price_cents = ? AND payment_method = ?"
  ).bind(quantity, total, now, shopId, sale.businessDate, sale.varietyId, sale.unitPriceCents, sale.paymentMethod, ...(direction < 0 ? [sale.quantity] : [])));
  const customerKey = sale.customerName.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (customerKey) {
    if (direction < 0) {
      statements.push(db.prepare(
        "DELETE FROM nursery_customer_daily_sales WHERE shop_id = ? AND business_date = ? AND customer_key = ? AND variety_id = ? AND unit_price_cents = ? AND payment_method = ? AND quantity = ?"
      ).bind(shopId, sale.businessDate, customerKey, sale.varietyId, sale.unitPriceCents, sale.paymentMethod, sale.quantity));
    }
    statements.push(db.prepare(
      direction < 0
        ? "UPDATE nursery_customer_daily_sales SET quantity = quantity + ?, total_amount_cents = total_amount_cents + ?, updated_at = ? WHERE shop_id = ? AND business_date = ? AND customer_key = ? AND variety_id = ? AND unit_price_cents = ? AND payment_method = ? AND quantity > ?"
        : "UPDATE nursery_customer_daily_sales SET quantity = quantity + ?, total_amount_cents = total_amount_cents + ?, updated_at = ? WHERE shop_id = ? AND business_date = ? AND customer_key = ? AND variety_id = ? AND unit_price_cents = ? AND payment_method = ?"
    ).bind(quantity, total, now, shopId, sale.businessDate, customerKey, sale.varietyId, sale.unitPriceCents, sale.paymentMethod, ...(direction < 0 ? [sale.quantity] : [])));
  }
  return statements;
}

nurseryRouter.patch("/nursery/entries/:id", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const id = c.req.param("id");
  const body = await c.req.json<{
    businessDate?: string; varietyId?: string; quantity?: number; unitPrice?: number;
    paymentMethod?: string; customerName?: string; customerPhone?: string;
  }>();
  const businessDate = body.businessDate ?? "";
  const quantity = Number(body.quantity);
  const unitPrice = Number(body.unitPrice);
  const paymentMethod = body.paymentMethod ?? "";
  const customerName = body.customerName?.trim().replace(/\s+/g, " ") ?? "";
  const customerPhone = body.customerPhone?.trim() ?? "";
  if (!validDate(businessDate) || !body.varietyId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000000 ||
      !Number.isFinite(unitPrice) || unitPrice < 0 || unitPrice > 1000000 || !paymentMethods.has(paymentMethod) ||
      customerName.length > 120 || customerPhone.length > 40 ||
      (paymentMethod === "credit" && (!customerName || unitPrice <= 0))) {
    return c.json({ error: "Check the date, variety, quantity, price, customer details and payment method." }, 400);
  }

  const old = await c.env.DB.prepare(
    "SELECT id, request_id AS requestId, business_date AS businessDate, variety_id AS varietyId, variety_name AS varietyName, customer_name AS customerName, customer_phone AS customerPhone, quantity, unit_price_cents AS unitPriceCents, total_amount_cents AS totalAmountCents, payment_method AS paymentMethod, debt_id AS debtId, transaction_id AS transactionId, source_supplier_id AS sourceSupplierId, source_supplier_name AS sourceSupplierName, created_at AS createdAt FROM nursery_sale_entries WHERE id = ? AND shop_id = ?"
  ).bind(id, shopId).first<{
    id: string; requestId: string; businessDate: string; varietyId: string; varietyName: string;
    customerName: string; customerPhone: string; quantity: number; unitPriceCents: number;
    totalAmountCents: number; paymentMethod: string; debtId: string | null; transactionId: string | null; createdAt: string;
    sourceSupplierId: string | null; sourceSupplierName: string | null;
  }>();
  if (!old) return c.json({ error: "Sale entry not found." }, 404);
  if (old.sourceSupplierId) {
    return c.json({ error: "This sale is linked to supplier stock and a debt-credit ledger. It cannot be edited after posting." }, 409);
  }

  const variety = await c.env.DB.prepare(
    "SELECT id, name FROM nursery_varieties WHERE id = ? AND shop_id = ?"
  ).bind(body.varietyId, shopId).first<{ id: string; name: string }>();
  if (!variety) return c.json({ error: "Choose a variety belonging to this shop." }, 400);

  let oldDebt: { amount_paid: number; total_amount: number } | null = null;
  if (old.debtId) {
    oldDebt = await c.env.DB.prepare("SELECT amount_paid, total_amount FROM debts WHERE id = ? AND shop_id = ?")
      .bind(old.debtId, shopId).first<{ amount_paid: number; total_amount: number }>();
    if (!oldDebt && paymentMethod === "credit") {
      return c.json({ error: "The linked customer debt could not be found. Refresh the debt records before editing this credit sale." }, 409);
    }
    if (oldDebt && Number(oldDebt.amount_paid) > 0) {
      return c.json({ error: "This credit sale already has a payment recorded. Reconcile the customer debt before editing this sale." }, 409);
    }
  }

  const unitPriceCents = Math.round(unitPrice * 100);
  const totalAmountCents = quantity * unitPriceCents;
  const now = new Date().toISOString();
  let linkedDebtId = paymentMethod === "credit" ? old.debtId : null;
  const oldAggregate = {
    businessDate: old.businessDate, varietyId: old.varietyId, unitPriceCents: old.unitPriceCents,
    paymentMethod: old.paymentMethod, quantity: old.quantity, totalAmountCents: old.totalAmountCents,
    customerName: old.customerName, customerPhone: old.customerPhone,
  };
  const statements = [
    ...adjustNurseryAggregateStatements(c.env.DB, shopId, oldAggregate, -1, now),
    c.env.DB.prepare(
      "INSERT INTO nursery_daily_sales (id, shop_id, business_date, variety_id, unit_price_cents, payment_method, quantity, total_amount_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(shop_id, business_date, variety_id, unit_price_cents, payment_method) DO UPDATE SET quantity = nursery_daily_sales.quantity + excluded.quantity, total_amount_cents = nursery_daily_sales.total_amount_cents + excluded.total_amount_cents, updated_at = excluded.updated_at"
    ).bind(crypto.randomUUID(), shopId, businessDate, variety.id, unitPriceCents, paymentMethod, quantity, totalAmountCents, now, now),
    c.env.DB.prepare(
      "INSERT INTO nursery_sale_entries (id, request_id, shop_id, business_date, variety_id, variety_name, customer_name, customer_phone, quantity, unit_price_cents, total_amount_cents, payment_method, debt_id, transaction_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(shop_id, request_id) DO UPDATE SET business_date = excluded.business_date, variety_id = excluded.variety_id, variety_name = excluded.variety_name, customer_name = excluded.customer_name, customer_phone = excluded.customer_phone, quantity = excluded.quantity, unit_price_cents = excluded.unit_price_cents, total_amount_cents = excluded.total_amount_cents, payment_method = excluded.payment_method, debt_id = excluded.debt_id"
     ).bind(old.id, old.requestId, shopId, businessDate, variety.id, variety.name, customerName, customerPhone, quantity, unitPriceCents, totalAmountCents, paymentMethod, linkedDebtId, old.transactionId, old.createdAt ?? now),
  ];

  if (old.debtId && paymentMethod !== "credit") {
    statements.push(c.env.DB.prepare("DELETE FROM debts WHERE id = ? AND shop_id = ? AND amount_paid = 0").bind(old.debtId, shopId));
    statements.push(c.env.DB.prepare("UPDATE nursery_entry_requests SET debt_id = NULL WHERE id = ? AND shop_id = ?").bind(old.requestId, shopId));
  } else if (paymentMethod === "credit" && old.debtId) {
    const itemsJson = JSON.stringify([{ productName: "Nursery seedlings — " + variety.name, qty: quantity, unitPrice, totalPrice: totalAmountCents / 100 }]);
    statements.push(c.env.DB.prepare(
      "UPDATE debts SET customer_name = ?, customer_phone = ?, total_amount = ?, balance = ?, status = CASE WHEN ? = 0 THEN 'unpaid' ELSE 'partial' END, items_json = ?, notes = 'Nursery register credit sale' WHERE id = ? AND shop_id = ? AND amount_paid = 0"
    ).bind(customerName, customerPhone, totalAmountCents / 100, totalAmountCents / 100, 0, itemsJson, old.debtId, shopId));
  } else if (paymentMethod === "credit" && !old.debtId) {
    linkedDebtId = crypto.randomUUID();
    const itemsJson = JSON.stringify([{ productName: "Nursery seedlings — " + variety.name, qty: quantity, unitPrice, totalPrice: totalAmountCents / 100 }]);
    statements.push(c.env.DB.prepare(
      "INSERT INTO debts (id, shop_id, sale_id, customer_name, customer_phone, total_amount, amount_paid, balance, status, notes, items_json, paid_at, created_at) VALUES (?, ?, NULL, ?, ?, ?, 0, ?, 'unpaid', 'Nursery register credit sale', ?, NULL, ?)"
    ).bind(linkedDebtId, shopId, customerName, customerPhone, totalAmountCents / 100, totalAmountCents / 100, itemsJson, now));
    statements.push(c.env.DB.prepare("UPDATE nursery_sale_entries SET debt_id = ? WHERE id = ? AND shop_id = ?").bind(linkedDebtId, id, shopId));
    statements.push(c.env.DB.prepare("UPDATE nursery_entry_requests SET debt_id = ? WHERE id = ? AND shop_id = ?").bind(linkedDebtId, old.requestId, shopId));
  }

  if (customerName) {
    const customerKey = customerName.toLocaleLowerCase().replace(/\s+/g, " ");
    statements.push(c.env.DB.prepare(
      "INSERT INTO customers (id, shop_id, name, phone, email, notes, credit_limit, created_at, updated_at) SELECT ?, ?, ?, ?, NULL, NULL, NULL, ?, ? WHERE NOT EXISTS (SELECT 1 FROM customers WHERE shop_id = ? AND lower(trim(name)) = ?)"
    ).bind(crypto.randomUUID(), shopId, customerName, customerPhone, now, now, shopId, customerKey));
    statements.push(c.env.DB.prepare(
      "INSERT INTO nursery_customer_daily_sales (id, shop_id, business_date, customer_key, customer_name, customer_phone, variety_id, unit_price_cents, payment_method, quantity, total_amount_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(shop_id, business_date, customer_key, variety_id, unit_price_cents, payment_method) DO UPDATE SET quantity = nursery_customer_daily_sales.quantity + excluded.quantity, total_amount_cents = nursery_customer_daily_sales.total_amount_cents + excluded.total_amount_cents, customer_name = excluded.customer_name, customer_phone = CASE WHEN excluded.customer_phone != '' THEN excluded.customer_phone ELSE nursery_customer_daily_sales.customer_phone END, updated_at = excluded.updated_at"
    ).bind(crypto.randomUUID(), shopId, businessDate, customerKey, customerName, customerPhone, variety.id, unitPriceCents, paymentMethod, quantity, totalAmountCents, now, now));
  }

  const oldCollectedCents = old.paymentMethod !== "credit" ? old.totalAmountCents : 0;
  const newCollectedCents = paymentMethod !== "credit" ? totalAmountCents : 0;
  const deltaCollectedCents = newCollectedCents - oldCollectedCents;
  let syncTouchedDebts = Boolean(old.debtId || linkedDebtId);
  if (deltaCollectedCents !== 0) {
    const syncConfig = await getNurserySyncConfig(c.env.DB, c.env.SESSIONS, shopId);
    if (syncConfig.enabled) {
      if (deltaCollectedCents > 0) {
        const built = await buildCreditOwnerStatements({
          d1: c.env.DB,
          db: createDb(c.env.DB),
          shopId,
          config: syncConfig,
          grossCents: deltaCollectedCents,
          sourceKey: `nursery-edit:${id}:${crypto.randomUUID()}`,
          sourceType: "nursery_adjustment",
          label: `Edited sale (${variety.name} × ${quantity})`,
          recordedBy: "Nursery Auto-Sync",
          now,
        });
        statements.push(...built.statements);
        syncTouchedDebts = true;
      } else {
        const adj = await buildDebitOwnerAdjustmentStatements({
          d1: c.env.DB,
          db: createDb(c.env.DB),
          shopId,
          config: syncConfig,
          grossReductionCents: Math.abs(deltaCollectedCents),
          sourceKey: `nursery-edit:${id}:${crypto.randomUUID()}`,
          label: `Reduced/changed sale (${variety.name})`,
          recordedBy: "Nursery Auto-Sync",
          now,
        });
        if (!adj.ok) {
          return c.json({ error: adj.error }, 409);
        }
        statements.push(...adj.statements);
        syncTouchedDebts = true;
      }
    }
  }

  await c.env.DB.batch(statements);
  if (syncTouchedDebts) await invalidateDebtViews(c.env, shopId);
  return c.json({ ok: true, id, businessDate, varietyId: variety.id, varietyName: variety.name, customerName, customerPhone, quantity, unitPriceCents, totalAmountCents, paymentMethod, debtId: linkedDebtId, createdAt: old.createdAt });
});

nurseryRouter.delete("/nursery/entries/:id", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const id = c.req.param("id");
  const old = await c.env.DB.prepare(
    "SELECT id, request_id AS requestId, business_date AS businessDate, variety_id AS varietyId, customer_name AS customerName, customer_phone AS customerPhone, quantity, unit_price_cents AS unitPriceCents, total_amount_cents AS totalAmountCents, payment_method AS paymentMethod, debt_id AS debtId, source_supplier_id AS sourceSupplierId FROM nursery_sale_entries WHERE id = ? AND shop_id = ?"
  ).bind(id, shopId).first<{
    id: string; requestId: string; businessDate: string; varietyId: string; customerName: string; customerPhone: string;
    quantity: number; unitPriceCents: number; totalAmountCents: number; paymentMethod: string; debtId: string | null; sourceSupplierId: string | null;
  }>();
  if (!old) return c.json({ error: "Sale entry not found." }, 404);
  if (old.sourceSupplierId) {
    return c.json({ error: "This sale is linked to supplier stock and a debt-credit ledger. It cannot be deleted after posting." }, 409);
  }
  if (old.debtId) {
    const debt = await c.env.DB.prepare("SELECT amount_paid FROM debts WHERE id = ? AND shop_id = ?")
      .bind(old.debtId, shopId).first<{ amount_paid: number }>();
    if (debt && Number(debt.amount_paid) > 0) {
      return c.json({ error: "This credit sale has a payment recorded. Reconcile the customer debt before deleting the sale." }, 409);
    }
  }

  const now = new Date().toISOString();
  const statements = adjustNurseryAggregateStatements(c.env.DB, shopId, old, -1, now);
  statements.push(c.env.DB.prepare("DELETE FROM nursery_sale_entries WHERE id = ? AND shop_id = ?").bind(id, shopId));
  if (old.debtId) {
    statements.push(c.env.DB.prepare("DELETE FROM debts WHERE id = ? AND shop_id = ? AND amount_paid = 0").bind(old.debtId, shopId));
    statements.push(c.env.DB.prepare("UPDATE nursery_entry_requests SET debt_id = NULL WHERE id = ? AND shop_id = ?").bind(old.requestId, shopId));
  }
  let syncTouchedDebts = Boolean(old.debtId);
  if (old.paymentMethod !== "credit" && old.totalAmountCents > 0) {
    const syncConfig = await getNurserySyncConfig(c.env.DB, c.env.SESSIONS, shopId);
    if (syncConfig.enabled) {
      const adj = await buildDebitOwnerAdjustmentStatements({
        d1: c.env.DB,
        db: createDb(c.env.DB),
        shopId,
        config: syncConfig,
        grossReductionCents: old.totalAmountCents,
        sourceKey: `nursery-delete:${id}`,
        label: "Deleted nursery sale",
        recordedBy: "Nursery Auto-Sync",
        now,
      });
      if (!adj.ok) {
        return c.json({ error: adj.error }, 409);
      }
      statements.push(...adj.statements);
      syncTouchedDebts = true;
    }
  }
  await c.env.DB.batch(statements);
  if (syncTouchedDebts) await invalidateDebtViews(c.env, shopId);
  return c.json({ ok: true, deleted: true });
});

nurseryRouter.get("/nursery/report", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!validDate(from) || !validDate(to) || from > to) {
    return c.json({ error: "Choose a valid report date range." }, 400);
  }
  const page = Math.max(1, Math.floor(Number(c.req.query("page") ?? 1) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(c.req.query("pageSize") ?? 20) || 20)));
  const offset = (page - 1) * pageSize;
   // Aggregate by normalized name so duplicate catalogue entries and daily rows roll up together.
  const rows = await c.env.DB.prepare(
      `SELECT LOWER(TRIM(v.name)) AS varietyKey, MIN(TRIM(v.name)) AS varietyName,
        COALESCE(SUM(s.quantity), 0) AS quantity,
        COALESCE(SUM(s.total_amount_cents), 0) AS totalAmountCents,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_amount_cents ELSE 0 END), 0) AS cashCents,
        COALESCE(SUM(CASE WHEN s.payment_method = 'mpesa' THEN s.total_amount_cents ELSE 0 END), 0) AS mpesaCents,
        COALESCE(SUM(CASE WHEN s.payment_method = 'credit' THEN s.total_amount_cents ELSE 0 END), 0) AS creditCents
     FROM nursery_daily_sales s
     JOIN nursery_varieties v ON v.id = s.variety_id AND v.shop_id = s.shop_id
     WHERE s.shop_id = ? AND s.business_date >= ? AND s.business_date <= ?
       GROUP BY LOWER(TRIM(v.name))
       ORDER BY quantity DESC, varietyName COLLATE NOCASE
     LIMIT ? OFFSET ?`
  ).bind(shopId, from, to, pageSize, offset).all();
  const count = await c.env.DB.prepare(
      `SELECT COUNT(DISTINCT LOWER(TRIM(v.name))) AS total
       FROM nursery_daily_sales s
       JOIN nursery_varieties v ON v.id = s.variety_id AND v.shop_id = s.shop_id
       WHERE s.shop_id = ? AND s.business_date >= ? AND s.business_date <= ?`
  ).bind(shopId, from, to).first<{ total: number }>();
  const summary = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS totalSeedlings,
      COALESCE(SUM(total_amount_cents), 0) AS totalRevenueCents,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount_cents ELSE 0 END), 0) AS cashCents,
      COALESCE(SUM(CASE WHEN payment_method = 'mpesa' THEN total_amount_cents ELSE 0 END), 0) AS mpesaCents,
      COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount_cents ELSE 0 END), 0) AS creditCents
     FROM nursery_daily_sales WHERE shop_id = ? AND business_date >= ? AND business_date <= ?`
  ).bind(shopId, from, to).first();
  const dailySummary = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS totalSeedlings,
      COALESCE(SUM(total_amount_cents), 0) AS totalRevenueCents,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount_cents ELSE 0 END), 0) AS cashCents,
      COALESCE(SUM(CASE WHEN payment_method = 'mpesa' THEN total_amount_cents ELSE 0 END), 0) AS mpesaCents,
      COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount_cents ELSE 0 END), 0) AS creditCents
     FROM nursery_daily_sales WHERE shop_id = ? AND business_date = ?`
  ).bind(shopId, c.req.query("businessDate") ?? to).first();
  return c.json({ rows: rows.results ?? [], summary, dailySummary, total: Number(count?.total ?? 0), page, pageSize });
});



nurseryRouter.get("/nursery/analytics", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  const bucket = c.req.query("bucket") ?? "day";

  if (!validDate(from) || !validDate(to) || from > to) {
    return c.json({ error: "Choose a valid analytics date range." }, 400);
  }
  if (bucket !== "day" && bucket !== "month") {
    return c.json({ error: "Choose a daily or monthly analytics view." }, 400);
  }

  const periodExpression = bucket === "month" ? "substr(business_date, 1, 7)" : "business_date";
  const rows = await c.env.DB.prepare(
    `SELECT ${periodExpression} AS period,
      COALESCE(SUM(quantity), 0) AS seedlingsSold,
      COALESCE(SUM(total_amount_cents), 0) AS totalRevenueCents,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount_cents ELSE 0 END), 0) AS cashCents,
      COALESCE(SUM(CASE WHEN payment_method = 'mpesa' THEN total_amount_cents ELSE 0 END), 0) AS mpesaCents,
      COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount_cents ELSE 0 END), 0) AS creditCents
     FROM nursery_daily_sales
     WHERE shop_id = ? AND business_date >= ? AND business_date <= ?
     GROUP BY ${periodExpression}
     ORDER BY period`
  ).bind(shopId, from, to).all();

  return c.json({ from, to, bucket, rows: rows.results ?? [] });
});

nurseryRouter.get("/nursery/transactions/:transactionId", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const transactionId = c.req.param("transactionId");
  const result = await c.env.DB.prepare(
    `SELECT id, request_id AS requestId, business_date AS businessDate, variety_id AS varietyId,
      variety_name AS varietyName, customer_name AS customerName, customer_phone AS customerPhone,
      quantity, unit_price_cents AS unitPriceCents, total_amount_cents AS totalAmountCents,
      payment_method AS paymentMethod, debt_id AS debtId, transaction_id AS transactionId,
      source_supplier_id AS sourceSupplierId, source_supplier_name AS sourceSupplierName, created_at AS createdAt
     FROM nursery_sale_entries
     WHERE shop_id = ? AND transaction_id = ?
     ORDER BY created_at ASC, id ASC`
  ).bind(shopId, transactionId).all();
  const entries = result.results ?? [];
  if (!entries.length) return c.json({ error: "Transaction not found. Older entries may not have a saved transaction group." }, 404);
  const first = entries[0] as { businessDate: string; customerName: string; customerPhone: string; paymentMethod: string };
  return c.json({
    transactionId, businessDate: first.businessDate, customerName: first.customerName,
    customerPhone: first.customerPhone, paymentMethod: first.paymentMethod, rows: entries,
    totalQuantity: entries.reduce((sum, row) => sum + Number((row as any).quantity || 0), 0),
    totalAmountCents: entries.reduce((sum, row) => sum + Number((row as any).totalAmountCents || 0), 0),
  });
});

nurseryRouter.get("/nursery/entries", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  const page = Math.max(1, Math.floor(Number(c.req.query("page") ?? 1) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(c.req.query("pageSize") ?? 25) || 25)));
  const offset = (page - 1) * pageSize;
  const search = (c.req.query("search") ?? "").trim().slice(0, 100).toLocaleLowerCase();
  const payment = c.req.query("payment") ?? "all";
  if (!validDate(from) || !validDate(to) || from > to || !["all", "cash", "mpesa", "credit"].includes(payment)) {
    return c.json({ error: "Choose a valid date range and payment filter." }, 400);
  }
  const needle = `%${search}%`;
  const rows = await c.env.DB.prepare(
    `SELECT id, request_id AS requestId, business_date AS businessDate, variety_id AS varietyId,
      variety_name AS varietyName, customer_name AS customerName,
      customer_phone AS customerPhone, quantity, unit_price_cents AS unitPriceCents,
      total_amount_cents AS totalAmountCents, payment_method AS paymentMethod,
      debt_id AS debtId, transaction_id AS transactionId,
      source_supplier_id AS sourceSupplierId, source_supplier_name AS sourceSupplierName, created_at AS createdAt
     FROM nursery_sale_entries
     WHERE shop_id = ? AND business_date >= ? AND business_date <= ?
       AND (? = '' OR lower(variety_name) LIKE ? OR lower(customer_name) LIKE ? OR lower(customer_phone) LIKE ? OR business_date LIKE ?)
       AND (? = 'all' OR payment_method = ?)
     ORDER BY business_date DESC, created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(shopId, from, to, search, needle, needle, needle, needle, payment, payment, pageSize, offset).all();
  const count = await c.env.DB.prepare(
    `SELECT COUNT(*) AS total FROM nursery_sale_entries
     WHERE shop_id = ? AND business_date >= ? AND business_date <= ?
       AND (? = '' OR lower(variety_name) LIKE ? OR lower(customer_name) LIKE ? OR lower(customer_phone) LIKE ? OR business_date LIKE ?)
       AND (? = 'all' OR payment_method = ?)`
  ).bind(shopId, from, to, search, needle, needle, needle, needle, payment, payment).first<{ total: number }>();
  const filteredSummary = await c.env.DB.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS quantity,
       COALESCE(SUM(total_amount_cents), 0) AS totalCents,
       COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount_cents ELSE 0 END), 0) AS creditCents
     FROM nursery_sale_entries
     WHERE shop_id = ? AND business_date >= ? AND business_date <= ?
       AND (? = '' OR lower(variety_name) LIKE ? OR lower(customer_name) LIKE ? OR lower(customer_phone) LIKE ? OR business_date LIKE ?)
       AND (? = 'all' OR payment_method = ?)`
  ).bind(shopId, from, to, search, needle, needle, needle, needle, payment, payment).first();
  return c.json({ rows: rows.results ?? [], total: Number(count?.total ?? 0), page, pageSize, summary: filteredSummary });
});

nurseryRouter.get("/nursery/customer-insights", requireAuth, async (c) => {
  const shopId = c.get("session").shopId;
  const from = c.req.query("from") ?? "";
  const to = c.req.query("to") ?? "";
  if (!validDate(from) || !validDate(to) || from > to) {
    return c.json({ error: "Choose a valid report date range." }, 400);
  }
  const rows = await c.env.DB.prepare(
    `SELECT s.customer_key AS customerKey, s.customer_name AS customerName,
      s.customer_phone AS customerPhone, v.name AS varietyName,
      SUM(s.quantity) AS quantity, SUM(s.total_amount_cents) AS totalAmountCents,
      MAX(s.business_date) AS lastPurchase
     FROM nursery_customer_daily_sales s
     JOIN nursery_varieties v ON v.id = s.variety_id AND v.shop_id = s.shop_id
     WHERE s.shop_id = ? AND s.business_date >= ? AND s.business_date <= ?
     GROUP BY s.customer_key, s.customer_name, s.customer_phone, s.variety_id, v.name
     ORDER BY totalAmountCents DESC, s.customer_name COLLATE NOCASE`
  ).bind(shopId, from, to).all();
  return c.json({ rows: rows.results ?? [] });
});

export default nurseryRouter;
