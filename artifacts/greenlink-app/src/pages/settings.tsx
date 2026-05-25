import { useState } from "react";
import {
  useLogout, useGetShop, useUpdateShop,
  useListSuppliers, useCreateSupplier, useUpdateSupplier, useDeleteSupplier,
  useListAuditLog, getListSuppliersQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocation } from "wouter";
import {
  LogOut, Store, Shield, Truck, FileText, Plus, Edit2, Trash2,
  KeyRound, Eye, EyeOff, Bot, CheckCircle2, ChevronRight,
  Phone, User, Sparkles, Clock, AlertCircle, Settings2, Download, Smartphone
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePwaInstall } from "@/hooks/use-pwa-install";

type Section = "shop" | "security" | "ai" | "suppliers" | "audit";

const NAV: { id: Section; label: string; icon: React.ElementType; ownerOnly?: boolean }[] = [
  { id: "shop",      label: "Shop Details",   icon: Store },
  { id: "security",  label: "Security",       icon: Shield,    ownerOnly: true },
  { id: "ai",        label: "AI Integration", icon: Bot,       ownerOnly: true },
  { id: "suppliers", label: "Suppliers",      icon: Truck,     ownerOnly: true },
  { id: "audit",     label: "Audit Log",      icon: FileText,  ownerOnly: true },
];

