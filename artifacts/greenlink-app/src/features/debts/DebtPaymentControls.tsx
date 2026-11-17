import { useState, useMemo } from "react";
import {
  useListDebts,
  useRecordDebtPayment,
  getListDebtsQueryKey,
  getGetDebtQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { enqueueMutation } from "@/lib/offline-queue";
import { useQueryClient } from "@tanstack/react-query";
import { toTitleCase } from "@/components/customer-autocomplete";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatKES } from "@/lib/format";
import { Phone, Wallet, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  applyDebtPayment,
  patchCustomerListCaches,
  patchCustomerProfileCaches,
  patchDebtCaches,
} from "@/lib/optimistic-finance";
import {
  debtBalanceDue,
  debtCredit,
  debtAmountPaid,
  sameCustomer,
  previewAllocations,
} from "@/lib/debt-utils";

export function PaymentDialog({ debt }: { debt: any }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [applyToAll, setApplyToAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const recordPayment = useRecordDebtPayment();
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const currentBalance = debtBalanceDue(debt);
  const enteredAmount = Number(amount) || 0;
  const extraCredit = Math.max(0, enteredAmount - currentBalance);
  const remainingAfterPayment = Math.max(0, currentBalance - enteredAmount);
  const paidPct = debt.totalAmount > 0
    ? Math.min(100, Math.round((debtAmountPaid(debt) / debt.totalAmount) * 100))
    : 0;

  const { data: allDebts } = useListDebts(
    { shopId },
    { query: { queryKey: getListDebtsQueryKey({ shopId }), enabled: open } },
  );
  const otherOpenDebts = useMemo(() => {
    if (!Array.isArray(allDebts)) return [];
    return (allDebts as any[])
      .filter(
        (d) =>
          d.id !== debt.id &&
          (d.status === "unpaid" || d.status === "partial") &&
          sameCustomer(d.customerName, debt.customerName),
      )
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }, [allDebts, debt.id, debt.customerName]);
  const hasOtherDebts = otherOpenDebts.length > 0;

  const payoffOrder = useMemo(
    () => [debt, ...otherOpenDebts].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))),
    [debt, otherOpenDebts],
  );
  const totalOwedAcrossDebts = useMemo(
    () => payoffOrder.reduce((sum, d) => sum + debtBalanceDue(d), 0),
    [payoffOrder],
  );
  const allocationPreview = useMemo(
    () => (applyToAll && hasOtherDebts ? previewAllocations(payoffOrder, enteredAmount) : null),
    [applyToAll, hasOtherDebts, payoffOrder, enteredAmount],
  );

  const handlePayment = async () => {
    const paid = Number(amount);
    if (!paid || paid <= 0 || submitting) return;
    const bulk = applyToAll && hasOtherDebts;

    setSubmitting(true);

    const exactKey = getListDebtsQueryKey({ shopId });
    const snapshot = qc.getQueryData(exactKey);
    const paidAt = new Date().toISOString();

    qc.cancelQueries({ queryKey: exactKey });

    if (bulk) {
      const { allocations, remaining } = previewAllocations(payoffOrder, paid);
      const lastIdx = allocations.length - 1;

      allocations.forEach(({ debt: d, amount: portion }, i) => {
        const finalApplied = portion + (i === lastIdx ? remaining : 0);
        patchDebtCaches(qc, shopId, d.id, (current) => applyDebtPayment(current, finalApplied, paidAt));
        patchCustomerProfileCaches(qc, shopId, d.id, (current) => applyDebtPayment(current, finalApplied, paidAt));
      });
      const closedCount = allocations.filter(
        ({ debt: d, amount: portion }) => debtBalanceDue(d) - portion <= 0.005,
      ).length;
      patchCustomerListCaches(qc, debt.customerName, (customer) => ({
        ...customer,
        totalBalance: Math.max(0, Number(customer.totalBalance || 0) - (paid - remaining)),
        totalCredit: Math.max(0, Number(customer.totalCredit || 0) + remaining),
        activeCount: Math.max(0, Number(customer.activeCount || 0) - closedCount),
      }));

      setOpen(false);
      setAmount("");
      setApplyToAll(false);

      if (!navigator.onLine) {
        try {
          await enqueueMutation("customer_debt_payment", shopId, {
            shopId,
            customerName: debt.customerName,
            amount: paid,
            recordedBy: userName,
          });
          toast.success("Payment saved offline — will sync on reconnect");
        } catch {
          qc.setQueryData(exactKey, snapshot);
          qc.invalidateQueries({ queryKey: ["/api/crm"] });
          qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
          toast.error("Could not save offline payment — please retry");
        } finally {
          setSubmitting(false);
        }
        return;
      }

      toast.success(
        allocations.length > 1
          ? `Payment applied across ${allocations.length} debts!`
          : "Payment recorded!",
      );

      customFetch("/api/debts/customer-payment", {
        method: "POST",
        body: JSON.stringify({ shopId, customerName: debt.customerName, amount: paid, recordedBy: userName }),
      })
        .then(() => {
          qc.invalidateQueries({ queryKey: exactKey });
          allocations.forEach(({ debt: d }) => qc.invalidateQueries({ queryKey: getGetDebtQueryKey(d.id) }));
          qc.invalidateQueries({ queryKey: ["/api/crm"] });
          qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
        })
        .catch(() => {
          qc.setQueryData(exactKey, snapshot);
          allocations.forEach(({ debt: d }) => qc.invalidateQueries({ queryKey: getGetDebtQueryKey(d.id) }));
          qc.invalidateQueries({ queryKey: ["/api/crm"] });
          qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
          toast.error("Payment failed — please retry");
        })
        .finally(() => {
          setSubmitting(false);
        });
      return;
    }

    patchDebtCaches(qc, shopId, debt.id, (current) =>
      applyDebtPayment(current, paid, paidAt),
    );
    patchCustomerListCaches(qc, debt.customerName, (customer) => {
      const nextBalance = Math.max(0, Number(customer.totalBalance || 0) - paid);
      const creditIncrease = Math.max(0, paid - currentBalance);
      return {
        ...customer,
        totalBalance: nextBalance,
        totalCredit: Math.max(0, Number(customer.totalCredit || 0) + creditIncrease),
        activeCount: Math.max(
          0,
          Number(customer.activeCount || 0) - (paid >= currentBalance ? 1 : 0),
        ),
      };
    });
    patchCustomerProfileCaches(qc, shopId, debt.id, (current) =>
      applyDebtPayment(current, paid, paidAt),
    );

    setOpen(false);
    setAmount("");
    setApplyToAll(false);
    if (!navigator.onLine) {
      try {
        await enqueueMutation("debt_payment", shopId, { debtId: debt.id, amount: paid, recordedBy: userName });
        toast.success("Payment saved offline — will sync on reconnect");
      } catch {
        qc.invalidateQueries({ queryKey: exactKey });
        qc.invalidateQueries({ queryKey: ["/api/crm"] });
        qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
        toast.error("Could not save offline payment — please retry");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    toast.success("Payment recorded!");

    recordPayment.mutateAsync({ debtId: debt.id, data: { amount: paid, recordedBy: userName } })
      .then(() => {
        qc.invalidateQueries({ queryKey: exactKey });
        qc.invalidateQueries({ queryKey: getGetDebtQueryKey(debt.id) });
        qc.invalidateQueries({ queryKey: ["/api/crm"] });
        qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
      })
      .catch(() => {
        qc.setQueryData(exactKey, snapshot);
        qc.invalidateQueries({ queryKey: getGetDebtQueryKey(debt.id) });
        qc.invalidateQueries({ queryKey: ["/api/crm"] });
        qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
        toast.error("Payment failed — please retry");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const quickAmounts = [
    { label: "25%", value: (debt.balance * 0.25).toFixed(0) },
    { label: "Half", value: (debt.balance * 0.5).toFixed(0) },
    {
      label: applyToAll && hasOtherDebts ? "All debts" : "Full",
      value: (applyToAll && hasOtherDebts ? totalOwedAcrossDebts : debt.balance).toString(),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setAmount(""); setApplyToAll(false); } }}>
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
              "bg-destructive/15 text-destructive",
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
              <span>Balance: <span className="text-destructive font-bold font-mono">{formatKES(currentBalance)}</span></span>
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
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
          />
          {hasOtherDebts && (
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-3 py-2.5 cursor-pointer">
              <Checkbox
                checked={applyToAll}
                onCheckedChange={(v) => setApplyToAll(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs">
                <span className="font-semibold text-foreground">
                  Apply to all of {debt.customerName}'s debts
                </span>
                <span className="block mt-0.5 text-[10px] text-muted-foreground">
                  They owe {formatKES(totalOwedAcrossDebts)} across {payoffOrder.length} debts. This payment will pay off the oldest ones first instead of only this one.
                </span>
              </span>
            </label>
          )}

          {enteredAmount > 0 && allocationPreview ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs space-y-1.5">
              <span className="font-semibold text-foreground block">Where this payment goes:</span>
              {allocationPreview.allocations.map(({ debt: d, amount: portion }) => (
                <div key={d.id} className="flex items-center justify-between text-muted-foreground">
                  <span className="truncate pr-2">
                    {format(new Date(d.createdAt), "d MMM yyyy")} debt
                    {d.id === debt.id ? " (this one)" : ""}
                  </span>
                  <span className="font-mono text-foreground shrink-0">
                    {formatKES(portion)}
                    {debtBalanceDue(d) - portion <= 0.005 ? " ✓" : ""}
                  </span>
                </div>
              ))}
              {allocationPreview.remaining > 0 && (
                <div className="flex items-center justify-between text-emerald-400 pt-1 border-t border-border/60">
                  <span className="font-semibold">Left over as customer credit</span>
                  <span className="font-mono font-semibold">{formatKES(allocationPreview.remaining)}</span>
                </div>
              )}
            </div>
          ) : enteredAmount > 0 && (
            <div className={cn(
              "rounded-lg border px-3 py-2 text-xs",
              extraCredit > 0
                ? "border-emerald-500/25 bg-emerald-500/5 text-emerald-400"
                : "border-border bg-muted/30 text-muted-foreground",
            )}>
              {extraCredit > 0 ? (
                <>
                  <span className="font-semibold">Extra customer credit: {formatKES(extraCredit)}</span>
                  <span className="block mt-0.5 text-[10px] text-muted-foreground">
                    The debt will close at zero. This extra amount will be kept for the customer and applied to a future debt or sale.
                  </span>
                </>
              ) : (
                <span>Remaining after payment: <strong>{formatKES(remainingAfterPayment)}</strong></span>
              )}
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map((q) => (
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
            disabled={!amount || Number(amount) <= 0 || submitting}
            className="px-8 min-w-[140px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                Recording…
              </span>
            ) : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddCreditDialog({ customerName, currentCredit }: { customerName: string; currentCredit: number }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const entered = Number(amount) || 0;

  const handleAdd = async () => {
    if (entered <= 0 || submitting) return;
    setSubmitting(true);
    const exactKey = getListDebtsQueryKey({ shopId });
    const snapshot = qc.getQueryData(exactKey);
    const paidAt = new Date().toISOString();
    const requestId = crypto.randomUUID();
    const payload = {
      shopId,
      customerName,
      amount: entered,
      recordedBy: userName,
      note: note.trim() || null,
      requestId,
    };

    qc.cancelQueries({ queryKey: exactKey });
    const cached = qc.getQueryData(exactKey);
    const creditRows = Array.isArray(cached)
      ? (cached as any[])
          .filter((d) => sameCustomer(d.customerName, customerName) && debtCredit(d) > 0)
          .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
      : [];
    const target = creditRows[creditRows.length - 1];
    if (target) {
      patchDebtCaches(qc, shopId, target.id, (current) => applyDebtPayment(current, entered, paidAt));
      patchCustomerProfileCaches(qc, shopId, target.id, (current) => applyDebtPayment(current, entered, paidAt));
    }
    patchCustomerListCaches(qc, customerName, (customer) => ({
      ...customer,
      totalCredit: Math.max(0, Number(customer.totalCredit || 0) + entered),
    }));

    setOpen(false);
    setAmount("");
    setNote("");

    if (!navigator.onLine) {
      try {
        await enqueueMutation("customer_credit_topup", shopId, payload);
        toast.success("Top-up saved offline — will sync on reconnect");
      } catch {
        qc.setQueryData(exactKey, snapshot);
        qc.invalidateQueries({ queryKey: ["/api/crm"] });
        qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
        toast.error("Could not save offline top-up — please retry");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    toast.success(`${formatKES(entered)} added to ${toTitleCase(customerName)}'s credit`);
    customFetch("/api/debts/customer-credit", { method: "POST", body: JSON.stringify(payload) })
      .then(() => {
        qc.invalidateQueries({ queryKey: exactKey });
        qc.invalidateQueries({ queryKey: ["/api/crm"] });
        qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
      })
      .catch(() => {
        qc.setQueryData(exactKey, snapshot);
        qc.invalidateQueries({ queryKey: exactKey });
        qc.invalidateQueries({ queryKey: ["/api/crm"] });
        qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
        toast.error("Top-up failed — please retry");
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setAmount(""); setNote(""); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
          <Wallet className="w-3 h-3 mr-1" />Add credit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add credit</DialogTitle>
        </DialogHeader>
        <div className="bg-muted/40 rounded-xl p-4 border border-border">
          <p className="font-bold text-foreground">{toTitleCase(customerName)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Current credit: <span className="text-emerald-400 font-bold font-mono">{formatKES(currentCredit)}</span>
          </p>
        </div>
        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wider font-bold">Amount to add (KES)</Label>
          <Input
            type="number"
            className="h-14 text-2xl font-bold font-mono text-center"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            autoFocus
          />
          <div className="grid grid-cols-4 gap-2">
            {[100, 500, 1000, 5000].map((v) => (
              <Button key={v} variant="outline" size="sm" className="h-9 text-xs font-semibold font-mono" onClick={() => setAmount(String((Number(amount) || 0) + v))}>
                +{v}
              </Button>
            ))}
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional) e.g. M-Pesa top-up" maxLength={120} />
          {entered > 0 && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-400">
              New credit balance: <strong className="font-mono">{formatKES(currentCredit + entered)}</strong>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={entered <= 0 || submitting} className="px-8 min-w-[140px]">
            Add credit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MarkPaidButton({ debt }: { debt: any }) {
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  if (debt.status === "paid" || completed) return null;

  const handle = async () => {
    if (loading) return;
    setLoading(true);
    const exactKey = getListDebtsQueryKey({ shopId });
    const snapshot = qc.getQueryData(exactKey);
    const now = new Date().toISOString();
    setCompleted(true);
    patchDebtCaches(qc, shopId, debt.id, (current) =>
      applyDebtPayment(current, Number(debt.balance || 0), now),
    );
    patchCustomerListCaches(qc, debt.customerName, (customer) => ({
      ...customer,
      totalBalance: Math.max(
        0,
        Number(customer.totalBalance || 0) - Number(debt.balance || 0),
      ),
      activeCount: Math.max(0, Number(customer.activeCount || 0) - 1),
    }));
    patchCustomerProfileCaches(qc, shopId, debt.id, (current) =>
      applyDebtPayment(current, Number(debt.balance || 0), now),
    );
    toast.success(`${debt.customerName} marked as paid`);
    try {
      await customFetch(`/api/debts/${debt.id}/payments`, {
        method: "POST",
        body: JSON.stringify({
          amount: debt.balance,
          recordedBy: localStorage.getItem("greenlink_userName") || undefined,
          note: "Marked paid",
          useAvailableCredit: true,
        }),
      });
      qc.invalidateQueries({ queryKey: exactKey });
      qc.invalidateQueries({ queryKey: getGetDebtQueryKey(debt.id) });
      qc.invalidateQueries({ queryKey: ["/api/crm"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
    } catch {
      qc.setQueryData(exactKey, snapshot);
      qc.invalidateQueries({ queryKey: getGetDebtQueryKey(debt.id) });
      qc.invalidateQueries({ queryKey: ["/api/crm"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
      setCompleted(false);
      toast.error("Failed to mark paid — please retry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-50"
      title="Mark debt as fully paid"
    >
      <BadgeCheck className="h-3.5 w-3.5" />
      {loading ? "…" : "Mark Paid"}
    </button>
  );
}

export function ReversePaymentButton({ debtId, payment, onDone }: { debtId: string; payment: any; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const reverse = async () => {
    if (loading) return;
    const reason = window.prompt("Why is this payment being reversed?", "Payment recorded by mistake");
    if (reason === null) return;
    setLoading(true);
    try {
      await customFetch(`/api/debts/${debtId}/payments/${payment.id}/reverse`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || "Payment correction" }),
      });
      toast.success("Payment reversed — the balance has been restored");
      qc.invalidateQueries({ queryKey: ["/api/crm"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
      onDone();
    } catch (error: any) {
      toast.error(error?.message || "Could not reverse this payment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={reverse}
      disabled={loading}
      className="text-[10px] font-semibold text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
      title="Create a correction entry without deleting history"
    >
      {loading ? "Reversing…" : "Undo"}
    </button>
  );
}
