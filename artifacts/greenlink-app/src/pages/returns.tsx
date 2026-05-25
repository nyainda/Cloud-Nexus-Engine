import { useState, useMemo, useCallback } from "react";
import { useListProducts, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatKES } from "@/lib/format";
import {
  RotateCcw, Search, Package, Minus, Plus, X, CheckCircle2,
  ChevronLeft, ChevronRight, TrendingDown, Clock, Receipt,
  User, Tag, AlertCircle, ArrowUpLeft, ShoppingBag,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function prevDay(iso: string) {
  return format(subDays(new Date(iso + "T12:00:00"), 1), "yyyy-MM-dd");
}

function nextDay(iso: string) {
  return format(subDays(new Date(iso + "T12:00:00"), -1), "yyyy-MM-dd");
}

function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-KE", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
}

// ─── Inline Return Form ────────────────────────────────────────────────────────
function ReturnForm({ product, onClose, onDone }: {
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
      const res = await customFetch("/api/returns", {
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        throw new Error(err?.error ?? "Failed to process return");
      }
      toast.success(`Return processed — ${qty}× ${product.canonicalName}`);
      onDone({ qty, refund });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to process return");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-border bg-muted/10 px-4 py-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Return Details
        </p>
        <button onClick={onClose} className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Qty */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Qty to Return</p>
          <div className="flex items-center bg-muted/40 rounded-xl border border-border">
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              className="w-9 h-9 flex items-center justify-center rounded-l-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30"
              disabled={qty <= 1}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="flex-1 text-center text-lg font-bold font-mono text-primary">{qty}</span>
            <button
              onClick={() => setQty(q => q + 1)}
              className="w-9 h-9 flex items-center justify-center rounded-r-xl text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Unit price */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unit Price</p>
          <div className="flex items-center bg-muted/40 rounded-xl border border-border px-3 h-9">
            <span className="text-xs text-muted-foreground font-mono mr-1">KES</span>
            <input
              type="number"
              min={0}
              value={unitPrice}
              onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
              className="flex-1 bg-transparent text-sm font-mono font-bold focus:outline-none text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reason (optional)</p>
        <input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Wrong product, expired, defective…"
          className="w-full h-9 px-3 text-sm bg-muted/40 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
        />
      </div>

      {/* Refund total */}
      <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Refund</p>
          <p className="text-[10px] text-muted-foreground">{qty} × {formatKES(unitPrice)}</p>
        </div>
        <span className="text-xl font-bold font-mono text-primary">{formatKES(refund)}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 h-10 rounded-xl border border-border text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || qty <= 0}
          className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
        >
          {loading ? (
            <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          {loading ? "Processing…" : "Confirm Return"}
        </button>
      </div>
    </div>
  );
}

// ─── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product, onDone }: { product: any; onDone: () => void }) {
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [open, setOpen] = useState(false);
  const [justDone, setJustDone] = useState(false);
  const stock = product.stockQty ?? 0;

  function handleDone() {
    setOpen(false);
    setJustDone(true);
    qc.invalidateQueries({ queryKey: ["returns"] });
    qc.invalidateQueries({ queryKey: ["listProducts", { shopId }] });
    onDone();
    setTimeout(() => setJustDone(false), 4000);
  }

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all duration-200",
      justDone ? "border-emerald-500/40 bg-emerald-500/5"
        : open ? "border-primary/40 bg-primary/5"
        : "border-border bg-card"
    )}>
      <button onClick={() => !justDone && setOpen(o => !o)} className="w-full text-left p-3.5">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors",
            justDone ? "bg-emerald-500/15" : open ? "bg-primary/15" : "bg-muted/40"
          )}>
            {justDone
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <Package className={cn("h-4 w-4", open ? "text-primary" : "text-muted-foreground")} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{product.canonicalName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {product.category && <span className="text-[10px] text-muted-foreground">{product.category}</span>}
              <span className={cn(
                "text-[10px] font-bold",
                stock <= 0 ? "text-destructive" : stock <= (product.alertQty ?? 5) ? "text-orange-400" : "text-emerald-500"
              )}>
                {stock <= 0 ? "Out of stock" : `${stock} in stock`}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold font-mono">{formatKES(product.sellingPrice)}</p>
            {justDone && <p className="text-[10px] text-emerald-500 font-bold">Returned ✓</p>}
          </div>
        </div>
      </button>
      {open && <ReturnForm product={product} onClose={() => setOpen(false)} onDone={handleDone} />}
    </div>
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

  return (
    <button
      onClick={() => setExpanded(e => !e)}
      className="w-full text-left bg-card border border-border rounded-xl overflow-hidden hover:border-primary/20 transition-all"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Time */}
          <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border flex flex-col items-center justify-center shrink-0">
            <Clock className="h-3 w-3 text-muted-foreground mb-0.5" />
            <span className="text-[9px] font-bold text-foreground leading-none">
              {fmtTime(ret.createdAt).split(" ")[0]}
            </span>
            <span className="text-[7px] text-muted-foreground leading-none uppercase">
              {new Date(ret.createdAt).getHours() >= 12 ? "PM" : "AM"}
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-bold">
                {items.length === 1 ? items[0].productName : `${items.length} products`}
              </p>
              {isSaleReturn && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-400">
                  From Sale
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1 mb-1">
              {items.slice(0, expanded ? items.length : 2).map((it, i) => (
                <span key={i} className="text-[10px] bg-muted/60 rounded-md px-1.5 py-0.5 text-muted-foreground font-medium">
                  {it.qty}× {it.productName.length > 22 ? it.productName.slice(0, 22) + "…" : it.productName}
                </span>
              ))}
              {!expanded && items.length > 2 && (
                <span className="text-[10px] text-primary font-bold px-1">+{items.length - 2} more</span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {ret.reason && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Tag className="h-2.5 w-2.5" />{ret.reason}
                </span>
              )}
              {ret.processedBy && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <User className="h-2.5 w-2.5" />{ret.processedBy}
                </span>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="text-right shrink-0">
            <p className="text-sm font-bold font-mono text-primary">{formatKES(ret.totalRefund)}</p>
            <p className="text-[10px] text-muted-foreground">refund</p>
          </div>
        </div>

        {expanded && items.length > 1 && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-medium flex-1 min-w-0 truncate pr-2">{it.productName}</span>
                <span className="text-muted-foreground mr-3 shrink-0">{it.qty} × {formatKES(it.unitPrice)}</span>
                <span className="font-bold font-mono text-primary shrink-0">{formatKES(it.refundAmount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Returns Page ──────────────────────────────────────────────────────────────
export default function ReturnsPage() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const qc = useQueryClient();

  const [date, setDate] = useState(isoToday);
  const isToday = date === isoToday();
  const canGoNext = date < isoToday();

  const [query, setQuery] = useState("");

  // ── FIXED: properly parse JSON response ────────────────────────────────────
  const { data: returnHistory, isLoading: histLoading, refetch } = useQuery<any[]>({
    queryKey: ["returns", shopId, date],
    queryFn: async () => {
      const res = await customFetch(`/api/returns?shopId=${shopId}&date=${date}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!shopId,
    refetchInterval: 30_000,
  });

  const returns: any[] = returnHistory ?? [];
  const totalRefunded = returns.reduce((s, r) => s + (r.totalRefund ?? 0), 0);
  const totalItemCount = returns.reduce((s: number, r: any) => {
    try { return s + JSON.parse(r.itemsJson ?? "[]").length; } catch { return s; }
  }, 0);

  const { data: productsData } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId } }
  );

  const filtered = useMemo(() => {
    const all = (productsData?.products ?? []) as any[];
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
  }, [productsData, query]);

  const handleReturnDone = useCallback(() => {
    setQuery("");
    refetch();
    qc.invalidateQueries({ queryKey: ["returns", shopId, date] });
  }, [refetch, qc, shopId, date]);

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border bg-card shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-display">Returns</h1>
              <p className="text-[10px] text-muted-foreground">
                {isToday ? "Today" : fmtDate(date)}
              </p>
            </div>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDate(d => prevDay(d))}
              className="w-8 h-8 rounded-lg border border-border bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDate(isoToday)}
              className={cn(
                "h-8 px-3 rounded-lg border text-xs font-bold transition-colors",
                isToday
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {isToday ? "Today" : "Go to Today"}
            </button>
            <button
              onClick={() => setDate(d => nextDay(d))}
              disabled={!canGoNext}
              className="w-8 h-8 rounded-lg border border-border bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats strip */}
        {!histLoading && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-center">
              <p className="text-xl font-bold font-mono">{returns.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Returns</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-center">
              <p className="text-xl font-bold font-mono">{totalItemCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Items</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-center">
              <p className="text-sm font-bold font-mono text-primary leading-none mt-0.5">
                {totalRefunded > 0 ? formatKES(totalRefunded) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Refunded</p>
            </div>
          </div>
        )}

        {/* Search — process new return */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search product to process a return…"
            className="w-full h-10 pl-9 pr-9 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3 pb-6">

        {/* Search results */}
        {query.trim() ? (
          <>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                <AlertCircle className="h-6 w-6 opacity-20" />
                <p className="text-sm font-semibold">No products found</p>
                <p className="text-xs">Try a different name or category</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-1">
                  <p className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</p>
                  <span className="text-[10px] font-bold text-primary flex items-center gap-1">
                    <ArrowUpLeft className="h-3 w-3" />
                    Tap to return
                  </span>
                </div>
                {filtered.map((p: any) => (
                  <ProductCard key={p.id} product={p} onDone={handleReturnDone} />
                ))}
              </>
            )}
          </>
        ) : (
          <>
            {/* Hint box */}
            <div className="flex items-start gap-3 bg-muted/20 border border-border/60 rounded-xl p-4">
              <ShoppingBag className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold">Process a Return</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  Search for any product above. Stock is automatically restored and a refund record is created.
                  To return against a specific sale, use the Return button in Sales History.
                </p>
              </div>
            </div>

            {/* History */}
            {histLoading ? (
              <div className="space-y-2 mt-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-20 rounded-xl border border-border bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : returns.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <TrendingDown className="h-10 w-10 opacity-10" />
                <p className="text-sm font-semibold">No returns {isToday ? "today" : "on this day"}</p>
                <p className="text-xs opacity-60">Use the search above to process a return</p>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-0.5">
                  Return History
                </p>
                <div className="space-y-2">
                  {returns.map((r: any) => (
                    <ReturnHistoryCard key={r.id} ret={r} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
