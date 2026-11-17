import { useState, useMemo, useEffect, useRef } from "react";
import { useCreateProduct, getListProductsQueryKey } from "@workspace/api-client-react";
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
import { Plus, Copy, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { generateSku, inferCategory } from "@/lib/product-utils";
import { CategoryPicker, BagCalculator, ProductTypeAndUnitSection } from "./StockFormHelpers";

function nameSimilarity(a: string, b: string): number {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.9;
  const wordsA = na.split(/\s+/).filter(w => w.length > 2);
  const wordsB = nb.split(/\s+/).filter(w => w.length > 2);
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const common = wordsA.filter(w => wordsB.includes(w)).length;
  return common / Math.max(wordsA.length, wordsB.length);
}

export function AddProductDialog({
  shopId,
  onSuccess: _onSuccess,
  existingProducts,
  isOwner,
}: {
  shopId: string;
  onSuccess: () => void;
  existingProducts: any[];
  isOwner: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("bag");
  const [productType, setProductType] = useState<"normal" | "measured">("normal");
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [qty, setQty] = useState("0");
  const [alertQty, setAlertQty] = useState("5");
  const [expiryDate, setExpiryDate] = useState("");
  const skuManuallyEdited = useRef(false);
  const categoryManuallyEdited = useRef(false);
  const createProduct = useCreateProduct();
  const qc = useQueryClient();

  useEffect(() => {
    if (!skuManuallyEdited.current && name.trim().length >= 2) {
      setSku(generateSku(name));
    }
    if (!name.trim()) { setSku(""); skuManuallyEdited.current = false; }
  }, [name]);

  useEffect(() => {
    if (!categoryManuallyEdited.current && name.trim().length >= 3) {
      const inferred = inferCategory(name);
      if (inferred) setCategory(inferred);
    }
    if (!name.trim()) { setCategory(""); categoryManuallyEdited.current = false; }
  }, [name]);

  const duplicates = useMemo(() => {
    if (name.trim().length < 3) return [];
    return existingProducts.filter(p => nameSimilarity(p.canonicalName, name) >= 0.7).slice(0, 3);
  }, [name, existingProducts]);

  const reset = () => {
    setName("");
    setSku("");
    setCategory("");
    setUnit("bag");
    setProductType("normal");
    setBuyPrice("");
    setSellPrice("");
    setQty("0");
    setAlertQty("5");
    setExpiryDate("");
    skuManuallyEdited.current = false;
    categoryManuallyEdited.current = false;
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    const tempId = `temp_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const optimisticProduct = {
      id: tempId,
      shopId,
      canonicalName: name.trim(),
      sku: sku || null,
      category: category || null,
      unit,
      productType,
      allowDecimals: productType === "measured",
      purchasePrice: buyPrice ? parseFloat(buyPrice) : null,
      sellingPrice: sellPrice ? parseFloat(sellPrice) : null,
      profitMargin: buyPrice && sellPrice && Number(sellPrice) > 0
        ? ((Number(sellPrice) - Number(buyPrice)) / Number(sellPrice)) * 100 : null,
      stockQty: parseFloat(qty) || 0,
      alertQty: parseFloat(alertQty) || 5,
      size: null,
      expiryDate: expiryDate || null,
      isActive: true,
      lastSoldAt: null,
      createdAt: now,
      updatedAt: now,
    };
    // Optimistic insert — product appears instantly without waiting for network
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: [...old.products, optimisticProduct], total: (old.total || 0) + 1 };
    });
    toast.success("Product added!");
    reset();
    setOpen(false);
    createProduct.mutate(
      { data: { shopId, canonicalName: name.trim(), sku: sku || undefined, category: category || undefined, unit, productType, allowDecimals: productType === "measured", purchasePrice: buyPrice ? parseFloat(buyPrice) : undefined, sellingPrice: sellPrice ? parseFloat(sellPrice) : undefined, alertQty: parseFloat(alertQty) || 5, stockQty: parseFloat(qty) || 0, expiryDate: expiryDate || undefined } as any },
      {
        onSuccess: (serverProduct: any) => {
          // Replace temp entry with server-confirmed data (real UUID + timestamps)
          qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
            if (!old?.products) return old;
            return { ...old, products: old.products.map((p: any) => p.id === tempId ? { ...p, ...serverProduct } : p) };
          });
          // Register with version guard as a NEW product so it gets appended back
          // if a stale background refetch response happens to omit it
          recordMutationResult({ ...serverProduct }, true);
        },
        onError: () => {
          // Remove the optimistic entry on failure
          qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
            if (!old?.products) return old;
            return { ...old, products: old.products.filter((p: any) => p.id !== tempId), total: Math.max(0, (old.total || 1) - 1) };
          });
          toast.error("Failed to add product — please retry");
        },
        onSettled: () => {
          // Silent background sync after mutation settles
          qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        },
      }
    );
  };

  const addMarginPct = buyPrice && sellPrice && Number(sellPrice) > 0
    ? ((Number(sellPrice) - Number(buyPrice)) / Number(sellPrice)) * 100
    : null;
  const addUnitProfit = buyPrice && sellPrice && Number(sellPrice) > 0
    ? Number(sellPrice) - Number(buyPrice)
    : null;
  const openingStockVal = Number(qty || 0) > 0 && Number(sellPrice || 0) > 0
    ? Number(qty) * Number(sellPrice)
    : 0;

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 rounded-lg text-xs font-bold px-3 cursor-pointer shadow-xs">
          <Plus className="h-3.5 w-3.5 mr-1" />Add Product
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-xl max-h-[92dvh] flex flex-col p-0 gap-0 rounded-3xl border border-border/80 shadow-2xl overflow-hidden">
        <DialogHeader className="border-b border-border/70 bg-muted/25 px-5 py-4 pr-11 text-left shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center shrink-0">
              <Plus className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-base font-bold leading-snug">Add New Product</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure identity, unit packaging, pricing &amp; opening stock
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          {/* 1. Identity & Smart Duplicate Guard */}
          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Product Name *</Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. DAP Fertilizer 50KG"
                className="h-10 rounded-xl bg-background font-semibold"
                autoFocus
              />
              {duplicates.length > 0 && (
                <div className="border border-amber-500/35 bg-amber-500/10 rounded-xl px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs font-bold">
                    <Copy className="h-3.5 w-3.5 shrink-0" />Similar products already in inventory:
                  </div>
                  {duplicates.map(d => (
                    <div key={d.id} className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground truncate pr-2">{d.canonicalName}</span>
                      <span className="font-mono shrink-0">{formatQty(d.stockQty)} {d.unit || "units"}</span>
                    </div>
                  ))}
                </div>
              )}
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
                  <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">SKU</Label>
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
                  placeholder="Auto-generated from name"
                  className={cn("h-9 rounded-xl bg-background font-mono text-sm", sku && !skuManuallyEdited.current && "text-primary")}
                />
              </div>
            </div>
          </div>

          {/* 2. Measurement & Packaging */}
          <ProductTypeAndUnitSection
            productType={productType}
            unit={unit}
            onTypeChange={setProductType}
            onUnitChange={setUnit}
          />

          {/* 3. Pricing & Margin */}
          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
            <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block">
              Pricing &amp; Profit {productType === "measured" ? `(KES / ${unit})` : "(KES)"}
            </Label>
            <div className="grid grid-cols-2 gap-2.5">
              {isOwner && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">Buy Cost</span>
                  <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-background px-2.5 h-10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                    <span className="text-[11px] font-mono font-bold text-muted-foreground">Ksh</span>
                    <input
                      type="number"
                      min={0}
                      value={buyPrice}
                      onChange={e => setBuyPrice(e.target.value)}
                      placeholder={productType === "measured" ? "136" : "0"}
                      className="w-full min-w-0 text-right text-sm font-bold font-mono tabular-nums bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              )}
              <div className={cn("space-y-1", !isOwner && "col-span-full")}>
                <span className="text-[11px] font-medium text-muted-foreground">Selling Price</span>
                <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-background px-2.5 h-10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-[11px] font-mono font-bold text-muted-foreground">Ksh</span>
                  <input
                    type="number"
                    min={0}
                    value={sellPrice}
                    onChange={e => setSellPrice(e.target.value)}
                    placeholder={productType === "measured" ? "144" : "0"}
                    className="w-full min-w-0 text-right text-sm font-bold font-mono tabular-nums bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>

            {isOwner && addMarginPct !== null && addUnitProfit !== null && (
              <div className={cn("rounded-xl border border-border/70 bg-background/80 px-3 py-2 text-xs flex items-center justify-between", addUnitProfit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                <span className="flex items-center gap-1.5 font-semibold"><TrendingUp className="h-3.5 w-3.5" />Est. Margin ({addUnitProfit < 0 ? "-" : "+"}{formatKES(Math.abs(addUnitProfit))}/{unit})</span>
                <span className="font-bold font-mono">{addMarginPct.toFixed(1)}%</span>
              </div>
            )}
            {productType === "measured" && (
              <BagCalculator unit={unit} setBuyPrice={setBuyPrice} setSellPrice={setSellPrice} />
            )}
          </div>

          {/* 4. Opening Stock, Alert & Expiry */}
          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-2.5">
            {productType === "measured" && (
              <p className="text-[11px] text-muted-foreground">
                Measured mode: enter total <strong className="text-foreground">{unit}</strong> on hand (e.g. 1 × 50kg bag → enter <strong>50</strong>).
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {productType === "measured" ? `Opening (${unit})` : "Opening Qty"}
                </Label>
                <Input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" step={productType === "measured" ? "0.5" : "1"} className="h-9 rounded-xl bg-background font-mono font-bold" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Low Alert {productType === "measured" ? `(${unit})` : ""}
                </Label>
                <Input type="number" value={alertQty} onChange={e => setAlertQty(e.target.value)} placeholder="5" step={productType === "measured" ? "0.5" : "1"} className="h-9 rounded-xl bg-background font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expiry (Optional)</Label>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="h-9 rounded-xl bg-background" />
              </div>
            </div>
            {openingStockVal > 0 && (
              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                <span className="text-muted-foreground">Opening Stock Retail Value</span>
                <span className="font-mono font-bold text-primary">{formatKES(openingStockVal)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border/70 bg-muted/15 px-5 py-3.5 flex items-center justify-end gap-2.5 shrink-0">
          <Button variant="outline" className="h-10 rounded-xl px-4 cursor-pointer" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || createProduct.isPending} className="h-10 rounded-xl px-5 font-bold cursor-pointer">
            <Plus className="h-4 w-4 mr-1.5" />
            {createProduct.isPending ? "Adding…" : openingStockVal > 0 ? `Add Product · ${formatKES(openingStockVal)}` : "Add Product"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
