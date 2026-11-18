import { desc, eq, and } from "drizzle-orm";
import { debts, debtPayments } from "@workspace/db/schema";
import type { Db } from "./db";
import { CK, CACHE_TTL, kvDel, kvGet, kvSet } from "./cache";
import {
  creditBalance,
  getCustomerCreditSources,
  getCustomerOutstandingDebts,
  matchesCustomerIdentities,
  type CustomerIdentity,
} from "./debt-credit";
import { customerNameKey, normalizeCustomerName, phonesMatch } from "./normalize";

export interface NurserySyncConfig {
  shopId: string;
  enabled: boolean;
  ownerCustomerName: string;
  ownerCustomerPhone: string;
  commissionPct: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface CollectedPlantTotals {
  collectedTillCents: number;
  creditSalesCents: number;
  paidCreditDebtCents: number;
  totalCollectedCents: number;
  settledNetCents: number;
  settledGrossCents: number;
  remainingCollectedCents: number;
  hasInitialSweep: boolean;
  settlementCount: number;
}

const PLANT_SETTLE_TAG_RE = /\[plant-settle(?:-adj)?:([^\]]+)\]/i;
export const INITIAL_SWEEP_SOURCE_KEY = "initial-collected-sweep-v1";

function clampFeePct(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(95, Math.max(0, Math.round((n + Number.EPSILON) * 100) / 100));
}

