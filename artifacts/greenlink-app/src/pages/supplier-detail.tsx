import { useState, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { useListScanSessions, useListSuppliers, customFetch } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Building2, Phone, FileText, Pencil, Package,
  Banknote, Calendar, TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  Hash, ImageIcon, Loader2, X, Save, ZoomIn, Trash2, AlertTriangle,
  Clock, ShoppingBag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isValid } from "date-fns";
import { toast } from "sonner";

// ─── types ────────────────────────────────────────────────────────────────────

type Period = "week" | "month" | "year" | "all";

interface InvoiceMeta {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  grandTotal?: number | null;
}

interface ParsedSession {
  id: string;
  status: string;
  totalProducts: number;
  createdAt: string;
  imageUrl: string | null;
  supplierId: string | null;
  meta: InvoiceMeta | null;
}

interface SupplierRecord {
  id: string;
  shopId: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
  createdAt: string;
}

interface Movement {
  id: string;
  productName: string;
  qtyChange: number;
  beforeQty: number;
  afterQty: number;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseSession(raw: any): ParsedSession {
  let meta: InvoiceMeta | null = null;
  try {
    if (raw.resultJson) {
      const p = JSON.parse(raw.resultJson);
      meta = p.invoiceMeta ?? p.meta ?? null;
    }
  } catch {}
  return {
    id: raw.id,
    status: raw.status,
    totalProducts: raw.totalProducts ?? 0,
    createdAt: raw.createdAt,
    imageUrl: raw.imageUrl ?? null,
    supplierId: raw.supplierId ?? null,
    meta,
  };
}

function isInPeriod(dateStr: string, period: Period): boolean {
  if (period === "all") return true;
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return false;
    const now = new Date();
    if (period === "week") {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff;
    }
    if (period === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (period === "year") return d.getFullYear() === now.getFullYear();
    return true;
  } catch { return false; }
}

function formatDate(str: string) {
  try { const d = parseISO(str); return isValid(d) ? format(d, "MMM d") : str; } catch { return str; }
}
function formatDateTime(str: string) {
  try { const d = parseISO(str); return isValid(d) ? format(d, "MMM d, yyyy · h:mm a") : str; } catch { return str; }
}
function formatKES(n: number) {
  return "KES " + n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function supplierInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}
const AVATAR_COLORS = ["#C8FF00","#4ade80","#60a5fa","#f472b6","#fb923c","#a78bfa","#34d399","#f87171","#38bdf8","#fbbf24"];
function avatarColor(name: string): string {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ─── Lightbox ──────────────────────────────────────────────────────────────────
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" onClick={onClose}>
        <X className="h-5 w-5 text-white" />
      </button>
      <img src={url} alt="Invoice" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// ─── Edit Supplier Modal ───────────────────────────────────────────────────────
function EditSupplierModal({ supplier, onClose, onSaved }: { supplier: SupplierRecord; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(supplier.name);
  const [phone, setPhone] = useState(supplier.phone ?? "");
  const [notes, setNotes] = useState(supplier.notes ?? "");

  const mut = useMutation({
    mutationFn: () => customFetch(`/api/suppliers/${supplier.id}`, {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() || supplier.name, phone: phone.trim() || null, notes: notes.trim() || null }),
    }),
    onSuccess: () => { toast.success("Supplier updated"); onSaved(); onClose(); },
    onError: () => toast.error("Failed to update supplier"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold font-display">Edit Supplier</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Supplier Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Phone Number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 7XX XXX XXX" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Delivers on Tuesdays" className="h-9 text-sm" />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 h-9 text-xs" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 h-9 text-xs font-bold gap-1.5" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Invoice Modal ─────────────────────────────────────────────────────
function DeleteModal({ sessionId, onClose, onDeleted }: { sessionId: string; onClose: () => void; onDeleted: () => void }) {
  const mut = useMutation({
    mutationFn: () => customFetch(`/api/ocr/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Invoice deleted"); onDeleted(); onClose(); },
    onError: () => toast.error("Failed to delete"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-base font-bold">Delete Invoice?</h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Scan record will be removed. Inventory already applied <span className="font-semibold text-foreground">won't</span> be reversed.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-9 text-xs" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" className="flex-1 h-9 text-xs font-bold gap-1.5" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice card ─────────────────────────────────────────────────────────────
function InvoiceCard({ session, onLightbox, onDelete, onRefresh }: {
  session: ParsedSession;
  onLightbox: (url: string) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { meta } = session;
  const grandTotal = meta?.grandTotal ? Number(meta.grandTotal) : null;

  const statusCfg: Record<string, { label: string; cls: string }> = {
    applied: { label: "Applied", cls: "bg-emerald-500/15 text-emerald-400" },
    complete: { label: "Scanned", cls: "bg-blue-500/15 text-blue-400" },
    processing: { label: "Processing", cls: "bg-orange-500/15 text-orange-400" },
    pending: { label: "Pending", cls: "bg-muted text-muted-foreground" },
  };
  const sc = statusCfg[session.status] ?? statusCfg.pending;

  const { data: movements, isLoading: movLoading } = useQuery<Movement[]>({
    queryKey: ["inv-mov", session.id],
    queryFn: () => customFetch<Movement[]>(`/api/inventory-movements?referenceId=${encodeURIComponent(session.id)}&limit=100`),
    enabled: expanded,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      <button className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-muted/20 transition-colors" onClick={() => setExpanded((v) => !v)}>
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-muted/50 flex items-center justify-center">
          {session.imageUrl
            ? <img src={session.imageUrl} alt="" className="w-full h-full object-cover" />
            : <ImageIcon className="h-4 w-4 text-muted-foreground/40" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold">
              {meta?.invoiceNumber ? `#${meta.invoiceNumber}` : formatDate(session.createdAt)}
            </span>
            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", sc.cls)}>{sc.label}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {formatDate(session.createdAt)}
            {session.totalProducts > 0 && ` · ${session.totalProducts} item${session.totalProducts !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex flex-col items-end shrink-0">
          {grandTotal !== null
            ? <span className="text-sm font-bold font-mono">{formatKES(grandTotal)}</span>
            : <span className="text-xs text-muted-foreground">—</span>}
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground mt-1" /> : <ChevronDown className="h-3 w-3 text-muted-foreground mt-1" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2.5 space-y-3">
          <p className="text-[10px] text-muted-foreground">{formatDateTime(session.createdAt)}</p>

          {session.imageUrl && (
            <div className="relative rounded-lg overflow-hidden cursor-pointer group" onClick={() => onLightbox(session.imageUrl!)}>
              <img src={session.imageUrl} alt="Invoice" className="w-full max-h-40 object-contain bg-muted/30" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/10 backdrop-blur rounded-lg px-2 py-1">
                  <ZoomIn className="h-3.5 w-3.5 text-white" /><span className="text-[10px] text-white font-semibold">View Full</span>
                </div>
              </div>
            </div>
          )}

          {(meta?.invoiceNumber || meta?.invoiceDate || grandTotal !== null) && (
            <div className="grid grid-cols-2 gap-1.5">
              {meta?.invoiceNumber && <MiniChip icon={Hash} label="Invoice No." value={`#${meta.invoiceNumber}`} />}
              {meta?.invoiceDate && <MiniChip icon={Calendar} label="Date" value={formatDate(meta.invoiceDate)} />}
              {grandTotal !== null && <MiniChip icon={Banknote} label="Total" value={formatKES(grandTotal)} />}
              {session.totalProducts > 0 && <MiniChip icon={Package} label="Items" value={String(session.totalProducts)} />}
            </div>
          )}

          {movLoading && (
            <div className="flex items-center gap-2 py-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /><span className="text-[10px]">Loading items…</span>
            </div>
          )}
          {movements && movements.length > 0 && (
            <div className="space-y-1">
              {movements.slice(0, 10).map((m) => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 rounded-lg">
                  {m.qtyChange > 0
                    ? <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                    : <TrendingDown className="h-3 w-3 text-red-400 shrink-0" />}
                  <span className="text-[10px] flex-1 truncate">{m.productName}</span>
                  <span className={cn("text-[10px] font-bold font-mono shrink-0", m.qtyChange > 0 ? "text-emerald-400" : "text-red-400")}>
                    {m.qtyChange > 0 ? "+" : ""}{m.qtyChange}
                  </span>
                </div>
              ))}
              {movements.length > 10 && <p className="text-[9px] text-muted-foreground text-center pt-0.5">+{movements.length - 10} more</p>}
            </div>
          )}

          <div className="flex gap-1.5 pt-0.5">
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1 text-red-400 hover:text-red-400 hover:bg-red-500/10 border-red-500/20"
              onClick={() => onDelete(session.id)}>
              <Trash2 className="h-3 w-3" />Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-lg px-2.5 py-2">
      <div className="flex items-center gap-1 mb-0.5"><Icon className="h-2.5 w-2.5 text-muted-foreground" /><span className="text-[8px] text-muted-foreground uppercase tracking-wide font-bold">{label}</span></div>
      <p className="text-[10px] text-foreground font-semibold truncate">{value}</p>
    </div>
  );
}

// ─── Period tabs ──────────────────────────────────────────────────────────────
function PeriodTabs({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const tabs: { key: Period; label: string }[] = [
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "year", label: "Year" },
    { key: "all", label: "All" },
  ];
  return (
    <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={cn("flex-1 text-xs font-semibold rounded-lg py-1.5 transition-all",
            period === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-muted/40 rounded-xl p-3 flex-1 min-w-0">
      <div className="flex items-center gap-1.5 mb-1"><Icon className="h-3 w-3 text-muted-foreground" /><span className="text-[9px] text-muted-foreground uppercase tracking-wide font-bold">{label}</span></div>
      <p className="text-sm font-bold font-mono truncate">{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Monthly spend chart (simple bars) ────────────────────────────────────────
function SpendChart({ sessions }: { sessions: ParsedSession[] }) {
  const months = useMemo(() => {
    const now = new Date();
    const data: { label: string; spend: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM");
      const spend = sessions
        .filter((s) => s.createdAt.startsWith(key))
        .reduce((sum, s) => sum + (s.meta?.grandTotal ? Number(s.meta.grandTotal) : 0), 0);
      data.push({ label, spend });
    }
    return data;
  }, [sessions]);

  const maxSpend = Math.max(...months.map((m) => m.spend), 1);
  const hasData = months.some((m) => m.spend > 0);
  if (!hasData) return null;

  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4">
      <p className="text-xs font-bold text-foreground mb-3">Monthly Spend</p>
      <div className="flex items-end gap-1.5 h-16">
        {months.map((m) => (
          <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full rounded-t-sm transition-all" style={{
              height: `${Math.max((m.spend / maxSpend) * 100, m.spend > 0 ? 8 : 2)}%`,
              background: m.spend > 0 ? "#C8FF00" : "rgba(255,255,255,0.08)",
              minHeight: "2px",
            }} />
            <span className="text-[8px] text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SupplierDetail() {
  const params = useParams<{ supplierId: string }>();
  const supplierId = params.supplierId;
  const [, navigate] = useLocation();
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  const [period, setPeriod] = useState<Period>("all");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const qc = useQueryClient();

  const { data: rawSessions, refetch } = useListScanSessions(
    { shopId }, { query: { enabled: !!shopId, staleTime: 90_000 } },
  );
  const { data: rawSuppliers, refetch: refetchSuppliers } = useListSuppliers(
    { shopId }, { query: { enabled: !!shopId, staleTime: 5 * 60_000 } },
  );

  const supplier = (rawSuppliers ?? []).find((s: any) => s.id === supplierId) as SupplierRecord | undefined;

  const { allSessions, periodSessions, totalSpend, totalItems } = useMemo(() => {
    const all: ParsedSession[] = (rawSessions ?? [])
      .filter((s: any) => (s.supplierId ?? null) === supplierId && s.scanType === "invoice")
      .map(parseSession)
      .sort((a: ParsedSession, b: ParsedSession) => b.createdAt.localeCompare(a.createdAt));

    const filtered = all.filter((s: ParsedSession) => isInPeriod(s.createdAt, period));
    const spend = filtered.reduce((sum, s) => sum + (s.meta?.grandTotal ? Number(s.meta.grandTotal) : 0), 0);
    const items = filtered.reduce((sum, s) => sum + s.totalProducts, 0);
    return { allSessions: all, periodSessions: filtered, totalSpend: spend, totalItems: items };
  }, [rawSessions, supplierId, period]);

  function refresh() {
    refetch();
    qc.invalidateQueries({ queryKey: ["inv-mov"] });
  }

  const firstAt = allSessions.length > 0 ? allSessions[allSessions.length - 1].createdAt : null;
  const lastAt = allSessions.length > 0 ? allSessions[0].createdAt : null;

  const color = supplier ? avatarColor(supplier.name) : "#555";
  const initials = supplier ? supplierInitials(supplier.name) : "?";

  if (!supplier && rawSuppliers) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground/30" />
        <div>
          <p className="text-sm font-bold text-foreground">Supplier not found</p>
          <p className="text-xs text-muted-foreground mt-1">This supplier may have been deleted.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/invoices")} className="text-xs gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />Back to Invoices
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Modals */}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      {deleteId && <DeleteModal sessionId={deleteId} onClose={() => setDeleteId(null)} onDeleted={refresh} />}
      {showEdit && supplier && <EditSupplierModal supplier={supplier} onClose={() => setShowEdit(false)} onSaved={() => { refetchSuppliers(); }} />}

      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/invoices")} className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          {supplier
            ? <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0" style={{ background: color, color: "#0A0A0A" }}>{initials}</div>
            : <div className="w-9 h-9 rounded-xl bg-muted animate-pulse" />}
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold font-display truncate">{supplier?.name ?? "Loading…"}</h1>
            {supplier?.phone && <p className="text-[10px] text-muted-foreground">{supplier.phone}</p>}
          </div>
          {supplier && (
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => setShowEdit(true)}>
              <Pencil className="h-3 w-3" />Edit
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* Notes */}
          {supplier?.notes && (
            <div className="flex items-start gap-2 px-3 py-2.5 bg-muted/30 rounded-xl border border-border/40">
              <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">{supplier.notes}</p>
            </div>
          )}

          {/* Lifetime stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard icon={ShoppingBag} label="Total Invoices" value={String(allSessions.length)} sub="all time" />
            <StatCard icon={Banknote} label="Total Spend"
              value={allSessions.reduce((s, x) => s + (x.meta?.grandTotal ? Number(x.meta.grandTotal) : 0), 0) > 0
                ? formatKES(allSessions.reduce((s, x) => s + (x.meta?.grandTotal ? Number(x.meta.grandTotal) : 0), 0))
                : "—"} sub="all time" />
            {firstAt && <StatCard icon={Clock} label="First Delivery" value={formatDate(firstAt)} />}
            {lastAt && <StatCard icon={Calendar} label="Last Delivery" value={formatDate(lastAt)} />}
          </div>

          {/* Monthly chart */}
          {allSessions.length > 0 && <SpendChart sessions={allSessions} />}

          {/* Period tabs */}
          <PeriodTabs period={period} onChange={setPeriod} />

          {/* Period stats */}
          {periodSessions.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{periodSessions.length}</span> invoice{periodSessions.length !== 1 ? "s" : ""}
              </span>
              {totalSpend > 0 && <>
                <span className="w-px h-3 bg-border" />
                <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{formatKES(totalSpend)}</span> spend</span>
              </>}
              {totalItems > 0 && <>
                <span className="w-px h-3 bg-border" />
                <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{totalItems}</span> items</span>
              </>}
            </div>
          )}

          {/* Invoice list */}
          {periodSessions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <ShoppingBag className="h-10 w-10 text-muted-foreground/20" />
              <div>
                <p className="text-sm font-semibold text-foreground">No invoices this {period === "all" ? "period" : period}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {period !== "all" ? "Try a wider time range." : "Scan a supplier invoice to get started."}
                </p>
              </div>
              {period !== "all" && <Button variant="outline" size="sm" onClick={() => setPeriod("all")} className="text-xs">View All</Button>}
            </div>
          )}

          {periodSessions.map((session: ParsedSession) => (
            <InvoiceCard
              key={session.id}
              session={session}
              onLightbox={setLightboxUrl}
              onDelete={setDeleteId}
              onRefresh={refresh}
            />
          ))}

        </div>
      </div>
    </div>
  );
}
