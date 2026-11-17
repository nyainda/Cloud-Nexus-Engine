import { useState, useEffect } from "react";
import {
  useRestockProduct,
  getListProductsQueryKey,
  getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { enqueueMutation } from "@/lib/offline-queue";
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
import { formatKES, formatQty, roundQty } from "@/lib/format";
import { Plus, Minus, ArrowUpRight, ArrowRight, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isWeighedUnit, getCategoryStyle } from "@/lib/product-utils";
import { WeightPresets } from "./StockFormHelpers";

export function RestockDialog({ product, trigger }: { product: any; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const weighed = product.productType === "measured" || isWeighedUnit(product.unit || "");
  const [qty, setQty] = useState<number | "">(0);
  const [purchasePrice, setPurchasePrice] = useState(product.purchasePrice?.toString() || "");
  const [sellingPrice, setSellingPrice] = useState(product.sellingPrice?.toString() || "");
  const [submitting, setSubmitting] = useState(false);

  // Sync prices from the latest product data every time the dialog opens.
  useEffect(() => {
    if (open) {
      setPurchasePrice(product.purchasePrice?.toString() || "");
      setSellingPrice(product.sellingPrice?.toString() || "");
      setQty(0);
    }
  }, [open, product.purchasePrice, product.sellingPrice]);
  const restockMutation = useRestockProduct();
  const qc = useQueryClient();

  const qtyNum = Number(qty || 0);
  const nextStock = roundQty(Number(product.stockQty || 0) + qtyNum);
  const buyNum = Number(purchasePrice || 0);
  const sellNum = Number(sellingPrice || 0);
  const marginPct = buyNum > 0 && sellNum > 0 ? ((sellNum - buyNum) / sellNum) * 100 : null;
  const unitProfit = buyNum > 0 && sellNum > 0 ? sellNum - buyNum : null;
  const restockCost = qtyNum > 0 && buyNum > 0 ? qtyNum * buyNum : 0;
  const alertQty = Number(product.alertQty || 0);
  const healthTarget = Math.max(alertQty * 2, 10);
  const nextHealthPct = nextStock <= 0 ? 0 : Math.min(100, Math.max(8, (nextStock / healthTarget) * 100));
  const stepUnit = weighed ? (Math.abs(qtyNum) < 1 ? 0.25 : 1) : 1;
  const minRemoveAllowed = -Number(product.stockQty || 0);
  const isInvalidNegative = qtyNum < 0 && nextStock < 0;

  const handleRestock = async () => {
    const cleanQty = roundQty(Number(qty));
    if (cleanQty === 0 || submitting || isInvalidNegative) return;

    setSubmitting(true);
    const snapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });

    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return {
        ...old,
        products: old.products.map((p: any) =>
          p.id !== product.id
            ? p
            : {
                ...p,
                stockQty: roundQty(p.stockQty + cleanQty),
                ...(purchasePrice && { purchasePrice: Number(purchasePrice) }),
                ...(sellingPrice && { sellingPrice: Number(sellingPrice) }),
              }
        ),
      };
    });

    toast.success(
      cleanQty > 0
        ? `Restocked ${formatQty(cleanQty)} ${product.unit || "units"} of ${product.canonicalName}`
        : `Removed ${formatQty(Math.abs(cleanQty))} ${product.unit || "units"} from ${product.canonicalName}`
    );
    setOpen(false);
    setQty(0);
    setSubmitting(false);

    if (!navigator.onLine) {
      await enqueueMutation("restock", (product.shopId as string) || "", {
        productId: product.id,
        qty: cleanQty,
        ...(purchasePrice ? { newPurchasePrice: Number(purchasePrice) } : {}),
        ...(sellingPrice ? { newSellingPrice: Number(sellingPrice) } : {}),
      });
      toast.success("Restock saved offline — will sync on reconnect");
      return;
    }

    (async () => {
      try {
        const updatedProduct = await restockMutation.mutateAsync({
          productId: product.id,
          data: {
            qty: cleanQty,
            newPurchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
            newSellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
          } as any,
        });
        recordMutationResult(updatedProduct as any);
        qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
          if (!old?.products) return old;
          return {
            ...old,
            products: old.products.map((p: any) =>
              p.id === (updatedProduct as any).id
                ? {
                    ...p,
                    stockQty: (updatedProduct as any).stockQty,
                    purchasePrice: (updatedProduct as any).purchasePrice,
                    sellingPrice: (updatedProduct as any).sellingPrice,
                  }
                : p
            ),
          };
        });
      } catch {
        snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        toast.error("Restock failed — please retry");
      } finally {
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      }
    })();
  };

  const catStyle = getCategoryStyle(product.category);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg border-primary/35 bg-primary/12 px-2.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer"
          >
            <ArrowUpRight className="mr-1 h-3.5 w-3.5" />Restock
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-[460px] max-h-[92dvh] flex flex-col p-0 gap-0 rounded-3xl border border-border/80 shadow-2xl overflow-hidden">
        {/* Header */}
        <DialogHeader className="border-b border-border/70 bg-muted/25 px-5 py-4 pr-11 text-left shrink-0">
          <div className="flex items-start gap-3">
            <div className={cn("w-10 h-10 rounded-2xl border flex items-center justify-center text-[11px] font-bold shrink-0", catStyle.bg, catStyle.text, catStyle.border)}>
              {catStyle.abbr}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-base font-bold text-foreground leading-snug line-clamp-2">
                {product.canonicalName}
              </DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="font-bold uppercase tracking-wider text-primary">Restock &amp; Adjust</span>
                {product.sku && <span className="font-mono text-muted-foreground">· #{product.sku}</span>}
                <span className="rounded-full border border-border/70 bg-background px-2 py-0.5 font-mono font-semibold text-muted-foreground">
                  {product.unit || "units"}
                </span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Before -> After Live Stock Preview */}
          <div className="rounded-2xl border border-border/80 bg-muted/25 p-3.5 space-y-2.5">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Current</p>
                <p className="mt-0.5 font-display text-xl font-bold font-mono tabular-nums text-foreground">
                  {formatQty(product.stockQty)}
                  <span className="ml-1 text-xs font-sans font-normal text-muted-foreground">{product.unit || "units"}</span>
                </p>
              </div>
              <div className="flex flex-col items-center px-2">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-bold font-mono tabular-nums",
                    qtyNum > 0
                      ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                      : qtyNum < 0
                      ? "border-amber-500/35 bg-amber-500/12 text-amber-600 dark:text-amber-400"
                      : "border-border bg-background text-muted-foreground"
                  )}
                >
                  {qtyNum > 0 ? `+${formatQty(qtyNum)}` : qtyNum < 0 ? formatQty(qtyNum) : "±0"}
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground mt-1" />
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">New Stock</p>
                <p
                  className={cn(
                    "mt-0.5 font-display text-xl font-bold font-mono tabular-nums",
                    isInvalidNegative
                      ? "text-destructive"
                      : qtyNum > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : qtyNum < 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground"
                  )}
                >
                  {formatQty(nextStock)}
                  <span className="ml-1 text-xs font-sans font-normal text-muted-foreground">{product.unit || "units"}</span>
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/80 border border-border/50">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    nextStock <= 0 ? "bg-destructive" : nextStock <= alertQty ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${nextHealthPct}%` }}
                />
              </div>
              {alertQty > 0 && (
                <p className="text-[10px] text-muted-foreground text-right">
                  Alert threshold: <span className="font-mono font-semibold text-foreground">{formatQty(alertQty)} {product.unit || "units"}</span>
                </p>
              )}
            </div>
          </div>

          {/* Quantity Stepper Card */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Quantity Adjustment (<span className="text-emerald-600 dark:text-emerald-400">+ add</span> / <span className="text-amber-600 dark:text-amber-400">− remove</span>)
              </Label>
              {qtyNum !== 0 && (
                <button
                  type="button"
                  onClick={() => setQty(0)}
                  className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                >
                  Reset 0
                </button>
              )}
            </div>

            <div className="grid grid-cols-[52px_minmax(0,1fr)_52px] items-center gap-2 rounded-2xl border border-border/80 bg-muted/35 p-1.5">
              <button
                type="button"
                aria-label="Decrease adjustment"
                disabled={nextStock - stepUnit < 0}
                onClick={() => setQty(q => roundQty(Math.max(minRemoveAllowed, Number(q || 0) - stepUnit)))}
                className="h-11 w-[52px] shrink-0 rounded-xl bg-background border border-border/80 shadow-xs flex items-center justify-center text-foreground hover:bg-muted active:scale-95 disabled:opacity-35 transition-all cursor-pointer"
              >
                <Minus className="h-4 w-4" />
              </button>
              <Input
                type="number"
                size={4}
                step={weighed ? "0.25" : "1"}
                value={qty}
                onFocus={e => e.target.select()}
                onChange={e => setQty(e.target.value === "" ? "" : (weighed ? parseFloat(e.target.value) || 0 : parseInt(e.target.value, 10) || 0))}
                className="h-11 w-full min-w-0 text-center text-2xl font-bold font-mono tabular-nums bg-background border-border/70 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label="Increase adjustment"
                onClick={() => setQty(q => roundQty(Number(q || 0) + stepUnit))}
                className="h-11 w-[52px] shrink-0 rounded-xl bg-primary text-primary-foreground shadow-sm flex items-center justify-center hover:brightness-105 active:scale-95 transition-all cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {weighed ? (
              <WeightPresets unit={product.unit || "kg"} onSelect={v => setQty(roundQty(v))} />
            ) : (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {[-5, -1, 1, 5, 10, 25, 50].map(delta => {
                  const disabled = delta < 0 && Number(product.stockQty || 0) + delta < 0;
                  return (
                    <button
                      key={delta}
                      type="button"
                      disabled={disabled}
                      onClick={() => setQty(delta)}
                      className={cn(
                        "px-2.5 py-1 rounded-full border text-[11px] font-bold font-mono tabular-nums transition-all cursor-pointer disabled:opacity-35",
                        qtyNum === delta
                          ? delta < 0
                            ? "bg-amber-500 text-white border-amber-500"
                            : "bg-primary text-primary-foreground border-primary shadow-2xs"
                          : "bg-muted/50 border-border/80 text-muted-foreground hover:text-foreground hover:border-primary/40"
                      )}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </button>
                  );
                })}
              </div>
            )}

            {isInvalidNegative && (
              <p className="text-xs font-semibold text-destructive">
                Cannot remove more than current stock ({formatQty(product.stockQty)} {product.unit || "units"}).
              </p>
            )}
          </div>

          {/* Buy & Sell Prices + Live Margin */}
          <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Buy Cost (KES)
                </Label>
                <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-background px-2.5 h-10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-[11px] font-mono font-bold text-muted-foreground">Ksh</span>
                  <input
                    type="number"
                    min={0}
                    value={purchasePrice}
                    onChange={e => setPurchasePrice(e.target.value)}
                    onFocus={e => e.target.select()}
                    placeholder={product.purchasePrice?.toString() || "0"}
                    className="w-full min-w-0 text-right text-sm font-bold font-mono tabular-nums bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Sell Price (KES)
                </Label>
                <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-background px-2.5 h-10 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-[11px] font-mono font-bold text-muted-foreground">Ksh</span>
                  <input
                    type="number"
                    min={0}
                    value={sellingPrice}
                    onChange={e => setSellingPrice(e.target.value)}
                    onFocus={e => e.target.select()}
                    placeholder={product.sellingPrice?.toString() || "0"}
                    className="w-full min-w-0 text-right text-sm font-bold font-mono tabular-nums bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>

            {(marginPct !== null || restockCost > 0) && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 text-xs">
                {marginPct !== null && unitProfit !== null && (
                  <span className={cn("font-semibold flex items-center gap-1.5", unitProfit < 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                    <TrendingUp className="h-3.5 w-3.5" />
                    Margin {marginPct.toFixed(1)}% ({unitProfit < 0 ? "-" : "+"}{formatKES(Math.abs(unitProfit))}/{product.unit || "unit"})
                  </span>
                )}
                {restockCost > 0 && (
                  <span className="font-mono text-muted-foreground ml-auto">
                    Stock cost: <strong className="text-foreground">{formatKES(restockCost)}</strong>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border/70 bg-muted/15 px-5 py-3.5 flex items-center justify-end gap-2.5 shrink-0">
          <Button variant="outline" className="h-10 rounded-xl px-4 cursor-pointer" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleRestock}
            disabled={qtyNum === 0 || submitting || isInvalidNegative}
            className={cn(
              "h-10 rounded-xl px-5 font-bold cursor-pointer",
              qtyNum < 0 ? "bg-amber-600 hover:bg-amber-500 text-white" : ""
            )}
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                Saving…
              </span>
            ) : qtyNum > 0 ? (
              `Add ${formatQty(qtyNum)} ${product.unit || "units"}`
            ) : qtyNum < 0 ? (
              `Remove ${formatQty(Math.abs(qtyNum))} ${product.unit || "units"}`
            ) : (
              "Enter adjustment"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
