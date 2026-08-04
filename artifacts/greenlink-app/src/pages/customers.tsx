import React, { useState, useMemo } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatKES } from "@/lib/format";
import {
  Search, UserPlus, Phone, Mail, FileText, Wallet, ChevronRight,
  BadgeCheck, AlertTriangle, Users, TrendingDown, Edit3, Trash2,
  ArrowLeft, CheckCircle2, Clock, CreditCard, MessageCircle, X,
  Save, Star,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────
interface CustomerEntry {
  id: string | null;
  name: string;
  phone: string;
  email: string | null;
  notes: string | null;
  creditLimit: number | null;
  registered: boolean;
  totalBalance: number;
  totalOwed: number;
  debtCount: number;
  activeCount: number;
  lastActivity: string | null;
  createdAt: string;
}

interface CustomerProfile {
  registered: boolean;
  customer: { id: string; name: string; phone: string; email: string | null; notes: string | null; creditLimit: number | null; createdAt: string } | null;
  debts: any[];
  stats: { totalBalance: number; totalOwed: number; totalPaid: number; debtCount: number; activeCount: number };
}

// ─── Query keys ──────────────────────────────────────────────────────────────
const crmKey = (shopId: string, q?: string) => ["/api/crm", shopId, q ?? ""];
const profileKey = (shopId: string, name: string) => ["/api/crm/profile", shopId, name];

// ─── Add/Edit customer dialog ─────────────────────────────────────────────────
function CustomerFormDialog({
  open,
  onClose,
  shopId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  shopId: string;
  initial?: CustomerEntry | null;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [creditLimit, setCreditLimit] = useState(
    initial?.creditLimit != null ? String(initial.creditLimit) : ""
  );
  const [saving, setSaving] = useState(false);

  // Reset fields when dialog opens
  React.useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setPhone(initial?.phone ?? "");
      setEmail(initial?.email ?? "");
      setNotes(initial?.notes ?? "");
      setCreditLimit(initial?.creditLimit != null ? String(initial.creditLimit) : "");
    }
  }, [open, initial]);

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Customer name is required"); return; }
    setSaving(true);
    try {
      if (isEdit && initial?.id) {
        await customFetch(`/api/crm/${initial.id}?shopId=${shopId}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            notes: notes.trim() || null,
            creditLimit: creditLimit ? Number(creditLimit) : null,
          }),
        });
        toast.success("Customer updated");
      } else {
        await customFetch("/api/crm", {
          method: "POST",
          body: JSON.stringify({
            shopId,
            name: name.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            notes: notes.trim() || null,
            creditLimit: creditLimit ? Number(creditLimit) : null,
          }),
        });
        toast.success(`${name.trim()} added`);
      }
      qc.invalidateQueries({ queryKey: ["/api/crm", shopId] });
      onClose();
    } catch {
      toast.error("Failed to save — please retry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            {isEdit ? "Edit Customer" : "New Customer"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider">Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Kamau" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider">Phone</Label>
            <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+254 712 345 678" type="tel" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider">Email</Label>
            <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider">Credit Limit (KES)</Label>
            <Input value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="e.g. 5000" type="number" min={0} />
            <p className="text-[10px] text-muted-foreground">Max credit allowed — leave blank for no limit</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold uppercase tracking-wider">Notes</Label>
            <textarea
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any notes about this customer…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="gap-2">
            {saving ? (
              <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {isEdit ? "Save Changes" : "Add Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────
function DeleteDialog({ customer, shopId, onDeleted }: { customer: CustomerEntry; shopId: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const handleDelete = async () => {
    if (!customer.id) return;
    setLoading(true);
    try {
      await customFetch(`/api/crm/${customer.id}?shopId=${shopId}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["/api/crm", shopId] });
      toast.success(`${customer.name} removed`);
      setOpen(false);
      onDeleted();
    } catch {
      toast.error("Failed to delete");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-xs font-semibold transition-colors"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />Remove Customer
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <span className="font-semibold text-foreground">{customer.name}</span>'s profile? Their debt records will not be deleted.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Customer profile view ───────────────────────────────────────────────────
function CustomerProfileView({
  customer,
  shopId,
  onBack,
  onEdit,
}: {
  customer: CustomerEntry;
  shopId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: profileKey(shopId, customer.name),
    queryFn: () =>
      customFetch<CustomerProfile>(
        `/api/crm/profile?shopId=${encodeURIComponent(shopId)}&name=${encodeURIComponent(customer.name)}`
      ),
    enabled: !!shopId && !!customer.name,
  });

  const qc = useQueryClient();
  const [registering, setRegistering] = useState(false);

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
      toast.success("Customer profile saved");
      qc.invalidateQueries({ queryKey: ["/api/crm", shopId] });
      qc.invalidateQueries({ queryKey: profileKey(shopId, customer.name) });
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setRegistering(false);
    }
  };

  const stats = profile?.stats;
  const debts = profile?.debts ?? [];
  const reg = profile?.customer;

  const waMsg = customer.phone
    ? `Hi ${customer.name}, you have an outstanding balance of ${formatKES(customer.totalBalance)} at our shop. Please settle at your earliest convenience. Thank you!`
    : "";
  const waUrl = customer.phone
    ? `https://wa.me/${customer.phone.replace(/\D/g, "")}?text=${encodeURIComponent(waMsg)}`
    : "#";

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-card/98 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={onBack}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base text-foreground truncate">{customer.name}</h1>
            <p className="text-xs text-muted-foreground">
              {customer.registered ? "Registered customer" : "Discovered from debts"}
            </p>
          </div>
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-muted/60 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Profile card */}
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0",
              customer.totalBalance > 0 ? "bg-destructive/15 text-destructive" : "bg-emerald-500/15 text-emerald-400"
            )}>
              {customer.name.charAt(0).toUpperCase()}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg text-foreground">{customer.name}</h2>
                {customer.registered && (
                  <Star className="h-3.5 w-3.5 text-primary fill-primary" />
                )}
              </div>

              <div className="space-y-1 mt-1.5">
                {(reg?.phone || customer.phone) && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {reg?.phone || customer.phone}
                  </p>
                )}
                {reg?.email && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    {reg.email}
                  </p>
                )}
                {reg?.creditLimit != null && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <CreditCard className="h-3.5 w-3.5 shrink-0" />
                    Credit limit: <span className="font-mono font-semibold text-foreground">{formatKES(reg.creditLimit)}</span>
                  </p>
                )}
              </div>

              {reg?.notes && (
                <div className="mt-2 bg-muted/40 rounded-xl px-3 py-2">
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    {reg.notes}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {!customer.registered ? (
              <button
                onClick={handleRegister}
                disabled={registering}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Star className="h-3.5 w-3.5" />
                {registering ? "Saving…" : "Save Profile"}
              </button>
            ) : null}
            {(reg?.phone || customer.phone) && customer.totalBalance > 0 && (
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <button className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-[#25D366]/30 text-[#25D366] bg-[#25D366]/5 hover:bg-[#25D366]/15 text-xs font-semibold transition-colors">
                  <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                </button>
              </a>
            )}
          </div>
        </div>

        {/* Stats row */}
        {!isLoading && stats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-center">
              <p className="text-base font-bold font-mono text-destructive leading-none">
                {formatKES(stats.totalBalance)}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Outstanding</p>
            </div>
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
              <p className="text-base font-bold font-mono text-emerald-400 leading-none">
                {formatKES(stats.totalPaid)}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Total Paid</p>
            </div>
            <div className="rounded-2xl bg-muted/40 border border-border/50 p-3 text-center">
              <p className="text-base font-bold font-mono text-foreground leading-none">
                {stats.debtCount}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Transactions</p>
            </div>
          </div>
        )}

        {/* Debt history */}
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
            Debt History
          </h3>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : debts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 text-emerald-500/20" />
              <p className="text-sm font-semibold">No debt history</p>
            </div>
          ) : (
            <div className="space-y-2">
              {debts.map((debt: any) => {
                const isPaid = debt.status === "paid";
                const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
                const isOverdue = !isPaid && daysAgo > 30;
                const paidPct = debt.totalAmount > 0
                  ? Math.round(((debt.totalAmount - debt.balance) / debt.totalAmount) * 100)
                  : 0;

                return (
                  <div
                    key={debt.id}
                    className={cn(
                      "rounded-2xl border bg-card p-3.5",
                      isOverdue ? "border-red-500/30" : "border-border/70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className={cn(
                            "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded leading-none",
                            isPaid ? "bg-emerald-500/15 text-emerald-400" :
                            isOverdue ? "bg-red-500/15 text-red-400" :
                            debt.status === "partial" ? "bg-orange-500/15 text-orange-400" :
                            "bg-destructive/15 text-destructive"
                          )}>
                            {isOverdue ? `${daysAgo}d overdue` : debt.status}
                          </span>
                          <span className="text-[10px] text-muted-foreground/50">
                            {format(new Date(debt.createdAt), "d MMM yyyy")}
                          </span>
                        </div>
                        {isPaid ? (
                          <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                            <BadgeCheck className="h-3.5 w-3.5" />
                            Settled {formatKES(debt.totalAmount)}
                          </p>
                        ) : (
                          <p className={cn("text-xs font-semibold", isOverdue ? "text-red-400" : "text-muted-foreground")}>
                            {formatKES(debt.balance)} remaining
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold font-mono text-foreground">
                          {formatKES(debt.totalAmount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground/50">total</p>
                      </div>
                    </div>

                    {!isPaid && debt.totalAmount > 0 && (
                      <div className="mt-2.5">
                        <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              isOverdue ? "bg-red-400" : debt.status === "partial" ? "bg-orange-400" : "bg-primary"
                            )}
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground/40 mt-1">
                          {paidPct}% paid
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main customers page ──────────────────────────────────────────────────────
export default function Customers() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "registered" | "active" | "overdue">("all");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerEntry | null>(null);

  const qc = useQueryClient();

  const { data: allCustomers = [], isLoading } = useQuery<CustomerEntry[]>({
    queryKey: ["/api/crm", shopId, ""],
    queryFn: () => customFetch<CustomerEntry[]>(`/api/crm?shopId=${encodeURIComponent(shopId)}`),
    enabled: !!shopId,
    refetchInterval: 10_000,
  });

  const stats = useMemo(() => {
    const total = allCustomers.length;
    const registered = allCustomers.filter(c => c.registered).length;
    const withBalance = allCustomers.filter(c => c.totalBalance > 0).length;
    const outstanding = allCustomers.reduce((s, c) => s + c.totalBalance, 0);
    return { total, registered, withBalance, outstanding };
  }, [allCustomers]);

  const FILTERS = [
    { value: "all" as const, label: "All", count: allCustomers.length },
    { value: "registered" as const, label: "Registered", count: allCustomers.filter(c => c.registered).length },
    { value: "active" as const, label: "Has Debt", count: allCustomers.filter(c => c.activeCount > 0).length },
  ];

  const filtered = useMemo(() => {
    let list = allCustomers;
    if (filter === "registered") list = list.filter(c => c.registered);
    else if (filter === "active") list = list.filter(c => c.activeCount > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").includes(q) ||
        (c.email || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [allCustomers, filter, search]);

  // ── Profile view ──
  if (selectedCustomer) {
    return (
      <CustomerProfileView
        customer={selectedCustomer}
        shopId={shopId}
        onBack={() => setSelectedCustomer(null)}
        onEdit={() => setEditTarget(selectedCustomer)}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">

      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-card/98 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight">Customers</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.total} customer{stats.total !== 1 ? "s" : ""} · {stats.registered} registered
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, phone or email…"
              className="pl-9 h-10 text-sm bg-muted/40 border-border/60 rounded-xl"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap",
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
              <span className={cn(
                "text-[10px] font-bold tabular-nums",
                filter === f.value ? "text-primary-foreground/70" : "text-muted-foreground/60"
              )}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats banner ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-4 pb-2">
        <div className="rounded-2xl bg-muted/40 border border-border/50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2 flex items-center gap-1">
            <Users className="h-3 w-3" />Customers
          </p>
          <p className="text-xl font-bold font-mono text-foreground leading-none">{stats.total}</p>
          <p className="text-[11px] text-muted-foreground/60 mt-2">
            {stats.registered} with profile
          </p>
        </div>
        <div className={cn(
          "rounded-2xl border p-4",
          stats.outstanding > 0 ? "bg-destructive/10 border-destructive/20" : "bg-muted/30 border-border/40"
        )}>
          <p className={cn(
            "text-[10px] font-bold uppercase tracking-widest mb-2 flex items-center gap-1",
            stats.outstanding > 0 ? "text-destructive/60" : "text-muted-foreground/50"
          )}>
            <TrendingDown className="h-3 w-3" />Outstanding
          </p>
          <p className={cn(
            "text-xl font-bold font-mono leading-none",
            stats.outstanding > 0 ? "text-destructive" : "text-muted-foreground/40"
          )}>
            {formatKES(stats.outstanding)}
          </p>
          <p className="text-[11px] text-muted-foreground/60 mt-2">
            {stats.withBalance} owe balance
          </p>
        </div>
      </div>

      {/* ── Customer list ────────────────────────────────────────────── */}
      <div className="px-4 pt-2 pb-8 space-y-2.5">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-muted/60 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-36 bg-muted/60 rounded-full" />
                  <div className="h-3 w-24 bg-muted/40 rounded-full" />
                </div>
                <div className="w-5 h-5 bg-muted/40 rounded-full" />
              </div>
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <Users className="h-12 w-12 text-muted-foreground/20" />
            <p className="text-sm font-semibold">
              {search ? `No results for "${search}"` : "No customers yet"}
            </p>
            {!search && (
              <button
                onClick={() => setAddOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
              >
                <UserPlus className="h-3.5 w-3.5" />Add first customer
              </button>
            )}
          </div>
        ) : (
          filtered.map(customer => {
            const hasBalance = customer.totalBalance > 0;
            const avatarColor = hasBalance
              ? "bg-destructive/15 text-destructive"
              : customer.registered
              ? "bg-primary/15 text-primary"
              : "bg-muted/60 text-muted-foreground";

            return (
              <div
                key={customer.registered ? customer.id! : `u-${customer.name}`}
                className="rounded-2xl border border-border/70 bg-card overflow-hidden"
              >
                <button
                  onClick={() => setSelectedCustomer(customer)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold shrink-0", avatarColor)}>
                    {customer.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-foreground truncate">{customer.name}</span>
                      {customer.registered && (
                        <Star className="h-3 w-3 text-primary fill-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                      {customer.phone || (customer.email ?? "No contact info")}
                    </p>
                    {customer.activeCount > 0 && (
                      <p className={cn(
                        "text-[11px] font-semibold font-mono mt-0.5",
                        hasBalance ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {hasBalance ? `${formatKES(customer.totalBalance)} owed` : "All settled"}
                        {customer.debtCount > 0 && (
                          <span className="text-muted-foreground/40 font-normal ml-1">
                            · {customer.debtCount} debt{customer.debtCount !== 1 ? "s" : ""}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Right: balance + arrow */}
                  <div className="flex items-center gap-2 shrink-0">
                    {isOwner && customer.registered && customer.id && (
                      <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
                        <button
                          onClick={() => setEditTarget(customer)}
                          className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                        <DeleteDialog
                          customer={customer}
                          shopId={shopId}
                          onDeleted={() => {}}
                        />
                      </div>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
                  </div>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* ── Add customer dialog ──────────────────────────────────────── */}
      <CustomerFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        shopId={shopId}
      />

      {/* ── Edit customer dialog ─────────────────────────────────────── */}
      <CustomerFormDialog
        open={!!editTarget}
        onClose={() => { setEditTarget(null); if (selectedCustomer) setSelectedCustomer(prev => prev ? { ...prev, ...editTarget! } : null); }}
        shopId={shopId}
        initial={editTarget}
      />
    </div>
  );
}
