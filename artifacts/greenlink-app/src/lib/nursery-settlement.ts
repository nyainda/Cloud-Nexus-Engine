import type { QueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getGetDebtQueryKey,
  getListDebtsQueryKey,
} from "@workspace/api-client-react";
import { formatKES } from "@/lib/format";
import {
  patchCustomerListCaches,
  patchCustomerProfileCaches,
  patchDebtCaches,
  applyDebtPayment,
} from "@/lib/optimistic-finance";

export type NurseryPoolMode = "collected" | "all";

export interface NurserySupplierSummary {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  receivedPlants?: number;
  onHandPlants?: number;
  supplierCreditCents?: number;
  customerDebtCents?: number;
}

export interface SettledPlantPaymentEntry {
  debtId: string;
  paymentId: string;
  customerName: string;
  amount: number;
  grossConsumed: number;
  shopProfitTaken: number;
  feePct: number;
  mode: NurseryPoolMode;
  paidAt: string;
  recordedBy: string;
  note: string;
  source: "plant_settlement" | "supplier_auto_offset";
}

export interface ShopNurseryPayout {
  id: string;
  shopId: string;
  customerKey: string;
  amount: number;
  grossConsumed: number;
  shopProfitTaken: number;
  feePct: number;
  method: "cash" | "mpesa";
  reference: string;
  note: string;
  recordedAt: string;
  recordedBy: string;
}

export interface ShopNurseryConfig {
  commissionPct: number;
  poolMode: NurseryPoolMode;
}

export interface NurserySettlementMetrics {
  shopId: string;
  shopName: string;
  today: string;
  totalSeedlings: number;
  grossTotal: number;
  cashTotal: number;
  mpesaTotal: number;
  collectedCashMpesa: number;
  creditSales: number;
  matchedSupplier: NurserySupplierSummary | null;
  suppliers: NurserySupplierSummary[];
  settledPayments: SettledPlantPaymentEntry[];
  settledByCustomerKey: Record<string, number>;
  d1SettledNetTotal: number;
  d1SettledGrossConsumed: number;
  d1HistoricalShopProfit: number;
  payouts: ShopNurseryPayout[];
  payoutNetTotal: number;
  payoutGrossConsumed: number;
  payoutShopProfit: number;
  shopConfig: ShopNurseryConfig;
}

export interface NurseryProjection {
  selectedGrossPool: number;
  grossConsumedToDate: number;
  remainingGrossPool: number;
  remainingShopProfit: number;
  totalShopProfit: number;
  totalSettledOrPaidOut: number;
  availableNetProceeds: number;
  totalNurseryNetEarned: number;
  excessAboveSelectedPool: number;
}

const CONFIG_STORAGE_KEY = "greenlink_nursery_shop_config_v1";
const PAYOUTS_STORAGE_KEY = "greenlink_nursery_payouts_v1";
const PLANT_SETTLE_TAG_RE = /\[plant-settle:([^\]]+)\]/i;

