import { useState } from "react";
import { toTitleCase } from "@/components/customer-autocomplete";
import { type NurserySupplierSummary } from "@/lib/nursery-settlement";
import { formatKES } from "@/lib/format";
import { Phone, CalendarClock, ChevronDown, ChevronRight, Sprout } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { type CustomerGroup, debtBalanceDue, debtCredit } from "@/lib/debt-utils";
import { CustomerDownloadButton } from "./DebtDownloadButtons";
import { AddCreditDialog } from "./DebtPaymentControls";

export function DebtRecordRow({ debt, onSelectDebt }: { debt: any; onSelectDebt: (debt: any) => void }) {
  const debtPaid = debt.status === "paid";
  const debtVoided = debt.status === "cancelled";
  const days = differenceInDays(new Date(), new Date(debt.createdAt));
  return (
    <button
      onClick={() => onSelectDebt(debt)}
      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left bg-card/70 hover:bg-card border border-border/60 hover:border-primary/40 transition-all"
    >
      <div className="w-8 h-8 rounded-lg bg-muted/50 border border-border/60 flex items-center justify-center shrink-0">
        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold truncate">{format(new Date(debt.createdAt), "d MMM yyyy, HH:mm")}</p>
        <p className="text-[11px] text-muted-foreground truncate">{debt.notes || `${days}d ago`} · Ref #{debt.id.slice(0, 8).toUpperCase()}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-bold font-mono tabular-nums">{formatKES(debt.totalAmount)}</p>
        <p className={cn("text-[11px] font-mono font-semibold tabular-nums", debtVoided ? "text-muted-foreground" : debtPaid ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
          {debtVoided ? "Voided" : debtPaid ? (debtCredit(debt) > 0 ? `Paid · +${formatKES(debtCredit(debt))} credit` : "Paid") : `${formatKES(debtBalanceDue(debt))} due`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export function CustomerGroupRow({
  group,
  onSelectDebt,
  matchedSupplier,
  plantPaidAmount = 0,
  onOpenPlantSettle,
}: {
  group: CustomerGroup;
  onSelectDebt: (debt: any) => void;
  matchedSupplier?: NurserySupplierSummary | null;
  plantPaidAmount?: number;
  onOpenPlantSettle?: (target: { customerName: string; customerPhone?: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasActive = group.activeDebts.length > 0;
  const hasPaidHistory = group.debts.some((d: any) => d.status === "paid");
  const allCancelled = group.debts.length > 0 && group.debts.every((d: any) => d.status === "cancelled");
  const isPaid = !hasActive && hasPaidHistory;
  const isPartial = hasActive && group.totalBalance > 0 && group.totalBalance < group.totalAmount;
  const isVoided = !hasActive && allCancelled;
  const statusLabel = isVoided ? "Voided" : isPaid ? "Paid" : group.isOverdue ? "Overdue" : isPartial ? "Partial" : "Unpaid";
  const statusCss = isPaid
    ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
    : isVoided
    ? "bg-muted text-muted-foreground border-border"
    : group.isOverdue
    ? "bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/25"
    : isPartial
    ? "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/25"
    : "bg-destructive/12 text-destructive border-destructive/25";
  const initials = group.customerName.split(" ").map((w: string) => w[0] ?? "").slice(0, 2).join("").toUpperCase();

  const outstandingDebts = group.debts.filter((d: any) => d.status === "unpaid" || d.status === "partial");
  const settledDebts = group.debts.filter((d: any) => d.status === "paid" || d.status === "cancelled");
  const [showSettled, setShowSettled] = useState(false);

  const paidAcrossGroup = Math.max(0, group.totalAmount - group.totalBalance);
  const groupPaidPct = group.totalAmount > 0 ? Math.min(100, Math.round((paidAcrossGroup / group.totalAmount) * 100)) : 0;

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div
        className="group relative flex items-center gap-3 px-4 py-3.5 hover:bg-muted/25 transition-colors cursor-pointer sm:grid sm:grid-cols-[minmax(190px,1.5fr)_minmax(110px,0.8fr)_minmax(115px,0.9fr)_92px_auto]"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className={cn(
            "absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full",
            isPaid ? "bg-emerald-500" : isVoided ? "bg-muted-foreground/40" : group.isOverdue ? "bg-rose-500" : isPartial ? "bg-amber-500" : "bg-destructive",
          )}
        />

        <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
          <div className={cn(
            "w-10 h-10 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0",
            isPaid
              ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
              : group.isOverdue
              ? "bg-rose-500/12 border-rose-500/25 text-rose-600 dark:text-rose-400"
              : isPartial
              ? "bg-amber-500/12 border-amber-500/25 text-amber-600 dark:text-amber-400"
              : "bg-primary/12 border-primary/25 text-primary",
          )}>
            {initials || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{toTitleCase(group.customerName)}</p>
              {matchedSupplier && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 border border-emerald-500/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Sprout className="h-2.5 w-2.5" />
                  Nursery
                </span>
              )}
              {plantPaidAmount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/12 border border-amber-500/25 px-1.5 py-0.5 text-[9px] font-bold font-mono text-amber-600 dark:text-amber-400 shrink-0">
                  Paid w/ Plants: {formatKES(plantPaidAmount)}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
              {group.customerPhone && (
                <span className="inline-flex items-center gap-1 font-mono">
                  <Phone className="h-2.5 w-2.5 shrink-0" />
                  {group.customerPhone}
                </span>
              )}
              {group.customerPhone && <span>·</span>}
              <span>{group.debts.length} record{group.debts.length === 1 ? "" : "s"}</span>
            </p>
          </div>
        </div>

        <div className="hidden sm:block text-right">
          <p className="text-sm font-semibold font-mono tabular-nums text-foreground">{formatKES(group.totalAmount)}</p>
          <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${groupPaidPct}%` }} />
          </div>
        </div>

        <div className="text-right shrink-0">
          <p className={cn(
            "text-sm font-bold font-mono tabular-nums",
            isPaid ? "text-emerald-600 dark:text-emerald-400" : group.isOverdue ? "text-rose-600 dark:text-rose-400" : isPartial ? "text-amber-600 dark:text-amber-400" : "text-destructive",
          )}>
            {formatKES(group.totalBalance)}
          </p>
          <p className="text-[10px] text-muted-foreground">Balance due</p>
          {group.totalCredit > 0 && (
            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
              +{formatKES(group.totalCredit)} credit
            </p>
          )}
        </div>

        <div className="hidden sm:flex justify-center">
          <span className={cn("inline-flex text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider", statusCss)}>
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center justify-end gap-1.5 shrink-0">
          {onOpenPlantSettle && matchedSupplier && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenPlantSettle({ customerName: group.customerName, customerPhone: group.customerPhone });
              }}
              className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-500/12 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold transition-colors cursor-pointer"
              title="Settle debts or view profit using plant sales"
            >
              <Sprout className="h-3 w-3" />
              Plants
            </button>
          )}
          {group.totalCredit > 0 && (
            <span onClick={(e) => e.stopPropagation()} className="shrink-0">
              <AddCreditDialog customerName={group.customerName} currentCredit={group.totalCredit} />
            </span>
          )}
          <CustomerDownloadButton group={group} />
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", expanded && "rotate-180 text-primary")} />
        </div>
      </div>
      {expanded && (
        <div className="bg-muted/20 border-t border-border/60 px-4 sm:px-5 py-3 space-y-1.5">
          {onOpenPlantSettle && (hasActive || matchedSupplier) && (
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <Sprout className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                <span className="text-[11px] font-medium text-foreground truncate">
                  {matchedSupplier
                    ? "Linked nursery owner — clear debts from sold plants or view shop profits"
                    : "Is this the nursery plant supplier? Clear debt using sold plants"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenPlantSettle({ customerName: group.customerName, customerPhone: group.customerPhone })}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors shrink-0 cursor-pointer"
              >
                <Sprout className="h-3 w-3" />
                {matchedSupplier ? "Settle w/ Plants" : "Link & Settle w/ Plants"}
              </button>
            </div>
          )}
          {outstandingDebts.length > 0 && (
            <>
              <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                <span>Outstanding ({outstandingDebts.length})</span>
                <span>Select a record to inspect</span>
              </div>
              {outstandingDebts.map((debt: any) => (
                <DebtRecordRow key={debt.id} debt={debt} onSelectDebt={onSelectDebt} />
              ))}
            </>
          )}

          {settledDebts.length > 0 && (
            <div className={cn(outstandingDebts.length > 0 && "mt-2 pt-2 border-t border-border/50")}>
              <button
                onClick={() => setShowSettled((v) => !v)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                <span>Settled / Paid ({settledDebts.length})</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showSettled && "rotate-180")} />
              </button>
              {showSettled && (
                <div className="opacity-85 space-y-1.5 pt-1">
                  {settledDebts.map((debt: any) => (
                    <DebtRecordRow key={debt.id} debt={debt} onSelectDebt={onSelectDebt} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
