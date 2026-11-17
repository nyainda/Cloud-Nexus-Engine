import { formatQty } from "@/lib/format";

export interface CustomerGroup {
  key: string;
  customerName: string;
  customerPhone: string;
  debts: any[];
  activeDebts: any[];
  totalBalance: number;
  totalCredit: number;
  totalAmount: number;
  worstStatus: "unpaid" | "partial" | "paid" | "cancelled";
  isOverdue: boolean;
}

export function debtProductSummary(items: any[] | undefined): string {
  const labels = (items ?? [])
    .map((item) => {
      const name = item?.productName ?? item?.name;
      if (!name) return "";
      const qty = item?.qty ?? item?.quantity;
      return qty !== undefined && qty !== null
        ? `${name} × ${formatQty(Number(qty))}`
        : String(name);
    })
    .filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "Unlinked debt";
}

export function compactDebtProductSummary(
  items: any[] | undefined,
  maxItems = 2,
): string {
  const labels = (items ?? [])
    .map((item) => {
      const name = item?.productName ?? item?.name;
      if (!name) return "";
      const qty = item?.qty ?? item?.quantity;
      return qty !== undefined && qty !== null
        ? `${name} × ${formatQty(Number(qty))}`
        : String(name);
    })
    .filter(Boolean);
  if (labels.length === 0) return "Unlinked debt";
  const visible = labels.slice(0, maxItems);
  return labels.length > maxItems
    ? `${visible.join(", ")} + ${labels.length - maxItems} more`
    : visible.join(", ");
}

export function debtBalanceDue(debt: any): number {
  return Math.max(0, Number(debt?.balance || 0));
}

export function debtCredit(debt: any): number {
  return Math.max(0, -Number(debt?.balance || 0));
}

export function debtAmountPaid(debt: any): number {
  return Math.max(
    0,
    Number(
      debt?.amountPaid ?? Number(debt?.totalAmount || 0) - Number(debt?.balance || 0),
    ),
  );
}

export function debtGenuineCashReceived(debt: any): number {
  const payments = debt?.payments || [];
  const reversedIds = new Set(
    payments
      .filter((p: any) => p.paymentType === "reversal" && p.reversalOfId)
      .map((p: any) => p.reversalOfId),
  );
  return payments
    .filter(
      (p: any) =>
        p.paymentType !== "reversal" &&
        Number(p.amount) >= 0 &&
        p.paymentType !== "credit_applied" &&
        !reversedIds.has(p.id),
    )
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
}

export function debtHasEffectivePaymentHistory(debt: any): boolean {
  const payments = debt?.payments || [];
  const reversedIds = new Set(
    payments
      .filter((p: any) => p.paymentType === "reversal" && p.reversalOfId)
      .map((p: any) => p.reversalOfId),
  );
  return payments.some(
    (p: any) =>
      p.paymentType !== "reversal" &&
      Number(p.amount) >= 0 &&
      !reversedIds.has(p.id),
  );
}

export function debtPdfBalanceDue(debt: any): number {
  return debt?.status === "paid" ? 0 : debtBalanceDue(debt);
}

export function debtPdfAmountPaid(debt: any): number {
  if (debt?.status === "paid" && !debtHasEffectivePaymentHistory(debt)) {
    return Math.max(Number(debt?.totalAmount || 0), debtAmountPaid(debt));
  }
  return debtAmountPaid(debt);
}

export function debtPdfTotalPaid(debt: any): number {
  if (debt?.status === "paid" && !debtHasEffectivePaymentHistory(debt)) {
    return Math.max(Number(debt?.totalAmount || 0), debtAmountPaid(debt));
  }
  return debtGenuineCashReceived(debt);
}

export function sameCustomer(a: string, b: string): boolean {
  return (
    a.trim().replace(/\s+/g, " ").toLowerCase() ===
    b.trim().replace(/\s+/g, " ").toLowerCase()
  );
}

/** Client-side mirror of the server's allocatePayment — oldest debt first. */
export function previewAllocations(debtsToPay: any[], paymentAmount: number) {
  let remaining = Math.max(0, paymentAmount);
  const allocations: { debt: any; amount: number }[] = [];
  for (const d of debtsToPay) {
    if (remaining <= 0) break;
    const due = debtBalanceDue(d);
    const amount = Math.min(remaining, due);
    if (amount <= 0) continue;
    allocations.push({ debt: d, amount });
    remaining -= amount;
  }
  return { allocations, remaining };
}
