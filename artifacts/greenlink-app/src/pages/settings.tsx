import { useState, useEffect } from "react";
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
  Phone, User, Sparkles, Clock, AlertCircle, Settings2, Download, Smartphone, X, MessageCircle, ScanLine,
  WifiOff, Wifi, RefreshCw, CloudUpload, ShoppingCart, Package, Banknote,
} from "lucide-react";
import {
  getPendingMutations, getFailedMutations, retryFailedMutations, clearAllMutations,
  type QueuedMutation,
} from "@/lib/offline-queue";
import { useOfflineSync } from "@/lib/use-offline-sync";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { usePwaInstall } from "@/hooks/use-pwa-install";

type Section = "shop" | "security" | "ai" | "suppliers" | "audit" | "offline";

const NAV: { id: Section; label: string; icon: React.ElementType; ownerOnly?: boolean }[] = [
  { id: "shop",      label: "Shop Details",   icon: Store },
  { id: "offline",   label: "Offline Sync",   icon: CloudUpload },
  { id: "security",  label: "Security",       icon: Shield,    ownerOnly: true },
  { id: "ai",        label: "AI Integration", icon: Bot,       ownerOnly: true },
  { id: "suppliers", label: "Suppliers",      icon: Truck,     ownerOnly: true },
  { id: "audit",     label: "Audit Log",      icon: FileText,  ownerOnly: true },
];

// ─── Offline sync section ─────────────────────────────────────────────────────
function mutationTypeLabel(type: QueuedMutation["type"]) {
  if (type === "sale") return "Sale";
  if (type === "restock") return "Restock";
  if (type === "debt_payment") return "Debt Payment";
  return type;
}
function mutationTypeIcon(type: QueuedMutation["type"]) {
  if (type === "sale") return ShoppingCart;
  if (type === "restock") return Package;
  if (type === "debt_payment") return Banknote;
  return CloudUpload;
}

