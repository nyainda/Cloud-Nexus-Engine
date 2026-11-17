import { useState, useEffect, useRef } from "react";
import {
  useUpdateProduct,
  getListProductsQueryKey,
  getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatKES, formatQty } from "@/lib/format";
import { Edit2, TrendingUp, Calendar, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateSku, inferCategory } from "@/lib/product-utils";
import { CategoryPicker, BagCalculator, ProductTypeAndUnitSection } from "./StockFormHelpers";

export function EditProductDialog({
  product,
  onSuccess: _onSuccess,
  trigger,
}: {
  product: any;
  onSuccess: () => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(product.canonicalName || "");
  const [sku, setSku] = useState(product.sku || "");
  const [category, setCategory] = useState(product.category || "");
  const [unit, setUnit] = useState(product.unit || "unit");
  const [productType, setProductType] = useState<"normal" | "measured">(product.productType === "measured" ? "measured" : "normal");
  const [buyPrice, setBuyPrice] = useState(product.purchasePrice?.toString() || "");
  const [sellPrice, setSellPrice] = useState(product.sellingPrice?.toString() || "");
  const [alertQty, setAlertQty] = useState(product.alertQty?.toString() || "5");
  const [expiryDate, setExpiryDate] = useState(product.expiryDate || "");
  const skuManuallyEdited = useRef(!!product.sku);
  const categoryManuallyEdited = useRef(!!product.category);
  const updateProduct = useUpdateProduct();
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setName(product.canonicalName || "");
    setSku(product.sku || "");
    setCategory(product.category || "");
    setUnit(product.unit || "unit");
    setProductType(product.productType === "measured" ? "measured" : "normal");
    setBuyPrice(product.purchasePrice?.toString() || "");
    setSellPrice(product.sellingPrice?.toString() || "");
    setAlertQty(product.alertQty?.toString() || "5");
    setExpiryDate(product.expiryDate || "");
    skuManuallyEdited.current = !!product.sku;
    categoryManuallyEdited.current = !!product.category;
  }, [open, product]);

  useEffect(() => {
    if (!open) return;
    if (!skuManuallyEdited.current && name.trim().length >= 2) setSku(generateSku(name));
    if (!name.trim()) { setSku(""); skuManuallyEdited.current = false; }
  }, [name, open]);

  useEffect(() => {
    if (!open) return;
    if (!categoryManuallyEdited.current && name.trim().length >= 3) {
      const inferred = inferCategory(name);
      if (inferred) setCategory(inferred);
    }
    if (!name.trim()) { setCategory(""); categoryManuallyEdited.current = false; }
  }, [name, open]);

  const handleSubmit = async () => {
    // Only include fields that have actual values — never send undefined to the server
    const patch: any = {};
    if (name.trim()) patch.canonicalName = name.trim();
    if (sku) patch.sku = sku;
    if (category) patch.category = category;
    if (unit) patch.unit = unit;
    patch.productType = productType;
    patch.allowDecimals = productType === "measured";
    if (buyPrice) patch.purchasePrice = parseFloat(buyPrice);
    if (sellPrice) patch.sellingPrice = parseFloat(sellPrice);
    if (alertQty) patch.alertQty = parseFloat(alertQty);
    if (expiryDate) patch.expiryDate = expiryDate;

    // When switching from measured (decimal) to normal (whole units), any
    // fractional stock qty becomes invalid — round it down to the nearest
    // whole unit so the product can no longer show values like 1.5.
    if (productType === "normal" && product.productType === "measured" && !Number.isInteger(product.stockQty)) {
      patch.stockQty = Math.floor(product.stockQty);
    }

    // Cancel in-flight fetches so they don't race and overwrite our optimistic update
    await qc.cancelQueries({ queryKey: getListProductsQueryKey() });

    // Snapshot all matching cache entries for rollback on error
    const snapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });

    // Optimistic update — user sees change instantly (only override fields that were actually edited)
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.map((p: any) => p.id !== product.id ? p : { ...p, ...patch }) };
    });

    // Close + confirm immediately — don't wait for the network
    toast.success("Product updated");
    setOpen(false);
    // ⚠️  Do NOT call onSuccess() here — it calls invalidateQueries() which fires a GET that
    // hits the still-warm KV cache and returns old data, overwriting the optimistic update.
    // Instead we invalidate inside the async IIFE below, after the PATCH has committed and
    // the server has busted its own KV cache.

    // Async IIFE: continues running even after this dialog component unmounts.
    // TanStack Query v5 per-call .mutate() callbacks are NOT guaranteed to fire after unmount,
    // so we use mutateAsync + try/catch/finally to guarantee the cache is always reconciled.
    (async () => {
      try {
        const updatedProduct = await updateProduct.mutateAsync({ productId: product.id, data: patch });
        // Register with version guard — even though we don't call invalidateQueries for
        // products here, the 5-min staleTime will eventually trigger a background refetch.
        // If that refetch hits a stale KV node, the guard will substitute this version.
        recordMutationResult(updatedProduct as any);
        // Use the PATCH response as authoritative truth — merge all server-confirmed fields
        // directly into the cache. This means zero GET requests after a write, completely
        // eliminating the KV eventual-consistency race where a GET returns stale data.
        qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
          if (!old?.products) return old;
          return {
            ...old,
            products: old.products.map((p: any) =>
              p.id === product.id ? { ...p, ...(updatedProduct as any) } : p
            ),
          };
        });
      } catch {
        // Rollback to pre-edit state on failure
        snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        toast.error("Failed to update product — please retry");
      } finally {
        // Only invalidate inventory movements — products are already authoritative from
        // the server response above. Invalidating products here would fire a GET that
        // could race against KV propagation and overwrite correct cache values.
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      }
    })();
  };

  const editMarginPct = buyPrice && sellPrice && Number(sellPrice) > 0
    ? ((Number(sellPrice) - Number(buyPrice)) / Number(sellPrice)) * 100
    : null;
  const editUnitProfit = buyPrice && sellPrice && Number(sellPrice) > 0
    ? Number(sellPrice) - Number(buyPrice)
    : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-border/80 bg-background/70 px-2.5 text-xs font-medium hover:border-primary/40 hover:bg-muted/60 transition-colors focus-visible:ring-2 focus-visible:ring-primary/20 cursor-pointer"
          >
            <Edit2 className="mr-1 h-3.5 w-3.5" />Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-xl max-h-[92dvh] flex flex-col p-0 gap-0 rounded-3xl border border-border/80 shadow-2xl overflow-hidden">
        <DialogHeader className="border-b border-border/70 bg-muted/25 px-5 py-4 pr-11 text-left shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-primary/12 border border-primary/25 text-primary flex items-center justify-center shrink-0">
              <Edit2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-base font-bold leading-snug">Edit Product Details</DialogTitle>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {product.canonicalName} · Stock: {formatQty(product.stockQty)} {product.unit || "units"}
              </p>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Product Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="h-10 rounded-xl bg-background font-semibold" />
            </div>
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Category</Label>
                <CategoryPicker
                  value={category}
                  onChange={v => { setCategory(v); categoryManuallyEdited.current = true; }}
                  autoDetected={!categoryManuallyEdited.current && !!category}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">SKU Code</Label>
                  {sku && (
                    <button
                      type="button"
                      onClick={() => { setSku(generateSku(name)); skuManuallyEdited.current = false; }}
                      className="text-[10px] text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <X className="h-2.5 w-2.5" />Regenerate
                    </button>
                  )}
                </div>
                <Input
                  value={sku}
                  onChange={e => { setSku(e.target.value); skuManuallyEdited.current = true; }}
                  className={cn("h-9 rounded-xl bg-background font-mono text-sm", sku && !skuManuallyEdited.current && "text-primary")}
                />
              </div>
            </div>
          </div>

          <ProductTypeAndUnitSection
            productType={productType}
            unit={unit}
            onTypeChange={setProductType}
            onUnitChange={setUnit}
          />

          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
            <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block">
              Pricing &amp; Profit Margin {productType === "measured" ? `(KES / ${unit})` : "(KES)"}
            </Label>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Buy Cost</span>
                <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-background px-2.5 h-10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-[11px] font-mono font-bold text-muted-foreground">Ksh</span>
                  <input
                    type="number"
                    min={0}
                    value={buyPrice}
                    onChange={e => setBuyPrice(e.target.value)}
                    className="w-full min-w-0 text-right text-sm font-bold font-mono tabular-nums bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder={productType === "measured" ? "136" : "0"}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">Sell Price</span>
                <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-background px-2.5 h-10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-[11px] font-mono font-bold text-muted-foreground">Ksh</span>
                  <input
                    type="number"
                    min={0}
                    value={sellPrice}
                    onChange={e => setSellPrice(e.target.value)}
                    className="w-full min-w-0 text-right text-sm font-bold font-mono tabular-nums bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder={productType === "measured" ? "144" : "0"}
                  />
                </div>
              </div>
            </div>
            {editMarginPct !== null && editUnitProfit !== null && (
              <div className={cn("rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs flex items-center justify-between", editUnitProfit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                <span className="flex items-center gap-1.5 font-semibold"><TrendingUp className="h-3.5 w-3.5" />Est. Profit ({editUnitProfit < 0 ? "-" : "+"}{formatKES(Math.abs(editUnitProfit))}/{unit})</span>
                <span className="font-bold font-mono">{editMarginPct.toFixed(1)}%</span>
              </div>
            )}
            {productType === "measured" && (
              <BagCalculator unit={unit} setBuyPrice={setBuyPrice} setSellPrice={setSellPrice} />
            )}
          </div>

          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Low Stock Alert {productType === "measured" ? `(${unit})` : ""}
              </Label>
              <Input type="number" value={alertQty} onChange={e => setAlertQty(e.target.value)} step={productType === "measured" ? "0.5" : "1"} className="h-9 rounded-xl bg-background font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" />Expiry Date
              </Label>
              <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="h-9 rounded-xl bg-background" />
            </div>
          </div>
        </div>
        <div className="border-t border-border/70 bg-muted/15 px-5 py-3.5 flex items-center justify-end gap-2.5 shrink-0">
          <Button variant="outline" className="h-10 rounded-xl px-4 cursor-pointer" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || updateProduct.isPending} className="h-10 rounded-xl px-5 font-bold cursor-pointer">
            {updateProduct.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