export function roundMoney(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

export function normalizeCustomerKey(name: string | null | undefined): string {
  return String(name ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizePhoneDigits(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

export function customerMatchesSupplier(
  customerName: string | null | undefined,
  customerPhone: string | null | undefined,
  supplier: NurserySupplierSummary,
): boolean {
  const custKey = normalizeCustomerKey(customerName);
  const custPhone = normalizePhoneDigits(customerPhone);

  const supCustKey = normalizeCustomerKey(supplier.customerName);
  const supNameKey = normalizeCustomerKey(supplier.name);
  const supCustPhone = normalizePhoneDigits(supplier.customerPhone);
  const supPhone = normalizePhoneDigits(supplier.phone);

  if (custKey && (custKey === supCustKey || custKey === supNameKey)) return true;
  if (custPhone && custPhone.length >= 7 && (custPhone === supCustPhone || custPhone === supPhone)) return true;
  return false;
}

export function findMatchingSupplier(
  suppliers: NurserySupplierSummary[],
  customerName: string | null | undefined,
  customerPhone: string | null | undefined,
): NurserySupplierSummary | null {
  return (
    suppliers.find((s) => customerMatchesSupplier(customerName, customerPhone, s)) ??
    null
  );
}

function clampFeePct(value: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(95, Math.max(0, roundMoney(numeric)));
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota issues so D1 mutations never fail.
  }
}

export function getShopNurseryConfig(shopId: string): ShopNurseryConfig {
  const all = readJsonStorage<Record<string, ShopNurseryConfig>>(CONFIG_STORAGE_KEY, {});
  const cfg = all[shopId];
  return {
    commissionPct: clampFeePct(cfg?.commissionPct ?? 0),
    poolMode: cfg?.poolMode === "all" ? "all" : "collected",
  };
}

export function saveShopNurseryConfig(shopId: string, config: ShopNurseryConfig): ShopNurseryConfig {
  const clean: ShopNurseryConfig = {
    commissionPct: clampFeePct(config.commissionPct),
    poolMode: config.poolMode === "all" ? "all" : "collected",
  };
  const all = readJsonStorage<Record<string, ShopNurseryConfig>>(CONFIG_STORAGE_KEY, {});
  all[shopId] = clean;
  writeJsonStorage(CONFIG_STORAGE_KEY, all);
  return clean;
}

export function getShopNurseryPayouts(shopId: string): ShopNurseryPayout[] {
  const all = readJsonStorage<Record<string, ShopNurseryPayout[]>>(PAYOUTS_STORAGE_KEY, {});
  return Array.isArray(all[shopId]) ? all[shopId]! : [];
}

export function addShopNurseryPayout(shopId: string, payout: ShopNurseryPayout): ShopNurseryPayout[] {
  const all = readJsonStorage<Record<string, ShopNurseryPayout[]>>(PAYOUTS_STORAGE_KEY, {});
  const next = [payout, ...(Array.isArray(all[shopId]) ? all[shopId]! : [])];
  all[shopId] = next;
  writeJsonStorage(PAYOUTS_STORAGE_KEY, all);
  return next;
}

export function removeShopNurseryPayout(shopId: string, payoutId: string): ShopNurseryPayout[] {
  const all = readJsonStorage<Record<string, ShopNurseryPayout[]>>(PAYOUTS_STORAGE_KEY, {});
  const next = (Array.isArray(all[shopId]) ? all[shopId]! : []).filter((p) => p.id !== payoutId);
  all[shopId] = next;
  writeJsonStorage(PAYOUTS_STORAGE_KEY, all);
  return next;
}

/**
 * Formats a human-readable payment note carrying compact structured metadata
 * so any browser/device reading D1 debt_payments can track plant proceeds used.
 */
export function buildPlantSettlementNote(params: {
  grossApplied: number;
  feePct: number;
  netApplied: number;
  mode: NurseryPoolMode;
  isCreditTopUp?: boolean;
}): string {
  const feePct = clampFeePct(params.feePct);
  const netApplied = roundMoney(params.netApplied);
  const grossApplied = roundMoney(params.grossApplied);
  const shopShare = Math.max(0, roundMoney(grossApplied - netApplied));
  const prefix = params.isCreditTopUp
    ? "Plant sales surplus added to store credit"
    : "Settled from plant sales";
  const breakdown =
    feePct > 0
      ? `Gross ${formatKES(grossApplied)} · Shop ${feePct}% (${formatKES(shopShare)}) · Net ${formatKES(netApplied)}`
      : `Plant proceeds ${formatKES(netApplied)}`;
  return `${prefix} (${breakdown}) [plant-settle:feePct=${feePct};mode=${params.mode}]`;
}

export function formatPlantSettlementNoteDisplay(note: string | null | undefined): string {
  return String(note ?? "")
    .replace(PLANT_SETTLE_TAG_RE, "")
    .trim();
}

export function parsePlantSettlementPayment(payment: any): {
  isPlantLinked: boolean;
  source: "plant_settlement" | "supplier_auto_offset" | null;
  feePct: number;
  mode: NurseryPoolMode;
} {
  const note = String(payment?.note ?? "");
  const recordedBy = String(payment?.recordedBy ?? "");
  const tagMatch = note.match(PLANT_SETTLE_TAG_RE);

  if (tagMatch) {
    const parts = tagMatch[1]!.split(";");
    let feePct = 0;
    let mode: NurseryPoolMode = "collected";
    for (const part of parts) {
      const [k, v] = part.split("=");
      if (k === "feePct") feePct = clampFeePct(Number(v));
      if (k === "mode" && (v === "collected" || v === "all")) mode = v;
    }
    return {
      isPlantLinked: true,
      source: "plant_settlement",
      feePct,
      mode,
    };
  }

  // Automatic supplier offsets written by /nursery/entries/batch in D1
  if (
    recordedBy.trim() === "Nursery" &&
    note.toLowerCase().includes("nursery supplier")
  ) {
    return {
      isPlantLinked: true,
      source: "supplier_auto_offset",
      feePct: 0,
      mode: "collected",
    };
  }

  return {
    isPlantLinked: false,
    source: null,
    feePct: 0,
    mode: "collected",
  };
}

function localTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Loads live Nursery sales totals for the active shop, matched supplier metadata,
 * and D1 debt_payments tagged as plant settlements across shop debts.
 */
export async function loadNurserySettlementState(params: {
  qc: QueryClient;
  shopId: string;
  shopName: string;
  customerName?: string;
  customerPhone?: string;
  allDebts: any[];
  suppliers?: NurserySupplierSummary[];
}): Promise<NurserySettlementMetrics> {
  const { qc, shopId, shopName, customerName = "", customerPhone = "", allDebts } = params;
  const today = localTodayIso();

  const [reportData, suppliersData] = await Promise.all([
    qc.fetchQuery({
      queryKey: ["/api/nursery/report", shopId, "all-time-settlement", today],
      queryFn: () =>
        customFetch<{
          summary?: {
            totalSeedlings?: number;
            totalRevenueCents?: number;
            cashCents?: number;
            mpesaCents?: number;
            creditCents?: number;
          };
        }>(
          `/api/nursery/report?from=2020-01-01&to=${encodeURIComponent(today)}&businessDate=${encodeURIComponent(today)}&page=1&pageSize=1`,
        ),
      staleTime: 10_000,
    }),
    params.suppliers
      ? Promise.resolve({ rows: params.suppliers })
      : qc.fetchQuery({
          queryKey: ["/api/nursery/suppliers", shopId],
          queryFn: () =>
            customFetch<{ rows: NurserySupplierSummary[] }>("/api/nursery/suppliers"),
          staleTime: 15_000,
        }),
  ]);

  const suppliers = suppliersData.rows ?? [];
  const matchedSupplier = customerName
    ? findMatchingSupplier(suppliers, customerName, customerPhone)
    : suppliers.find((s) => !!s.customerId) ?? suppliers[0] ?? null;

  const summary = reportData?.summary ?? {};
  const cashTotal = roundMoney(Number(summary.cashCents ?? 0) / 100);
  const mpesaTotal = roundMoney(Number(summary.mpesaCents ?? 0) / 100);
  const collectedCashMpesa = roundMoney(cashTotal + mpesaTotal);
  const creditSales = roundMoney(Number(summary.creditCents ?? 0) / 100);
  const grossTotal = roundMoney(Number(summary.totalRevenueCents ?? 0) / 100);
  const totalSeedlings = Number(summary.totalSeedlings ?? 0);

  // Prioritize target customer + matched supplier debts, and also include any other
  // active/paid debts in the shop (up to 60 total) so cross-device D1 settlements are always captured.
  const targetCustomerKey = normalizeCustomerKey(customerName);
  const targetPhoneDigits = normalizePhoneDigits(customerPhone);
  const activePaymentDebts = allDebts.filter((debt) => {
    if (!debt || debt.status === "cancelled") return false;
    return (
      Number(debt.amountPaid ?? 0) > 0 ||
      debt.status === "paid" ||
      debt.status === "partial" ||
      Number(debt.balance ?? 0) < 0
    );
  });

  const priorityDebts: any[] = [];
  const otherDebts: any[] = [];
  for (const debt of activePaymentDebts) {
    const dKey = normalizeCustomerKey(debt.customerName);
    const dPhone = normalizePhoneDigits(debt.customerPhone);
    const matchesTarget =
      (targetCustomerKey && dKey === targetCustomerKey) ||
      (targetPhoneDigits.length >= 7 && dPhone === targetPhoneDigits);
    const matchesAnySupplier = suppliers.some((s) =>
      customerMatchesSupplier(debt.customerName, debt.customerPhone, s),
    );
    if (matchesTarget || matchesAnySupplier) priorityDebts.push(debt);
    else otherDebts.push(debt);
  }
  const candidateDebts = [...priorityDebts, ...otherDebts].slice(0, 60);

  const debtDetails = await Promise.all(
    candidateDebts.map((d) =>
      qc
        .fetchQuery({
          queryKey: getGetDebtQueryKey(d.id),
          queryFn: () => customFetch<any>(`/api/debts/${encodeURIComponent(d.id)}`),
          staleTime: 10_000,
        })
        .catch(() => null),
    ),
  );

  const settledPayments: SettledPlantPaymentEntry[] = [];
  const settledByCustomerKey: Record<string, number> = {};
  let d1SettledNetTotal = 0;
  let d1SettledGrossConsumed = 0;
  let d1HistoricalShopProfit = 0;

  for (const detail of debtDetails) {
    if (!detail || !Array.isArray(detail.payments)) continue;
    const reversedIds = new Set<string>(
      detail.payments
        .filter((p: any) => p.paymentType === "reversal" && p.reversalOfId)
        .map((p: any) => String(p.reversalOfId)),
    );

    for (const payment of detail.payments) {
      if (!payment || payment.paymentType === "reversal") continue;
      if (reversedIds.has(String(payment.id))) continue;
      const amount = roundMoney(Number(payment.amount ?? 0));
      if (amount <= 0) continue;

      const parsed = parsePlantSettlementPayment(payment);
      if (!parsed.isPlantLinked || !parsed.source) continue;

      const rate = (100 - parsed.feePct) / 100;
      const grossConsumed =
        rate > 0 ? roundMoney(amount / rate) : amount;
      const shopProfitTaken = Math.max(0, roundMoney(grossConsumed - amount));

      d1SettledNetTotal = roundMoney(d1SettledNetTotal + amount);
      d1SettledGrossConsumed = roundMoney(d1SettledGrossConsumed + grossConsumed);
      d1HistoricalShopProfit = roundMoney(d1HistoricalShopProfit + shopProfitTaken);

      const cKey = normalizeCustomerKey(detail.customerName);
      if (cKey) {
        settledByCustomerKey[cKey] = roundMoney((settledByCustomerKey[cKey] ?? 0) + amount);
      }

      settledPayments.push({
        debtId: detail.id,
        paymentId: payment.id,
        customerName: detail.customerName ?? "",
        amount,
        grossConsumed,
        shopProfitTaken,
        feePct: parsed.feePct,
        mode: parsed.mode,
        paidAt: payment.paidAt ?? detail.createdAt,
        recordedBy: payment.recordedBy ?? "System",
        note: formatPlantSettlementNoteDisplay(payment.note),
        source: parsed.source,
      });
    }
  }

  settledPayments.sort(
    (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
  );

  const payouts = getShopNurseryPayouts(shopId);
  let payoutNetTotal = 0;
  let payoutGrossConsumed = 0;
  let payoutShopProfit = 0;
  for (const p of payouts) {
    payoutNetTotal = roundMoney(payoutNetTotal + Number(p.amount || 0));
    payoutGrossConsumed = roundMoney(payoutGrossConsumed + Number(p.grossConsumed || p.amount || 0));
    payoutShopProfit = roundMoney(payoutShopProfit + Number(p.shopProfitTaken || 0));
  }

  return {
    shopId,
    shopName,
    today,
    totalSeedlings,
    grossTotal,
    cashTotal,
    mpesaTotal,
    collectedCashMpesa,
    creditSales,
    matchedSupplier,
    suppliers,
    settledPayments,
    settledByCustomerKey,
    d1SettledNetTotal,
    d1SettledGrossConsumed,
    d1HistoricalShopProfit,
    payouts,
    payoutNetTotal,
    payoutGrossConsumed,
    payoutShopProfit,
    shopConfig: getShopNurseryConfig(shopId),
  };
}

export function computeNurseryProjection(params: {
  metrics: NurserySettlementMetrics;
  poolMode: NurseryPoolMode;
  shopCommissionPct: number;
}): NurseryProjection {
  const { metrics, poolMode } = params;
  const feePct = clampFeePct(params.shopCommissionPct);
  const selectedGrossPool =
    poolMode === "collected" ? metrics.collectedCashMpesa : metrics.grossTotal;

  const grossConsumedToDate = roundMoney(
    metrics.d1SettledGrossConsumed + metrics.payoutGrossConsumed,
  );
  const remainingGrossPool = Math.max(
    0,
    roundMoney(selectedGrossPool - grossConsumedToDate),
  );
  const remainingShopProfit = roundMoney(remainingGrossPool * (feePct / 100));
  const totalShopProfit = roundMoney(
    metrics.d1HistoricalShopProfit + metrics.payoutShopProfit + remainingShopProfit,
  );
  const availableNetProceeds = Math.max(
    0,
    roundMoney(remainingGrossPool - remainingShopProfit),
  );
  const totalSettledOrPaidOut = roundMoney(
    metrics.d1SettledNetTotal + metrics.payoutNetTotal,
  );
  const totalNurseryNetEarned = roundMoney(
    totalSettledOrPaidOut + availableNetProceeds,
  );
  const excessAboveSelectedPool = Math.max(
    0,
    roundMoney(grossConsumedToDate - selectedGrossPool),
  );

  return {
    selectedGrossPool,
    grossConsumedToDate,
    remainingGrossPool,
    remainingShopProfit,
    totalShopProfit,
    totalSettledOrPaidOut,
    availableNetProceeds,
    totalNurseryNetEarned,
    excessAboveSelectedPool,
  };
}

export async function linkCustomerToNurserySupplier(params: {
  qc: QueryClient;
  shopId: string;
  customerName: string;
  customerPhone?: string;
  suppliers: NurserySupplierSummary[];
}): Promise<NurserySupplierSummary> {
  const { qc, shopId, customerName, customerPhone = "", suppliers } = params;
  const searchTerm = customerName.trim() || customerPhone.trim();
  const customersRes = await customFetch<{
    rows: Array<{ id: string; name: string; phone?: string | null }>;
  }>(`/api/nursery/supplier-customers?q=${encodeURIComponent(searchTerm)}`);

  const matchKey = normalizeCustomerKey(customerName);
  const matchPhone = normalizePhoneDigits(customerPhone);
  const foundCustomer =
    customersRes.rows.find(
      (c) =>
        normalizeCustomerKey(c.name) === matchKey ||
        (matchPhone.length >= 7 && normalizePhoneDigits(c.phone) === matchPhone),
    ) ?? customersRes.rows[0];

  if (!foundCustomer) {
    throw new Error(
      `Could not find "${customerName}" in shop customers yet.`,
    );
  }

  const existingSupplier = findMatchingSupplier(
    suppliers,
    customerName,
    customerPhone,
  );

  let saved: NurserySupplierSummary;
  if (existingSupplier) {
    saved = await customFetch<NurserySupplierSummary>(
      `/api/nursery/suppliers/${encodeURIComponent(existingSupplier.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ customerId: foundCustomer.id }),
      },
    );
  } else {
    saved = await customFetch<NurserySupplierSummary>("/api/nursery/suppliers", {
      method: "POST",
      body: JSON.stringify({
        name: customerName.trim(),
        phone: customerPhone.trim() || null,
        customerId: foundCustomer.id,
        notes: "Nursery owner account linked for plant-sales debt settlement",
      }),
    });
  }

  await qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] });
  return saved;
}

/** Preview oldest-first debt payoff order identically to /api/debts/customer-payment. */
export function buildOldestFirstPreview(debtsList: any[], netAmount: number) {
  const openSorted = [...debtsList]
    .filter((d) => d.status !== "paid" && d.status !== "cancelled" && Number(d.balance ?? 0) > 0)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let remaining = Math.max(0, roundMoney(netAmount));
  const allocations: Array<{ debt: any; applied: number }> = [];

  for (const d of openSorted) {
    if (remaining <= 0.004) break;
    const due = Math.max(0, roundMoney(Number(d.balance ?? 0)));
    if (due <= 0) continue;
    const take = roundMoney(Math.min(due, remaining));
    allocations.push({ debt: d, applied: take });
    remaining = Math.max(0, roundMoney(remaining - take));
  }

  return {
    openSorted,
    allocations,
    totalAppliedToDebts: roundMoney(
      allocations.reduce((s, item) => s + item.applied, 0),
    ),
    surplusToCredit: remaining,
  };
}

export async function applyPlantSalesToCustomerDebts(params: {
  qc: QueryClient;
  shopId: string;
  customerName: string;
  customerDebts: any[];
  netAmount: number;
  feePct: number;
  poolMode: NurseryPoolMode;
  recordedBy: string;
  mode: "pay_debts" | "add_credit";
}) {
  const {
    qc,
    shopId,
    customerName,
    customerDebts,
    netAmount,
    feePct,
    poolMode,
    recordedBy,
    mode,
  } = params;

  const cleanNet = roundMoney(netAmount);
  if (cleanNet <= 0) {
    throw new Error("Settlement amount must be greater than zero.");
  }

  const rate = (100 - clampFeePct(feePct)) / 100;
  const grossConsumed = rate > 0 ? roundMoney(cleanNet / rate) : cleanNet;
  const note = buildPlantSettlementNote({
    grossApplied: grossConsumed,
    feePct,
    netApplied: cleanNet,
    mode: poolMode,
    isCreditTopUp: mode === "add_credit",
  });

  const exactDebtsKey = getListDebtsQueryKey({ shopId });
  const paidAt = new Date().toISOString();

  if (mode === "add_credit") {
    const requestId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `plant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const res = await customFetch<any>("/api/debts/customer-credit", {
      method: "POST",
      body: JSON.stringify({
        shopId,
        customerName,
        amount: cleanNet,
        recordedBy,
        note,
        requestId,
      }),
    });

    await Promise.all([
      qc.invalidateQueries({ queryKey: exactDebtsKey }),
      qc.invalidateQueries({ queryKey: getListDebtsQueryKey() }),
      qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] }),
      qc.invalidateQueries({ queryKey: ["/api/crm"] }),
      qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] }),
      qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] }),
      ...customerDebts.map((d) =>
        qc.invalidateQueries({ queryKey: getGetDebtQueryKey(d.id) }),
      ),
    ]);

    return res;
  }

  const preview = buildOldestFirstPreview(customerDebts, cleanNet);
  const lastIdx = preview.allocations.length - 1;

  preview.allocations.forEach(({ debt: d, applied }, idx) => {
    const totalOnRow = roundMoney(
      applied + (idx === lastIdx ? preview.surplusToCredit : 0),
    );
    patchDebtCaches(qc, shopId, d.id, (cur) =>
      applyDebtPayment(cur, totalOnRow, paidAt),
    );
    patchCustomerProfileCaches(qc, shopId, d.id, (cur) =>
      applyDebtPayment(cur, totalOnRow, paidAt),
    );
  });

  const closedCount = preview.allocations.filter(
    ({ debt: d, applied }) => Number(d.balance || 0) - applied <= 0.005,
  ).length;
  patchCustomerListCaches(qc, customerName, (customer) => ({
    ...customer,
    totalBalance: Math.max(
      0,
      Number(customer.totalBalance || 0) - preview.totalAppliedToDebts,
    ),
    totalCredit: Math.max(
      0,
      Number(customer.totalCredit || 0) + preview.surplusToCredit,
    ),
    activeCount: Math.max(
      0,
      Number(customer.activeCount || 0) - closedCount,
    ),
  }));

  try {
    const res = await customFetch<any>("/api/debts/customer-payment", {
      method: "POST",
      body: JSON.stringify({
        shopId,
        customerName,
        amount: cleanNet,
        recordedBy,
        note,
      }),
    });

    await Promise.all([
      qc.invalidateQueries({ queryKey: exactDebtsKey }),
      qc.invalidateQueries({ queryKey: getListDebtsQueryKey() }),
      qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] }),
      qc.invalidateQueries({ queryKey: ["/api/crm"] }),
      qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] }),
      qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] }),
      ...customerDebts.map((d) =>
        qc.invalidateQueries({ queryKey: getGetDebtQueryKey(d.id) }),
      ),
    ]);

    return res;
  } catch (error) {
    await qc.invalidateQueries({ queryKey: exactDebtsKey });
    await Promise.all(
      customerDebts.map((d) =>
        qc.invalidateQueries({ queryKey: getGetDebtQueryKey(d.id) }),
      ),
    );
    throw error;
  }
}
