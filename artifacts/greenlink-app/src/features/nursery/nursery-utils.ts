import { useEffect, useState } from "react";

export type Variety = {
  id: string;
  name: string;
  category: string;
  defaultPrice: number;
  isActive: number | boolean;
};

export type VarietyListData = {
  rows: Variety[];
  total: number;
  page: number;
  pageSize: number;
  categories: string[];
};

export type ReportRow = {
  varietyKey?: string;
  varietyId?: string;
  varietyName: string;
  quantity: number;
  totalAmountCents: number;
  cashCents?: number | string | null;
  mpesaCents?: number | string | null;
  creditCents?: number | string | null;
};

export type ReportData = {
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { totalSeedlings: number; totalRevenueCents: number; cashCents: number; mpesaCents: number; creditCents: number };
  dailySummary: { totalSeedlings: number; totalRevenueCents: number; cashCents: number; mpesaCents: number; creditCents: number };
};

export type IndividualSaleEntry = {
  id: string;
  requestId: string;
  transactionId?: string | null;
  businessDate: string;
  varietyId: string;
  varietyName: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  unitPriceCents: number;
  totalAmountCents: number;
  paymentMethod: "cash" | "mpesa" | "credit";
  debtId: string | null;
  sourceSupplierId?: string | null;
  sourceSupplierName?: string | null;
  createdAt: string;
};

export type EntriesData = {
  rows: IndividualSaleEntry[];
  total: number;
  page: number;
  pageSize: number;
  summary: { quantity: number; totalCents: number; creditCents: number };
};

export type MonthlyCategory = {
  category: string;
  seedlingsSold: number;
  totalRevenueCents: number;
  varietyCount: number;
  cashCents: number;
  mpesaCents: number;
  creditCents: number;
};

export type MonthlySummaryData = {
  month: string;
  from: string;
  to: string;
  categories: MonthlyCategory[];
  summary: { seedlingsSold: number; totalRevenueCents: number };
};

export type SupplierRow = {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  receivedPlants: number;
  onHandPlants: number;
  supplierCreditCents: number;
  customerDebtCents: number;
};

export type SupplierCustomer = {
  id: string;
  name: string;
  phone?: string | null;
  outstandingDebtCents: number;
};

export type SupplierRecord = {
  id: string;
  recordType: string;
  recordedAt: string;
  varietyName: string;
  quantity: number;
  amountCents: number;
  note: string;
};

export type SaleSource = {
  varietyId: string;
  supplierId: string;
  supplierName: string;
  availableQuantity: number;
};

export type NurseryTab = "overview" | "record" | "catalogue" | "insights" | "sales" | "reports" | "suppliers";

export type CustomerInsightRow = {
  customerKey: string;
  customerName: string;
  customerPhone: string;
  varietyName: string;
  quantity: number;
  totalAmountCents: number;
  lastPurchase: string;
};

export interface NurseryCartItem {
  requestId: string;
  varietyId: string;
  name: string;
  quantity: string;
  unitPrice: string;
  sourceSupplierId: string;
}

export interface NurserySaleEditState {
  businessDate: string;
  varietyId: string;
  quantity: string;
  unitPrice: string;
  paymentMethod: "cash" | "mpesa" | "credit";
  customerName: string;
  customerPhone: string;
}

export const nurseryQueryOptions = {
  staleTime: 10_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

export function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, amount: number) {
  const parsed = new Date(date + "T12:00:00");
  parsed.setDate(parsed.getDate() + amount);
  return localDate(parsed);
}

export function formatBusinessDate(date: string) {
  if (!date) return "—";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function cents(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

export function useDebouncedValue<T>(value: T, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

export function varietyListUrl({
  status,
  search,
  category,
  page,
  pageSize,
}: {
  status: "active" | "archived" | "all";
  search: string;
  category?: string;
  page: number;
  pageSize: number;
}) {
  const params = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
  if (search.trim()) params.set("search", search.trim());
  if (category) params.set("category", category);
  return `/api/nursery/varieties?${params.toString()}`;
}
