import { useState, useEffect } from "react";
import {
  getListDebtsQueryKey,
  getListSalesQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CustomerAutocomplete,
  toTitleCase,
  type SelectedCustomer,
} from "@/components/customer-autocomplete";
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
import { Trash2, Users, UserPlus, User2, Save } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { addDebtToCustomerListCaches } from "@/lib/optimistic-finance";

export function DeleteDebtDialog({ debt, onDeleted }: { debt: any; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  const handleDelete = async () => {
    setLoading(true);
    const exactKey = getListDebtsQueryKey({ shopId });
    const snapshot = qc.getQueryData(exactKey);

    qc.setQueryData(exactKey, (old: any) =>
      Array.isArray(old) ? old.filter((d: any) => d.id !== debt.id) : old,
    );
    setOpen(false);
    onDeleted();

    try {
      await customFetch(`/api/debts/${debt.id}`, { method: "DELETE" });
      toast.success(`Debt for ${debt.customerName} deleted`);
      qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
    } catch {
      qc.setQueryData(exactKey, snapshot);
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
          Use this for a <span className="font-semibold text-foreground">debt entered by mistake</span>. It permanently removes the record. Debts that have payments or come from a sale can't be deleted — reverse the payments or void the sale instead.
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

export function DebtTransferDialog({
  debt,
  items,
  onDone,
}: {
  debt: any;
  items: any[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  useEffect(() => {
    if (!open) return;
    setCustomerName("");
    setCustomerPhone("");
    setQuantities(
      Object.fromEntries(items.map((item, index) => [index, String(item.qty ?? item.quantity ?? 0)])),
    );
  }, [open, items]);

  const selectedTotal = items.reduce((sum, item, index) => {
    const qty = Number(quantities[index] ?? 0);
    return sum + (Number.isFinite(qty) ? qty * Number(item.unitPrice ?? 0) : 0);
  }, 0);
  const hasSelection = items.some((_, index) => Number(quantities[index] ?? 0) > 0);
  const overBalance = selectedTotal > Number(debt.balance ?? 0) + 0.01;

  const selectAll = () => {
    setQuantities(
      Object.fromEntries(items.map((item, index) => [index, String(item.qty ?? item.quantity ?? 0)])),
    );
  };

  const clearAll = () => setQuantities({});

  const handleSubmit = async () => {
    if (submitting || !customerName.trim() || !hasSelection || overBalance) return;
    setSubmitting(true);
    try {
      const selectedItems = items
        .map((item, itemIndex) => ({ itemIndex, qty: Number(quantities[itemIndex] ?? 0) }))
        .filter((item) => Number.isFinite(item.qty) && item.qty > 0);

      await customFetch(`/api/debts/${debt.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          items: selectedItems,
          operationId: crypto.randomUUID(),
        }),
      });
      toast.success(`Debt items recorded for ${toTitleCase(customerName)}`);
      setOpen(false);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move the debt items");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={items.length === 0 || Number(debt.balance ?? 0) <= 0}
          className="h-8 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
        >
          <Users className="h-3.5 w-3.5" />
          Move items
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Move debt items
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5">
            <p className="text-xs font-semibold">Current record: {toTitleCase(debt.customerName)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              The receiving record keeps the original taken date and item prices. Only the outstanding amount can be moved.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Receiving customer</Label>
            <CustomerAutocomplete
              shopId={shopId}
              value={customerName}
              onChange={setCustomerName}
              onSelect={(customer: SelectedCustomer) => {
                setCustomerName(customer.name);
                setCustomerPhone(customer.phone);
              }}
              placeholder="Search or enter a customer name"
            />
            <Input
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="Phone number (optional)"
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items and quantities</Label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAll} className="text-[11px] font-semibold text-primary hover:underline">
                  Select all
                </button>
                <button type="button" onClick={clearAll} className="text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-border overflow-hidden">
              {items.map((item, index) => {
                const available = Number(item.qty ?? item.quantity ?? 0);
                const quantity = Number(quantities[index] ?? 0);
                const selected = quantity > 0;
                return (
                  <div key={`${item.productName}-${index}`} className={cn("flex items-center gap-2.5 px-3 py-2.5", index > 0 && "border-t border-border/50")}>
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked) => {
                        setQuantities((current) => ({
                          ...current,
                          [index]: checked ? String(available) : "",
                        }));
                      }}
                      aria-label={`Move ${item.productName}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatKES(item.unitPrice)} each · {available} available
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      max={available}
                      step="any"
                      value={quantities[index] ?? ""}
                      onChange={(event) => {
                        const next = event.target.value;
                        setQuantities((current) => ({ ...current, [index]: next }));
                      }}
                      className="h-8 w-20 text-right text-xs"
                      aria-label={`Quantity of ${item.productName}`}
                    />
                    <span className="w-20 text-right text-xs font-mono font-semibold text-primary">
                      {formatKES(Math.max(0, quantity * Number(item.unitPrice ?? 0)))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Remaining here</p>
              <p className="mt-1 text-sm font-bold font-mono">{formatKES(Math.max(0, Number(debt.balance ?? 0) - selectedTotal))}</p>
            </div>
            <div className={cn("rounded-xl border p-3", overBalance ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5")}>
              <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">New debt</p>
              <p className={cn("mt-1 text-sm font-bold font-mono", overBalance ? "text-destructive" : "text-primary")}>{formatKES(selectedTotal)}</p>
            </div>
          </div>
          {overBalance && (
            <p className="text-[11px] font-semibold text-destructive">
              The selected items exceed the outstanding balance of {formatKES(debt.balance)}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !customerName.trim() || !hasSelection || overBalance}
          >
            {submitting ? "Saving…" : "Save new debt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddDebtDialog({ shopId, onAdded }: { shopId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const reset = () => { setCustomerName(""); setCustomerPhone(""); setAmount(""); setNotes(""); };

  const handleSave = async () => {
    const name = toTitleCase(customerName);
    if (!name) { toast.error("Customer name required"); return; }
    const total = parseFloat(amount);
    if (!total || total <= 0) { toast.error("Enter a valid amount"); return; }

    setSaving(true);
    const optimisticDebt = {
      id: `optimistic-${crypto.randomUUID()}`,
      shopId,
      saleId: null,
      customerName: name,
      customerPhone: customerPhone.trim(),
      totalAmount: total,
      amountPaid: 0,
      balance: total,
      status: "unpaid",
      notes: notes.trim() || null,
      paidAt: null,
      createdAt: new Date().toISOString(),
      items: [],
    };
    const debtListKey = getListDebtsQueryKey({ shopId });
    const debtSnapshot = qc.getQueryData(debtListKey);

    qc.setQueryData(debtListKey, (old: any) =>
      Array.isArray(old) ? [optimisticDebt, ...old] : old,
    );
    addDebtToCustomerListCaches(qc, shopId, optimisticDebt);
    setOpen(false);
    reset();
    toast.success(`Debt of ${amount} recorded for ${name}`);

    try {
      await customFetch("/api/debts", {
        method: "POST",
        body: JSON.stringify({
          shopId,
          customerName: name,
          customerPhone: customerPhone.trim(),
          totalAmount: total,
          notes: notes.trim() || undefined,
        }),
      });
      onAdded();
      qc.invalidateQueries({ queryKey: ["/api/crm"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
    } catch {
      qc.setQueryData(debtListKey, debtSnapshot);
      qc.invalidateQueries({ queryKey: ["/api/crm"] });
      qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
      toast.error("Failed to record debt — please retry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={saving}
        className="inline-flex h-9 items-center gap-1.5 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shadow-sm transition-colors"
      >
        <UserPlus className="h-3.5 w-3.5" />
        New Debt
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); reset(); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Record a Debt
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Customer name *</Label>
              <CustomerAutocomplete
                shopId={shopId}
                value={customerName}
                onChange={(v) => { setCustomerName(v); }}
                onSelect={(c: SelectedCustomer) => {
                  setCustomerName(c.name);
                  if (c.phone) setCustomerPhone(c.phone);
                }}
                showBalanceWarning
                selectedBalance={undefined}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Phone (optional)</Label>
              <div className="relative">
                <User2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="tel"
                  placeholder="+254 7XX XXX XXX"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 pl-9 pr-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Amount (KES) *</Label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 1500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 px-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Notes (optional)</Label>
              <textarea
                rows={2}
                placeholder="What is this debt for?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => { setOpen(false); reset(); }}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!customerName.trim() || !amount || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Record Debt
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
