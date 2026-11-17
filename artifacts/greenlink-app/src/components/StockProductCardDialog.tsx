import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatKES, formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  AlertTriangle,
  Calendar,
  Package,
  Scale,
  TrendingUp,
} from "lucide-react";

interface StockProductCardDialogProps {
  product: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
  categoryStyle: { bg: string; text: string; border: string; abbr: string };
  actions: React.ReactNode;
}

export function StockProductCardDialog({
  product,
  open,
  onOpenChange,
  isOwner,
  categoryStyle,
  actions,
}: StockProductCardDialogProps) {
  if (!product) return null;

  const weighed =
    product.productType === "measured" ||
    ["kg", "kilogram", "kilograms", "g", "gram", "grams", "l", "litre", "litres", "liter", "liters", "ml", "millilitre", "millilitres"].includes(
      String(product.unit || "").toLowerCase().trim(),
    );

  const stockQty = Number(product.stockQty || 0);
  const alertQty = Number(product.alertQty || 0);
  const buyPrice = Number(product.purchasePrice || 0);
  const sellPrice = Number(product.sellingPrice || 0);
  const isOut = stockQty <= 0;
  const isLow = !isOut && stockQty <= alertQty;

  const todayStr = new Date().toISOString().split("T")[0];
  const soonStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const isExpired = Boolean(product.expiryDate && product.expiryDate < todayStr);
  const isExpiringSoon = Boolean(product.expiryDate && !isExpired && product.expiryDate <= soonStr);

  const healthTarget = Math.max(alertQty * 2, 10);
  const healthPct = isOut ? 0 : Math.min(100, Math.max(8, (stockQty / healthTarget) * 100));

  const unitProfit = sellPrice > 0 && buyPrice > 0 ? sellPrice - buyPrice : null;
  const marginPct = unitProfit !== null && sellPrice > 0 ? (unitProfit / sellPrice) * 100 : null;
  const retailStockValue = sellPrice > 0 ? stockQty * sellPrice : 0;
  const costStockValue = buyPrice > 0 ? stockQty * buyPrice : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-lg max-h-[92dvh] flex flex-col p-0 gap-0 rounded-3xl border border-border/80 shadow-2xl overflow-hidden">
        {/* Header Hero */}
        <DialogHeader className="border-b border-border/70 bg-muted/25 px-5 py-4 pr-11 text-left shrink-0">
          <div className="flex items-start gap-3.5">
            <div
              className={cn(
                "w-12 h-12 rounded-2xl border flex items-center justify-center text-xs font-bold shrink-0 shadow-2xs",
                categoryStyle.bg,
                categoryStyle.text,
                categoryStyle.border,
              )}
            >
              {categoryStyle.abbr}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-display text-base sm:text-lg font-bold text-foreground leading-snug">
                {product.canonicalName}
              </DialogTitle>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    categoryStyle.bg,
                    categoryStyle.text,
                    categoryStyle.border,
                  )}
                >
                  {product.category || "Uncategorised"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[10px] font-bold font-mono text-muted-foreground">
                  {weighed ? <Scale className="h-2.5 w-2.5 text-primary" /> : <Package className="h-2.5 w-2.5" />}
                  {product.unit || "unit"}
                </span>
                {product.sku && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    #{product.sku}
                  </span>
                )}
                {(isExpired || isExpiringSoon) && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      isExpired
                        ? "bg-destructive/15 text-destructive"
                        : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                    )}
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {isExpired ? "Expired" : "Expiring <30d"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          {/* Stock Health Spotlight Card */}
          <div
            className={cn(
              "rounded-2xl border p-4 space-y-3",
              isOut
                ? "border-destructive/30 bg-destructive/[0.05]"
                : isLow
                ? "border-amber-500/30 bg-amber-500/[0.05]"
                : "border-emerald-500/25 bg-emerald-500/[0.04]",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  Available Stock On Hand
                </p>
                <p
                  className={cn(
                    "mt-1 font-display text-3xl font-bold tabular-nums leading-none",
                    isOut
                      ? "text-destructive"
                      : isLow
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-foreground",
                  )}
                >
                  {formatQty(stockQty)}
                  <span className="ml-1.5 text-sm font-semibold text-muted-foreground font-sans">
                    {product.unit || "units"}
                  </span>
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold",
                  isOut
                    ? "border-destructive/30 bg-destructive/12 text-destructive"
                    : isLow
                    ? "border-amber-500/30 bg-amber-500/12 text-amber-600 dark:text-amber-400"
                    : "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isOut ? "bg-destructive" : isLow ? "bg-amber-500" : "bg-emerald-500",
                  )}
                />
                {isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="h-2 w-full overflow-hidden rounded-full bg-background/80 border border-border/50">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isOut ? "bg-destructive" : isLow ? "bg-amber-500" : "bg-emerald-500",
                  )}
                  style={{ width: `${healthPct}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  Low alert at{" "}
                  <strong className="font-mono text-foreground">
                    {formatQty(alertQty)} {product.unit || "units"}
                  </strong>
                </span>
                <span>
                  Mode:{" "}
                  <strong className="text-foreground">
                    {weighed ? "Measured (decimals)" : "Whole units"}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* Pricing & Value Grid */}
          {isOwner ? (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-border/75 bg-muted/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Buying Cost
                </p>
                <p className="mt-1 text-base font-bold font-mono tabular-nums text-foreground">
                  {buyPrice > 0 ? formatKES(buyPrice) : "Not set"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">per {product.unit || "unit"}</p>
              </div>

              <div className="rounded-2xl border border-border/75 bg-muted/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Selling Price
                </p>
                <p className="mt-1 text-base font-bold font-mono tabular-nums text-primary">
                  {sellPrice > 0 ? formatKES(sellPrice) : "Not set"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">per {product.unit || "unit"}</p>
              </div>

              <div className="rounded-2xl border border-border/75 bg-muted/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  Unit Margin
                </p>
                <p
                  className={cn(
                    "mt-1 text-base font-bold font-mono tabular-nums",
                    unitProfit === null
                      ? "text-muted-foreground"
                      : unitProfit < 0
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {unitProfit !== null
                    ? `${unitProfit < 0 ? "-" : "+"}${formatKES(Math.abs(unitProfit))}`
                    : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {marginPct !== null ? `${marginPct.toFixed(1)}% gross margin` : "Set buy & sell prices"}
                </p>
              </div>

              <div className="rounded-2xl border border-border/75 bg-muted/25 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total Stock Value
                </p>
                <p className="mt-1 text-base font-bold font-mono tabular-nums text-foreground">
                  {retailStockValue > 0 ? formatKES(retailStockValue) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {costStockValue > 0 ? `Cost: ${formatKES(costStockValue)}` : "Retail estimate"}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/75 bg-muted/25 p-3.5 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Selling Price
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">per {product.unit || "unit"}</p>
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-primary">
                {sellPrice > 0 ? formatKES(sellPrice) : "Not set"}
              </p>
            </div>
          )}

          {/* Extra Metadata Pills (Expiry / Updated) */}
          {(product.expiryDate || product.lastSoldAt) && (
            <div className="rounded-2xl border border-border/60 bg-muted/15 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              {product.expiryDate && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Expiry:{" "}
                  <strong className={cn("font-mono", isExpired ? "text-destructive" : isExpiringSoon ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                    {product.expiryDate}
                  </strong>
                </span>
              )}
              {product.lastSoldAt && (
                <span>
                  Last sold:{" "}
                  <strong className="font-mono text-foreground">
                    {format(new Date(product.lastSoldAt), "d MMM yyyy")}
                  </strong>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Unified Action Footer */}
        <div className="border-t border-border/70 bg-muted/20 px-5 py-3.5 flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      </DialogContent>
    </Dialog>
  );
}