export function roundMoney(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function formatKESLabel(amount: number): string {
  return `Ksh ${roundMoney(amount).toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function isNurseryCreditDebtNote(notes: string | null | undefined): boolean {
  return String(notes ?? "").trim() === "Nursery register credit sale";
}

export async function isNurseryCreditDebt(
  d1: D1Database,
  shopId: string,
  debt: { id: string; notes?: string | null },
): Promise<boolean> {
  if (isNurseryCreditDebtNote(debt.notes)) return true;
  const linked = await d1
    .prepare("SELECT 1 AS found FROM nursery_sale_entries WHERE shop_id = ? AND debt_id = ? LIMIT 1")
    .bind(shopId, debt.id)
    .first<{ found: number }>();
  return Boolean(linked?.found);
}

export function buildAutoPlantSettleNote(params: {
  label: string;
  grossCents: number;
  feePct: number;
  netCents: number;
  isCreditTopUp?: boolean;
  isAdjustment?: boolean;
}): string {
  const feePct = clampFeePct(params.feePct);
  const net = roundMoney(params.netCents / 100);
  const gross = roundMoney(params.grossCents / 100);
  const shopShare = Math.max(0, roundMoney(gross - net));
  const tagName = params.isAdjustment ? "plant-settle-adj" : "plant-settle";

  if (params.isAdjustment) {
    const absNet = Math.abs(net);
    const absGross = Math.abs(gross);
    const details =
      feePct > 0
        ? `Gross -${formatKESLabel(absGross)} · Net -${formatKESLabel(absNet)}`
        : `${formatKESLabel(absNet)}`;
    return `Auto plant adjustment: ${params.label} (-${details}) [${tagName}:feePct=${feePct};mode=collected;auto=1]`;
  }

  const prefix = params.isCreditTopUp
    ? `Auto plant credit (${params.label})`
    : `Auto settled from plant sales (${params.label})`;
  const breakdown =
    feePct > 0
      ? `Gross ${formatKESLabel(gross)} · Shop ${feePct}% (${formatKESLabel(shopShare)}) · Net ${formatKESLabel(net)}`
      : `Plant proceeds ${formatKESLabel(net)}`;
  return `${prefix} — ${breakdown} [${tagName}:feePct=${feePct};mode=collected;auto=1]`;
}

export function parsePlantNoteFeePct(note: string | null | undefined, recordedBy: string | null | undefined): {
  isPlantLinked: boolean;
  isAdjustment: boolean;
  feePct: number;
} {
  const text = String(note ?? "");
  const match = text.match(PLANT_SETTLE_TAG_RE);
  if (match) {
    let feePct = 0;
    for (const part of match[1]!.split(";")) {
      const [k, v] = part.split("=");
      if (k === "feePct") feePct = clampFeePct(Number(v));
    }
    return {
      isPlantLinked: true,
      isAdjustment: text.toLowerCase().includes("[plant-settle-adj:"),
      feePct,
    };
  }
  if (String(recordedBy ?? "").trim() === "Nursery" && text.toLowerCase().includes("nursery supplier")) {
    return { isPlantLinked: true, isAdjustment: false, feePct: 0 };
  }
  return { isPlantLinked: false, isAdjustment: false, feePct: 0 };
}

/**
 * Loads (and on first run safely initializes) per-shop Nursery Auto-Sync config in D1.
 * Shops that already linked a nursery customer/supplier or recorded [plant-settle:...]
 * settlements default to enabled=true targeting that account so no manual click is required.
 */
export async function getNurserySyncConfig(
  d1: D1Database,
  kv: KVNamespace,
  shopId: string,
): Promise<NurserySyncConfig> {
  const cached = await kvGet<NurserySyncConfig>(kv, CK.nurserySync(shopId));
  if (cached) return cached;

  const existing = await d1
    .prepare(
      `SELECT shop_id AS shopId, enabled, owner_customer_name AS ownerCustomerName,
         owner_customer_phone AS ownerCustomerPhone, commission_pct AS commissionPct,
         updated_by AS updatedBy, updated_at AS updatedAt
       FROM nursery_auto_sync
       WHERE shop_id = ?
       LIMIT 1`,
    )
    .bind(shopId)
    .first<{
      shopId: string;
      enabled: number;
      ownerCustomerName: string;
      ownerCustomerPhone: string;
      commissionPct: number;
      updatedBy: string | null;
      updatedAt: string | null;
    }>();

  if (existing) {
    const cfg: NurserySyncConfig = {
      shopId: existing.shopId,
      enabled: Boolean(existing.enabled),
      ownerCustomerName: existing.ownerCustomerName || "Nursery",
      ownerCustomerPhone: existing.ownerCustomerPhone || "",
      commissionPct: clampFeePct(existing.commissionPct),
      updatedBy: existing.updatedBy ?? null,
      updatedAt: existing.updatedAt ?? null,
    };
    await kvSet(kv, CK.nurserySync(shopId), cfg, CACHE_TTL.nurserySync);
    return cfg;
  }

  // Detect an already-linked nursery supplier or past plant-settled customer account.
  const linkedSupplier = await d1
    .prepare(
      `SELECT c.name AS customerName, c.phone AS customerPhone
       FROM suppliers s
       INNER JOIN customers c ON c.id = s.customer_id AND c.shop_id = s.shop_id
       WHERE s.shop_id = ?
       ORDER BY s.created_at ASC
       LIMIT 1`,
    )
    .bind(shopId)
    .first<{ customerName: string; customerPhone: string }>();

  const settledAccount =
    linkedSupplier ??
    (await d1
      .prepare(
        `SELECT d.customer_name AS customerName, d.customer_phone AS customerPhone
         FROM debt_payments dp
         INNER JOIN debts d ON d.id = dp.debt_id
         WHERE d.shop_id = ?
           AND d.status != 'cancelled'
           AND dp.payment_type != 'reversal'
           AND dp.amount > 0
           AND LOWER(COALESCE(dp.note, '')) LIKE '%[plant-settle:%'
         ORDER BY COALESCE(dp.paid_at, d.created_at) DESC
         LIMIT 1`,
      )
      .bind(shopId)
      .first<{ customerName: string; customerPhone: string }>());

  if (settledAccount) {
    const now = new Date().toISOString();
    const ownerName = normalizeCustomerName(settledAccount.customerName || "Nursery");
    const ownerPhone = String(settledAccount.customerPhone ?? "").trim();
    await d1
      .prepare(
        `INSERT OR IGNORE INTO nursery_auto_sync
          (shop_id, enabled, owner_customer_name, owner_customer_phone, commission_pct, updated_by, updated_at)
         VALUES (?, 1, ?, ?, 0, 'System Auto-Setup', ?)`,
      )
      .bind(shopId, ownerName, ownerPhone, now)
      .run();

    const persisted = await d1
      .prepare(
        `SELECT shop_id AS shopId, enabled, owner_customer_name AS ownerCustomerName,
           owner_customer_phone AS ownerCustomerPhone, commission_pct AS commissionPct,
           updated_by AS updatedBy, updated_at AS updatedAt
         FROM nursery_auto_sync WHERE shop_id = ? LIMIT 1`,
      )
      .bind(shopId)
      .first<any>();

    const cfg: NurserySyncConfig = {
      shopId,
      enabled: persisted ? Boolean(persisted.enabled) : true,
      ownerCustomerName: persisted?.ownerCustomerName ?? ownerName,
      ownerCustomerPhone: persisted?.ownerCustomerPhone ?? ownerPhone,
      commissionPct: clampFeePct(persisted?.commissionPct ?? 0),
      updatedBy: persisted?.updatedBy ?? "System Auto-Setup",
      updatedAt: persisted?.updatedAt ?? now,
    };
    await kvSet(kv, CK.nurserySync(shopId), cfg, CACHE_TTL.nurserySync);
    return cfg;
  }

  // Suggest an unlinked "Nursery" debt customer if present, without forcing auto-sync on other shops.
  const nurseryDebt = await d1
    .prepare(
      `SELECT customer_name AS customerName, customer_phone AS customerPhone
       FROM debts
       WHERE shop_id = ? AND status != 'cancelled' AND lower(trim(customer_name)) = 'nursery'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(shopId)
    .first<{ customerName: string; customerPhone: string }>();

  const defaultCfg: NurserySyncConfig = {
    shopId,
    enabled: false,
    ownerCustomerName: nurseryDebt ? normalizeCustomerName(nurseryDebt.customerName) : "Nursery",
    ownerCustomerPhone: nurseryDebt?.customerPhone?.trim() ?? "",
    commissionPct: 0,
    updatedBy: null,
    updatedAt: null,
  };
  await kvSet(kv, CK.nurserySync(shopId), defaultCfg, CACHE_TTL.nurserySync);
  return defaultCfg;
}

export async function saveNurserySyncConfig(
  d1: D1Database,
  kv: KVNamespace,
  shopId: string,
  params: {
    enabled: boolean;
    ownerCustomerName: string;
    ownerCustomerPhone: string;
    commissionPct: number;
    updatedBy: string;
  },
): Promise<NurserySyncConfig> {
  const now = new Date().toISOString();
  const cleanName = normalizeCustomerName(params.ownerCustomerName || "Nursery") || "Nursery";
  const cleanPhone = String(params.ownerCustomerPhone ?? "").trim();
  const cleanFee = clampFeePct(params.commissionPct);

  await d1
    .prepare(
      `INSERT INTO nursery_auto_sync
        (shop_id, enabled, owner_customer_name, owner_customer_phone, commission_pct, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(shop_id) DO UPDATE SET
         enabled = excluded.enabled,
         owner_customer_name = excluded.owner_customer_name,
         owner_customer_phone = excluded.owner_customer_phone,
         commission_pct = excluded.commission_pct,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    )
    .bind(shopId, params.enabled ? 1 : 0, cleanName, cleanPhone, cleanFee, params.updatedBy, now)
    .run();

  const updated: NurserySyncConfig = {
    shopId,
    enabled: Boolean(params.enabled),
    ownerCustomerName: cleanName,
    ownerCustomerPhone: cleanPhone,
    commissionPct: cleanFee,
    updatedBy: params.updatedBy,
    updatedAt: now,
  };
  await kvDel(kv, CK.nurserySync(shopId));
  await kvSet(kv, CK.nurserySync(shopId), updated, CACHE_TTL.nurserySync);
  return updated;
}

/**
 * When a shop enables Nursery Auto-Sync and Mum takes goods on debt under EITHER
 * her linked account name ("Nursery") OR her phone ("0723057972" / CRM profile phone),
 * resolve both identities so her plant credit cuts the debt automatically.
 */
export async function resolveEffectiveCreditIdentities(
  d1: D1Database,
  kv: KVNamespace,
  shopId: string,
  customerName: string,
  customerPhone?: string | null,
): Promise<{ config: NurserySyncConfig; extraIdentities: CustomerIdentity[]; matchesOwner: boolean }> {
  const config = await getNurserySyncConfig(d1, kv, shopId);
  const extraIdentities: CustomerIdentity[] = [];
  if (!config.enabled) {
    return { config, extraIdentities, matchesOwner: false };
  }

  const ownerIdentity: CustomerIdentity = {
    customerName: config.ownerCustomerName,
    customerPhone: config.ownerCustomerPhone,
  };
  let matches = matchesCustomerIdentities(
    { customerName, customerPhone: String(customerPhone ?? "") },
    [ownerIdentity],
  );

  // If the cashier only typed a nickname (e.g. "Mum") with no phone, check CRM profile phone once.
  if (!matches && !String(customerPhone ?? "").trim() && customerName.trim()) {
    const crmRow = await d1
      .prepare("SELECT phone FROM customers WHERE shop_id = ? AND lower(trim(name)) = ? LIMIT 1")
      .bind(shopId, customerNameKey(customerName))
      .first<{ phone: string }>();
    if (crmRow?.phone && phonesMatch(crmRow.phone, config.ownerCustomerPhone)) {
      matches = true;
    }
  }

  if (matches) {
    extraIdentities.push(ownerIdentity);
  }
  return { config, extraIdentities, matchesOwner: matches };
}

/**
 * Authoritative collected-pool totals directly from D1:
 *   Collected = (Cash + M-Pesa nursery sales) + (already-paid amount on Nursery credit debts)
 *   Remaining = max(0, Collected - SettledGross)
 */
export async function computeCollectedPlantTotals(
  d1: D1Database,
  shopId: string,
): Promise<CollectedPlantTotals> {
  const [tillRow, creditPaidRow, settledRows, sweepRow] = await Promise.all([
    d1
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN payment_method IN ('cash', 'mpesa') THEN total_amount_cents ELSE 0 END), 0) AS collectedTillCents,
           COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount_cents ELSE 0 END), 0) AS creditSalesCents
         FROM nursery_daily_sales
         WHERE shop_id = ?`,
      )
      .bind(shopId)
      .first<{ collectedTillCents: number; creditSalesCents: number }>(),
    d1
      .prepare(
        `SELECT COALESCE(SUM(
           CAST(ROUND(MIN(MAX(0, total_amount), MAX(0, amount_paid)) * 100) AS INTEGER)
         ), 0) AS paidCreditDebtCents
         FROM debts
         WHERE shop_id = ?
           AND status != 'cancelled'
           AND amount_paid > 0
           AND (
             notes = 'Nursery register credit sale'
             OR EXISTS (
               SELECT 1 FROM nursery_sale_entries e
               WHERE e.shop_id = debts.shop_id AND e.debt_id = debts.id
             )
           )`,
      )
      .bind(shopId)
      .first<{ paidCreditDebtCents: number }>(),
    d1
      .prepare(
        `SELECT dp.amount, dp.recorded_by AS recordedBy, dp.note
         FROM debt_payments dp
         INNER JOIN debts d ON d.id = dp.debt_id
         WHERE d.shop_id = ?
           AND d.status != 'cancelled'
           AND dp.payment_type != 'reversal'
           AND (
             (dp.amount > 0 AND LOWER(COALESCE(dp.note, '')) LIKE '%[plant-settle:%')
             OR (dp.amount > 0 AND TRIM(COALESCE(dp.recorded_by, '')) = 'Nursery' AND LOWER(COALESCE(dp.note, '')) LIKE '%nursery supplier%')
             OR LOWER(COALESCE(dp.note, '')) LIKE '%[plant-settle-adj:%'
           )
           AND NOT EXISTS (
             SELECT 1 FROM debt_payments rev
             WHERE rev.debt_id = dp.debt_id
               AND rev.payment_type = 'reversal'
               AND rev.reversal_of_id = dp.id
           )`,
      )
      .bind(shopId)
      .all<{ amount: number; recordedBy: string | null; note: string | null }>(),
    d1
      .prepare("SELECT 1 AS found FROM nursery_auto_postings WHERE shop_id = ? AND source_key = ? LIMIT 1")
      .bind(shopId, INITIAL_SWEEP_SOURCE_KEY)
      .first<{ found: number }>(),
  ]);

  let settledNetCents = 0;
  let settledGrossCents = 0;
  let settlementCount = 0;
  for (const row of settledRows.results ?? []) {
    const netAmount = Number(row.amount || 0);
    if (!Number.isFinite(netAmount) || Math.abs(netAmount) < 0.005) continue;
    const parsed = parsePlantNoteFeePct(row.note, row.recordedBy);
    if (!parsed.isPlantLinked) continue;
    const rate = (100 - parsed.feePct) / 100;
    const grossAmount = rate > 0 ? netAmount / rate : netAmount;
    settledNetCents += Math.round(netAmount * 100);
    settledGrossCents += Math.round(grossAmount * 100);
    if (!parsed.isAdjustment) settlementCount += 1;
  }

  const collectedTillCents = Math.round(Number(tillRow?.collectedTillCents ?? 0));
  const creditSalesCents = Math.round(Number(tillRow?.creditSalesCents ?? 0));
  const paidCreditDebtCents = Math.round(Number(creditPaidRow?.paidCreditDebtCents ?? 0));
  const totalCollectedCents = collectedTillCents + paidCreditDebtCents;
  const remainingCollectedCents = Math.max(0, totalCollectedCents - settledGrossCents);

  return {
    collectedTillCents,
    creditSalesCents,
    paidCreditDebtCents,
    totalCollectedCents,
    settledNetCents,
    settledGrossCents,
    remainingCollectedCents,
    hasInitialSweep: Boolean(sweepRow?.found),
    settlementCount,
  };
}

