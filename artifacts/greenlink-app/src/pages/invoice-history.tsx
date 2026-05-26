import { useState, useMemo } from "react";
import { useListScanSessions, customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Truck, ScanLine, Search, ChevronDown, ChevronUp,
  Building2, Hash, Calendar, Banknote, Package,
  TrendingDown, TrendingUp, ArrowRight, FileX, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, isValid } from "date-fns";

// ─── types ────────────────────────────────────────────────────────────────────

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
  meta: InvoiceMeta | null;
}

interface Movement {
  id: string;
  productId: string;
  productName: string;
  movementType: string;
  qtyChange: number;
  beforeQty: number;
  afterQty: number;
  createdAt: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseSession(raw: any): ParsedSession {
  let meta: InvoiceMeta | null = null;
  try {
    if (raw.resultJson) {
      const p = JSON.parse(raw.resultJson);
      // Applied sessions: { applied, invoiceMeta }
      // Scanned sessions: { items, meta }
      meta = p.invoiceMeta ?? p.meta ?? null;
    }
  } catch {}
  return {
    id: raw.id,
    status: raw.status,
    scanType: raw.scanType,
    totalProducts: raw.totalProducts ?? 0,
    createdAt: raw.createdAt,
    meta,
  };
}

function formatDate(str: string) {
  try {
    const d = parseISO(str);
    if (!isValid(d)) return str;
    return format(d, "MMM d, yyyy");
  } catch { return str; }
}

function formatTime(str: string) {
  try {
    const d = parseISO(str);
    if (!isValid(d)) return "";
    return format(d, "h:mm a");
  } catch { return ""; }
}

function formatKES(n: number) {
  return "KES " + n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function groupByMonth(sessions: ParsedSession[]) {
  const groups: Record<string, ParsedSession[]> = {};
  for (const s of sessions) {
    try {
      const d = parseISO(s.createdAt);
      const key = isValid(d) ? format(d, "MMMM yyyy") : "Unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    } catch {
      if (!groups["Unknown"]) groups["Unknown"] = [];
      groups["Unknown"].push(s);
    }
  }
  return groups;
}

// ─── SessionMovements — lazy loaded per session ───────────────────────────────

function SessionMovements({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useQuery<Movement[]>({
    queryKey: ["invoice-movements", sessionId],
    queryFn: () =>
      customFetch<Movement[]>(`/api/inventory-movements?referenceId=${encodeURIComponent(sessionId)}&limit=100`),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-xs">Loading items…</span>
      </div>
    );
  }

  if (!data?.length) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        No inventory movements recorded for this session.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {data.map((m) => {
        const priceIncrease = m.qtyChange > 0;
        return (
          <div key={m.id} className="flex items-center gap-3 bg-background/60 rounded-lg px-3 py-2.5">
            <div className={cn(
              "w-7 h-7 rounded-lg flex items-center justify-center shrink-0",
              priceIncrease ? "bg-emerald-500/15" : "bg-red-500/15",
            )}>
              {priceIncrease
                ? <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                : <TrendingDown className="h-3.5 w-3.5 text-red-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{m.productName}</p>
              <p className="text-[10px] text-muted-foreground">
                {m.beforeQty} → {m.afterQty} units
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className={cn(
                "text-xs font-bold font-mono",
                priceIncrease ? "text-emerald-400" : "text-red-400",
              )}>
                {priceIncrease ? "+" : ""}{m.qtyChange}
              </p>
              <p className="text-[9px] text-muted-foreground uppercase">units</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── InvoiceCard ──────────────────────────────────────────────────────────────

function InvoiceCard({ session }: { session: ParsedSession }) {
  const [expanded, setExpanded] = useState(false);
  const { meta } = session;

  const supplierName = meta?.supplierName || null;
  const invoiceNumber = meta?.invoiceNumber || null;
  const invoiceDate = meta?.invoiceDate || null;
  const grandTotal = meta?.grandTotal ? Number(meta.grandTotal) : null;

  const statusConfig = {
    applied: { label: "Applied", cls: "bg-emerald-500/15 text-emerald-400" },
    complete: { label: "Scanned", cls: "bg-blue-500/15 text-blue-400" },
    processing: { label: "Processing", cls: "bg-orange-500/15 text-orange-400" },
    pending: { label: "Pending", cls: "bg-muted text-muted-foreground" },
  };
  const statusCfg = statusConfig[session.status as keyof typeof statusConfig] ?? statusConfig.pending;

  return (
    <div className="bg-card border border-border/60 rounded-2xl overflow-hidden">
      {/* Card header — always visible */}
      <button
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Truck className="h-5 w-5 text-primary" />
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-foreground truncate">
              {supplierName ?? "Unknown Supplier"}
            </span>
            <span className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
              statusCfg.cls,
            )}>
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {invoiceNumber && (
              <span className="text-[10px] text-muted-foreground font-mono">#{invoiceNumber}</span>
            )}
            <span className="text-[10px] text-muted-foreground">
              {formatDate(session.createdAt)} · {formatTime(session.createdAt)}
            </span>
            {session.totalProducts > 0 && (
              <span className="text-[10px] text-muted-foreground">
                · {session.totalProducts} item{session.totalProducts !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Right side: total + chevron */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          {grandTotal !== null ? (
            <span className="text-sm font-bold font-mono text-foreground">
              {formatKES(grandTotal)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/60 px-4 pb-4 pt-3 space-y-4">

          {/* Invoice meta grid */}
          {(supplierName || invoiceNumber || invoiceDate || grandTotal !== null) && (
            <div className="grid grid-cols-2 gap-2">
              {supplierName && (
                <MetaChip icon={Building2} label="Supplier" value={supplierName} />
              )}
              {invoiceNumber && (
                <MetaChip icon={Hash} label="Invoice No." value={`#${invoiceNumber}`} mono />
              )}
              {invoiceDate && (
                <MetaChip icon={Calendar} label="Invoice Date" value={formatDate(invoiceDate)} />
              )}
              {grandTotal !== null && (
                <MetaChip icon={Banknote} label="Grand Total" value={formatKES(grandTotal)} mono />
              )}
            </div>
          )}

          {/* Products restocked */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Products Restocked
              </span>
            </div>
            <SessionMovements sessionId={session.id} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetaChip({
  icon: Icon, label, value, mono,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-muted/40 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="text-[9px] text-muted-foreground uppercase tracking-wide font-bold">{label}</span>
      </div>
      <p className={cn("text-xs text-foreground font-semibold truncate", mono && "font-mono")}>{value}</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InvoiceHistory() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [search, setSearch] = useState("");

  const { data: rawSessions, isLoading } = useListScanSessions(
    { shopId },
    { query: { enabled: !!shopId } },
  );

  // Filter to invoice type only, parse resultJson, apply search
  const sessions = useMemo<ParsedSession[]>(() => {
    const all = (rawSessions ?? [])
      .filter((s: any) => s.scanType === "invoice")
      .map(parseSession)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((s) =>
      (s.meta?.supplierName ?? "").toLowerCase().includes(q) ||
      (s.meta?.invoiceNumber ?? "").toLowerCase().includes(q),
    );
  }, [rawSessions, search]);

  const grouped = useMemo(() => groupByMonth(sessions), [sessions]);
  const months = Object.keys(grouped);

  // Summary stats
  const totalApplied = sessions.filter((s) => s.status === "applied").length;
  const totalItems = sessions.reduce((sum, s) => sum + s.totalProducts, 0);
  const totalSpend = sessions.reduce((sum, s) => {
    const t = s.meta?.grandTotal ? Number(s.meta.grandTotal) : 0;
    return sum + t;
  }, 0);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold font-display">Purchase History</h1>
          </div>
          <Link href="/ocr">
            <Button size="sm" className="h-8 text-xs font-bold gap-1.5">
              <ScanLine className="h-3.5 w-3.5" />
              Scan Invoice
            </Button>
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">All scanned supplier invoices and restocks</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* Summary stats */}
          {sessions.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              <StatCard label="Invoices" value={String(totalApplied)} sub="applied" />
              <StatCard label="Products" value={String(totalItems)} sub="restocked" />
              <StatCard
                label="Total Spend"
                value={totalSpend > 0 ? "KES " + totalSpend.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
                sub="recorded"
                small={totalSpend > 99999}
              />
            </div>
          )}

          {/* Search bar */}
          {sessions.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by supplier or invoice number…"
                className="pl-9 h-10 text-sm"
              />
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Loading invoices…</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && sessions.length === 0 && !search && (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Truck className="h-8 w-8 text-primary/60" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground mb-1">No invoices yet</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Scan your first supplier invoice to start tracking purchase history and restocking automatically.
                </p>
              </div>
              <Link href="/ocr">
                <Button className="gap-2 font-bold">
                  <ScanLine className="h-4 w-4" />
                  Scan First Invoice
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          )}

          {/* No search results */}
          {!isLoading && sessions.length === 0 && search && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-6">
              <FileX className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="text-sm font-semibold text-foreground">No results for "{search}"</p>
                <p className="text-xs text-muted-foreground mt-0.5">Try a different supplier name or invoice number</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSearch("")} className="text-xs">
                Clear search
              </Button>
            </div>
          )}

          {/* Grouped invoice list */}
          {!isLoading && months.map((month) => (
            <div key={month}>
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{month}</p>
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-[10px] text-muted-foreground">{grouped[month].length} invoice{grouped[month].length !== 1 ? "s" : ""}</span>
              </div>
              <div className="space-y-2">
                {grouped[month].map((session) => (
                  <InvoiceCard key={session.id} session={session} />
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, small }: { label: string; value: string; sub: string; small?: boolean }) {
  return (
    <div className="bg-card border border-border/60 rounded-xl p-3 text-center">
      <p className={cn(
        "font-bold font-mono text-foreground leading-tight",
        small ? "text-sm" : "text-lg",
      )}>
        {value}
      </p>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</p>
      <p className="text-[9px] text-muted-foreground/60">{sub}</p>
    </div>
  );
}
