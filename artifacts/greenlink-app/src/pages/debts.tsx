import React, { useState, useMemo } from "react";
import { useListDebts, useRecordDebtPayment, useGetDebt, getListDebtsQueryKey, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatKES } from "@/lib/format";
import {
  Search, Users, Phone, CalendarClock, CheckCircle2, Wallet,
  MessageCircle, AlertTriangle, Clock, TrendingDown, History,
  ChevronDown, ChevronUp, Banknote, User2, Trash2
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

function PaymentDialog({ debt }: { debt: any }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const recordPayment = useRecordDebtPayment();
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const paidPct = debt.totalAmount > 0
    ? Math.round(((debt.totalAmount - debt.balance) / debt.totalAmount) * 100)
    : 0;

  const handlePayment = async () => {
    const paid = Number(amount);
    const exactKey = getListDebtsQueryKey({ shopId });
    await qc.cancelQueries({ queryKey: exactKey });
    const snapshot = qc.getQueryData(exactKey);
    qc.setQueryData(exactKey, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map(d => {
        if (d.id !== debt.id) return d;
        const newBalance = Math.max(0, d.balance - paid);
        return { ...d, balance: newBalance, status: newBalance === 0 ? "paid" : newBalance < d.totalAmount ? "partial" : d.status };
      });
    });
    setOpen(false); setAmount("");
    (async () => {
      try {
        await recordPayment.mutateAsync({ debtId: debt.id, data: { amount: paid, recordedBy: userName } });
        toast.success("Payment recorded!");
        qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
      } catch {
        qc.setQueryData(exactKey, snapshot);
        toast.error("Failed to record payment — please retry");
      }
    })();
  };

  const quickAmounts = [
    { label: "25%", value: (debt.balance * 0.25).toFixed(0) },
    { label: "Half", value: (debt.balance * 0.5).toFixed(0) },
    { label: "Full", value: debt.balance.toString() },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setAmount(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs px-3 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground">
          <Wallet className="w-3.5 h-3.5 mr-1" />Record Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/40 rounded-xl p-4 border border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
              "bg-destructive/15 text-destructive"
            )}>
              {debt.customerName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-foreground">{debt.customerName}</p>
              {debt.customerPhone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />{debt.customerPhone}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Paid {paidPct}%</span>
              <span>Balance: <span className="text-destructive font-bold font-mono">{formatKES(debt.balance)}</span></span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Total: {formatKES(debt.totalAmount)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wider font-bold">Payment Amount (KES)</Label>
          <Input
            type="number"
            className="h-14 text-2xl font-bold font-mono text-center"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            max={debt.balance}
            autoFocus
          />
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map(q => (
              <Button
                key={q.label}
                variant="outline"
                size="sm"
                className="h-9 text-xs font-semibold"
                onClick={() => setAmount(q.value)}
              >
                {q.label}
                <span className="ml-1 text-[10px] text-muted-foreground font-mono">
                  {formatKES(Number(q.value))}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handlePayment}
            disabled={!amount || Number(amount) <= 0 || Number(amount) > debt.balance || recordPayment.isPending}
            className="px-8"
          >
            {recordPayment.isPending ? "Processing…" : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete debt dialog ────────────────────────────────────────────────────────
function DeleteDebtDialog({ debt, onDeleted }: { debt: any; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await customFetch(`/api/debts/${debt.id}`, { method: "DELETE" });
      toast.success(`Debt for ${debt.customerName} deleted`);
      setOpen(false);
      onDeleted();
    } catch {
      toast.error("Failed to delete — please retry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
          title="Delete debt"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            Delete Debt Record
          </DialogTitle>
        </DialogHeader>

        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 space-y-1">
          <p className="text-sm font-bold text-foreground">{debt.customerName}</p>
          {debt.customerPhone && (
            <p className="text-xs text-muted-foreground">{debt.customerPhone}</p>
          )}
          <p className="text-sm font-bold font-mono text-destructive">{formatKES(debt.totalAmount)}</p>
          <p className="text-[10px] text-muted-foreground">
            Created {format(new Date(debt.createdAt), "d MMM yyyy")}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Use this for <span className="font-semibold text-foreground">returned goods</span> or <span className="font-semibold text-foreground">data entry mistakes</span>. This permanently removes the debt and all its payment records.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            className="px-8"
          >
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Payment history panel ─────────────────────────────────────────────────
function DebtHistoryPanel({ debtId }: { debtId: string }) {
  const { data, isLoading } = useGetDebt(debtId, { query: { enabled: !!debtId } });

  if (isLoading) {
    return (
      <div className="px-4 py-4 space-y-2 animate-pulse">
        {[1, 2].map(i => (
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

  return (
    <div className="border-t border-border/30 bg-muted/10 px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
        Payment Timeline
      </p>

      {/* Original debt row */}
      <div className="relative pl-7 pb-3">
        <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center">
          <Banknote className="h-2.5 w-2.5 text-destructive" />
        </div>
        {payments.length > 0 && <div className="absolute left-2.5 top-5 w-px h-full bg-border/40" />}
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

      {/* Payment rows */}
      {payments.map((payment: any, i: number) => (
        <div key={payment.id} className="relative pl-7 pb-3">
          <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
          </div>
          {i < payments.length - 1 && <div className="absolute left-2.5 top-5 w-px h-full bg-border/40" />}
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

      {/* Summary */}
      <div className="mt-2 pt-3 border-t border-border/30 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground/50">Balance remaining</p>
          <p className={cn("text-sm font-bold font-mono", (data as any)?.balance === 0 ? "text-emerald-400" : "text-destructive")}>
            {formatKES((data as any)?.balance ?? 0)}
          </p>
        </div>
      </div>
    </div>
  );
}

type DebtTab = "unpaid" | "partial" | "overdue" | "paid" | "all";

export default function Debts() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 100);
  const [tab, setTab] = useState<DebtTab>("unpaid");
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);

  const qc = useQueryClient();

  const { data: allDebts, isLoading } = useListDebts(
    { shopId },
    { query: { enabled: !!shopId } }
  );

  const handleDeleted = () => {
    qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
  };

  const stats = useMemo(() => {
    const debts = allDebts || [];
    const active = debts.filter(d => d.status !== "paid");
    const overdue = active.filter(d => differenceInDays(new Date(), new Date(d.createdAt)) > 30);
    return {
      outstanding: active.reduce((s, d) => s + (d.balance || 0), 0),
      activeCount: active.length,
      overdueCount: overdue.length,
      totalDebts: debts.length,
    };
  }, [allDebts]);

  const filtered = useMemo(() => {
    const debts = allDebts || [];
    let list = debts;
    if (tab === "overdue") {
      list = debts.filter(d => d.status !== "paid" && differenceInDays(new Date(), new Date(d.createdAt)) > 30);
    } else if (tab !== "all") {
      list = debts.filter(d => d.status === tab);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(d =>
        d.customerName.toLowerCase().includes(q) ||
        (d.customerPhone || "").includes(q)
      );
    }
    return list;
  }, [allDebts, tab, debouncedSearch]);

  const TABS: { value: DebtTab; label: string; count: number; color?: string }[] = [
    { value: "unpaid", label: "Unpaid", count: (allDebts || []).filter(d => d.status === "unpaid").length, color: "text-destructive" },
    { value: "partial", label: "Partial", count: (allDebts || []).filter(d => d.status === "partial").length, color: "text-orange-400" },
    { value: "overdue", label: "Overdue 30d+", count: stats.overdueCount, color: "text-red-500" },
    { value: "paid", label: "Paid", count: (allDebts || []).filter(d => d.status === "paid").length, color: "text-emerald-400" },
    { value: "all", label: "All", count: stats.totalDebts },
  ];

  return (
    <div className="flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 py-3 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold font-display">Customer Debts</h1>
            <p className="text-xs text-muted-foreground">{stats.activeCount} active debtors</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center">
            <p className="text-base font-bold font-mono text-destructive leading-tight">
              {formatKES(stats.outstanding)}
            </p>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mt-0.5 flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" />Outstanding
            </p>
          </div>
          <div className="bg-muted/40 border border-border/50 rounded-xl p-3 text-center">
            <p className="text-base font-bold font-mono text-foreground leading-tight">{stats.activeCount}</p>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mt-0.5 flex items-center justify-center gap-1">
              <Users className="h-3 w-3" />Customers
            </p>
          </div>
          <div className={cn(
            "border rounded-xl p-3 text-center",
            stats.overdueCount > 0
              ? "bg-red-500/10 border-red-500/20"
              : "bg-muted/40 border-border/50"
          )}>
            <p className={cn(
              "text-base font-bold font-mono leading-tight",
              stats.overdueCount > 0 ? "text-red-400" : "text-muted-foreground"
            )}>
              {stats.overdueCount}
            </p>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mt-0.5 flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />Overdue
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or phone…"
            className="pl-9 h-10 text-sm bg-muted/40 border-border/60 rounded-xl"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                tab === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {t.label}
              <span className={cn(
                "text-[10px] font-bold",
                tab === t.value ? "text-primary-foreground/70" : (t.color || "text-muted-foreground/50")
              )}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Debt list */}
      <div>
        {isLoading ? (
          <div className="divide-y divide-border/40 animate-pulse">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-muted/60 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-28 bg-muted/60 rounded-full" />
                    <div className="h-3 w-12 bg-muted/40 rounded-full" />
                  </div>
                  <div className="h-2.5 w-20 bg-muted/40 rounded-full" />
                  <div className="h-1.5 w-full bg-muted/40 rounded-full mt-2" />
                  <div className="flex gap-2 mt-1">
                    <div className="h-7 w-28 bg-muted/50 rounded-lg" />
                    <div className="h-7 w-20 bg-muted/30 rounded-lg" />
                  </div>
                </div>
                <div className="h-4 w-16 bg-muted/60 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground pt-12">
            <CheckCircle2 className="h-10 w-10 text-emerald-500/30" />
            <p className="text-sm font-medium">
              {tab === "paid" ? "No paid debts yet" : "All clear!"}
            </p>
            <p className="text-xs opacity-50">
              {search ? "No results for your search" : `No ${tab !== "all" ? tab : ""} debt records found.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map(debt => {
              const isPaid = debt.status === "paid";
              const isPartial = debt.status === "partial";
              const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
              const isOverdue = !isPaid && daysAgo > 30;
              const paidPct = debt.totalAmount > 0
                ? Math.round(((debt.totalAmount - debt.balance) / debt.totalAmount) * 100)
                : 0;

              return (
                <React.Fragment key={debt.id}>
                  <div className={cn(
                    "px-4 py-4 hover:bg-muted/10 transition-colors",
                    isOverdue && "border-l-2 border-l-red-500"
                  )}>
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold",
                        isPaid ? "bg-emerald-500/15 text-emerald-400" :
                        isOverdue ? "bg-red-500/15 text-red-400" :
                        isPartial ? "bg-orange-500/15 text-orange-400" :
                        "bg-destructive/15 text-destructive"
                      )}>
                        {debt.customerName.charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-bold text-sm text-foreground">{debt.customerName}</span>
                          <Badge className={cn(
                            "text-[9px] px-1.5 py-0.5 font-bold uppercase border-0 h-4",
                            isPaid ? "bg-emerald-500/15 text-emerald-400" :
                            isOverdue ? "bg-red-500/15 text-red-400" :
                            isPartial ? "bg-orange-500/15 text-orange-400" :
                            "bg-destructive/15 text-destructive"
                          )}>
                            {isOverdue ? `Overdue ${daysAgo}d` : debt.status}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-muted-foreground/70 mb-2">
                          {debt.customerPhone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />{debt.customerPhone}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <CalendarClock className="h-3 w-3" />
                            {format(new Date(debt.createdAt), "MMM d, yyyy")}
                          </span>
                        </div>

                        {/* Payment progress bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground/60">
                              {isPaid ? "Fully paid" : `${paidPct}% paid`}
                            </span>
                            <span className={cn(
                              "font-bold font-mono",
                              isPaid ? "text-emerald-400" : isOverdue ? "text-red-400" : "text-destructive"
                            )}>
                              {isPaid ? formatKES(debt.totalAmount) : `${formatKES(debt.balance)} left`}
                            </span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isPaid ? "bg-emerald-400" : isOverdue ? "bg-red-400" : "bg-primary"
                              )}
                              style={{ width: `${paidPct}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-muted-foreground/40 font-mono">
                            Total: {formatKES(debt.totalAmount)}
                          </p>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 mt-3 flex-wrap items-center">
                          {!isPaid && <PaymentDialog debt={debt} />}
                          {debt.customerPhone && !isPaid && (
                            <a
                              href={`https://wa.me/${debt.customerPhone.replace(/\D/g, "")}?text=Hi ${encodeURIComponent(debt.customerName)}, you have an outstanding balance of ${formatKES(debt.balance)} at our shop. Please settle at your earliest convenience. Thank you!`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs px-3 font-semibold border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/10 hover:border-[#25D366]/50"
                              >
                                <MessageCircle className="w-3.5 h-3.5 mr-1" />WhatsApp
                              </Button>
                            </a>
                          )}
                          <button
                            onClick={() => setExpandedDebtId(expandedDebtId === debt.id ? null : debt.id)}
                            className="flex items-center gap-1 h-8 px-3 rounded-lg bg-muted/60 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <History className="h-3 w-3" />
                            History
                            {expandedDebtId === debt.id
                              ? <ChevronUp className="h-3 w-3" />
                              : <ChevronDown className="h-3 w-3" />
                            }
                          </button>
                          {isOwner && (
                            <DeleteDebtDialog debt={debt} onDeleted={handleDeleted} />
                          )}
                          {isOverdue && (
                            <div className="flex items-center gap-1 text-xs text-red-400 font-semibold">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {daysAgo}d overdue
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {expandedDebtId === debt.id && <DebtHistoryPanel debtId={debt.id} />}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