/**
 * Builds atomic D1 statements that credit collected plant proceeds onto Mum's account:
 *  1) Records an idempotent `nursery_auto_postings` guard FIRST in the batch (UNIQUE shop_id, source_key)
 *  2) Clears any open debts matching owner name OR phone oldest-first
 *  3) Parks any leftover surplus as store credit (negative balance) on her Nursery account
 */
export async function buildCreditOwnerStatements(params: {
  d1: D1Database;
  db: Db;
  shopId: string;
  config: NurserySyncConfig;
  grossCents: number;
  sourceKey: string;
  sourceType: "nursery_sale" | "credit_debt_payment" | "initial_sweep" | "nursery_adjustment";
  label: string;
  recordedBy: string;
  now: string;
}): Promise<{
  statements: D1PreparedStatement[];
  netCents: number;
  appliedToDebtsCents: number;
  addedToCreditCents: number;
  paidDebtIds: string[];
}> {
  const { d1, db, shopId, config, sourceKey, sourceType, label, recordedBy, now } = params;
  const cleanGrossCents = Math.max(0, Math.round(params.grossCents));
  if (cleanGrossCents <= 0) {
    return { statements: [], netCents: 0, appliedToDebtsCents: 0, addedToCreditCents: 0, paidDebtIds: [] };
  }

  const feePct = clampFeePct(config.commissionPct);
  const netCents = Math.round((cleanGrossCents * (100 - feePct)) / 100);
  const postingId = crypto.randomUUID();

  if (netCents <= 0) {
    return {
      statements: [
        d1
          .prepare(
            `INSERT INTO nursery_auto_postings
              (id, shop_id, source_key, source_type, gross_cents, net_cents, commission_pct, debt_payment_id, debt_id, details_json, created_at)
             VALUES (?, ?, ?, ?, ?, 0, ?, NULL, NULL, NULL, ?)`,
          )
          .bind(postingId, shopId, sourceKey, sourceType, cleanGrossCents, feePct, now),
      ],
      netCents: 0,
      appliedToDebtsCents: 0,
      addedToCreditCents: 0,
      paidDebtIds: [],
    };
  }

  const ownerName = normalizeCustomerName(config.ownerCustomerName || "Nursery") || "Nursery";
  const ownerPhone = String(config.ownerCustomerPhone ?? "").trim();

  const [openDebts, creditSources] = await Promise.all([
    getCustomerOutstandingDebts(db, shopId, ownerName, ownerPhone),
    getCustomerCreditSources(db, shopId, ownerName, ownerPhone),
  ]);

  let remainingCents = netCents;
  const allocations: Array<{ debtId: string; appliedCents: number; debtBalanceCents: number }> = [];
  for (const d of openDebts) {
    if (remainingCents <= 0) break;
    const dueCents = Math.max(0, Math.round(Number(d.balance || 0) * 100));
    if (dueCents <= 0) continue;
    const takeCents = Math.min(remainingCents, dueCents);
    allocations.push({ debtId: d.id, appliedCents: takeCents, debtBalanceCents: dueCents });
    remainingCents -= takeCents;
  }

  const appliedToDebtsCents = netCents - remainingCents;
  const addedToCreditCents = remainingCents;

  // Pick a store-credit carrier row only when surplus remains; avoid scanning paid debts when not needed.
  let preferredPaidCarrier = creditSources[creditSources.length - 1] ?? null;
  if (addedToCreditCents > 0 && !preferredPaidCarrier && allocations.length === 0) {
    const paidRows = await db
      .select()
      .from(debts)
      .where(and(eq(debts.shopId, shopId), eq(debts.status, "paid")))
      .orderBy(desc(debts.createdAt))
      .all();
    preferredPaidCarrier =
      paidRows.find((r) =>
        matchesCustomerIdentities(r, [{ customerName: ownerName, customerPhone: ownerPhone }]),
      ) ?? null;
  }

  const statements: D1PreparedStatement[] = [];
  const paymentEntries: Array<{ debtId: string; paymentId: string; amount: number; kind: "debt" | "credit" }> = [];
  const paidDebtIds: string[] = [];

  // Map per-debt changes cleanly so a single debt row isn't mutated twice if also used for surplus.
  const surplusCarrierIsOpenAllocation =
    addedToCreditCents > 0 && !preferredPaidCarrier && allocations.length > 0;
  const carrierDebtIdFromOpen = surplusCarrierIsOpenAllocation
    ? allocations[allocations.length - 1]!.debtId
    : null;

  for (const alloc of allocations) {
    const extraSurplusCents = carrierDebtIdFromOpen === alloc.debtId ? addedToCreditCents : 0;
    const totalMoveCents = alloc.appliedCents + extraSurplusCents;
    const totalMove = roundMoney(totalMoveCents / 100);
    const paymentId = crypto.randomUUID();
    const note = buildAutoPlantSettleNote({
      label,
      grossCents: cleanGrossCents,
      feePct,
      netCents: totalMoveCents,
      isCreditTopUp: false,
    });
    if (alloc.appliedCents >= alloc.debtBalanceCents) {
      paidDebtIds.push(alloc.debtId);
    }

    statements.push(
      d1
        .prepare(
          `UPDATE debts
           SET amount_paid = amount_paid + ?,
               balance = balance - ?,
               status = CASE
                 WHEN balance - ? <= 0.005 THEN 'paid'
                 WHEN amount_paid + ? > 0 THEN 'partial'
                 ELSE 'unpaid'
               END,
               paid_at = CASE
                 WHEN balance - ? <= 0.005 THEN COALESCE(paid_at, ?)
                 ELSE paid_at
               END
           WHERE id = ? AND shop_id = ? AND status != 'cancelled'`,
        )
        .bind(totalMove, totalMove, totalMove, totalMove, totalMove, now, alloc.debtId, shopId),
    );
    statements.push(
      d1
        .prepare(
          `INSERT INTO debt_payments (id, debt_id, amount, recorded_by, paid_at, payment_type, reversal_of_id, note)
           VALUES (?, ?, ?, ?, ?, 'payment', NULL, ?)`,
        )
        .bind(paymentId, alloc.debtId, totalMove, recordedBy, now, note),
    );
    paymentEntries.push({ debtId: alloc.debtId, paymentId, amount: totalMove, kind: "debt" });
  }

  if (addedToCreditCents > 0 && !surplusCarrierIsOpenAllocation) {
    const creditMove = roundMoney(addedToCreditCents / 100);
    const paymentId = crypto.randomUUID();
    const note = buildAutoPlantSettleNote({
      label,
      grossCents: cleanGrossCents,
      feePct,
      netCents: addedToCreditCents,
      isCreditTopUp: true,
    });

    if (preferredPaidCarrier) {
      statements.push(
        d1
          .prepare(
            `UPDATE debts
             SET amount_paid = amount_paid + ?,
                 balance = balance - ?
             WHERE id = ? AND shop_id = ? AND status != 'cancelled'`,
          )
          .bind(creditMove, creditMove, preferredPaidCarrier.id, shopId),
      );
      statements.push(
        d1
          .prepare(
            `INSERT INTO debt_payments (id, debt_id, amount, recorded_by, paid_at, payment_type, reversal_of_id, note)
             VALUES (?, ?, ?, ?, ?, 'payment', NULL, ?)`,
          )
          .bind(paymentId, preferredPaidCarrier.id, creditMove, recordedBy, now, note),
      );
      paymentEntries.push({ debtId: preferredPaidCarrier.id, paymentId, amount: creditMove, kind: "credit" });
    } else {
      // Shop has zero debt history for Mum yet: create a $0 carrier row to hold her positive store credit.
      const carrierId = crypto.randomUUID();
      statements.push(
        d1
          .prepare(
            `INSERT INTO debts
              (id, shop_id, sale_id, customer_name, customer_phone, total_amount, amount_paid, balance, status, notes, items_json, paid_at, created_at)
             VALUES (?, ?, NULL, ?, ?, 0, ?, ?, 'paid', 'Nursery owner plant credit account', '[]', ?, ?)`,
          )
          .bind(carrierId, shopId, ownerName, ownerPhone, creditMove, -creditMove, now, now),
      );
      statements.push(
        d1
          .prepare(
            `INSERT INTO debt_payments (id, debt_id, amount, recorded_by, paid_at, payment_type, reversal_of_id, note)
             VALUES (?, ?, ?, ?, ?, 'payment', NULL, ?)`,
          )
          .bind(paymentId, carrierId, creditMove, recordedBy, now, note),
      );
      paymentEntries.push({ debtId: carrierId, paymentId, amount: creditMove, kind: "credit" });
    }
  }

  for (const closedDebtId of paidDebtIds) {
    statements.push(
      d1
        .prepare("DELETE FROM notifications WHERE debt_id = ? AND type = 'debt_reminder'")
        .bind(closedDebtId),
    );
  }

  const primaryPayment = paymentEntries[0] ?? null;
  const guardStmt = d1
    .prepare(
      `INSERT INTO nursery_auto_postings
        (id, shop_id, source_key, source_type, gross_cents, net_cents, commission_pct, debt_payment_id, debt_id, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      postingId,
      shopId,
      sourceKey,
      sourceType,
      cleanGrossCents,
      netCents,
      feePct,
      primaryPayment?.paymentId ?? null,
      primaryPayment?.debtId ?? null,
      JSON.stringify({ paymentEntries, label }),
      now,
    );

  // Place idempotency guard FIRST so any concurrent replay aborts the entire atomic batch cleanly.
  return {
    statements: [guardStmt, ...statements],
    netCents,
    appliedToDebtsCents,
    addedToCreditCents,
    paidDebtIds,
  };
}

/**
 * Safely pulls back previously auto-credited surplus when a Cash/M-Pesa nursery sale
 * is lowered or deleted, without ever letting store credit go below zero if already spent.
 */
export async function buildDebitOwnerAdjustmentStatements(params: {
  d1: D1Database;
  db: Db;
  shopId: string;
  config: NurserySyncConfig;
  grossReductionCents: number;
  sourceKey: string;
  label: string;
  recordedBy: string;
  now: string;
}): Promise<{ ok: true; statements: D1PreparedStatement[]; netReductionCents: number } | { ok: false; error: string }> {
  const { d1, db, shopId, config, sourceKey, label, recordedBy, now } = params;
  const cleanGrossReduction = Math.max(0, Math.round(params.grossReductionCents));
  if (cleanGrossReduction <= 0) {
    return { ok: true, statements: [], netReductionCents: 0 };
  }

  const feePct = clampFeePct(config.commissionPct);
  const netReductionCents = Math.round((cleanGrossReduction * (100 - feePct)) / 100);
  if (netReductionCents <= 0) {
    return { ok: true, statements: [], netReductionCents: 0 };
  }

  const ownerName = normalizeCustomerName(config.ownerCustomerName || "Nursery") || "Nursery";
  const ownerPhone = String(config.ownerCustomerPhone ?? "").trim();
  const creditSources = await getCustomerCreditSources(db, shopId, ownerName, ownerPhone);
  const totalAvailableCreditCents = creditSources.reduce(
    (sum, s) => sum + Math.max(0, Math.round(creditBalance(s) * 100)),
    0,
  );

  if (totalAvailableCreditCents + 1 < netReductionCents) {
    return {
      ok: false,
      error: `This nursery sale already credited ${formatKESLabel(netReductionCents / 100)} to ${ownerName}, and that credit has already been used. Reconcile or reverse the customer debt payment first.`,
    };
  }

  let remainingCents = netReductionCents;
  const statements: D1PreparedStatement[] = [];
  const adjEntries: Array<{ debtId: string; paymentId: string; amount: number }> = [];

  for (const source of [...creditSources].reverse()) {
    if (remainingCents <= 0) break;
    const availCents = Math.max(0, Math.round(creditBalance(source) * 100));
    if (availCents <= 0) continue;
    const takeCents = Math.min(remainingCents, availCents);
    const takeAmount = roundMoney(takeCents / 100);
    const adjPaymentId = crypto.randomUUID();
    const note = buildAutoPlantSettleNote({
      label,
      grossCents: cleanGrossReduction,
      feePct,
      netCents: takeCents,
      isAdjustment: true,
    });

    statements.push(
      d1
        .prepare(
          `UPDATE debts
           SET balance = balance + ?,
               amount_paid = MAX(0, amount_paid - ?)
           WHERE id = ? AND shop_id = ? AND status != 'cancelled' AND balance <= ?`,
        )
        .bind(takeAmount, takeAmount, source.id, shopId, -takeAmount + 0.01),
    );
    statements.push(
      d1
        .prepare(
          `INSERT INTO debt_payments (id, debt_id, amount, recorded_by, paid_at, payment_type, reversal_of_id, note)
           VALUES (?, ?, ?, ?, ?, 'payment', NULL, ?)`,
        )
        .bind(adjPaymentId, source.id, -takeAmount, recordedBy, now, note),
    );
    adjEntries.push({ debtId: source.id, paymentId: adjPaymentId, amount: -takeAmount });
    remainingCents -= takeCents;
  }

  const guardStmt = d1
    .prepare(
      `INSERT INTO nursery_auto_postings
        (id, shop_id, source_key, source_type, gross_cents, net_cents, commission_pct, debt_payment_id, debt_id, details_json, created_at)
       VALUES (?, ?, ?, 'nursery_adjustment', ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      shopId,
      sourceKey,
      -cleanGrossReduction,
      -netReductionCents,
      feePct,
      adjEntries[0]?.paymentId ?? null,
      adjEntries[0]?.debtId ?? null,
      JSON.stringify({ adjEntries, label }),
      now,
    );

  return {
    ok: true,
    statements: [guardStmt, ...statements],
    netReductionCents,
  };
}

/**
 * Runs an idempotent catch-up sweep of remaining un-settled collected plant proceeds
 * into the Nursery owner's account. Safe under concurrent clicks via UNIQUE(shop_id, source_key).
 */
export async function runCollectedPlantSweep(params: {
  d1: D1Database;
  db: Db;
  kv: KVNamespace;
  shopId: string;
  recordedBy: string;
  sourceKey?: string;
}): Promise<{
  sweptGrossCents: number;
  sweptNetCents: number;
  appliedToDebtsCents: number;
  addedToCreditCents: number;
  alreadyDone: boolean;
}> {
  const { d1, db, kv, shopId, recordedBy, sourceKey = INITIAL_SWEEP_SOURCE_KEY } = params;
  const config = await getNurserySyncConfig(d1, kv, shopId);
  if (!config.enabled) {
    return { sweptGrossCents: 0, sweptNetCents: 0, appliedToDebtsCents: 0, addedToCreditCents: 0, alreadyDone: false };
  }

  const priorSweep = await d1
    .prepare("SELECT id FROM nursery_auto_postings WHERE shop_id = ? AND source_key = ? LIMIT 1")
    .bind(shopId, sourceKey)
    .first<{ id: string }>();
  if (priorSweep && sourceKey === INITIAL_SWEEP_SOURCE_KEY) {
    return { sweptGrossCents: 0, sweptNetCents: 0, appliedToDebtsCents: 0, addedToCreditCents: 0, alreadyDone: true };
  }

  const totals = await computeCollectedPlantTotals(d1, shopId);
  if (totals.remainingCollectedCents <= 0) {
    if (sourceKey === INITIAL_SWEEP_SOURCE_KEY) {
      await d1
        .prepare(
          `INSERT OR IGNORE INTO nursery_auto_postings
            (id, shop_id, source_key, source_type, gross_cents, net_cents, commission_pct, debt_payment_id, debt_id, details_json, created_at)
           VALUES (?, ?, ?, 'initial_sweep', 0, 0, ?, NULL, NULL, '{"note":"Nothing remaining to sweep"}', ?)`,
        )
        .bind(crypto.randomUUID(), shopId, sourceKey, config.commissionPct, new Date().toISOString())
        .run();
    }
    return { sweptGrossCents: 0, sweptNetCents: 0, appliedToDebtsCents: 0, addedToCreditCents: 0, alreadyDone: true };
  }

  const now = new Date().toISOString();
  const built = await buildCreditOwnerStatements({
    d1,
    db,
    shopId,
    config,
    grossCents: totals.remainingCollectedCents,
    sourceKey,
    sourceType: "initial_sweep",
    label: "Remaining collected plant balance sync",
    recordedBy,
    now,
  });

  if (!built.statements.length) {
    return { sweptGrossCents: 0, sweptNetCents: 0, appliedToDebtsCents: 0, addedToCreditCents: 0, alreadyDone: false };
  }

  try {
    await d1.batch(built.statements);
  } catch (err) {
    if (String(err).toLowerCase().includes("unique")) {
      return { sweptGrossCents: 0, sweptNetCents: 0, appliedToDebtsCents: 0, addedToCreditCents: 0, alreadyDone: true };
    }
    throw err;
  }

  await kvDel(kv, CK.debts(shopId), CK.dashboard(shopId, now.slice(0, 10)));
  return {
    sweptGrossCents: totals.remainingCollectedCents,
    sweptNetCents: built.netCents,
    appliedToDebtsCents: built.appliedToDebtsCents,
    addedToCreditCents: built.addedToCreditCents,
    alreadyDone: false,
  };
}
