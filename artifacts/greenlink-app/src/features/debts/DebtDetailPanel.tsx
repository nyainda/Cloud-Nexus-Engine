import { useState } from "react";
import {
  useGetDebt,
  getListDebtsQueryKey,
  getGetDebtQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { toTitleCase } from "@/components/customer-autocomplete";
import {
  formatPlantSettlementNoteDisplay,
  parsePlantSettlementPayment,
} from "@/lib/nursery-settlement";
import { formatKES, formatQty } from "@/lib/format";
import {
  Phone,
  CheckCircle2,
  MessageCircle,
  Banknote,
  User2,
  ShoppingBasket,
  Package,
  X,
  Sprout,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  debtProductSummary,
  debtBalanceDue,
  debtCredit,
  debtAmountPaid,
} from "@/lib/debt-utils";
import {
  PaymentDialog,
  MarkPaidButton,
  ReversePaymentButton,
} from "./DebtPaymentControls";
import { DeleteDebtDialog, DebtTransferDialog } from "./DebtRecordDialogs";
import { DebtDownloadButton } from "./DebtDownloadButtons";

type DetailTab = "overview" | "payments" | "items";

export function DebtDetailPanel({
  debt,
  isOwner,
  onClose,
  onOpenPlantSettle,
}: {
  debt: any;
  isOwner: boolean;
  onClose: () => void;
  onOpenPlantSettle?: (target: { customerName: string; customerPhone?: string }) => void;
}) {
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const { data, isLoading } = useGetDebt(debt.id, {
    query: { queryKey: getGetDebtQueryKey(debt.id), staleTime: 30_000 },
  });
  const qc = useQueryClient();
  const payments: any[] = (data as any)?.payments ?? [];
  const items: any[] = (data as any)?.items ?? [];

  const isPaid = debt.status === "paid";
  const isCancelled = debt.status === "cancelled";
  const isPartial = debt.status === "partial";
  const balanceDue = debtBalanceDue(debt);
  const customerCredit = debtCredit(debt);
  const totalPaid = debtAmountPaid(debt);
  const paidPct = debt.totalAmount > 0 ? Math.min(100, Math.round((totalPaid / debt.totalAmount) * 100)) : 0;
  const daysOpen = differenceInDays(new Date(), new Date(debt.createdAt));
  const isOverdue = !isPaid && !isCancelled && daysOpen > 30;

  const statusLabel = isCancelled ? "VOIDED" : isPaid ? "PAID" : isPartial ? "PARTIAL" : "UNPAID";
  const statusBadgeCss = isPaid
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : isCancelled
    ? "bg-muted text-muted-foreground border-border"
    : isOverdue
    ? "bg-red-500/15 text-red-400 border-red-500/25"
    : isPartial
    ? "bg-orange-500/15 text-orange-400 border-orange-500/25"
    : "bg-destructive/15 text-destructive border-destructive/25";
  const statusColor = isCancelled ? "text-muted-foreground" : isPaid ? "text-emerald-400" : isOverdue ? "text-red-400" : isPartial ? "text-orange-400" : "text-destructive";
  const avatarBg = isPaid ? "bg-emerald-500/15 text-emerald-400" : isOverdue ? "bg-red-500/15 text-red-400" : isPartial ? "bg-orange-500/15 text-orange-400" : "bg-destructive/15 text-destructive";

  const initials = debt.customerName.split(" ").map((w: string) => w[0] ?? "").slice(0, 2).join("").toUpperCase();

  const tabs = [
    { id: "overview" as DetailTab, label: "Overview" },
    { id: "payments" as DetailTab, label: isLoading ? "Payments" : `Payments (${payments.length})` },
    { id: "items" as DetailTab, label: isLoading ? "Items" : `Items (${items.length})` },
  ];
  const reversedPaymentIds = new Set(
    payments.filter((p: any) => p.paymentType === "reversal" && p.reversalOfId).map((p: any) => p.reversalOfId),
  );
  const refreshDebt = () => {
    qc.invalidateQueries({ queryKey: getListDebtsQueryKey({ shopId: localStorage.getItem("greenlink_shopId") || "" }) });
    qc.invalidateQueries({ queryKey: getGetDebtQueryKey(debt.id) });
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold font-mono text-foreground truncate">
            Debt #{debt.id.slice(0, 8).toUpperCase()}
          </span>
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border shrink-0", statusBadgeCss)}>
            {statusLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ml-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setDetailTab(t.id)}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px",
              detailTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {detailTab === "overview" && (
          <div className="p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold shrink-0", avatarBg)}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-foreground">{toTitleCase(debt.customerName)}</p>
                {debt.customerPhone ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3 shrink-0" />{debt.customerPhone}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/30 mt-0.5 italic">No phone number</p>
                )}
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  {daysOpen}d ago{isOverdue && <span className="text-red-400 font-semibold"> · Overdue</span>}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-muted/30 rounded-xl p-3 border border-border/40">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Total Amount</p>
                <p className="text-sm font-bold font-mono text-foreground">{formatKES(debt.totalAmount)}</p>
              </div>
              <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/15">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Amount Paid</p>
                <p className="text-sm font-bold font-mono text-emerald-400">{formatKES(totalPaid)}</p>
              </div>
              <div className={cn("rounded-xl p-3 border", isPaid ? "bg-emerald-500/5 border-emerald-500/15" : "bg-destructive/5 border-destructive/15")}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {balanceDue <= 0.005 ? "Paid in Full" : "Balance Due"}
                </p>
                <p className={cn("text-sm font-bold font-mono", statusColor)}>{formatKES(balanceDue)}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 border border-border/40">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Status</p>
                <span className={cn("text-xs font-bold", statusColor)}>{statusLabel}</span>
              </div>
              {customerCredit > 0 && (
                <div className="rounded-xl p-3 border border-emerald-500/15 bg-emerald-500/5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1.5">Customer Credit</p>
                  <p className="text-sm font-bold font-mono text-emerald-400">{formatKES(customerCredit)}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Available for the customer&apos;s next debt or sale.</p>
                </div>
              )}
            </div>

            {!isPaid && (
              <div>
                <div className="flex justify-between text-[10px] mb-1.5 text-muted-foreground">
                  <span>Paid {paidPct}%</span>
                  <span className="font-mono">{formatKES(totalPaid)} / {formatKES(debt.totalAmount)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", isPartial ? "bg-orange-400" : "bg-primary")}
                    style={{ width: `${paidPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border overflow-hidden">
              {[
                { label: "Debt Ref", value: debt.id.slice(0, 8).toUpperCase() },
                { label: "Sale ID", value: debt.saleId ? debt.saleId.slice(0, 14) + "…" : "—" },
                { label: "Created At", value: format(new Date(debt.createdAt), "d MMM yyyy, HH:mm") },
                ...(debt.paidAt ? [{ label: isCancelled ? "Voided At" : "Paid At", value: format(new Date(debt.paidAt), "d MMM yyyy") }] : []),
                ...(debt.notes ? [{ label: "Notes", value: debt.notes }] : []),
              ].map((row, i) => (
                <div key={row.label} className={cn("flex items-start gap-3 px-3 py-2.5", i > 0 && "border-t border-border/60")}>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-[68px] shrink-0 mt-0.5 leading-relaxed">{row.label}</span>
                  <span className="text-xs text-foreground font-mono break-all">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {detailTab === "payments" && (
          <div className="p-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-xl" />)}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                  <div className="w-8 h-8 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                    <Banknote className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">Debt Opened</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(debt.createdAt), "d MMM yyyy, HH:mm")}</p>
                  </div>
                  <p className="text-xs font-bold font-mono text-destructive shrink-0">{formatKES(debt.totalAmount)}</p>
                </div>

                {payments.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center py-6 italic">No payments recorded yet</p>
                )}

                {payments.map((p: any, i: number) => {
                  const isReversal = p.paymentType === "reversal" || Number(p.amount) < 0;
                  const isReversed = !isReversal && reversedPaymentIds.has(p.id);
                  const plantMeta = !isReversal ? parsePlantSettlementPayment(p) : { isPlantLinked: false };
                  const cleanNote = formatPlantSettlementNoteDisplay(p.note);
                  return (
                    <div
                      key={p.id ?? i}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border",
                        isReversal ? "bg-destructive/5 border-destructive/20" : isReversed ? "bg-muted/30 border-border/50" : "bg-emerald-500/5 border-emerald-500/20",
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        isReversal ? "bg-destructive/15" : isReversed ? "bg-muted" : "bg-emerald-500/15",
                      )}>
                        {isReversal
                          ? <X className="h-3.5 w-3.5 text-destructive" />
                          : <CheckCircle2 className={cn("h-3.5 w-3.5", isReversed ? "text-muted-foreground" : "text-emerald-400")} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-semibold">
                            {isReversal ? "Payment Reversed" : isReversed ? "Payment Received · Reversed" : "Payment Received"}
                          </p>
                          {plantMeta.isPlantLinked && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                              <Sprout className="h-2.5 w-2.5" />
                              Plant Proceeds
                            </span>
                          )}
                          {p.recordedBy && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <User2 className="h-2.5 w-2.5" />{p.recordedBy}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(p.paidAt), "d MMM yyyy, HH:mm")}
                          {cleanNote ? ` · ${cleanNote}` : ""}
                        </p>
                        <p className="text-[10px] text-primary/70 mt-1 flex items-start gap-1">
                          <Package className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                          <span className="truncate">Product: {debtProductSummary(items)}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cn("text-xs font-bold font-mono", isReversal ? "text-destructive" : isReversed ? "text-muted-foreground line-through" : "text-emerald-400")}>
                          {isReversal ? "" : "+"}{formatKES(Math.abs(p.amount))}
                        </p>
                        {isOwner && !isReversal && !isReversed && (
                          <ReversePaymentButton debtId={debt.id} payment={p} onDone={refreshDebt} />
                        )}
                      </div>
                    </div>
                  );
                })}

                <div className="mt-1 p-3 rounded-xl bg-muted/30 border border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground/60">Balance</p>
                    <p className={cn("text-sm font-bold font-mono", debtBalanceDue(debt) === 0 ? "text-emerald-400" : statusColor)}>
                      {formatKES(debtBalanceDue(debt))}
                    </p>
                    {debtCredit(debt) > 0 && <p className="text-[10px] text-emerald-400 font-semibold">+{formatKES(debtCredit(debt))} credit</p>}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {detailTab === "items" && (
          <div className="p-4">
            {isLoading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted/40 rounded-xl" />)}
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 text-center py-8 italic">No items linked to this debt</p>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_32px_minmax(90px,auto)_minmax(90px,auto)] bg-muted/50 border-b border-border">
                    <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Product</div>
                    <div className="px-1 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-right">Qty</div>
                    <div className="px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-right">Unit</div>
                    <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-right">Total</div>
                  </div>
                  {items.map((item: any, i: number) => (
                    <div key={i} className={cn("grid grid-cols-[1fr_32px_minmax(90px,auto)_minmax(90px,auto)] items-center", i > 0 && "border-t border-border/50")}>
                      <div className="px-3 py-2.5 text-xs font-medium truncate">{item.productName}</div>
                      <div className="px-1 py-2.5 text-xs text-right text-muted-foreground font-mono tabular-nums">{formatQty(Number(item.qty ?? item.quantity ?? 0))}</div>
                      <div className="px-2 py-2.5 text-xs text-right text-muted-foreground font-mono whitespace-nowrap">{formatKES(item.unitPrice)}</div>
                      <div className="px-3 py-2.5 text-xs text-right font-bold font-mono text-primary whitespace-nowrap">{formatKES(item.totalPrice ?? item.total)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <span className="text-xs font-bold">Total</span>
                  <span className="text-sm font-bold font-mono text-primary">{formatKES(debt.totalAmount)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions footer */}
      <div className="border-t border-border p-3 shrink-0 space-y-2">
        <div className="flex gap-2 flex-wrap">
          {!isPaid && !isCancelled && debt.balance > 0 && <PaymentDialog debt={debt} />}
          {onOpenPlantSettle && (
            <button
              type="button"
              onClick={() =>
                onOpenPlantSettle({
                  customerName: debt.customerName,
                  customerPhone: debt.customerPhone,
                })
              }
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold transition-colors cursor-pointer"
              title="Settle using Nursery plant sales"
            >
              <Sprout className="h-3.5 w-3.5" />
              Settle w/ Plants
            </button>
          )}
          <DebtDownloadButton debt={debt} />
          {isOwner && !isPaid && !isCancelled && debt.balance > 0 && <MarkPaidButton debt={debt} />}
          {isOwner && !isPaid && !isCancelled && debt.balance > 0 && (
            <DebtTransferDialog debt={debt} items={items} onDone={refreshDebt} />
          )}
          {isOwner && !isCancelled && !isLoading && payments.length === 0 && !totalPaid && !(data as any)?.saleId && !(debt as any).saleId && (
            <DeleteDebtDialog debt={debt} onDeleted={onClose} />
          )}
        </div>
        {debt.customerPhone && !isPaid && !isCancelled && debt.balance > 0 && (
          <a
            href={`https://wa.me/${debt.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${debt.customerName}, you have an outstanding balance of ${formatKES(debt.balance)} at our shop. Please settle at your earliest convenience. Thank you!`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full h-8 rounded-xl border border-[#25D366]/30 text-[#25D366] bg-[#25D366]/5 hover:bg-[#25D366]/15 text-xs font-semibold transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Send WhatsApp Reminder
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Legacy panel kept for internal use only ──────────────────────────────
export function DebtHistoryPanel({ debtId }: { debtId: string }) {
  const { data, isLoading } = useGetDebt(debtId, {
    query: { queryKey: getGetDebtQueryKey(debtId), enabled: !!debtId },
  });

  if (isLoading) {
    return (
      <div className="px-4 py-4 space-y-2 animate-pulse">
        {[1, 2].map((i) => (
          <div key={i} className="flex gap-3 items-center">
            <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-2 w-16 bg-muted rounded" />
            </div>
            <div className="h-3 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const payments = (data as any)?.payments || [];
  const items: { productName: string; quantity: number; unitPrice: number; totalPrice: number; discount?: number | null }[] = (data as any)?.items || [];

  return (
    <div className="border-t border-border/30 bg-muted/10 px-4 py-4 space-y-4">
      {items.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2 flex items-center gap-1.5">
            <ShoppingBasket className="h-3 w-3" />Items Taken
          </p>
          <div className="rounded-xl border border-border/40 overflow-hidden bg-background/40">
            {items.map((item, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  i > 0 && "border-t border-border/30",
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Package className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">
                    {item.quantity} × {formatKES(item.unitPrice)}
                    {item.discount ? <span className="ml-1.5 text-orange-400">−{item.discount}%</span> : null}
                  </p>
                </div>
                <p className="text-xs font-bold font-mono text-foreground shrink-0">{formatKES(item.totalPrice)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
          Payment Timeline
        </p>

        <div className="relative pl-7 pb-3 overflow-hidden">
          <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center">
            <Banknote className="h-2.5 w-2.5 text-destructive" />
          </div>
          {payments.length > 0 && <div className="absolute left-2.5 top-5 w-px bottom-0 bg-border/40" />}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Debt opened</p>
              <p className="text-[10px] text-muted-foreground/60">
                {data ? format(new Date((data as any).createdAt), "d MMM yyyy, HH:mm") : "—"}
              </p>
            </div>
            <p className="text-xs font-bold text-destructive font-mono">{formatKES((data as any)?.totalAmount ?? 0)}</p>
          </div>
        </div>

        {payments.map((payment: any, i: number) => (
          <div key={payment.id} className="relative pl-7 pb-3 overflow-hidden">
            <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
            </div>
            {i < payments.length - 1 && <div className="absolute left-2.5 top-5 w-px bottom-0 bg-border/40" />}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-foreground">Payment received</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[10px] text-muted-foreground/60">
                    {format(new Date(payment.paidAt), "d MMM yyyy, HH:mm")}
                  </p>
                  {payment.recordedBy && (
                    <p className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
                      <User2 className="h-2 w-2" />{payment.recordedBy}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-emerald-400 font-mono">+{formatKES(payment.amount)}</p>
            </div>
          </div>
        ))}

        {payments.length === 0 && (
          <p className="text-xs text-muted-foreground/40 pl-7 italic">No payments recorded yet</p>
        )}

        <div className="mt-2 pt-3 border-t border-border/30 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground/50">Balance remaining</p>
            <p className={cn("text-sm font-bold font-mono", debtBalanceDue(data) === 0 ? "text-emerald-400" : "text-destructive")}>
              {formatKES(debtBalanceDue(data))}
            </p>
            {debtCredit(data) > 0 && (
              <p className="text-[10px] text-emerald-400 font-semibold">
                +{formatKES(debtCredit(data))} customer credit
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
