import { useState, useEffect } from "react";
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
import { UserPlus, Save } from "lucide-react";
import { toast } from "sonner";
import { toTitleCase } from "@/components/customer-autocomplete";
import { customerKey, crmKey, profileKey, type CustomerEntry } from "./customer-utils";

export function CustomerFormDialog({
  open,
  onClose,
  shopId,
  initial,
}: {
  open: boolean;
  onClose: (updated?: Partial<CustomerEntry>) => void;
  shopId: string;
  initial?: CustomerEntry | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const isRegistered = initial?.registered ?? false;
  const isUnregistered = isEdit && !isRegistered;

  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [creditLimit, setCreditLimit] = useState(
    initial?.creditLimit != null ? String(initial.creditLimit) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setPhone(initial?.phone ?? "");
      setEmail(initial?.email ?? "");
      setNotes(initial?.notes ?? "");
      setCreditLimit(initial?.creditLimit != null ? String(initial.creditLimit) : "");
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    const trimmed = {
      name: toTitleCase(name),
      phone: phone.trim(),
      email: email.trim() || null,
      notes: notes.trim() || null,
      creditLimit: creditLimit ? Number(creditLimit) : null,
    };

    let snapshot: any[] | undefined;

    if (isEdit && initial) {
      snapshot = qc.getQueryData<any[]>(crmKey(shopId));
      const oldKey = customerKey(initial.name);
      const newKey = customerKey(trimmed.name);
      qc.setQueryData(crmKey(shopId), (old: any[] = []) => {
        const target =
          newKey !== oldKey
            ? old.find((c) => customerKey(c.name) === newKey && c !== initial)
            : undefined;
        if (target) {
          const mergedEntry = {
            ...target,
            phone: trimmed.phone || target.phone,
            email: trimmed.email ?? target.email,
            notes: trimmed.notes ?? target.notes,
            creditLimit: trimmed.creditLimit ?? target.creditLimit,
            registered: target.registered || isRegistered,
            totalBalance: Number(target.totalBalance || 0) + Number(initial.totalBalance || 0),
            totalOwed: Number(target.totalOwed || 0) + Number(initial.totalOwed || 0),
            debtCount: Number(target.debtCount || 0) + Number(initial.debtCount || 0),
            activeCount: Number(target.activeCount || 0) + Number(initial.activeCount || 0),
          };
          return old
            .filter((c) => c !== target && customerKey(c.name) !== oldKey)
            .concat(mergedEntry);
        }
        return old.map((c) => (customerKey(c.name) === oldKey ? { ...c, ...trimmed } : c));
      });
    }

    onClose({ name: trimmed.name, phone: trimmed.phone });
    setSaving(true);
    try {
      if (isUnregistered) {
        await customFetch("/api/crm/rename", {
          method: "PATCH",
          body: JSON.stringify({
            shopId,
            oldName: initial!.name,
            newName: trimmed.name,
            phone: trimmed.phone,
          }),
        });
        toast.success("Customer updated across all debts");
      } else if (isRegistered && initial?.id) {
        await customFetch(`/api/crm/${initial.id}?shopId=${shopId}`, {
          method: "PATCH",
          body: JSON.stringify(trimmed),
        });
        toast.success("Customer updated");
      } else {
        const tempEntry: any = {
          ...trimmed,
          id: `tmp-${Date.now()}`,
          registered: true,
          totalBalance: 0,
          totalCredit: 0,
          totalOwed: 0,
          totalPaid: 0,
          debtCount: 0,
          activeCount: 0,
          lastActivity: null,
          latestDebtAmount: null,
          latestDebtBalance: null,
          latestDebtStatus: null,
          createdAt: new Date().toISOString(),
        };
        qc.setQueryData(crmKey(shopId), (old: any[] = []) => [tempEntry, ...old]);
        await customFetch("/api/crm", {
          method: "POST",
          body: JSON.stringify({ shopId, ...trimmed }),
        });
        toast.success(`${trimmed.name} added`);
      }
      qc.invalidateQueries({ queryKey: crmKey(shopId) });
      if (initial?.name) qc.invalidateQueries({ queryKey: profileKey(shopId, initial.name) });
    } catch {
      if (snapshot) qc.setQueryData(crmKey(shopId), snapshot);
      else qc.invalidateQueries({ queryKey: crmKey(shopId) });
      toast.error("Failed to save — please retry");
    } finally {
      setSaving(false);
    }
  };

  const title = !isEdit ? "New Customer" : isUnregistered ? "Edit Customer" : "Edit Profile";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden gap-0">
        <div className="px-6 pt-5 pb-4 border-b border-border/70 bg-muted/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base font-bold">
              <span className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                <UserPlus className="h-4 w-4 text-primary" />
              </span>
              {title}
            </DialogTitle>
            {isUnregistered && (
              <p className="text-xs text-muted-foreground mt-1.5 pl-10">
                Renaming updates all debt records linked to this customer.
              </p>
            )}
          </DialogHeader>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Full Name *
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Kamau"
              className="rounded-xl h-10"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Phone Number
            </Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712 345 678"
              type="tel"
              className="rounded-xl h-10"
            />
          </div>
          {!isUnregistered && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Email
                  </Label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    type="email"
                    className="rounded-xl h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Credit Limit (KES)
                  </Label>
                  <Input
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                    placeholder="No limit"
                    type="number"
                    min={0}
                    className="rounded-xl h-10 font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Account Notes
                </Label>
                <textarea
                  className="w-full rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Delivery preferences, payment terms, or remarks…"
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/70 bg-muted/15">
          <Button variant="ghost" onClick={() => onClose()} disabled={saving} className="rounded-xl">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="gap-2 rounded-xl px-5">
            {saving ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {!isEdit ? "Add Customer" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
