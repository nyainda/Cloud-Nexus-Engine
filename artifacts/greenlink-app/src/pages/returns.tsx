import { useState, useMemo, useEffect, useCallback } from "react";
import { useListProducts, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, Search, Package, Minus, Plus, X, CheckCircle2,
  ChevronDown, ChevronUp, AlertCircle, ChevronLeft, ChevronRight,
  Calendar, TrendingDown, Clock, Receipt, User, Tag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "KES " + Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}

function prevDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nextDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Inline Return Form ───────────────────────────────────────────────────────
function ReturnForm({
  product,
  onClose,
  onDone,
}: {
  product: any;
  onClose: () => void;
  onDone: (result: { qty: number; refund: number }) => void;
}) {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState<number>(product.sellingPrice ?? 0);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const refund = qty * unitPrice;

  async function handleSubmit() {
    if (qty <= 0) return;
    setLoading(true);
    try {
      await customFetch("/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          productId: product.id,
          productName: product.canonicalName,
          qty,
          unitPrice,
          reason: reason.trim() || undefined,
          processedBy: role,
        }),
      });
      toast.success(`Return processed — ${qty} × ${product.canonicalName} · ${fmt(refund)} refund`);
      onDone({ qty, refund });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to process return");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-amber-400/30 bg-amber-50/5 px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-500">Return Details</p>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Qty */}
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Qty to Return</Label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQty(q => Math.max(1, q - 1))}
            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="text-2xl font-bold font-mono w-10 text-center text-amber-500">{qty}</span>
          <button
            onClick={() => setQty(q => q + 1)}
            className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground ml-1">units</span>
        </div>
      </div>

      {/* Unit price */}
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Unit Price at Sale <span className="text-muted-foreground/50">(edit if different)</span>
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">KES</span>
          <input
            type="number"
            min={0}
            value={unitPrice}
            onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
            className="flex h-10 w-full rounded-lg border border-border bg-background pl-14 pr-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/60"
          />
        </div>
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reason (optional)</Label>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Wrong product, expired, defective…"
          className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60"
        />
      </div>

      {/* Refund total */}
      <div className="rounded-lg border border-amber-400/40 bg-amber-50/5 p-3 flex justify-between items-center">
        <span className="text-sm font-bold text-amber-500">Total Refund</span>
        <span className="text-xl font-bold font-mono text-amber-500">{fmt(refund)}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={loading || qty <= 0}
          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
          {loading ? "Processing…" : "Confirm Return"}
        </Button>
      </div>
    </div>
  );
}

// ─── Product Search Card ───────────────────────────────────────────────────────
function ProductCard({ product, onDone }: { product: any; onDone: () => void }) {
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [open, setOpen] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const stock = product.stockQty ?? 0;

  function handleDone() {
    setOpen(false);
    setJustDone(true);
    qc.invalidateQueries({ queryKey: ["listProducts", { shopId }] });
    qc.invalidateQueries({ queryKey: ["listProducts"] });
    onDone();
    setTimeout(() => setJustDone(false), 3000);
  }

  return (
    <Card className={cn(
      "shadow-none overflow-hidden transition-all duration-200",
      open ? "border-amber-400/60" : justDone ? "border-emerald-400/50" : "border-border"
    )}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left">
        <CardContent className="p-3 flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
            open ? "border-amber-400/60 bg-amber-50/10" : "border-border bg-muted/30"
          )}>
            {justDone
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <Package className={cn("h-4 w-4", open ? "text-amber-500" : "text-muted-foreground")} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{product.canonicalName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {product.category && <span className="text-[10px] text-muted-foreground">{product.category}</span>}
              <span className={cn(
                "text-[10px] font-bold",
                stock <= 0 ? "text-destructive" : stock <= (product.alertQty ?? 5) ? "text-amber-500" : "text-emerald-500"
              )}>
                {stock <= 0 ? "Out of stock" : `Stock: ${stock}`}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold font-mono">{fmt(product.sellingPrice)}</p>
            {justDone && <p className="text-[10px] text-emerald-500 font-semibold">Returned ✓</p>}
          </div>
          <div className="shrink-0">
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardContent>
      </button>
      {open && <ReturnForm product={product} onClose={() => setOpen(false)} onDone={handleDone} />}
    </Card>
  );
}

