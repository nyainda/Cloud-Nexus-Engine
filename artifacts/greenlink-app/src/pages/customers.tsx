import React, { useState, useMemo } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatKES } from "@/lib/format";
import {
  Search, UserPlus, Phone, Mail, FileText, Wallet, ChevronRight,
  BadgeCheck, Users, TrendingDown, Edit3, Trash2,
  ArrowLeft, CheckCircle2, Clock, CreditCard, MessageCircle,
  Save, Star, AlertCircle, X,
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

// ─── Avatar helper ────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-violet-500/20 text-violet-400",
  "bg-cyan-500/20 text-cyan-400",
  "bg-amber-500/20 text-amber-400",
  "bg-rose-500/20 text-rose-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-sky-500/20 text-sky-400",
  "bg-fuchsia-500/20 text-fuchsia-400",
  "bg-orange-500/20 text-orange-400",
];
function avatarColor(name: string, hasBalance: boolean) {
  if (hasBalance) return "bg-destructive/20 text-destructive";
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

// ─── Query keys ───────────────────────────────────────────────────────────────
const crmKey = (shopId: string) => ["/api/crm", shopId];
const profileKey = (shopId: string, name: string) => ["/api/crm/profile", shopId, name];

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
  // Unregistered = known only from debts, no customer record
  const isUnregistered = isEdit && !isRegistered;

  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [creditLimit, setCreditLimit] = useState(
    initial?.creditLimit != null ? String(initial.creditLimit) : ""
  );
  const [saving, setSaving] = useState(false);

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
    const trimmed = {
      name: name.trim(), phone: phone.trim(),
      email: email.trim() || null, notes: notes.trim() || null,
      creditLimit: creditLimit ? Number(creditLimit) : null,
    };

    // Optimistic update for edits — close dialog instantly
    let snapshot: any[] | undefined;
    if (isEdit && isRegistered && initial?.id) {
      snapshot = qc.getQueryData<any[]>(crmKey(shopId));
      qc.setQueryData(crmKey(shopId), (old: any[] = []) =>
        old.map(c => c.id === initial.id ? { ...c, ...trimmed } : c)
      );
    }
    onClose({ name: trimmed.name, phone: trimmed.phone });
    setSaving(true);
    try {
      if (isUnregistered) {
        await customFetch("/api/crm/rename", {
          method: "PATCH",
          body: JSON.stringify({ shopId, oldName: initial!.name, newName: trimmed.name, phone: trimmed.phone }),
        });
        toast.success("Customer updated across all debts");
      } else if (isRegistered && initial?.id) {
        await customFetch(`/api/crm/${initial.id}?shopId=${shopId}`, {
          method: "PATCH",
          body: JSON.stringify(trimmed),
        });
        toast.success("Customer updated");
      } else {
        // New: optimistic add with a temp id, then server confirms
        const tempEntry: any = { ...trimmed, id: `tmp-${Date.now()}`, registered: true, totalBalance: 0, totalOwed: 0, debtCount: 0, activeCount: 0, lastActivity: null, createdAt: new Date().toISOString() };
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
      else qc.invalidateQueries({ queryKey: crmKey(shopId) }); // revert temp add
      toast.error("Failed to save — please retry");
    } finally {
      setSaving(false);
    }
  };

  const title = !isEdit ? "New Customer" : isUnregistered ? "Edit Customer" : "Edit Profile";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" />
            {title}
          </DialogTitle>
          {isUnregistered && (
            <p className="text-xs text-muted-foreground mt-1">
              Renaming will update all debt records linked to this customer.
            </p>
          )}
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
          {!isUnregistered && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" type="email" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider">Credit Limit (KES)</Label>
                <Input value={creditLimit} onChange={e => setCreditLimit(e.target.value)} placeholder="e.g. 5000" type="number" min={0} />
                <p className="text-[10px] text-muted-foreground">Leave blank for no limit</p>
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose()} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!name.trim() || saving} className="gap-2">
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
    // Optimistic: remove instantly, close dialog, call back
    const snapshot = qc.getQueryData<any[]>(crmKey(shopId));
    qc.setQueryData(crmKey(shopId), (old: any[] = []) => old.filter(c => c.id !== customer.id));
    toast.success(`${customer.name} removed`);
    setOpen(false);
    onDeleted();
    setLoading(true);
    try {
      await customFetch(`/api/crm/${customer.id}?shopId=${shopId}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: crmKey(shopId) });
    } catch {
      qc.setQueryData(crmKey(shopId), snapshot); // rollback
      toast.error("Failed to delete — restored");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center w-7 h-7 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
        title="Remove customer"
      >
        <Trash2 className="h-3 w-3" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />Remove Profile
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <span className="font-semibold text-foreground">{customer.name}</span>'s profile?
            Their debt records will remain — only the registered profile is deleted.
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

// ─── Customer profile view ────────────────────────────────────────────────────
function CustomerProfileView({
  customer: initialCustomer,
  shopId,
  onBack,
  onEdit,
}: {
  customer: CustomerEntry;
  shopId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  // Use local state so edits reflect immediately in header
  const [customer, setCustomer] = useState(initialCustomer);

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
  const [editOpen, setEditOpen] = useState(false);

  const handleRegister = async () => {
    setRegistering(true);
    try {
      await customFetch("/api/crm", {
        method: "POST",
        body: JSON.stringify({
          shopId,
          name: customer.name,
          phone: customer.phone,
          email: null, notes: null, creditLimit: null,
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
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-muted/60 hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">{customer.name}</h1>
            <p className="text-xs text-muted-foreground">
              {customer.registered ? "Registered profile" : "From debt records only"}
            </p>
          </div>
          <button
            onClick={() => setEditOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-muted/60 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 pb-10">
        {/* Hero card */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {/* Top accent bar */}
          <div className={cn(
            "h-1.5",
            customer.totalBalance > 0 ? "bg-destructive" : "bg-primary"
          )} />
          <div className="p-4">
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0",
                avatarColor(customer.name, customer.totalBalance > 0)
              )}>
                {customer.name.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-bold text-lg">{customer.name}</h2>
                  {customer.registered && <Star className="h-3.5 w-3.5 text-primary fill-primary" />}
                  {!customer.registered && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      Unregistered
                    </span>
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
                      Limit: <span className="font-mono font-semibold text-foreground ml-1">{formatKES(reg.creditLimit)}</span>
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

            {/* Action buttons */}
            <div className="flex gap-2 mt-4 flex-wrap">
              {!customer.registered && (
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  <Star className="h-3.5 w-3.5" />
                  {registering ? "Saving…" : "Save Profile"}
                </button>
              )}
              {(reg?.phone || customer.phone) && customer.totalBalance > 0 && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  <button className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-[#25D366]/30 text-[#25D366] bg-[#25D366]/5 hover:bg-[#25D366]/15 text-xs font-semibold transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" />WhatsApp Reminder
                  </button>
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        {!isLoading && stats && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-center">
              <p className="text-sm font-bold font-mono text-destructive leading-none">
                {formatKES(stats.totalBalance)}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">Outstanding</p>
            </div>
            <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center">
              <p className="text-sm font-bold font-mono text-emerald-400 leading-none">
                {formatKES(stats.totalPaid)}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">Total Paid</p>
            </div>
            <div className="rounded-2xl bg-muted/40 border border-border/50 p-3 text-center">
              <p className="text-sm font-bold font-mono text-foreground leading-none">
                {stats.debtCount}
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1.5">Transactions</p>
            </div>
          </div>
        )}

        {/* Debt history */}
        <div>
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3 flex items-center gap-1.5">
            <Clock className="h-3 w-3" />Debt History
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
                      isOverdue ? "border-red-500/30" :
                      isPaid ? "border-emerald-500/20" : "border-border/70"
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
                        <p className="text-sm font-bold font-mono">{formatKES(debt.totalAmount)}</p>
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
                        <p className="text-[10px] text-muted-foreground/40 mt-1">{paidPct}% paid</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit dialog from profile */}
      <CustomerFormDialog
        open={editOpen}
        onClose={(updated) => {
          setEditOpen(false);
          if (updated?.name) setCustomer(c => ({ ...c, ...updated }));
        }}
        shopId={shopId}
        initial={customer}
      />
    </div>
  );
}

// ─── Customer card ────────────────────────────────────────────────────────────
function CustomerCard({
  customer,
  isOwner,
  shopId,
  onClick,
  onEdit,
}: {
  customer: CustomerEntry;
  isOwner: boolean;
  shopId: string;
  onClick: () => void;
  onEdit: () => void;
}) {
  const hasBalance = customer.totalBalance > 0;
  const ac = avatarColor(customer.name, hasBalance);

  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden group hover:border-border transition-colors">
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={e => e.key === "Enter" && onClick()}
        className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer"
      >
        {/* Avatar */}
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center text-base font-bold shrink-0 transition-transform group-hover:scale-105",
          ac
        )}>
          {customer.name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate">{customer.name}</span>
            {customer.registered && (
              <Star className="h-2.5 w-2.5 text-primary fill-primary shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
            {customer.phone || customer.email || (
              <span className="italic">No contact info</span>
            )}
          </p>
          {customer.activeCount > 0 && (
            <p className={cn(
              "text-[11px] font-semibold font-mono mt-0.5",
              hasBalance ? "text-destructive" : "text-emerald-400"
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

        {/* Right actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isOwner && (
            <div onClick={e => e.stopPropagation()} className="flex items-center gap-1">
              <button
                onClick={onEdit}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Edit customer"
              >
                <Edit3 className="h-3 w-3" />
              </button>
              {customer.registered && customer.id && (
                <DeleteDialog
                  customer={customer}
                  shopId={shopId}
                  onDeleted={() => {}}
                />
              )}
            </div>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
        </div>
      </div>

      {/* Balance bar for customers with debt */}
      {hasBalance && (
        <div className="h-0.5 bg-destructive/30 mx-4 mb-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-destructive/70 rounded-full"
            style={{
              width: customer.totalOwed > 0
                ? `${Math.round((customer.totalBalance / customer.totalOwed) * 100)}%`
                : "100%"
            }}
          />
        </div>
      )}
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

  const { data: allCustomers = [], isLoading } = useQuery<CustomerEntry[]>({
    queryKey: crmKey(shopId),
    queryFn: () => customFetch<CustomerEntry[]>(`/api/crm?shopId=${encodeURIComponent(shopId)}`),
    enabled: !!shopId,
    refetchInterval: 15_000,
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

      {/* ── Sticky header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border/80">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Customers</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.total} total · {stats.registered} registered · {stats.withBalance} with debt
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by name, phone or email…"
              className="pl-9 h-9 text-sm bg-muted/40 border-border/40 rounded-xl"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
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
                filter === f.value ? "text-primary-foreground/70" : "text-muted-foreground/50"
              )}>
                {f.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats banner ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-4 pb-1">
        {/* Customers card */}
        <div className="rounded-2xl bg-muted/30 border border-border/40 p-4 relative overflow-hidden">
          <div className="absolute top-3 right-3 opacity-10">
            <Users className="h-8 w-8" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">Customers</p>
          <p className="text-2xl font-bold font-mono">{stats.total}</p>
          <p className="text-[11px] text-muted-foreground/50 mt-1">
            {stats.registered} registered
          </p>
        </div>

        {/* Outstanding card */}
        <div className={cn(
          "rounded-2xl border p-4 relative overflow-hidden",
          stats.outstanding > 0
            ? "bg-destructive/10 border-destructive/20"
            : "bg-muted/30 border-border/40"
        )}>
          <div className="absolute top-3 right-3 opacity-10">
            <TrendingDown className="h-8 w-8" />
          </div>
          <p className={cn(
            "text-[10px] font-bold uppercase tracking-widest mb-2",
            stats.outstanding > 0 ? "text-destructive/70" : "text-muted-foreground/60"
          )}>Outstanding</p>
          <p className={cn(
            "text-2xl font-bold font-mono",
            stats.outstanding > 0 ? "text-destructive" : "text-muted-foreground/40"
          )}>
            {formatKES(stats.outstanding)}
          </p>
          <p className="text-[11px] text-muted-foreground/50 mt-1">
            {stats.withBalance} owe balance
          </p>
        </div>
      </div>

      {/* ── Customer list ─────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-8 space-y-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border/40 bg-card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-muted/60 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-36 bg-muted/60 rounded-full" />
                  <div className="h-2.5 w-24 bg-muted/40 rounded-full" />
                </div>
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
          <>
            {/* Section: with debt */}
            {filtered.some(c => c.activeCount > 0) && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pt-1 flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3" />With Active Debt
                </p>
                {filtered
                  .filter(c => c.activeCount > 0)
                  .map(customer => (
                    <CustomerCard
                      key={customer.id ?? `u-${customer.name}`}
                      customer={customer}
                      isOwner={isOwner}
                      shopId={shopId}
                      onClick={() => setSelectedCustomer(customer)}
                      onEdit={() => setEditTarget(customer)}
                    />
                  ))}
              </>
            )}

            {/* Section: all settled */}
            {filtered.some(c => c.activeCount === 0) && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 pt-2 flex items-center gap-1.5">
                  <BadgeCheck className="h-3 w-3" />All Settled / No Debt
                </p>
                {filtered
                  .filter(c => c.activeCount === 0)
                  .map(customer => (
                    <CustomerCard
                      key={customer.id ?? `u-${customer.name}`}
                      customer={customer}
                      isOwner={isOwner}
                      shopId={shopId}
                      onClick={() => setSelectedCustomer(customer)}
                      onEdit={() => setEditTarget(customer)}
                    />
                  ))}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Add customer dialog ───────────────────────────────────── */}
      <CustomerFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        shopId={shopId}
      />

      {/* ── Edit customer dialog ──────────────────────────────────── */}
      <CustomerFormDialog
        open={!!editTarget}
        onClose={(updated) => {
          setEditTarget(null);
          if (updated && selectedCustomer) {
            setSelectedCustomer(prev => prev ? { ...prev, ...updated } : null);
          }
        }}
        shopId={shopId}
        initial={editTarget}
      />
    </div>
  );
}
