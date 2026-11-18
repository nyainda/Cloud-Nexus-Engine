import { getPdfShopLogoAssets } from "@/lib/pdf-stamp";

export interface QuotationItem {
  productId?: string;
  productName: string;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface Quotation {
  id: string;
  shopId: string;
  quoteNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  notes: string | null;
  validUntil: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  items: QuotationItem[];
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  invoiceSnapshot?: {
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    notes: string | null;
    validUntil: string | null;
    subtotal: number;
    discountAmount: number;
    total: number;
    items: QuotationItem[];
    createdAt: string;
    revisionNumber?: number;
    revisedAt?: string | null;
  } | null;
  createdBy: string | null;
  createdAt: string;
}

export const KES = (n: number) =>
  "KES " +
  n.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

export function amountInWords(amount: number): string {
  const small = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const wholeWords = (value: number): string => {
    if (value < 20) return small[value];
    if (value < 100)
      return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${small[value % 10]}` : ""}`;
    if (value < 1_000)
      return `${small[Math.floor(value / 100)]} hundred${value % 100 ? ` ${wholeWords(value % 100)}` : ""}`;
    if (value < 1_000_000)
      return `${wholeWords(Math.floor(value / 1_000))} thousand${value % 1_000 ? ` ${wholeWords(value % 1_000)}` : ""}`;
    if (value < 1_000_000_000)
      return `${wholeWords(Math.floor(value / 1_000_000))} million${value % 1_000_000 ? ` ${wholeWords(value % 1_000_000)}` : ""}`;
    if (value < 1_000_000_000_000)
      return `${wholeWords(Math.floor(value / 1_000_000_000))} billion${value % 1_000_000_000 ? ` ${wholeWords(value % 1_000_000_000)}` : ""}`;
    return value.toLocaleString("en-KE");
  };
  const centsTotal = Math.round(Math.max(0, Number(amount) || 0) * 100);
  const shillings = Math.floor(centsTotal / 100);
  const cents = centsTotal % 100;
  return `${wholeWords(shillings)} Kenya shillings${cents ? ` and ${wholeWords(cents)} cents` : ""} only`;
}

export function getQuotationShopName(shop: any): string {
  const shopId = shop?.id ?? localStorage.getItem("greenlink_shopId");
  if (shopId === "shop-sunrise") {
    return getPdfShopLogoAssets(shopId).sealName;
  }
  return shop?.name ?? "Our Shop";
}

export const STATUS_META = {
  draft: {
    label: "Draft",
    color: "text-muted-foreground bg-muted/70 border-border/80",
    dot: "bg-muted-foreground",
  },
  sent: {
    label: "Sent",
    color: "text-sky-700 dark:text-sky-300 bg-sky-500/12 border-sky-500/25",
    dot: "bg-sky-500",
  },
  accepted: {
    label: "Accepted",
    color: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/12 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    color: "text-rose-700 dark:text-rose-400 bg-rose-500/12 border-rose-500/25",
    dot: "bg-rose-500",
  },
  expired: {
    label: "Expired",
    color: "text-amber-700 dark:text-amber-400 bg-amber-500/12 border-amber-500/25",
    dot: "bg-amber-500",
  },
} as const;