// ─── Inline edit field ───────────────────────────────────────────────────────
function EditableField({
  label, value, placeholder, onSave, type = "text", hint
}: {
  label: string; value: string; placeholder?: string;
  onSave: (v: string) => Promise<void>; type?: string; hint?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const handleSave = () => {
    if (draft === value) { setEditing(false); return; }
    setEditing(false); // close immediately
    onSave(draft).catch(() => toast.error("Failed to save — please retry"));
  };

  return (
    <div className="group">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1.5">{label}</p>
      {editing ? (
        <div className="flex gap-2">
          <input
            type={type}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
            autoFocus
            className="flex-1 h-10 bg-muted/40 border border-primary/40 rounded-xl px-3 text-sm text-foreground focus:outline-none focus:border-primary/70 focus:ring-1 focus:ring-primary/20"
          />
          <button
            onClick={handleSave}
            className="px-4 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => { setDraft(value); setEditing(false); }}
            className="px-3 h-10 rounded-xl bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/70 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setDraft(value); setEditing(true); }}
          className="w-full flex items-center justify-between group/btn"
        >
          <span className={cn("text-sm font-medium", value ? "text-foreground" : "text-muted-foreground/40 italic")}>
            {value || placeholder || "Not set"}
          </span>
          <span className="text-[10px] text-muted-foreground/0 group-hover/btn:text-primary/60 transition-colors font-semibold">
            Edit
          </span>
        </button>
      )}
      {hint && !editing && <p className="text-[10px] text-muted-foreground/40 mt-1">{hint}</p>}
    </div>
  );
}

// ─── PIN change row ───────────────────────────────────────────────────────────
function PinRow({ shopId, roleLabel }: { shopId: string; roleLabel: "owner" | "cashier" }) {
  const [open, setOpen] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const updateShop = useUpdateShop();
  const label = roleLabel === "owner" ? "Owner" : "Cashier";
  const match = newPin && confirmPin && newPin === confirmPin;

  const reset = () => { setNewPin(""); setConfirmPin(""); setShowNew(false); setShowConfirm(false); };

  const handleChange = () => {
    if (newPin.length < 4) { toast.error("PIN must be at least 4 digits"); return; }
    if (!match) { toast.error("PINs do not match"); return; }
    const data = roleLabel === "owner" ? { ownerPin: newPin } : { cashierPin: newPin };
    // Close + confirm immediately
    toast.success(`${label} PIN updated`);
    reset(); setOpen(false);
    updateShop.mutate({ shopId, data }, {
      onError: () => toast.error("Failed to update PIN — please retry"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button className="w-full flex items-center justify-between py-4 px-5 rounded-2xl bg-muted/30 hover:bg-muted/50 border border-border/40 hover:border-border/60 transition-all group">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center",
              roleLabel === "owner" ? "bg-primary/10" : "bg-blue-500/10"
            )}>
              <KeyRound className={cn("h-4 w-4", roleLabel === "owner" ? "text-primary" : "text-blue-400")} />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">{label} PIN</p>
              <p className="text-xs text-muted-foreground">4–8 digits · ●●●●</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" /> Change {label} PIN
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">New PIN</Label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                inputMode="numeric"
                maxLength={8}
                value={newPin}
                onChange={e => setNewPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Enter new PIN"
                autoFocus
                className="flex h-12 w-full rounded-xl border border-border/60 bg-muted/30 px-4 pr-10 text-xl tracking-[0.4em] font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
              />
              <button type="button" onClick={() => setShowNew(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Confirm PIN</Label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                inputMode="numeric"
                maxLength={8}
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                placeholder="Re-enter PIN"
                className={cn(
                  "flex h-12 w-full rounded-xl border bg-muted/30 px-4 pr-10 text-xl tracking-[0.4em] font-mono focus:outline-none focus:ring-1",
                  confirmPin && !match
                    ? "border-destructive/60 focus:border-destructive/60 focus:ring-destructive/20"
                    : match
                    ? "border-emerald-500/60 focus:border-emerald-500/60 focus:ring-emerald-500/20"
                    : "border-border/60 focus:border-primary/60 focus:ring-primary/20"
                )}
              />
              <button type="button" onClick={() => setShowConfirm(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {confirmPin && !match && (
              <p className="text-[11px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />PINs don't match</p>
            )}
            {match && (
              <p className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />PINs match</p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button onClick={() => setOpen(false)} className="flex-1 h-11 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/70 transition-colors">Cancel</button>
          <button
            onClick={handleChange}
            disabled={!match || newPin.length < 4 || updateShop.isPending}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {updateShop.isPending ? "Updating…" : "Confirm Change"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Gemini key section ──────────────────────────────────────────────────────
function GeminiSection({ shopId, hasKey }: { shopId: string; hasKey: boolean }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const updateShop = useUpdateShop();
  const qc = useQueryClient();

  const handleSave = () => {
    const trimmedKey = key.trim();
    // Close + confirm immediately
    toast.success(trimmedKey ? "Gemini key saved — Smart Scanner active" : "Key removed");
    setOpen(false); setKey(""); setShow(false);
    updateShop.mutate(
      { shopId, data: { geminiApiKey: trimmedKey || null } as any },
      {
        onSuccess: () => { qc.invalidateQueries(); },
        onError: () => toast.error("Failed to save API key — please retry"),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className={cn(
        "rounded-2xl border p-5 flex items-center gap-4 transition-all",
        hasKey
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-muted/20 border-border/40"
      )}>
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", hasKey ? "bg-emerald-500/15" : "bg-muted/60")}>
          <Sparkles className={cn("h-6 w-6", hasKey ? "text-emerald-400" : "text-muted-foreground/40")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-foreground text-sm">Gemini Vision</p>
            {hasKey ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-2.5 w-2.5" />ACTIVE
              </span>
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground/50 bg-muted px-2 py-0.5 rounded-full">NOT SET</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-0.5 leading-relaxed">
            {hasKey ? "Smart Scanner can read handwritten notebooks & supplier invoices" : "Add a Google AI key to enable invoice & notebook scanning"}
          </p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="shrink-0 px-4 h-9 rounded-xl bg-muted hover:bg-muted/70 text-sm font-semibold text-foreground border border-border/40 transition-colors"
        >
          {hasKey ? "Replace" : "Add Key"}
        </button>
      </div>

      <div className="rounded-2xl bg-muted/20 border border-border/30 p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">How to get a free key</p>
        <ol className="space-y-1">
          {["Go to aistudio.google.com/apikey", "Sign in with your Google account", "Click 'Create API key'", "Paste it here"].map((step, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <span className="w-4 h-4 rounded-full bg-muted/80 border border-border/50 flex items-center justify-center text-[9px] font-bold text-muted-foreground shrink-0">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setKey(""); setShow(false); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5 text-primary" />
              {hasKey ? "Replace Gemini Key" : "Add Gemini API Key"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">API Key</Label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="AIza…"
                  autoFocus
                  className="flex h-12 w-full rounded-xl border border-border/60 bg-muted/30 px-4 pr-10 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20"
                />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {hasKey && (
              <button
                onClick={() => {
                  toast.success("Key removed");
                  setOpen(false);
                  updateShop.mutate({ shopId, data: { geminiApiKey: null } as any }, {
                    onSuccess: () => { qc.invalidateQueries(); },
                    onError: () => toast.error("Failed to remove key — please retry"),
                  });
                }}
                className="h-11 px-4 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors border border-destructive/20"
              >
                Remove
              </button>
            )}
            <button onClick={() => setOpen(false)} className="h-11 px-4 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/70 transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!key.trim() || updateShop.isPending}
              className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {updateShop.isPending ? "Saving…" : "Save Key"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Supplier form ────────────────────────────────────────────────────────────
function SupplierFormDialog({
  shopId, supplier, trigger, onSuccess
}: {
  shopId: string;
  supplier?: { id: string; name: string; phone?: string | null; notes?: string | null };
  trigger: React.ReactNode;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(supplier?.name || "");
  const [phone, setPhone] = useState(supplier?.phone || "");
  const [notes, setNotes] = useState(supplier?.notes || "");
  const create = useCreateSupplier();
  const update = useUpdateSupplier();
  const isPending = create.isPending || update.isPending;

  const reset = () => { setName(supplier?.name || ""); setPhone(supplier?.phone || ""); setNotes(supplier?.notes || ""); };

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (supplier) {
      // Close + confirm immediately — don't wait for the network
      toast.success("Supplier updated"); setOpen(false); onSuccess();
      update.mutate({ supplierId: supplier.id, data: { name, phone: phone || undefined, notes: notes || undefined } }, {
        onError: () => toast.error("Failed to update supplier — please retry"),
      });
    } else {
      // Close + confirm immediately — don't wait for the network
      toast.success("Supplier added"); setOpen(false); reset(); onSuccess();
      create.mutate({ data: { shopId, name, phone: phone || undefined, notes: notes || undefined } }, {
        onError: () => toast.error("Failed to add supplier — please retry"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl">{supplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Name *</Label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-border/60 bg-muted/30 px-4 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Phone</Label>
            <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" placeholder="07xx xxx xxx"
              className="flex h-11 w-full rounded-xl border border-border/60 bg-muted/30 px-4 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20" />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Notes</Label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Preferred seed supplier"
              className="flex h-11 w-full rounded-xl border border-border/60 bg-muted/30 px-4 text-sm focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <button onClick={() => setOpen(false)} className="flex-1 h-11 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/70 transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={!name.trim() || isPending}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40">
            {isPending ? "Saving…" : supplier ? "Update" : "Add Supplier"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Settings() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const logout = useLogout();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";
  const { canInstall, isInstalled, install } = usePwaInstall();

  const [activeSection, setActiveSection] = useState<Section>("shop");

  const { data: shop } = useGetShop(shopId, { query: { enabled: !!shopId } });
  const { data: suppliers } = useListSuppliers({ shopId }, { query: { enabled: !!shopId && isOwner } });
  const { data: auditLog } = useListAuditLog({ shopId, limit: 20 }, { query: { enabled: !!shopId && isOwner } });

  const updateShop = useUpdateShop();

  const deleteSupplier = useDeleteSupplier({
    mutation: {
      onSuccess: () => { qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() }); },
      onError: () => toast.error("Failed to remove supplier — please retry"),
    },
  });

  const refreshSuppliers = () => qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        localStorage.removeItem("greenlink_token");
        localStorage.removeItem("greenlink_role");
        localStorage.removeItem("greenlink_shopId");
        setLocation("/login");
        toast.success("Signed out");
      },
    });
  };

  const visibleNav = NAV.filter(n => !n.ownerOnly || isOwner);

  return (
    <div className="flex flex-col md:flex-row min-h-full bg-background">
      {/* ── Sidebar Nav ── */}
      <aside className="md:w-64 md:shrink-0 md:border-r md:border-border/50 md:h-full">
        {/* Mobile: horizontal pill nav */}
        <div className="md:hidden flex gap-2 px-4 py-3 border-b border-border/50 overflow-x-auto scrollbar-hide">
          {visibleNav.map(n => (
            <button
              key={n.id}
              onClick={() => setActiveSection(n.id)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all",
                activeSection === n.id
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              <n.icon className="h-3.5 w-3.5" />
              {n.label}
            </button>
          ))}
        </div>

        {/* Desktop: vertical sidebar */}
        <div className="hidden md:flex flex-col h-full py-6">
          <div className="px-4 mb-6">
            <div className="flex items-center gap-2 px-2">
              <Settings2 className="h-4 w-4 text-muted-foreground/50" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">System Settings</span>
            </div>
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {visibleNav.map(n => (
              <button
                key={n.id}
                onClick={() => setActiveSection(n.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold transition-all text-left",
                  activeSection === n.id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground border border-transparent"
                )}
              >
                <n.icon className={cn("h-4 w-4 shrink-0", activeSection === n.id ? "text-primary" : "text-muted-foreground/60")} />
                {n.label}
                {activeSection === n.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
              </button>
            ))}
          </nav>

          {/* Logout at bottom of sidebar */}
          <div className="px-3 pt-4 border-t border-border/50 mt-4">
            <button
              onClick={handleLogout}
              disabled={logout.isPending}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-semibold text-destructive hover:bg-destructive/10 transition-all border border-transparent hover:border-destructive/20"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {logout.isPending ? "Signing out…" : "Sign Out"}
            </button>
          </div>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8">

        {/* ── SHOP DETAILS ─────────────────────────────────────── */}
        {activeSection === "shop" && (
          <div className="max-w-xl space-y-6">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground">Shop Details</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Your terminal identity and contact info</p>
            </div>

            {/* Shop identity card */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 border-b border-border/60 px-6 py-5 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center">
                  <Store className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{shop?.name || "Loading…"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                      {role}
                    </span>
                    <span className="text-xs text-muted-foreground">Active session</span>
                  </div>
                </div>
              </div>

              <div className="px-6 py-5 space-y-5">
                {isOwner ? (
                  <>
                    <EditableField
                      label="Shop Name"
                      value={shop?.name || ""}
                      onSave={(v) => {
                        toast.success("Name updated");
                        return new Promise<void>((_, rej) => {
                          updateShop.mutate({ shopId, data: { name: v } }, { onError: rej });
                        });
                      }}
                    />
                    <div className="border-t border-border/30" />
                    <EditableField
                      label="WhatsApp Contact"
                      value={shop?.ownerWhatsapp || ""}
                      placeholder="+254 700 000 000"
                      hint="Used for urgent stock and system alerts"
                      onSave={(v) => {
                        toast.success("WhatsApp updated");
                        return new Promise<void>((_, rej) => {
                          updateShop.mutate({ shopId, data: { ownerWhatsapp: v } }, { onError: rej });
                        });
                      }}
                    />
                  </>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Shop Name</p>
                      <p className="text-sm font-semibold text-foreground">{shop?.name || "—"}</p>
                    </div>
                    <div className="border-t border-border/30" />
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Your Role</p>
                      <p className="text-sm font-semibold text-foreground capitalize">{role}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Install App card */}
            {!isInstalled && (
              <div className={cn(
                "rounded-2xl border p-5 flex items-center gap-4 transition-all",
                canInstall
                  ? "bg-primary/5 border-primary/20"
                  : "bg-muted/20 border-border/30"
              )}>
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
                  canInstall ? "bg-primary/15" : "bg-muted/60"
                )}>
                  <Smartphone className={cn("h-6 w-6", canInstall ? "text-primary" : "text-muted-foreground/40")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground">Install App</p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">
                    {canInstall
                      ? "Add GreenLink OS to your home screen for fast offline access"
                      : "Open this app in Chrome or Edge on your phone to install it"}
                  </p>
                </div>
                {canInstall && (
                  <button
                    onClick={() => install().then(ok => ok && toast.success("App installed!"))}
                    className="shrink-0 flex items-center gap-2 px-4 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    Install
                  </button>
                )}
              </div>
            )}

            {isInstalled && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">App Installed</p>
                  <p className="text-xs text-muted-foreground/60">Running as a standalone app on this device</p>
                </div>
              </div>
            )}

            {/* Mobile logout */}
            <div className="md:hidden">
              <button
                onClick={handleLogout}
                disabled={logout.isPending}
                className="w-full h-14 rounded-2xl bg-destructive/10 text-destructive font-bold text-sm border border-destructive/20 hover:bg-destructive/20 transition-all flex items-center justify-center gap-2"
              >
                <LogOut className="h-4 w-4" />
                {logout.isPending ? "Signing out…" : "Sign Out"}
              </button>
            </div>
          </div>
        )}

        {/* ── SECURITY ─────────────────────────────────────────── */}
        {activeSection === "security" && isOwner && (
          <div className="max-w-xl space-y-6">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground">Security</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Manage PINs for owner and cashier access</p>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Authentication PINs</p>
              </div>
              <div className="p-4 space-y-3">
                <PinRow shopId={shopId} roleLabel="owner" />
                <PinRow shopId={shopId} roleLabel="cashier" />
              </div>
            </div>

            <div className="rounded-2xl bg-muted/30 border border-border/50 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Security Notes</p>
              <ul className="space-y-2">
                {[
                  "PINs are hashed — they cannot be recovered if forgotten",
                  "Share the cashier PIN with staff, keep the owner PIN private",
                  "Sessions expire after 24 hours automatically",
                ].map((note, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground/80">
                    <div className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0 mt-1.5" />
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ── AI INTEGRATION ───────────────────────────────────── */}
        {activeSection === "ai" && isOwner && (
          <div className="max-w-xl space-y-6">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground">AI Integration</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Connect Gemini Vision to power the Smart Scanner</p>
            </div>
            <GeminiSection shopId={shopId} hasKey={!!(shop as any)?.hasGeminiKey} />
          </div>
        )}

        {/* ── SUPPLIERS ────────────────────────────────────────── */}
        {activeSection === "suppliers" && isOwner && (
          <div className="max-w-xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold font-display text-foreground">Suppliers</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{suppliers?.length ?? 0} registered</p>
              </div>
              <SupplierFormDialog
                shopId={shopId}
                onSuccess={refreshSuppliers}
                trigger={
                  <button className="flex items-center gap-2 px-4 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors shadow-sm shadow-primary/20">
                    <Plus className="h-4 w-4" />Add
                  </button>
                }
              />
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {suppliers && suppliers.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {suppliers.map((s: any, i: number) => (
                    <div key={s.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors group">
                      <div className="w-10 h-10 rounded-xl bg-muted/60 border border-border/40 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-muted-foreground">{s.name[0]?.toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm">{s.name}</p>
                        {s.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Phone className="h-2.5 w-2.5" />{s.phone}
                          </p>
                        )}
                        {s.notes && <p className="text-xs text-muted-foreground/50 truncate mt-0.5">{s.notes}</p>}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <SupplierFormDialog
                          shopId={shopId}
                          supplier={s}
                          onSuccess={refreshSuppliers}
                          trigger={
                            <button className="w-8 h-8 rounded-lg bg-muted hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                        <button
                          onClick={() => { if (confirm(`Remove ${s.name}?`)) { toast.success("Supplier removed"); deleteSupplier.mutate({ supplierId: s.id }); } }}
                          className="w-8 h-8 rounded-lg bg-muted hover:bg-destructive/15 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border/40 flex items-center justify-center">
                    <Truck className="h-7 w-7 opacity-30" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm">No suppliers yet</p>
                    <p className="text-xs opacity-50 mt-0.5">Add your agrochemical and seed suppliers</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── AUDIT LOG ────────────────────────────────────────── */}
        {activeSection === "audit" && isOwner && (
          <div className="max-w-xl space-y-6">
            <div>
              <h2 className="text-2xl font-bold font-display text-foreground">Audit Log</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Recent system activity and changes</p>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              {auditLog && auditLog.length > 0 ? (
                <div className="divide-y divide-border/30">
                  {auditLog.map((log: any) => (
                    <div key={log.id} className="px-5 py-4 hover:bg-muted/10 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-primary/60" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground capitalize leading-tight">
                              {log.action.replace(/_/g, " ")}
                            </p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                              <User className="h-2.5 w-2.5" />
                              {log.performedBy || "System"}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-muted-foreground/70 shrink-0 flex items-center gap-1 whitespace-nowrap">
                          <Clock className="h-2.5 w-2.5" />
                          {format(new Date(log.createdAt), "MMM d, HH:mm")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                  <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border/40 flex items-center justify-center">
                    <FileText className="h-7 w-7 opacity-30" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm">No activity yet</p>
                    <p className="text-xs opacity-50 mt-0.5">Actions will appear here as you use the system</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
