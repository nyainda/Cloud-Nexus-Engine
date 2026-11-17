import React, { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Search,
  UserPlus,
  Phone,
  Mail,
  FileText,
  ChevronRight,
  Users,
  TrendingDown,
  Edit3,
  Trash2,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageCircle,
  Save,
  Star,
  X,
  ArrowUpDown,
  Wallet,
  ArrowUpRight,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/components/customer-autocomplete";

function customerKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function formatWhatsAppNumber(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }
  return digits;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CustomerEntry {
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

interface CustomerProfile {
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

type FilterMode = "all" | "registered" | "active" | "credit";
type SortMode = "balance" | "recent" | "name" | "paid" | "credit";

// ─── Avatar helper (Light & Dark accessible contrast) ─────────────────────────
const AVATAR_COLORS = [
  "bg-violet-500/15 text-violet-700 dark:text-violet-300 border border-violet-500/20",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/20",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/20",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/20",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/20",
  "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-500/20",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/20",
];

function avatarColor(name: string, hasBalance: boolean) {
  if (hasBalance) {
    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/25";
  }
  const idx = name ? name.charCodeAt(0) % AVATAR_COLORS.length : 0;
  return AVATAR_COLORS[idx];
}

// ─── Query keys ───────────────────────────────────────────────────────────────
const crmKey = (shopId: string) => ["/api/crm", shopId];
const profileKey = (shopId: string, name: string) => ["/api/crm/profile", shopId, name];

const PAGE_STEP = 20;
const INITIAL_VISIBLE = 15;

// ─── Add/Edit customer dialog ─────────────────────────────────────────────────
function CustomerFormDialog({
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

// ─── Delete confirm dialog ────────────────────────────────────────────────────
function DeleteDialog({
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

function DeleteIndividualDebtButton({
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

function EditDebtItemsButton({
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

// ─── Customer detail panel ────────────────────────────────────────────────────
function CustomerDetailPanel({
  customer: initialCustomer,
  shopId,
  onClose,
  onEdit,
  isOwner,
}: {
  customer: CustomerEntry;
  shopId: string;
  onClose: () => void;
  onEdit: () => void;
  isOwner: boolean;
}) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [tab, setTab] = useState<"overview" | "debts">("overview");
  const qc = useQueryClient();
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    setCustomer(initialCustomer);
    setTab("overview");
  }, [initialCustomer.id, initialCustomer.name]);

  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: profileKey(shopId, customer.name),
    queryFn: () =>
      customFetch<CustomerProfile>(
        `/api/crm/profile?shopId=${encodeURIComponent(shopId)}&name=${encodeURIComponent(customer.name)}`
      ),
    enabled: !!shopId && !!customer.name,
  });

  const stats = profile?.stats;
  const debts = profile?.debts ?? [];
  const reg = profile?.customer;

  const displayedBalance = stats?.totalBalance ?? customer.totalBalance;
  const displayedCredit = stats?.totalCredit ?? customer.totalCredit ?? 0;
  const effectivePhone = reg?.phone || customer.phone || "";
  const effectiveCreditLimit = reg?.creditLimit ?? customer.creditLimit;

  const limitUtilizationPct =
    effectiveCreditLimit && effectiveCreditLimit > 0
      ? Math.min(100, Math.round((displayedBalance / effectiveCreditLimit) * 100))
      : null;
  const isOverLimit =
    effectiveCreditLimit != null && effectiveCreditLimit > 0 && displayedBalance > effectiveCreditLimit;

  const handleRegister = async () => {
    setRegistering(true);
    try {
      await customFetch("/api/crm", {
        method: "POST",
        body: JSON.stringify({
          shopId,
          name: customer.name,
          phone: customer.phone,
          email: null,
          notes: null,
          creditLimit: null,
        }),
      });
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: crmKey(shopId) });
      qc.invalidateQueries({ queryKey: profileKey(shopId, customer.name) });
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setRegistering(false);
    }
  };

  const waMsg = effectivePhone
    ? displayedBalance > 0
      ? `Hi ${customer.name}, you have an outstanding balance of ${formatKES(displayedBalance)} at our shop.${displayedCredit > 0 ? ` You also have ${formatKES(displayedCredit)} customer credit available.` : ""} Please settle at your earliest convenience. Thank you!`
      : displayedCredit > 0
      ? `Hi ${customer.name}, you have ${formatKES(displayedCredit)} customer credit available at our shop. Thank you!`
      : `Hi ${customer.name}, your account has no outstanding balance at our shop. Thank you!`
    : "";
  const waNumber = formatWhatsAppNumber(effectivePhone);
  const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}` : "#";

  const TABS = [
    { id: "overview" as const, label: "Overview" },
    { id: "debts" as const, label: `Debts (${isLoading ? "…" : debts.length})` },
  ];

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Panel Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-border/80 bg-muted/20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold shrink-0",
              avatarColor(customer.name, displayedBalance > 0)
            )}
          >
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-bold text-sm sm:text-base text-foreground truncate">{customer.name}</h2>
              {customer.registered || profile?.registered ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/12 text-primary border border-primary/20 shrink-0">
                  <Star className="h-2.5 w-2.5 fill-primary" />
                  Registered
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/70 shrink-0">
                  Debt-Only
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {effectivePhone || reg?.email || customer.email || "No contact info on file"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isOwner && (
            <button
              onClick={onEdit}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Edit customer"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
          {isOwner && customer.registered && customer.id && (
            <DeleteDialog customer={customer} shopId={shopId} onDeleted={onClose} />
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Segmented Tabs */}
      <div className="px-4 pt-3 pb-2 border-b border-border/60 shrink-0">
        <div className="grid grid-cols-2 p-1 rounded-xl bg-muted/60 border border-border/60 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "py-1.5 rounded-lg text-xs font-semibold transition-all",
                tab === t.id
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && (
          <div className="p-4 space-y-4">
            {/* 4-Card KPI Breakdown */}
            {isLoading ? (
              <div className="grid grid-cols-2 gap-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-2.5">
                <div
                  className={cn(
                    "rounded-2xl border p-3.5",
                    stats.totalBalance > 0
                      ? "bg-rose-500/8 border-rose-500/20"
                      : "bg-muted/30 border-border/60"
                  )}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Outstanding
                  </p>
                  <p
                    className={cn(
                      "text-base font-bold font-mono tabular-nums mt-1 truncate",
                      stats.totalBalance > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                    )}
                  >
                    {formatKES(stats.totalBalance)}
                  </p>
                </div>

                <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/20 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total Paid
                  </p>
                  <p className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1 truncate">
                    {formatKES(stats.totalPaid)}
                  </p>
                </div>

                <div className="rounded-2xl bg-sky-500/8 border border-sky-500/20 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Store Credit
                  </p>
                  <p className="text-base font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1 truncate">
                    {formatKES(stats.totalCredit)}
                  </p>
                </div>

                <div className="rounded-2xl bg-muted/35 border border-border/60 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Debt Records
                  </p>
                  <p className="text-base font-bold font-mono tabular-nums text-foreground mt-1">
                    {stats.debtCount}{" "}
                    <span className="text-[11px] font-sans font-medium text-muted-foreground">
                      ({stats.activeCount} open)
                    </span>
                  </p>
                </div>
              </div>
            ) : null}

            {/* Credit Limit Meter */}
            {effectiveCreditLimit != null && effectiveCreditLimit > 0 && limitUtilizationPct != null && (
              <div
                className={cn(
                  "rounded-2xl border p-3.5 space-y-2",
                  isOverLimit
                    ? "border-rose-500/30 bg-rose-500/8"
                    : "border-border/70 bg-muted/20"
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {isOverLimit && <ShieldAlert className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />}
                    Credit Limit Usage
                  </span>
                  <span className="font-mono font-bold tabular-nums text-muted-foreground">
                    {formatKES(displayedBalance)} / {formatKES(effectiveCreditLimit)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isOverLimit
                        ? "bg-rose-500"
                        : limitUtilizationPct >= 75
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    )}
                    style={{ width: `${limitUtilizationPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {isOverLimit
                    ? "Balance exceeds configured credit limit"
                    : `${limitUtilizationPct}% of credit allowance used`}
                </p>
              </div>
            )}

            {/* Contact & Profile Details */}
            {(() => {
              const rows = [
                effectivePhone
                  ? {
                      Icon: Phone,
                      label: "Phone",
                      value: effectivePhone,
                      href: `tel:${effectivePhone}`,
                    }
                  : null,
                reg?.email || customer.email
                  ? {
                      Icon: Mail,
                      label: "Email",
                      value: reg?.email || customer.email || "",
                      href: `mailto:${reg?.email || customer.email}`,
                    }
                  : null,
                effectiveCreditLimit != null
                  ? {
                      Icon: CreditCard,
                      label: "Credit Limit",
                      value: formatKES(effectiveCreditLimit),
                      href: undefined,
                    }
                  : null,
                reg?.notes || customer.notes
                  ? {
                      Icon: FileText,
                      label: "Notes",
                      value: reg?.notes || customer.notes || "",
                      href: undefined,
                    }
                  : null,
              ].filter(Boolean) as Array<{
                Icon: React.ComponentType<{ className?: string }>;
                label: string;
                value: string;
                href?: string;
              }>;

              if (rows.length === 0) {
                return (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">No contact details saved yet</p>
                    {isOwner && (
                      <Button variant="outline" size="sm" onClick={onEdit} className="rounded-xl h-7 text-xs">
                        Add contact details
                      </Button>
                    )}
                  </div>
                );
              }

              return (
                <div className="rounded-2xl border border-border/80 bg-background/40 overflow-hidden divide-y divide-border/60">
                  {rows.map((row) => (
                    <div key={row.label} className="flex items-start gap-3 px-3.5 py-2.5">
                      <row.Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {row.label}
                        </p>
                        {row.href ? (
                          <a
                            href={row.href}
                            className="text-xs font-medium text-primary hover:underline mt-0.5 block break-words"
                          >
                            {row.value}
                          </a>
                        ) : (
                          <p className="text-xs text-foreground mt-0.5 break-words">{row.value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {!customer.registered && !profile?.registered && (
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Star className="h-3.5 w-3.5" />
                  {registering ? "Saving…" : "Save Profile"}
                </button>
              )}

              {effectivePhone && displayedBalance > 0 && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-emerald-500/35 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp Reminder
                  </button>
                </a>
              )}

              <Link
                href="/debts"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
              >
                <Wallet className="w-3.5 h-3.5 text-primary" />
                Debt Ledger
                <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
              </Link>
            </div>

            {/* Activity timestamps */}
            {(customer.lastActivity || customer.createdAt) && (
              <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {customer.lastActivity && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Last activity {format(new Date(customer.lastActivity), "d MMM yyyy")}
                  </span>
                )}
                {customer.createdAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Added {format(new Date(customer.createdAt), "d MMM yyyy")}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "debts" && (
          <div className="p-4 space-y-2.5">
            {isLoading ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : debts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 text-emerald-500/30" />
                <p className="text-sm font-semibold text-foreground">No debt records</p>
                <p className="text-xs text-muted-foreground">This customer has no credit invoices on file.</p>
              </div>
            ) : (
              debts.map((debt: any) => {
                const isPaid = debt.status === "paid";
                const isCancelled = debt.status === "cancelled";
                const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
                const isOverdue = !isPaid && !isCancelled && daysAgo > 30;
                const paidPct =
                  debt.totalAmount > 0
                    ? Math.round(((debt.totalAmount - debt.balance) / debt.totalAmount) * 100)
                    : 0;

                return (
                  <div
                    key={debt.id}
                    className={cn(
                      "rounded-2xl border bg-background/50 p-3.5 transition-colors",
                      isOverdue
                        ? "border-rose-500/30"
                        : isPaid
                        ? "border-emerald-500/25"
                        : isCancelled
                        ? "border-border/50 opacity-75"
                        : "border-border/80"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full leading-none",
                              isCancelled
                                ? "bg-muted text-muted-foreground"
                                : isPaid
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : isOverdue
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                                : debt.status === "partial"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                            )}
                          >
                            {isCancelled ? "Voided" : isOverdue ? `${daysAgo}d overdue` : debt.status}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(debt.createdAt), "d MMM yyyy")}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "text-xs font-semibold",
                            isCancelled
                              ? "text-muted-foreground"
                              : isPaid
                              ? "text-emerald-700 dark:text-emerald-400"
                              : isOverdue
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-foreground"
                          )}
                        >
                          {isCancelled
                            ? "Sale voided"
                            : isPaid
                            ? `Settled ${formatKES(debt.totalAmount)}`
                            : `${formatKES(debt.balance)} remaining`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold font-mono tabular-nums">{formatKES(debt.totalAmount)}</p>
                        <p className="text-[10px] text-muted-foreground">total</p>
                      </div>
                    </div>

                    {!isPaid && !isCancelled && debt.totalAmount > 0 && (
                      <div className="mt-2.5">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              isOverdue
                                ? "bg-rose-500"
                                : debt.status === "partial"
                                ? "bg-amber-500"
                                : "bg-primary"
                            )}
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{paidPct}% paid</p>
                      </div>
                    )}

                    <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-3">
                      <EditDebtItemsButton
                        debt={debt}
                        shopId={shopId}
                        isOwner={isOwner}
                        onSaved={() => {
                          qc.invalidateQueries({ queryKey: profileKey(shopId, customer.name) });
                          qc.invalidateQueries({ queryKey: crmKey(shopId) });
                        }}
                      />
                      <DeleteIndividualDebtButton
                        debt={debt}
                        shopId={shopId}
                        customerName={customer.name}
                        onDeleted={() => {
                          qc.invalidateQueries({ queryKey: profileKey(shopId, customer.name) });
                          qc.invalidateQueries({ queryKey: crmKey(shopId) });
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main customers page ──────────────────────────────────────────────────────
export default function Customers() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const shopName = localStorage.getItem("greenlink_shopName") || "Active Shop";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sortBy, setSortBy] = useState<SortMode>("balance");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerEntry | null>(null);

  const qc = useQueryClient();

  const { data: allCustomers = [], isLoading } = useQuery<CustomerEntry[]>({
    queryKey: crmKey(shopId),
    queryFn: () => customFetch<CustomerEntry[]>(`/api/crm?shopId=${encodeURIComponent(shopId)}`),
    enabled: !!shopId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [search, filter, sortBy]);

  const stats = useMemo(() => {
    const total = allCustomers.length;
    const registered = allCustomers.filter((c) => c.registered).length;
    const withBalance = allCustomers.filter((c) => c.totalBalance > 0).length;
    const withCredit = allCustomers.filter((c) => (c.totalCredit ?? 0) > 0).length;
    const outstanding = allCustomers.reduce((s, c) => s + Number(c.totalBalance || 0), 0);
    const totalCredit = allCustomers.reduce((s, c) => s + Number(c.totalCredit || 0), 0);
    return { total, registered, withBalance, withCredit, outstanding, totalCredit };
  }, [allCustomers]);

  const FILTERS: Array<{ value: FilterMode; label: string; count: number }> = [
    { value: "all", label: "All", count: stats.total },
    { value: "registered", label: "Registered", count: stats.registered },
    { value: "active", label: "Has Debt", count: allCustomers.filter((c) => c.activeCount > 0 || c.totalBalance > 0).length },
    { value: "credit", label: "Has Credit", count: stats.withCredit },
  ];

  const sortedFiltered = useMemo(() => {
    let list = allCustomers;
    if (filter === "registered") list = list.filter((c) => c.registered);
    else if (filter === "active") list = list.filter((c) => c.activeCount > 0 || c.totalBalance > 0);
    else if (filter === "credit") list = list.filter((c) => (c.totalCredit ?? 0) > 0);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "balance") {
        const diff = (b.totalBalance || 0) - (a.totalBalance || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortBy === "credit") {
        const diff = (b.totalCredit || 0) - (a.totalCredit || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortBy === "paid") {
        const diff = (b.totalPaid || 0) - (a.totalPaid || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortBy === "recent") {
        const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : new Date(a.createdAt).getTime();
        const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : new Date(b.createdAt).getTime();
        return tb - ta;
      }
      return a.name.localeCompare(b.name);
    });
  }, [allCustomers, filter, search, sortBy]);

  const visibleCustomers = useMemo(
    () => sortedFiltered.slice(0, visibleCount),
    [sortedFiltered, visibleCount]
  );

  const handleSelect = (c: CustomerEntry) => setSelectedCustomer(c);
  const handleClose = () => setSelectedCustomer(null);

  const isSelected = (c: CustomerEntry) =>
    selectedCustomer
      ? c.id && selectedCustomer.id
        ? c.id === selectedCustomer.id
        : c.name === selectedCustomer.name
      : false;

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] md:h-screen bg-background overflow-hidden">
      {/* ── Sticky Executive Header ───────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border/80 shrink-0">
        <div className="px-4 sm:px-5 pt-3.5 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                <Users className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold font-display tracking-tight truncate">
                  Customers &amp; CRM
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  {shopName} · {stats.total} directory account{stats.total === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/debts"
                className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
              >
                <Wallet className="h-3.5 w-3.5 text-primary" />
                Debt Ledger
              </Link>
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>New Customer</span>
              </button>
            </div>
          </div>

          {/* Search + Sort Controls */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search customer by name, phone or email…"
                className="pl-9 pr-8 h-9 text-sm bg-muted/40 border-border/60 rounded-xl"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortMode)}
                aria-label="Sort customers"
                className="h-9 rounded-xl border border-border/70 bg-muted/40 px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 w-full sm:w-auto"
              >
                <option value="balance">Sort: Highest Debt</option>
                <option value="recent">Sort: Recent Activity</option>
                <option value="name">Sort: Name (A–Z)</option>
                <option value="paid">Sort: Most Paid</option>
                <option value="credit">Sort: Store Credit</option>
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap border",
                  filter === f.value
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/50 text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted"
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "text-[10px] font-bold tabular-nums px-1.5 py-0.2 rounded-full",
                    filter === f.value
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background/70 text-muted-foreground"
                  )}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body: Split Pane ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Directory List Pane */}
        <div
          className={cn(
            "flex flex-col overflow-hidden transition-[width] duration-150",
            selectedCustomer ? "hidden md:flex md:flex-1" : "flex-1"
          )}
        >
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 pt-4 pb-20 md:pb-8 space-y-4">
            {/* Interactive 4-Card KPI Strip (switches to 2x2 when right panel is open to prevent text clipping) */}
            <div
              className={cn(
                "grid grid-cols-2 gap-2.5 sm:gap-3",
                !selectedCustomer && "lg:grid-cols-4"
              )}
            >
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 transition-colors",
                  filter === "all"
                    ? "bg-card border-primary/50 ring-1 ring-primary/25"
                    : "bg-card/80 border-border/80 hover:border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    All Accounts
                  </span>
                  <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                </div>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 text-foreground">
                  {stats.total}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {stats.registered} registered
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "registered" ? "all" : "registered")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 transition-colors",
                  filter === "registered"
                    ? "bg-card border-primary/50 ring-1 ring-primary/25"
                    : "bg-card/80 border-border/80 hover:border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Saved Profiles
                  </span>
                  <Star className="h-3.5 w-3.5 text-primary fill-primary/20 shrink-0" />
                </div>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 text-foreground">
                  {stats.registered}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Contacts &amp; limits
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "active" ? "all" : "active")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 transition-colors",
                  filter === "active"
                    ? "bg-rose-500/10 border-rose-500/50 ring-1 ring-rose-500/25"
                    : stats.outstanding > 0
                    ? "bg-rose-500/6 border-rose-500/25 hover:border-rose-500/45"
                    : "bg-card/80 border-border/80 hover:border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total Debt Due
                  </span>
                  <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                </div>
                <p
                  className={cn(
                    "text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 leading-snug break-words",
                    stats.outstanding > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                  )}
                >
                  {formatKES(stats.outstanding)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {stats.withBalance} customer{stats.withBalance === 1 ? "" : "s"} owe
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "credit" ? "all" : "credit")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 transition-colors",
                  filter === "credit"
                    ? "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/25"
                    : "bg-card/80 border-border/80 hover:border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Store Credit
                  </span>
                  <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                </div>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 text-emerald-700 dark:text-emerald-400 leading-snug break-words">
                  {formatKES(stats.totalCredit)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {stats.withCredit} with credit
                </p>
              </button>
            </div>

            {/* Table Card */}
            <div className="rounded-2xl border border-border/80 bg-card overflow-hidden">
              {/* Column Header */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_20px] sm:grid-cols-[minmax(0,1fr)_130px_92px_20px] gap-x-3 px-4 py-2.5 border-b border-border/70 bg-muted/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Customer Account
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">
                  Balance &amp; Credit
                </span>
                <span className="hidden sm:block text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
                  Status
                </span>
                <span />
              </div>

              {/* Rows */}
              {isLoading ? (
                <div className="divide-y divide-border/40">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                      <div className="w-9 h-9 rounded-xl bg-muted/60 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-36 bg-muted/60 rounded-full" />
                        <div className="h-2.5 w-24 bg-muted/40 rounded-full" />
                      </div>
                      <div className="h-4 w-20 bg-muted/40 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : sortedFiltered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 gap-3 text-center">
                  <Users className="h-11 w-11 text-muted-foreground/25" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {search ? `No customers match "${search}"` : "No customers match this filter"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search || filter !== "all"
                        ? "Try clearing your search or switching filters."
                        : "Add your first registered customer profile to track contacts and credit limits."}
                    </p>
                  </div>
                  {search || filter !== "all" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                      className="rounded-xl"
                    >
                      Reset filters
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setAddOpen(true)} className="rounded-xl gap-1.5">
                      <UserPlus className="h-3.5 w-3.5" />
                      Add first customer
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border/45">
                  {visibleCustomers.map((customer) => (
                    <div
                      key={customer.id ?? `u-${customer.name}`}
                      onClick={() => handleSelect(customer)}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto_20px] sm:grid-cols-[minmax(0,1fr)_130px_92px_20px] gap-x-3 items-center px-4 py-3 cursor-pointer transition-colors",
                        isSelected(customer)
                          ? "bg-primary/10 ring-1 ring-inset ring-primary/35"
                          : "hover:bg-muted/35"
                      )}
                    >
                      {/* Customer Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0",
                            avatarColor(customer.name, customer.totalBalance > 0)
                          )}
                        >
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-semibold text-foreground truncate">
                              {customer.name}
                            </span>
                            {customer.registered && (
                              <Star
                                className="h-3 w-3 text-primary fill-primary shrink-0"
                                aria-label="Registered profile"
                              />
                            )}
                            {customer.creditLimit != null && (
                              <span className="hidden lg:inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 tabular-nums">
                                Limit {formatKES(customer.creditLimit)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {customer.phone || customer.email || (
                              <span className="italic opacity-75">No phone or email</span>
                            )}
                          </p>
                          {customer.latestDebtAmount != null && customer.lastActivity && (
                            <p className="text-[10px] text-sky-600 dark:text-sky-400 truncate mt-0.5">
                              Latest: {formatKES(customer.latestDebtAmount)} ·{" "}
                              {format(new Date(customer.lastActivity), "d MMM yyyy")}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Balance / Credit */}
                      <div className="text-right min-w-0">
                        <p
                          className={cn(
                            "text-sm font-bold font-mono tabular-nums",
                            customer.totalBalance > 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {customer.totalBalance > 0 ? formatKES(customer.totalBalance) : "Ksh 0"}
                        </p>
                        {customer.totalCredit > 0 && (
                          <p className="text-[10px] font-medium font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            Credit: {formatKES(customer.totalCredit)}
                          </p>
                        )}
                        {(customer.totalPaid ?? 0) > 0 && (
                          <p className="text-[10px] font-mono tabular-nums text-muted-foreground">
                            Paid: {formatKES(customer.totalPaid)}
                          </p>
                        )}
                      </div>

                      {/* Status Pill */}
                      <div className="hidden sm:flex justify-center">
                        {customer.totalBalance > 0 || customer.activeCount > 0 ? (
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-2.5 py-1 rounded-full whitespace-nowrap tabular-nums",
                              customer.totalBalance > 0
                                ? "bg-rose-500/12 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                            )}
                          >
                            {customer.activeCount} active
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                            Clear
                          </span>
                        )}
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination Footer */}
              {!isLoading && sortedFiltered.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-border/60 bg-muted/20 text-xs">
                  <span className="text-muted-foreground tabular-nums">
                    Showing <span className="font-semibold text-foreground">1–{visibleCustomers.length}</span> of{" "}
                    <span className="font-semibold text-foreground">{sortedFiltered.length}</span> customer
                    {sortedFiltered.length === 1 ? "" : "s"}
                  </span>
                  {sortedFiltered.length > visibleCount && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount((n) => n + PAGE_STEP)}
                        className="h-7 rounded-lg text-xs font-semibold"
                      >
                        Show {Math.min(PAGE_STEP, sortedFiltered.length - visibleCount)} more
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVisibleCount(sortedFiltered.length)}
                        className="h-7 rounded-lg text-xs font-semibold text-primary"
                      >
                        Show all ({sortedFiltered.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Desktop Right Split Panel ── */}
        {selectedCustomer && (
          <div className="hidden md:flex flex-col w-[410px] lg:w-[430px] border-l border-border/80 overflow-hidden shrink-0">
            <CustomerDetailPanel
              customer={selectedCustomer}
              shopId={shopId}
              onClose={handleClose}
              onEdit={() => setEditTarget(selectedCustomer)}
              isOwner={isOwner}
            />
          </div>
        )}
      </div>

      {/* ── Mobile Bottom Sheet ────────────────────────────────────────────── */}
      {selectedCustomer && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={handleClose}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl flex flex-col overflow-hidden border-t border-border shadow-2xl"
            style={{ maxHeight: "90vh" }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
            </div>
            <CustomerDetailPanel
              customer={selectedCustomer}
              shopId={shopId}
              onClose={handleClose}
              onEdit={() => setEditTarget(selectedCustomer)}
              isOwner={isOwner}
            />
          </div>
        </div>
      )}

      {/* ── Form Dialogs ───────────────────────────────────────────────────── */}
      <CustomerFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        shopId={shopId}
      />
      <CustomerFormDialog
        open={!!editTarget}
        onClose={(updated) => {
          setEditTarget(null);
          if (updated) {
            setSelectedCustomer((prev) => (prev ? { ...prev, ...updated } : null));
            qc.invalidateQueries({ queryKey: crmKey(shopId) });
          }
        }}
        shopId={shopId}
        initial={editTarget}
      />
    </div>
  );
}
