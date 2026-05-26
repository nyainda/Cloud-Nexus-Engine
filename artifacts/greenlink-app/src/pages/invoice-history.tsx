import { useState, useMemo } from "react";
import { useListScanSessions, useListSuppliers, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Truck, ScanLine, Search, ChevronDown, ChevronUp,
  Building2, Hash, Calendar, Banknote, Package,
  TrendingUp, TrendingDown, ArrowRight, FileX, Loader2,
  ImageIcon, Trash2, Pencil, X, ZoomIn, Save, AlertTriangle, Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isValid } from "date-fns";
import { toast } from "sonner";

// ─── types ────────────────────────────────────────────────────────────────────

type Period = "today" | "week" | "month" | "all";

interface InvoiceMeta {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  grandTotal?: number | null;
}

interface ParsedSession {
  id: string;
  status: string;
  scanType: string;
  totalProducts: number;
  createdAt: string;
  imageUrl: string | null;
  supplierId: string | null;
  meta: InvoiceMeta | null;
}

interface SupplierRecord {
  id: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
}

interface SupplierGroup {
  key: string;
  supplier: SupplierRecord | null;
  displayName: string;
  sessions: ParsedSession[];
  totalSpend: number;
  totalItems: number;
  lastAt: string;
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
    scanType: raw.scanType,
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
    if (period === "today") return format(d, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
    if (period === "week") {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff;
    }
    if (period === "month") {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  } catch { return false; }
}

function formatDate(str: string) {
  try {
    const d = parseISO(str);
    return isValid(d) ? format(d, "MMM d") : str;
  } catch { return str; }
}

function formatDateTime(str: string) {
  try {
    const d = parseISO(str);
    return isValid(d) ? format(d, "MMM d, yyyy · h:mm a") : str;
  } catch { return str; }
}

function formatKES(n: number) {
  return "KES " + n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function supplierInitials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  "#C8FF00", "#4ade80", "#60a5fa", "#f472b6", "#fb923c",
  "#a78bfa", "#34d399", "#f87171", "#38bdf8", "#fbbf24",
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center" onClick={onClose}>
        <X className="h-5 w-5 text-white" />
      </button>
      <img src={url} alt="Scanned invoice" className="max-w-full max-h-full object-contain rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function EditModal({ session, onClose, onSaved }: { session: ParsedSession; onClose: () => void; onSaved: () => void }) {
  const [supplierName, setSupplierName] = useState(session.meta?.supplierName ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState(session.meta?.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(session.meta?.invoiceDate ?? "");
  const [grandTotal, setGrandTotal] = useState(session.meta?.grandTotal != null ? String(session.meta.grandTotal) : "");

  const mut = useMutation({
    mutationFn: () => customFetch(`/api/ocr/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        supplierName: supplierName.trim() || null,
        invoiceNumber: invoiceNumber.trim() || null,
        invoiceDate: invoiceDate.trim() || null,
        grandTotal: grandTotal.trim() ? Number(grandTotal) : null,
      }),
    }),
    onSuccess: () => { toast.success("Invoice updated"); onSaved(); onClose(); },
    onError: () => toast.error("Failed to update"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold font-display">Edit Invoice</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Supplier Name</Label>
            <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Amiran Kenya" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Invoice Number</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-001" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Invoice Date</Label>
            <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Grand Total (KES)</Label>
            <Input type="number" value={grandTotal} onChange={(e) => setGrandTotal(e.target.value)} placeholder="e.g. 45000" className="h-9 text-sm" />
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

function DeleteModal({ session, onClose, onDeleted }: { session: ParsedSession; onClose: () => void; onDeleted: () => void }) {
  const mut = useMutation({
    mutationFn: () => customFetch(`/api/ocr/sessions/${session.id}`, { method: "DELETE" }),
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
              The scan record will be deleted. Inventory movements already applied will <span className="font-semibold text-foreground">not</span> be reversed.
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

function LinkModal({
  session, suppliers, onClose, onSaved,
}: { session: ParsedSession; suppliers: SupplierRecord[]; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState<string>(session.supplierId ?? "");
  const mut = useMutation({
    mutationFn: () => customFetch(`/api/ocr/sessions/${session.id}`, {
      method: "PATCH",
      body: JSON.stringify({ supplierId: selected || null }),
    }),
    onSuccess: () => { toast.success("Invoice linked"); onSaved(); onClose(); },
    onError: () => toast.error("Failed to link"),
  });
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold font-display">Link to Supplier</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          <button
            className={cn("w-full text-left px-3 py-2 rounded-xl text-sm border transition-colors",
              !selected ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border hover:bg-muted/40")}
            onClick={() => setSelected("")}
          >
            Unlinked (none)
          </button>
          {suppliers.map((s) => (
            <button
              key={s.id}
              className={cn("w-full text-left px-3 py-2.5 rounded-xl text-sm border transition-colors flex items-center gap-2.5",
                selected === s.id ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted/40")}
              onClick={() => setSelected(s.id)}
            >
              <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 text-background"
                style={{ background: avatarColor(s.name) }}>
                {supplierInitials(s.name)}
              </span>
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 h-9 text-xs" onClick={onClose}>Cancel</Button>
          <Button className="flex-1 h-9 text-xs font-bold gap-1.5" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}Save Link
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Invoice row (inside supplier card) ───────────────────────────────────────

function InvoiceRow({
  session,
  suppliers,
  onLightbox,
  onEdit,
  onDelete,
  onLink,
}: {
  session: ParsedSession;
  suppliers: SupplierRecord[];
  onLightbox: (url: string) => void;
  onEdit: (s: ParsedSession) => void;
  onDelete: (s: ParsedSession) => void;
  onLink: (s: ParsedSession) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { meta } = session;
  const invoiceNumber = meta?.invoiceNumber;
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
    <div className="rounded-xl border border-border/50 overflow-hidden bg-background/40">
      {/* Row header */}
      <button className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-muted/20 transition-colors" onClick={() => setExpanded((v) => !v)}>
        {/* Thumbnail */}
        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-muted/50 flex items-center justify-center">
          {session.imageUrl
            ? <img src={session.imageUrl} alt="" className="w-full h-full object-cover" />
            : <ImageIcon className="h-3.5 w-3.5 text-muted-foreground/50" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground">
              {invoiceNumber ? `#${invoiceNumber}` : formatDate(session.createdAt)}
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
            ? <span className="text-xs font-bold font-mono">{formatKES(grandTotal)}</span>
            : <span className="text-xs text-muted-foreground">—</span>}
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground mt-0.5" /> : <ChevronDown className="h-3 w-3 text-muted-foreground mt-0.5" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/40 px-3 pb-3 pt-2.5 space-y-3">
          {/* Full date */}
          <p className="text-[10px] text-muted-foreground">{formatDateTime(session.createdAt)}</p>

          {/* Scanned image */}
          {session.imageUrl && (
            <div className="relative rounded-lg overflow-hidden cursor-pointer group" onClick={() => onLightbox(session.imageUrl!)}>
              <img src={session.imageUrl} alt="Invoice" className="w-full max-h-36 object-contain bg-muted/30" />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-white/10 backdrop-blur rounded-lg px-2 py-1">
                  <ZoomIn className="h-3.5 w-3.5 text-white" />
                  <span className="text-[10px] text-white font-semibold">View Full</span>
                </div>
              </div>
            </div>
          )}

          {/* Invoice meta grid */}
          {(meta?.invoiceNumber || meta?.invoiceDate || grandTotal !== null) && (
            <div className="grid grid-cols-2 gap-1.5">
              {meta?.invoiceNumber && <MiniChip icon={Hash} label="Invoice No." value={`#${meta.invoiceNumber}`} />}
              {meta?.invoiceDate && <MiniChip icon={Calendar} label="Date" value={formatDate(meta.invoiceDate)} />}
              {grandTotal !== null && <MiniChip icon={Banknote} label="Total" value={formatKES(grandTotal)} />}
              {session.totalProducts > 0 && <MiniChip icon={Package} label="Items" value={String(session.totalProducts)} />}
            </div>
          )}

          {/* Products */}
          {movLoading && (
            <div className="flex items-center gap-2 py-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px]">Loading items…</span>
            </div>
          )}
          {movements && movements.length > 0 && (
            <div className="space-y-1">
              {movements.slice(0, 8).map((m) => (
                <div key={m.id} className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 rounded-lg">
                  {m.qtyChange > 0
                    ? <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                    : <TrendingDown className="h-3 w-3 text-red-400 shrink-0" />}
                  <span className="text-[10px] flex-1 truncate text-foreground">{m.productName}</span>
                  <span className={cn("text-[10px] font-bold font-mono shrink-0", m.qtyChange > 0 ? "text-emerald-400" : "text-red-400")}>
                    {m.qtyChange > 0 ? "+" : ""}{m.qtyChange}
                  </span>
                </div>
              ))}
              {movements.length > 8 && (
                <p className="text-[9px] text-muted-foreground text-center pt-1">+{movements.length - 8} more items</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 pt-0.5">
            {!session.supplierId && (
              <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1" onClick={() => onLink(session)}>
                <Link2 className="h-3 w-3" />Link
              </Button>
            )}
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1" onClick={() => onEdit(session)}>
              <Pencil className="h-3 w-3" />Edit
            </Button>
            <Button variant="outline" size="sm" className="flex-1 h-7 text-[10px] gap-1 text-red-400 hover:text-red-400 hover:bg-red-500/10 border-red-500/20" onClick={() => onDelete(session)}>
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
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
        <span className="text-[8px] text-muted-foreground uppercase tracking-wide font-bold">{label}</span>
      </div>
      <p className="text-[10px] text-foreground font-semibold truncate">{value}</p>
    </div>
  );
}

// ─── Supplier group card ──────────────────────────────────────────────────────

function SupplierCard({
  group,
  suppliers,
  expanded,
  onToggle,
  onLightbox,
  onEdit,
  onDelete,
  onLink,
}: {
  group: SupplierGroup;
  suppliers: SupplierRecord[];
  expanded: boolean;
  onToggle: () => void;
  onLightbox: (url: string) => void;
  onEdit: (s: ParsedSession) => void;
  onDelete: (s: ParsedSession) => void;
  onLink: (s: ParsedSession) => void;
}) {
  const color = group.supplier ? avatarColor(group.supplier.name) : "#555";
  const initials = group.supplier ? supplierInitials(group.supplier.name) : "?";
  const isUnknown = group.key === "unknown";

  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
      {/* Header */}
      <button className="w-full text-left flex items-center gap-3 px-4 py-3.5 hover:bg-muted/20 transition-colors" onClick={onToggle}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
          style={{ background: color, color: isUnknown ? "#888" : "#0A0A0A" }}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{group.displayName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground">
              {group.sessions.length} invoice{group.sessions.length !== 1 ? "s" : ""}
            </span>
            {group.totalSpend > 0 && (
              <span className="text-[10px] text-muted-foreground">· {formatKES(group.totalSpend)}</span>
            )}
            {group.supplier?.phone && (
              <span className="text-[10px] text-muted-foreground">· {group.supplier.phone}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end shrink-0 gap-1">
          <span className="text-[10px] text-muted-foreground">{formatDate(group.lastAt)}</span>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Invoice list */}
      {expanded && (
        <div className="border-t border-border/50 px-3 pb-3 pt-2.5 space-y-2">
          {group.sessions.map((session) => (
            <InvoiceRow
              key={session.id}
              session={session}
              suppliers={suppliers}
              onLightbox={onLightbox}
              onEdit={onEdit}
              onDelete={onDelete}
              onLink={onLink}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Period tab bar ───────────────────────────────────────────────────────────

function PeriodTabs({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const tabs: { key: Period; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "all", label: "All" },
  ];
  return (
    <div className="flex gap-1 bg-muted/50 rounded-xl p-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "flex-1 text-xs font-semibold rounded-lg py-1.5 transition-all",
            period === t.key
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InvoiceHistory() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [period, setPeriod] = useState<Period>("month");
  const [search, setSearch] = useState("");
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editSession, setEditSession] = useState<ParsedSession | null>(null);
  const [deleteSession, setDeleteSession] = useState<ParsedSession | null>(null);
  const [linkSession, setLinkSession] = useState<ParsedSession | null>(null);

  const qc = useQueryClient();

  const { data: rawSessions, isLoading: sessLoading, refetch } = useListScanSessions(
    { shopId }, { query: { enabled: !!shopId, staleTime: 90_000 } },
  );
  const { data: rawSuppliers } = useListSuppliers(
    { shopId }, { query: { enabled: !!shopId, staleTime: 5 * 60_000 } },
  );

  const suppliers: SupplierRecord[] = (rawSuppliers ?? []) as SupplierRecord[];
  const supplierMap = useMemo(() => {
    const m = new Map<string, SupplierRecord>();
    suppliers.forEach((s) => m.set(s.id, s));
    return m;
  }, [suppliers]);

  function refresh() {
    refetch();
    qc.invalidateQueries({ queryKey: ["inv-mov"] });
    qc.invalidateQueries({ queryKey: ["listSuppliers"] });
  }

  // ── Client-side grouping (no DB hits) ──────────────────────────────────────
  const groups = useMemo<SupplierGroup[]>(() => {
    const q = search.trim().toLowerCase();

    const sessions: ParsedSession[] = (rawSessions ?? [])
      .filter((s: any) => s.scanType === "invoice")
      .map(parseSession)
      .filter((s: ParsedSession) => isInPeriod(s.createdAt, period));

    // Apply search: match supplier name or invoice #
    const filtered = q
      ? sessions.filter((s: ParsedSession) => {
          const supplier = s.supplierId ? supplierMap.get(s.supplierId) : null;
          const sName = (supplier?.name ?? s.meta?.supplierName ?? "").toLowerCase();
          const inv = (s.meta?.invoiceNumber ?? "").toLowerCase();
          return sName.includes(q) || inv.includes(q);
        })
      : sessions;

    // Group by supplierId
    const byKey = new Map<string, ParsedSession[]>();
    for (const s of filtered) {
      const key = s.supplierId ?? "unknown";
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(s);
    }

    const result: SupplierGroup[] = [];
    for (const [key, grpSessions] of byKey.entries()) {
      const sorted = [...grpSessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const supplier = key !== "unknown" ? (supplierMap.get(key) ?? null) : null;
      const totalSpend = sorted.reduce((sum, s) => sum + (s.meta?.grandTotal ? Number(s.meta.grandTotal) : 0), 0);
      const totalItems = sorted.reduce((sum, s) => sum + s.totalProducts, 0);
      result.push({
        key,
        supplier,
        displayName: supplier?.name ?? (sorted[0]?.meta?.supplierName ? sorted[0].meta.supplierName! : "Unknown Supplier"),
        sessions: sorted,
        totalSpend,
        totalItems,
        lastAt: sorted[0]?.createdAt ?? "",
      });
    }

    // Sort: known suppliers by lastAt desc, "unknown" always last
    return result.sort((a, b) => {
      if (a.key === "unknown") return 1;
      if (b.key === "unknown") return -1;
      return b.lastAt.localeCompare(a.lastAt);
    });
  }, [rawSessions, period, search, supplierMap]);

  function toggleKey(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const totalInvoices = groups.reduce((s, g) => s + g.sessions.length, 0);
  const totalSpend = groups.reduce((s, g) => s + g.totalSpend, 0);
  const isLoading = sessLoading;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Modals */}
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      {editSession && <EditModal session={editSession} onClose={() => setEditSession(null)} onSaved={refresh} />}
      {deleteSession && <DeleteModal session={deleteSession} onClose={() => setDeleteSession(null)} onDeleted={refresh} />}
      {linkSession && <LinkModal session={linkSession} suppliers={suppliers} onClose={() => setLinkSession(null)} onSaved={refresh} />}

      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold font-display">Purchase History</h1>
          </div>
          <Link href="/ocr">
            <Button size="sm" className="h-8 text-xs font-bold gap-1.5">
              <ScanLine className="h-3.5 w-3.5" />Scan Invoice
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">Supplier invoices, grouped and searchable</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3">

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search suppliers or invoice numbers…" className="pl-9 h-10 text-sm" />
          </div>

          {/* Period tabs */}
          <PeriodTabs period={period} onChange={setPeriod} />

          {/* Summary bar */}
          {!isLoading && groups.length > 0 && (
            <div className="flex items-center gap-3 px-1">
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{groups.filter((g) => g.key !== "unknown").length}</span> supplier{groups.filter((g) => g.key !== "unknown").length !== 1 ? "s" : ""}
              </span>
              <span className="w-px h-3 bg-border" />
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{totalInvoices}</span> invoice{totalInvoices !== 1 ? "s" : ""}
              </span>
              {totalSpend > 0 && (
                <>
                  <span className="w-px h-3 bg-border" />
                  <span className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{formatKES(totalSpend)}</span> spend
                  </span>
                </>
              )}
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Loading invoices…</p>
            </div>
          )}

          {/* Empty states */}
          {!isLoading && groups.length === 0 && !search && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Truck className="h-8 w-8 text-primary/60" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">
                  {period !== "all" ? `No invoices this ${period === "today" ? "day" : period}` : "No invoices yet"}
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {period !== "all" ? "Try a wider time range, or scan a new invoice." : "Scan a supplier invoice to start tracking purchase history."}
                </p>
              </div>
              <div className="flex gap-2">
                {period !== "all" && (
                  <Button variant="outline" size="sm" onClick={() => setPeriod("all")} className="text-xs">View All</Button>
                )}
                <Link href="/ocr">
                  <Button className="gap-2 font-bold text-xs">
                    <ScanLine className="h-3.5 w-3.5" />Scan Invoice<ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {!isLoading && groups.length === 0 && search && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
              <FileX className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-semibold text-foreground">No results for "{search}"</p>
                <p className="text-xs text-muted-foreground mt-0.5">Try a different supplier name or invoice number</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSearch("")} className="text-xs">Clear search</Button>
            </div>
          )}

          {/* Supplier groups */}
          {!isLoading && groups.map((group) => (
            <SupplierCard
              key={group.key}
              group={group}
              suppliers={suppliers}
              expanded={expandedKeys.has(group.key)}
              onToggle={() => toggleKey(group.key)}
              onLightbox={setLightboxUrl}
              onEdit={setEditSession}
              onDelete={setDeleteSession}
              onLink={setLinkSession}
            />
          ))}

        </div>
      </div>
    </div>
  );
}