// ─── Return History Card ───────────────────────────────────────────────────────
function ReturnHistoryCard({ ret }: { ret: any }) {
  const [expanded, setExpanded] = useState(false);

  const items: Array<{ productName: string; qty: number; unitPrice: number; refundAmount: number }> =
    useMemo(() => {
      try { return JSON.parse(ret.itemsJson ?? "[]"); } catch { return []; }
    }, [ret.itemsJson]);

  const isSaleReturn = ret.saleId && ret.saleId !== "standalone";
  const timeStr = fmtTime(ret.createdAt);

  return (
    <Card className="shadow-none overflow-hidden border-border hover:border-amber-400/40 transition-colors">
      <button className="w-full text-left" onClick={() => setExpanded(e => !e)}>
        <CardContent className="p-3.5">
          <div className="flex items-start gap-3">
            {/* Time badge */}
            <div className="shrink-0 flex flex-col items-center">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-400/30 flex flex-col items-center justify-center">
                <Clock className="h-3 w-3 text-amber-500 mb-0.5" />
                <span className="text-[9px] font-bold text-amber-500 leading-none">
                  {timeStr.replace(" AM", "").replace(" PM", "").replace(" am", "").replace(" pm", "")}
                </span>
                <span className="text-[7px] text-amber-400/70 leading-none uppercase">
                  {new Date(ret.createdAt).getHours() >= 12 ? "PM" : "AM"}
                </span>
              </div>
            </div>

            {/* Main info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-foreground">
                  {items.length === 1
                    ? items[0].productName
                    : `${items.length} products returned`}
                </span>
                {isSaleReturn && (
                  <Badge variant="outline" className="text-[9px] border-blue-400/40 text-blue-400 py-0 px-1.5 h-4">
                    From Sale
                  </Badge>
                )}
              </div>

              {/* Item preview */}
              {items.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {items.slice(0, expanded ? items.length : 2).map((it, i) => (
                    <span key={i} className="text-[10px] bg-muted/60 rounded-md px-1.5 py-0.5 text-muted-foreground font-medium">
                      {it.qty}× {it.productName.length > 22 ? it.productName.slice(0, 22) + "…" : it.productName}
                    </span>
                  ))}
                  {!expanded && items.length > 2 && (
                    <span className="text-[10px] text-amber-500 font-semibold px-1">+{items.length - 2} more</span>
                  )}
                </div>
              )}

              {/* Meta row */}
              <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                {ret.reason && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Tag className="h-2.5 w-2.5" />
                    {ret.reason}
                  </span>
                )}
                {ret.processedBy && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <User className="h-2.5 w-2.5" />
                    {ret.processedBy}
                  </span>
                )}
              </div>
            </div>

            {/* Refund amount */}
            <div className="text-right shrink-0">
              <p className="text-base font-bold font-mono text-amber-500">
                {fmt(ret.totalRefund)}
              </p>
              <p className="text-[10px] text-muted-foreground">refunded</p>
            </div>
          </div>

          {/* Expanded: full line items */}
          {expanded && items.length > 1 && (
            <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-foreground font-medium flex-1 min-w-0 truncate pr-2">{it.productName}</span>
                  <span className="text-muted-foreground mr-3 shrink-0">{it.qty} × {fmt(it.unitPrice)}</span>
                  <span className="font-bold font-mono text-amber-500 shrink-0">{fmt(it.refundAmount)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </button>
    </Card>
  );
}

// ─── Returns Page ─────────────────────────────────────────────────────────────
export default function ReturnsPage() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const qc = useQueryClient();

  // Date navigation
  const [date, setDate] = useState(isoToday);
  const isToday = date === isoToday();
  const canGoNext = date < isoToday();

  // Search state
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const showSearch = searchFocused || query.trim().length > 0;

  // Returns history
  const { data: returnHistory, isLoading: histLoading, refetch } = useQuery({
    queryKey: ["returns", shopId, date],
    queryFn: () => customFetch(`/returns?shopId=${shopId}&date=${date}`),
    enabled: !!shopId,
    refetchInterval: 30_000,
  });

  const returns: any[] = returnHistory as any[] ?? [];

  const totalRefunded = returns.reduce((s: number, r: any) => s + (r.totalRefund ?? 0), 0);
  const totalItems = returns.reduce((s: number, r: any) => {
    try { return s + JSON.parse(r.itemsJson ?? "[]").length; } catch { return s; }
  }, 0);

  // Products for search
  const { data: products } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId } }
  );

  const filtered = useMemo(() => {
    const all = (products || []) as any[];
    if (!query.trim()) return [];
    const q = normalize(query);
    return all
      .filter(p => {
        const name = normalize(p.canonicalName ?? "");
        const cat = normalize(p.category ?? "");
        const sku = normalize(p.sku ?? "");
        return name.includes(q) || cat.includes(q) || sku.includes(q) ||
          q.split(" ").every(word => name.includes(word));
      })
      .slice(0, 20);
  }, [products, query]);

  const handleReturnDone = useCallback(() => {
    setQuery("");
    setSearchFocused(false);
    refetch();
    qc.invalidateQueries({ queryKey: ["returns", shopId, date] });
  }, [refetch, qc, shopId, date]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        {/* Title + Date Nav */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
                <RotateCcw className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground leading-tight font-display">Returns</h1>
                <p className="text-[10px] text-muted-foreground leading-none">
                  {isToday ? "Today" : fmtDate(date)}
                </p>
              </div>
            </div>

            {/* Date navigator */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setDate(d => prevDay(d))}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDate(isoToday)}
                className={cn(
                  "h-8 px-2.5 rounded-lg border text-xs font-bold transition-colors",
                  isToday
                    ? "border-amber-400/60 bg-amber-500/10 text-amber-500"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {isToday ? "Today" : <Calendar className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setDate(d => nextDay(d))}
                disabled={!canGoNext}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Stats strip */}
          {!histLoading && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-center">
                <p className="text-lg font-bold font-mono text-foreground leading-none">{returns.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Returns</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-center">
                <p className="text-lg font-bold font-mono text-foreground leading-none">{totalItems}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Items</p>
              </div>
              <div className="rounded-xl border border-amber-400/30 bg-amber-50/5 px-3 py-2 text-center">
                <p className="text-sm font-bold font-mono text-amber-500 leading-none">
                  {totalRefunded > 0
                    ? "KES " + totalRefunded.toLocaleString("en-KE", { maximumFractionDigits: 0 })
                    : "—"}
                </p>
                <p className="text-[10px] text-amber-400/70 mt-0.5">Refunded</p>
              </div>
            </div>
          )}

          {/* Search bar — Process New Return */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => { if (!query.trim()) setSearchFocused(false); }}
              placeholder="Search product to process a return…"
              className="flex h-11 w-full rounded-xl border border-border bg-muted/30 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400/60 transition-colors"
            />
            {(query || showSearch) && (
              <button
                onMouseDown={e => { e.preventDefault(); setQuery(""); setSearchFocused(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 px-4 py-3 space-y-2 pb-6">

        {/* ── Search results panel ── */}
        {showSearch && (
          <div className="space-y-2">
            {!query.trim() ? (
              <div className="rounded-xl border border-dashed border-amber-400/30 bg-amber-50/5 p-4 text-center">
                <p className="text-sm font-semibold text-amber-500">Type a product name to search</p>
                <p className="text-xs text-muted-foreground mt-1">You can return some items and leave others — set qty per product</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <AlertCircle className="h-6 w-6 opacity-30 mb-2" />
                <p className="text-sm font-semibold">No products found</p>
                <p className="text-xs mt-0.5">Try a different name or category</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
                  <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-500">Tap to return</Badge>
                </div>
                {filtered.map((p: any) => (
                  <ProductCard key={p.id} product={p} onDone={handleReturnDone} />
                ))}
              </>
            )}
            <div className="h-px bg-border/60 my-3" />
          </div>
        )}

        {/* ── History section ── */}
        {!showSearch && (
          <>
            {histLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 rounded-xl border border-border bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : returns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 border border-border flex items-center justify-center mb-4">
                  <RotateCcw className="h-7 w-7 opacity-20" />
                </div>
                <p className="font-bold text-foreground/60">
                  {isToday ? "No returns today" : `No returns on ${fmtDate(date)}`}
                </p>
                <p className="text-sm mt-1 text-center max-w-xs">
                  {isToday
                    ? "Search above to process a return from a customer"
                    : "Use the arrows above to browse other dates"}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1 mb-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground/60">
                    {isToday ? "Today's Returns" : fmtDate(date)}
                  </p>
                  <button
                    onClick={() => refetch()}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="h-2.5 w-2.5" /> Refresh
                  </button>
                </div>
                {returns.map((ret: any) => (
                  <ReturnHistoryCard key={ret.id} ret={ret} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
