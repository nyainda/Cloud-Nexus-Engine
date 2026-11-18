export function customerKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function formatWhatsAppNumber(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }
  return digits;
}

export interface CustomerEntry {
  id: string | null;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  creditLimit: number | null;
  registered: boolean;
  totalBalance: number;
  totalCredit: number;
  totalOwed: number;
  totalPaid: number;
  debtCount: number;
  activeCount: number;
  lastActivity: string | null;
  latestDebtAmount: number | null;
  latestDebtBalance: number | null;
  latestDebtStatus: string | null;
  createdAt: string;
}

export interface CustomerProfile {
  registered: boolean;
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    notes: string | null;
    creditLimit: number | null;
    createdAt: string;
  } | null;
  debts: any[];
  stats: {
    totalBalance: number;
    totalCredit: number;
    totalOwed: number;
    totalPaid: number;
    debtCount: number;
    activeCount: number;
  };
}

export type FilterMode = "all" | "registered" | "active" | "credit";
export type SortMode = "balance" | "recent" | "name" | "paid" | "credit";

export const AVATAR_COLORS = [
  "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/20",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/20",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/20",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/20",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/20",
];

export function avatarColor(name: string, hasBalance: boolean) {
  if (hasBalance) {
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25";
  }
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  return AVATAR_COLORS[idx];
}

export const crmKey = (shopId: string) => ["/api/crm", shopId];
export const profileKey = (shopId: string, name: string) => ["/api/crm/profile", shopId, name];

export const PAGE_STEP = 20;
export const INITIAL_VISIBLE = 15;
