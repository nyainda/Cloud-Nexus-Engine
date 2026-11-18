import { format, startOfWeek, startOfMonth, subDays } from "date-fns";

export type QuickRange = "today" | "week" | "month" | "year";

export const QUICK_RANGES: { value: QuickRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
];

export function getDateRange(range: QuickRange): { from: string; to: string } {
  const today = new Date();
  const to = format(today, "yyyy-MM-dd");
  if (range === "today") return { from: to, to };
  if (range === "week") return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), to };
  if (range === "year") return { from: `${today.getFullYear()}-01-01`, to };
  return { from: format(startOfMonth(today), "yyyy-MM-dd"), to };
}

export function getPrevDateRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from + "T12:00:00");
  const t = new Date(to + "T12:00:00");
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const prevTo = subDays(f, 1);
  const prevFrom = subDays(prevTo, days - 1);
  return { from: format(prevFrom, "yyyy-MM-dd"), to: format(prevTo, "yyyy-MM-dd") };
}

export const STALE = 5 * 60_000;
export const GC = 30 * 60_000;

export const CATEGORY_COLORS = [
  "hsl(var(--primary))", "#10b981", "#3b82f6", "#f59e0b", "#ec4899",
  "#8b5cf6", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MonthlySalesResponse {
  shopId: string;
  year: number;
  totalRevenue: number;
  totalProfit: number;
  totalSalesCount: number;
  monthlyBreakdown: { month: number; revenue: number; profit: number; salesCount: number }[];
}

export type NurserySalesBucket = "day" | "month";

export interface NurserySalesRow {
  period: string;
  seedlingsSold: number;
  totalRevenueCents: number;
  cashCents: number;
  mpesaCents: number;
  creditCents: number;
}

export interface NurserySalesResponse {
  from: string;
  to: string;
  bucket: NurserySalesBucket;
  rows: NurserySalesRow[];
}

export interface NurseryVarietyReportRow {
  varietyKey?: string;
  varietyId?: string;
  varietyName: string;
  quantity: number;
  totalAmountCents: number;
  cashCents?: number | string | null;
  mpesaCents?: number | string | null;
  creditCents?: number | string | null;
}

export interface NurseryReportResponse {
  rows: NurseryVarietyReportRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { totalSeedlings: number; totalRevenueCents: number; cashCents: number; mpesaCents: number; creditCents: number };
}

export interface NurseryEntryRow {
  id: string;
  businessDate: string;
  varietyId: string;
  varietyName: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  unitPriceCents: number;
  totalAmountCents: number;
  paymentMethod: "cash" | "mpesa" | "credit";
  sourceSupplierName?: string | null;
  createdAt: string;
}

export interface NurseryEntriesResponse {
  rows: NurseryEntryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function dateRangeDayCount(from: string, to: string): number {
  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((toTime - fromTime) / 86_400_000) + 1;
}

export interface ProductVariant {
  productId: string;
  productName: string;
  category: string;
  totalQty: number;
  totalRevenue: number;
  totalProfit: number;
  salesCount: number;
}

export interface ProductSearchResult {
  query: string;
  variants: ProductVariant[];
  summary: { totalQty: number; totalRevenue: number; totalProfit: number; salesCount: number } | null;
}

export type PsQuickRange = "this_month" | "last_month" | "last_3_months" | "this_year" | "custom";

export function getPsDateRange(r: PsQuickRange): { from: string; to: string } {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");
  if (r === "this_month") {
    return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(today) };
  }
  if (r === "last_month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const last = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: fmt(first), to: fmt(last) };
  }
  if (r === "last_3_months") {
    const from = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    return { from: fmt(from), to: fmt(today) };
  }
  return { from: fmt(new Date(today.getFullYear(), 0, 1)), to: fmt(today) };
}

export function fmtQty(n: number) {
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export interface ProductSearchRequest {
  query: string;
  from: string;
  to: string;
  range: PsQuickRange;
}