function OfflineSyncSection({ shopId }: { shopId: string }) {
  const { isOnline, pendingCount, syncing, syncNow, refreshCount } = useOfflineSync(shopId);
  const [pending, setPending] = useState<QueuedMutation[]>([]);
  const [failed, setFailed] = useState<QueuedMutation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [p, f] = await Promise.all([
        getPendingMutations(shopId),
        getFailedMutations(shopId),
      ]);
      setPending(p);
      setFailed(f);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [shopId]);

  const handleRetryAll = async () => {
    await retryFailedMutations(shopId);
    await load();
    await refreshCount();
    syncNow();
  };

  const handleClearFailed = async () => {
    if (!confirm("Remove all failed transactions from the queue?")) return;
    const db = await import("@/lib/offline-queue");
    for (const m of failed) await db.deleteMutation(m.id);
    await load();
    await refreshCount();
    toast.success("Failed transactions cleared");
  };

  const MutationRow = ({ m, badge }: { m: QueuedMutation; badge?: "pending" | "failed" }) => {
    const Icon = mutationTypeIcon(m.type);
    return (
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/10 transition-colors">
        <div className="w-8 h-8 rounded-xl bg-muted/40 border border-border/30 flex items-center justify-center shrink-0 mt-0.5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">{mutationTypeLabel(m.type)}</p>
          <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">
            {format(new Date(m.createdAt), "MMM d, HH:mm:ss")}
            {m.attempts > 0 && ` · ${m.attempts} attempt${m.attempts !== 1 ? "s" : ""}`}
          </p>
          {badge === "failed" && m.errorMsg && (
            <p className="text-[10px] text-destructive/70 mt-1 font-medium leading-tight">
              ↳ {m.errorMsg}
            </p>
          )}
        </div>
        {badge === "pending" && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">queued</span>
        )}
        {badge === "failed" && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 shrink-0">failed</span>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold font-display text-foreground">Offline Sync</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Sales, restocks, and payments made while offline are queued here and synced automatically on reconnect
        </p>
      </div>

      {/* Connection status card */}
      <div className={cn(
        "rounded-2xl border p-5 flex items-center gap-4 transition-all",
        isOnline
          ? "bg-emerald-500/5 border-emerald-500/20"
          : "bg-destructive/5 border-destructive/20"
      )}>
        <div className={cn(
          "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0",
          isOnline ? "bg-emerald-500/15" : "bg-destructive/15"
        )}>
          {isOnline
            ? <Wifi className="h-6 w-6 text-emerald-400" />
            : <WifiOff className="h-6 w-6 text-destructive" />}
        </div>
        <div className="flex-1">
          <p className="font-bold text-sm text-foreground">{isOnline ? "Online" : "Offline"}</p>
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {isOnline
              ? syncing
                ? `Syncing ${pendingCount} transaction${pendingCount !== 1 ? "s" : ""}…`
                : "Connected to the server — transactions sync instantly"
              : `No connection · ${pendingCount > 0 ? `${pendingCount} transaction${pendingCount !== 1 ? "s" : ""} queued` : "transactions will queue until reconnected"}`}
          </p>
        </div>
        {isOnline && pendingCount > 0 && !syncing && (
          <button
            onClick={() => { syncNow(); setTimeout(load, 1500); }}
            className="shrink-0 flex items-center gap-2 px-4 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync Now
          </button>
        )}
        {syncing && (
          <RefreshCw className="h-5 w-5 text-blue-400 animate-spin shrink-0" />
        )}
      </div>

      {/* Pending queue */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Queued Transactions</p>
            {!loading && <p className="text-xs text-muted-foreground/60 mt-0.5">{pending.length} waiting to sync</p>}
          </div>
          {pending.length > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">{pending.length}</span>
          )}
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <RefreshCw className="h-5 w-5 text-muted-foreground/40 animate-spin" />
          </div>
        ) : pending.length > 0 ? (
          <div className="divide-y divide-border/30">
            {pending.map(m => <MutationRow key={m.id} m={m} badge="pending" />)}
          </div>
        ) : (
          <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 opacity-20" />
            <p className="text-sm font-semibold opacity-40">All synced</p>
          </div>
        )}
      </div>

      {/* Failed transactions */}
      {(failed.length > 0 || !loading) && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Failed Transactions</p>
              {!loading && <p className="text-xs text-muted-foreground/60 mt-0.5">{failed.length} need attention</p>}
            </div>
            {failed.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleRetryAll}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="h-3 w-3" />Retry All
                </button>
                <button
                  onClick={handleClearFailed}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {failed.length > 0 ? (
            <div className="divide-y divide-border/30">
              {failed.map(m => <MutationRow key={m.id} m={m} badge="failed" />)}
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 gap-2 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 opacity-20" />
              <p className="text-sm font-semibold opacity-40">No failed transactions</p>
            </div>
          )}
        </div>
      )}

      {/* How it works */}
      <div className="rounded-2xl bg-muted/30 border border-border/50 p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">How Offline Mode Works</p>
        <ul className="space-y-2">
          {[
            "Sales, restocks, and debt payments recorded offline are saved to this device",
            "When connection is restored, all queued transactions sync to the server automatically",
            "Products are always available from local cache — the POS works with no internet",
            "Failed transactions can be retried manually using the button above",
          ].map((note, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground/80">
              <div className="w-1 h-1 rounded-full bg-muted-foreground/50 shrink-0 mt-1.5" />
              {note}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

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

// ─── WhatsApp multi-number field ─────────────────────────────────────────────
function WhatsAppField({
  numbers,
  onSave,
}: {
  numbers: string[];
  onSave: (nums: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newNum, setNewNum] = useState("");

  const remove = (idx: number) => {
    const updated = numbers.filter((_, i) => i !== idx);
    toast.success("Number removed");
    onSave(updated);
  };

  const add = () => {
    const n = newNum.trim();
    if (!n) return;
    const updated = [...numbers, n];
    toast.success("Number added");
    onSave(updated);
    setNewNum("");
    setAdding(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">WhatsApp Contacts</p>
        {numbers.length > 1 && (
          <span className="text-[10px] font-bold bg-[#25D366]/10 text-[#25D366] px-1.5 py-0.5 rounded-full">{numbers.length} owners</span>
        )}
      </div>
      <div className="space-y-2">
        {numbers.map((num, i) => (
          <div key={i} className="flex items-center gap-2.5 bg-muted/20 border border-border rounded-xl px-3 py-2.5">
            <MessageCircle className="h-3.5 w-3.5 text-[#25D366] shrink-0" />
            <span className="text-sm font-medium flex-1 font-mono">{num}</span>
            {numbers.length > 1 && (
              <span className="text-[10px] text-muted-foreground/60 shrink-0">Owner {i + 1}</span>
            )}
            <button
              onClick={() => remove(i)}
              className="text-muted-foreground/40 hover:text-destructive transition-colors p-1 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {numbers.length === 0 && !adding && (
          <p className="text-sm text-muted-foreground/40 italic py-1">No number set</p>
        )}

        {adding ? (
          <div className="flex gap-2">
            <input
              value={newNum}
              onChange={e => setNewNum(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") add();
                if (e.key === "Escape") { setAdding(false); setNewNum(""); }
              }}
              autoFocus
              placeholder="+254 700 000 000"
              className="flex-1 h-10 bg-muted/40 border border-primary/40 rounded-xl px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
            <button
              onClick={add}
              className="px-4 h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setNewNum(""); }}
              className="px-3 h-10 rounded-xl bg-muted text-muted-foreground text-xs hover:bg-muted/70 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline mt-1"
          >
            <Plus className="h-3.5 w-3.5" />
            {numbers.length === 0 ? "Add WhatsApp number" : "Add another owner"}
          </button>
        )}

        <p className="text-[10px] text-muted-foreground/40 mt-0.5">
          Used for WhatsApp stock, debt & expiry alert reports
        </p>
      </div>
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
    reset(); setOpen(false);
    (async () => {
      try {
        await updateShop.mutateAsync({ shopId, data });
        toast.success(`${label} PIN updated`);
      } catch {
        toast.error("Failed to update PIN — please retry");
      }
    })();
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

// ─── Reusable AI key section ─────────────────────────────────────────────────
function AiKeySection({
  title, subtitle, activeText, inactiveText, icon: Icon, accentColor, steps, placeholder,
  hasKey, onSave, onRemove, isPending,
}: {
  title: string; subtitle: string; activeText: string; inactiveText: string;
  icon: any; accentColor: string; steps: string[]; placeholder: string;
  hasKey: boolean; onSave: (key: string) => void; onRemove: () => void; isPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);

  const handleSave = () => {
    const trimmed = key.trim();
    setOpen(false); setKey(""); setShow(false);
    onSave(trimmed);
  };

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border p-5 flex items-center gap-4 transition-all",
        hasKey ? `bg-${accentColor}-500/5 border-${accentColor}-500/20` : "bg-muted/20 border-border/40")}>
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", hasKey ? `bg-${accentColor}-500/15` : "bg-muted/60")}>
          <Icon className={cn("h-6 w-6", hasKey ? `text-${accentColor}-400` : "text-muted-foreground/40")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-foreground text-sm">{title}</p>
            {hasKey ? (
              <span className={cn("flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full", `text-${accentColor}-400 bg-${accentColor}-500/10`)}>
                <CheckCircle2 className="h-2.5 w-2.5" />ACTIVE
              </span>
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground/50 bg-muted px-2 py-0.5 rounded-full">NOT SET</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-0.5 leading-relaxed">{hasKey ? activeText : inactiveText}</p>
        </div>
        <button onClick={() => setOpen(true)}
          className="shrink-0 px-4 h-9 rounded-xl bg-muted hover:bg-muted/70 text-sm font-semibold text-foreground border border-border/40 transition-colors">
          {hasKey ? "Replace" : "Add Key"}
        </button>
      </div>
      <div className="rounded-2xl bg-muted/20 border border-border/30 p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">How to get a free key</p>
        <ol className="space-y-1">
          {steps.map((step, i) => (
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
              <Icon className="h-5 w-5 text-primary" />
              {hasKey ? `Replace ${title} Key` : `Add ${title} API Key`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">API Key</Label>
              <div className="relative">
                <input type={show ? "text" : "password"} value={key} onChange={e => setKey(e.target.value)} placeholder={placeholder} autoFocus
                  className="flex h-12 w-full rounded-xl border border-border/60 bg-muted/30 px-4 pr-10 text-sm font-mono focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/20" />
                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {hasKey && (
              <button onClick={() => { setOpen(false); onRemove(); }}
                className="h-11 px-4 rounded-xl bg-destructive/10 text-destructive text-sm font-semibold hover:bg-destructive/20 transition-colors border border-destructive/20">
                Remove
              </button>
            )}
            <button onClick={() => setOpen(false)} className="h-11 px-4 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/70 transition-colors">Cancel</button>
            <button onClick={handleSave} disabled={!key.trim() || isPending}
              className="h-11 px-6 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-40">
              {isPending ? "Saving…" : "Save Key"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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
    setOpen(false); setKey(""); setShow(false);
    (async () => {
      try {
        await updateShop.mutateAsync({ shopId, data: { geminiApiKey: trimmedKey || null } as any });
        toast.success(trimmedKey ? "Gemini key saved — Smart Scanner active" : "Key removed");
        qc.invalidateQueries();
      } catch {
        toast.error("Failed to save API key — please retry");
      }
    })();
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
                  setOpen(false);
                  (async () => {
                    try {
                      await updateShop.mutateAsync({ shopId, data: { geminiApiKey: null } as any });
                      toast.success("Key removed");
                      qc.invalidateQueries();
                    } catch {
                      toast.error("Failed to remove key — please retry");
                    }
                  })();
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

// ─── Groq key section ────────────────────────────────────────────────────────
function GroqSection({ shopId, hasKey }: { shopId: string; hasKey: boolean }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [show, setShow] = useState(false);
  const updateShop = useUpdateShop();
  const qc = useQueryClient();

  const handleSave = () => {
    const trimmedKey = key.trim();
    setOpen(false); setKey(""); setShow(false);
    (async () => {
      try {
        await updateShop.mutateAsync({ shopId, data: { groqApiKey: trimmedKey || null } as any });
        toast.success(trimmedKey ? "Groq key saved — Smart Scanner active" : "Key removed");
        qc.invalidateQueries();
      } catch {
        toast.error("Failed to save API key — please retry");
      }
    })();
  };

  return (
    <div className="space-y-4">
      <div className={cn(
        "rounded-2xl border p-5 flex items-center gap-4 transition-all",
        hasKey ? "bg-orange-500/5 border-orange-500/20" : "bg-muted/20 border-border/40"
      )}>
        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", hasKey ? "bg-orange-500/15" : "bg-muted/60")}>
          <Bot className={cn("h-6 w-6", hasKey ? "text-orange-400" : "text-muted-foreground/40")} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-bold text-foreground text-sm">Groq Vision</p>
            {hasKey ? (
              <span className="flex items-center gap-1 text-[10px] font-bold text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-2.5 w-2.5" />ACTIVE
              </span>
            ) : (
              <span className="text-[10px] font-bold text-muted-foreground/50 bg-muted px-2 py-0.5 rounded-full">NOT SET</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-0.5 leading-relaxed">
            {hasKey ? "Smart Scanner uses Llama 4 Scout vision — ultra-fast OCR" : "Add a Groq key for fast invoice & notebook scanning (used first)"}
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
          {["Go to console.groq.com/keys", "Sign in or create a free account", "Click 'Create API Key'", "Paste it here"].map((step, i) => (
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
              <Bot className="h-5 w-5 text-primary" />
              {hasKey ? "Replace Groq Key" : "Add Groq API Key"}
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
                  placeholder="gsk_…"
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
                  setOpen(false);
                  (async () => {
                    try {
                      await updateShop.mutateAsync({ shopId, data: { groqApiKey: null } as any });
                      toast.success("Key removed");
                      qc.invalidateQueries();
                    } catch {
                      toast.error("Failed to remove key — please retry");
                    }
                  })();
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
      setOpen(false);
      (async () => {
        try {
          await update.mutateAsync({ supplierId: supplier.id, data: { name, phone: phone || undefined, notes: notes || undefined } });
          toast.success("Supplier updated");
          onSuccess();
        } catch {
          toast.error("Failed to update supplier — please retry");
        }
      })();
    } else {
      setOpen(false); reset();
      (async () => {
        try {
          await create.mutateAsync({ data: { shopId, name, phone: phone || undefined, notes: notes || undefined } });
          toast.success("Supplier added");
          onSuccess();
        } catch {
          toast.error("Failed to add supplier — please retry");
        }
      })();
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

  const { data: shop } = useGetShop(shopId, { query: { enabled: !!shopId, refetchInterval: 60_000, refetchIntervalInBackground: false } });
  const { data: suppliers } = useListSuppliers({ shopId }, { query: { enabled: !!shopId && isOwner, refetchInterval: 60_000, refetchIntervalInBackground: false } });
  const { data: auditLog } = useListAuditLog({ shopId, limit: 20 }, { query: { enabled: !!shopId && isOwner, refetchInterval: 30_000, refetchIntervalInBackground: false } });

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
                      onSave={async (v) => {
                        await updateShop.mutateAsync({ shopId, data: { name: v } });
                        toast.success("Name updated");
                      }}
                    />
                    <div className="border-t border-border/30" />
                    <WhatsAppField
                      numbers={(shop?.ownerWhatsapp || "").split(",").map(n => n.trim()).filter(Boolean)}
                      onSave={(nums) => {
                        updateShop.mutate({ shopId, data: { ownerWhatsapp: nums.join(",") } });
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

        {/* ── OFFLINE SYNC ─────────────────────────────────────── */}
        {activeSection === "offline" && (
          <OfflineSyncSection shopId={shopId} />
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
              <p className="text-sm text-muted-foreground mt-0.5">Connect an AI provider to power the Smart Scanner. Groq is used first (faster), Gemini as fallback.</p>
            </div>

            {/* Groq */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Groq — Vision OCR (Primary · Fastest)</p>
              <GroqSection shopId={shopId} hasKey={!!(shop as any)?.hasGroqKey} />
            </div>

            {/* Gemini */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">Google Gemini — Vision OCR (Fallback)</p>
              <GeminiSection shopId={shopId} hasKey={!!(shop as any)?.hasGeminiKey} />
            </div>

            {/* Quick access to the scanner */}
            <button
              onClick={() => setLocation("/ocr")}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <ScanLine className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Open Smart Scanner</p>
                <p className="text-xs text-muted-foreground/70 mt-0.5">Scan invoices and handwritten notebooks with AI</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </button>
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
                          onClick={() => { if (confirm(`Remove ${s.name}?`)) { deleteSupplier.mutate({ supplierId: s.id }, { onSuccess: () => toast.success("Supplier removed"), onError: () => toast.error("Failed to remove supplier — please retry") }); } }}
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
