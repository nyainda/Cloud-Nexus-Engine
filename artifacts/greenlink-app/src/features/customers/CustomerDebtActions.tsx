import { useState } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatKES } from "@/lib/format";
import { Edit3, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { crmKey, type CustomerEntry } from "./customer-utils";

export function DeleteDialog({
  customer,
  shopId,
  onDeleted,
}: {
  customer: CustomerEntry;
  shopId: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleDelete = async () => {
    if (!customer.id) return;
    const snapshot = qc.getQueryData<any[]>(crmKey(shopId));
    qc.setQueryData(crmKey(shopId), (old: any[] = []) => old.filter((c) => c.id !== customer.id));
    toast.success(`${customer.name} removed`);
    setOpen(false);
    onDeleted();
    setLoading(true);
    try {
      await customFetch(`/api/crm/${customer.id}?shopId=${shopId}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: crmKey(shopId) });
    } catch {
      qc.setQueryData(crmKey(shopId), snapshot);
      toast.error("Failed to delete — restored");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-8 h-8 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors"
        title="Remove registered profile"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Trash2 className="h-4 w-4" />
              Remove Customer Profile
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Remove <span className="font-semibold text-foreground">{customer.name}</span>&apos;s saved profile?
            Their existing debt records will remain untouched — only the CRM profile is removed.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading} className="rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading} className="rounded-xl">
              {loading ? "Removing…" : "Remove Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteIndividualDebtButton({
  debt,
  customerName,
  onDeleted,
}: {
  debt: any;
  shopId: string;
  customerName: string;
  onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const canDelete = !debt.saleId && Number(debt.amountPaid || 0) === 0 && debt.status !== "cancelled";

  if (!canDelete) return null;

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete this individual debt record for ${customerName}? This is only available because no payment has been recorded.`
      )
    )
      return;
    setLoading(true);
    try {
      await customFetch(`/api/debts/${debt.id}`, { method: "DELETE" });
      toast.success("Debt record deleted");
      onDeleted();
    } catch (error: any) {
      toast.error(error?.message || "Could not delete this debt record");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
      title="Delete this unpaid manual debt record"
    >
      <Trash2 className="h-3 w-3" />
      {loading ? "Deleting…" : "Delete record"}
    </button>
  );
}

export function EditDebtItemsButton({
  debt,
  isOwner,
  onSaved,
}: {
  debt: any;
  shopId: string;
  isOwner: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<Array<{ productName: string; qty: number; unitPrice: string }>>([]);

  if (!isOwner || !debt.saleId) return null;

  const loadItems = async () => {
    setLoading(true);
    try {
      const detail = await customFetch<any>(`/api/debts/${debt.id}`);
      const loaded = (detail?.items ?? []).map((item: any) => ({
        productName: String(item.productName ?? ""),
        qty: Number(item.qty ?? item.quantity ?? 0),
        unitPrice: String(item.unitPrice ?? 0),
      }));
      setItems(loaded);
    } catch {
      toast.error("Could not load debt items");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) void loadItems();
  };

  const handleSave = async () => {
    if (saving || items.length === 0) return;
    const payload = items.map((item) => ({
      productName: item.productName,
      qty: item.qty,
      unitPrice: Number(item.unitPrice),
    }));
    if (
      payload.some(
        (item) =>
          !item.productName.trim() ||
          !Number.isFinite(item.qty) ||
          item.qty <= 0 ||
          !Number.isFinite(item.unitPrice) ||
          item.unitPrice < 0
      )
    ) {
      toast.error("Enter a valid non-negative price for every item");
      return;
    }
    setSaving(true);
    try {
      await customFetch(`/api/debts/${debt.id}`, {
        method: "PATCH",
        body: JSON.stringify({ items: payload }),
      });
      toast.success("Debt prices updated");
      setOpen(false);
      onSaved();
    } catch (error: any) {
      toast.error(error?.message || "Could not update debt prices");
    } finally {
      setSaving(false);
    }
  };

  const previewTotal = items.reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
    0
  );

  return (
    <>
      <button
        onClick={() => handleOpenChange(true)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
        title="Edit prices for this debt"
      >
        <Edit3 className="h-3 w-3" />
        Edit prices
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit3 className="h-4 w-4 text-primary" />
              Edit Debt Item Prices
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Adjusts this customer&apos;s debt record only. The original POS sale and catalog prices stay unchanged.
          </p>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading items…</div>
          ) : (
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={`${item.productName}-${index}`} className="grid grid-cols-[1fr_104px] gap-3 items-end">
                  <div className="min-w-0">
                    <Label className="text-xs truncate block">{item.productName}</Label>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {item.qty} unit{item.qty === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div>
                    <Label htmlFor={`debt-price-${debt.id}-${index}`} className="text-[11px] text-muted-foreground">
                      Unit price
                    </Label>
                    <Input
                      id={`debt-price-${debt.id}-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(event) =>
                        setItems((current) =>
                          current.map((entry, i) =>
                            i === index ? { ...entry, unitPrice: event.target.value } : entry
                          )
                        )
                      }
                      className="mt-1 h-9 rounded-xl font-mono"
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <span className="font-semibold">New debt total</span>
                <span className="font-bold font-mono tabular-nums">{formatKES(previewTotal)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving} className="rounded-xl">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={loading || saving || items.length === 0} className="rounded-xl">
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving…" : "Save prices"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
