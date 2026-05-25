import { useState, useMemo } from "react";
import { useListProducts, customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RotateCcw, Search, Package, Minus, Plus, X, CheckCircle2,
  ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "KES " + Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function normalize(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
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
      toast.success(
        `Return processed — ${qty} × ${product.canonicalName} · ${fmt(refund)} refund`
      );
      onDone({ qty, refund });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to process return");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-border bg-muted/20 px-4 py-4 space-y-4">
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
        <Button variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
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

// ─── Product Card ─────────────────────────────────────────────────────────────
function ProductCard({ product }: { product: any }) {
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [open, setOpen] = useState(false);
  const [justDone, setJustDone] = useState<{ qty: number; refund: number } | null>(null);

  const stock = product.stockQty ?? 0;

  function handleDone(result: { qty: number; refund: number }) {
    setOpen(false);
    setJustDone(result);
    // Invalidate products so stock updates everywhere
    qc.invalidateQueries({ queryKey: ["listProducts", { shopId }] });
    qc.invalidateQueries({ queryKey: ["listProducts"] });
    setTimeout(() => setJustDone(null), 4000);
  }

  return (
    <Card className={cn(
      "shadow-none overflow-hidden transition-colors",
      open ? "border-amber-400/50" : justDone ? "border-emerald-400/50" : "border-border"
    )}>
      <button
        onClick={() => { setOpen(o => !o); setJustDone(null); }}
        className="w-full text-left"
      >
        <CardContent className="p-3 flex items-center gap-3">
          <div className={cn(
            "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
            open ? "border-amber-400/50 bg-amber-50/10" : "border-border bg-muted/30"
          )}>
            {justDone
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <Package className={cn("h-4 w-4", open ? "text-amber-500" : "text-muted-foreground")} />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{product.canonicalName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {product.category && (
                <span className="text-[10px] text-muted-foreground">{product.category}</span>
              )}
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
            {justDone && (
              <p className="text-[10px] text-emerald-500 font-semibold">+{justDone.qty} returned</p>
            )}
          </div>

          <div className="shrink-0">
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </CardContent>
      </button>

      {open && (
        <ReturnForm product={product} onClose={() => setOpen(false)} onDone={handleDone} />
      )}
    </Card>
  );
}

// ─── Returns Page ─────────────────────────────────────────────────────────────
export default function ReturnsPage() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [query, setQuery] = useState("");

  const { data: products, isLoading } = useListProducts(
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

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 pt-4 pb-3 space-y-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-500" />
            Process Return
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Search for the product the customer is returning
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type product name, category or SKU…"
            className="flex h-11 w-full rounded-xl border border-border bg-muted/30 pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400/60 transition-colors"
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
      <div className="px-4 py-4 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 rounded-xl border border-border bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : !query.trim() ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-400/20 flex items-center justify-center mb-4">
              <RotateCcw className="h-7 w-7 text-amber-500 opacity-60" />
            </div>
            <p className="font-bold text-foreground">Search for a product</p>
            <p className="text-sm text-muted-foreground mt-1 text-center max-w-xs">
              Type the product name above to find it and process the return
            </p>
            <div className="mt-6 rounded-xl border border-border bg-muted/20 p-4 max-w-sm w-full space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">How returns work</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-500 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                  Search for the returned product
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-500 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                  Enter qty and price at time of sale
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-500 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                  Stock is automatically restored and return is logged
                </div>
              </div>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <AlertCircle className="h-8 w-8 opacity-30 mb-3" />
            <p className="font-bold">No products found</p>
            <p className="text-sm mt-1">Try a different name or category</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-muted-foreground">
                {filtered.length} product{filtered.length !== 1 ? "s" : ""} found
              </p>
              <Badge variant="outline" className="text-[10px] border-amber-400/40 text-amber-500">
                Tap to expand
              </Badge>
            </div>
            {filtered.map((p: any) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
