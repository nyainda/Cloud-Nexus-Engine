import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatKES, formatQty, roundQty } from "@/lib/format";
import { Plus, Minus, ShoppingCart, Package, X, TrendingUp, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { isWeighedUnit } from "@/lib/product-utils";
import { QtyTextInput } from "./QtyTextInput";

export function QuickAddSheet({
  product,
  open,
  onClose,
  onAdd,
  isOwner,
  cartQty,
}: {
  product: any | null;
  open: boolean;
  onClose: () => void;
  onAdd: (product: any, qty: number, price: number) => void;
  isOwner: boolean;
  cartQty: number;
}) {
  const [qty, setQty] = useState<number>(1);
  const [price, setPrice] = useState(0);
  const [amountInput, setAmountInput] = useState("");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && product) {
      const isMeasured = product.productType === "measured" || isWeighedUnit(product.unit || "");
      const available = Math.max(0, roundQty((product.stockQty || 0) - cartQty));
      const initialCap = available > 0 ? available : (product.stockQty || 1);
      setQty(roundQty(Math.min(isMeasured ? 0.5 : 1, initialCap)));
      setPrice(product.sellingPrice || 0);
      setAmountInput("");
      setTimeout(() => qtyInputRef.current?.select(), 60);
    }
  }, [open, product, cartQty]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !product) return null;

  const weighed = product.productType === "measured" || isWeighedUnit(product.unit || "");
  const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
  const isOut = product.stockQty === 0;
  const remainingAvailable = Math.max(0, roundQty(product.stockQty - cartQty));
  const maxAddQty = remainingAvailable;
  const isCartLimitReached = !isOut && remainingAvailable <= 0;
  const marginPct = product.purchasePrice && price > 0
    ? ((price - product.purchasePrice) / price) * 100
    : null;
  const profit = product.purchasePrice
    ? qty * (price - product.purchasePrice)
    : null;

  const qtyStep = weighed ? 0.25 : 1;
  const qtyMin = weighed ? 0.01 : 1;
  const effectiveMax = Math.max(qtyMin, maxAddQty);

  const submit = () => {
    if (isOut || isCartLimitReached) return;
    const finalQty = roundQty(Math.min(Math.max(qtyMin, qty), maxAddQty));
    onAdd(product, finalQty, price);
    onClose();
  };

  const presetValues = (weighed
    ? (product.unit?.toLowerCase() === "g" || product.unit?.toLowerCase() === "ml"
        ? [50, 100, 250, 500, 1000]
        : [0.1, 0.25, 0.5, 1, 2, 5, 10])
    : [1, 2, 3, 5, 10, 20, 50]
  ).filter(v => v <= maxAddQty);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-card w-full sm:max-w-[440px] max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl border border-border/80 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3.5 border-b border-border/70 bg-muted/25 shrink-0">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0",
                weighed
                  ? "bg-primary/12 border-primary/25 text-primary"
                  : "bg-background border-border text-muted-foreground shadow-2xs"
              )}
            >
              {weighed ? <Scale className="h-5 w-5" /> : <Package className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-base text-foreground leading-snug line-clamp-2">
                {product.canonicalName}
              </p>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {product.category && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-background text-muted-foreground border border-border/70">
                    {product.category}
                  </span>
                )}
                {product.unit && (
                  <span
                    className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border font-mono",
                      weighed
                        ? "text-primary border-primary/25 bg-primary/10"
                        : "text-muted-foreground border-border/70 bg-background"
                    )}
                  >
                    {product.unit}
                  </span>
                )}
                {product.sku && (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    #{product.sku}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close product dialog"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-background border border-border/70 text-muted-foreground hover:text-foreground flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border",
                  isOut
                    ? "bg-destructive/12 border-destructive/25 text-destructive"
                    : isLow
                    ? "bg-amber-500/12 border-amber-500/30 text-amber-600 dark:text-amber-400"
                    : "bg-emerald-500/12 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    isOut ? "bg-destructive" : isLow ? "bg-amber-500" : "bg-emerald-500"
                  )}
                />
                {isOut
                  ? "Out of Stock"
                  : `${formatQty(product.stockQty)} ${product.unit || "units"} in stock`}
              </span>
              {cartQty > 0 && (
                <span className="inline-flex items-center gap-1 bg-primary/12 border border-primary/30 text-primary rounded-full px-2.5 py-0.5 text-[11px] font-bold">
                  <ShoppingCart className="h-3 w-3" />
                  {formatQty(cartQty)} in ticket ({formatQty(remainingAvailable)} left)
                </span>
              )}
            </div>
            <span className="text-xs font-bold font-mono text-foreground bg-background border border-border/70 px-2.5 py-0.5 rounded-full">
              {formatKES(product.sellingPrice || 0)}/{product.unit || "unit"}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
          {isCartLimitReached && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              All {formatQty(product.stockQty)} {product.unit || "units"} of this product are already in the current ticket.
            </div>
          )}

          {/* Unified Tactile Stepper */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
                Quantity ({product.unit || (weighed ? "kg" : "unit")})
              </Label>
              {maxAddQty > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setQty(roundQty(maxAddQty));
                    setAmountInput("");
                  }}
                  className="text-[11px] font-semibold font-mono text-primary hover:underline cursor-pointer"
                >
                  Max {formatQty(maxAddQty)}
                </button>
              )}
            </div>

            <div className="grid grid-cols-[52px_minmax(0,1fr)_52px] items-center gap-2 rounded-2xl border border-border/80 bg-muted/35 p-1.5">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={isOut || isCartLimitReached || qty <= qtyMin}
                className="h-12 w-[52px] shrink-0 rounded-xl bg-background border border-border/80 shadow-xs flex items-center justify-center text-foreground hover:bg-muted active:scale-95 disabled:opacity-35 transition-all cursor-pointer"
                onClick={() => {
                  setQty(q => Math.max(qtyMin, roundQty(q - qtyStep)));
                  setAmountInput("");
                }}
              >
                <Minus className="h-4 w-4" />
              </button>
              <QtyTextInput
                inputRef={qtyInputRef}
                value={qty}
                min={qtyMin}
                max={effectiveMax}
                isDecimal={weighed}
                onChange={next => {
                  setQty(next);
                  setAmountInput("");
                }}
                className="h-12 w-full min-w-0 text-center text-2xl sm:text-3xl font-bold font-mono tabular-nums bg-background border border-border/70 rounded-xl focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 text-foreground"
              />
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={isOut || isCartLimitReached || qty >= maxAddQty}
                className="h-12 w-[52px] shrink-0 rounded-xl bg-primary text-primary-foreground shadow-sm flex items-center justify-center hover:brightness-105 active:scale-95 disabled:opacity-35 transition-all cursor-pointer"
                onClick={() => {
                  setQty(q => roundQty(Math.min(maxAddQty, q + qtyStep)));
                  setAmountInput("");
                }}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {presetValues.length > 0 && (
              <div className="flex gap-1.5 flex-wrap pt-0.5">
                {presetValues.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      setQty(roundQty(v));
                      setAmountInput("");
                    }}
                    className={cn(
                      "text-[11px] font-bold font-mono px-2.5 py-1 rounded-full border transition-all cursor-pointer tabular-nums",
                      roundQty(qty) === v
                        ? "bg-primary text-primary-foreground border-primary shadow-xs"
                        : "bg-muted/50 border-border/80 text-muted-foreground hover:text-foreground hover:border-primary/40"
                    )}
                  >
                    {weighed ? `${v}${product.unit}` : `×${v}`}
                  </button>
                ))}
              </div>
            )}

            {weighed && price > 0 && (
              <div className="rounded-2xl border border-border/70 bg-muted/25 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Quick Sell by Amount (KES)
                  </span>
                  <span className="text-[11px] font-mono text-primary font-semibold tabular-nums">
                    = {formatQty(qty)} {product.unit || "kg"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[50, 100, 200, 500, 1000].map(amt => {
                    const computed = roundQty(amt / price);
                    if (computed < qtyMin || computed > maxAddQty) return null;
                    return (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setAmountInput(String(amt));
                          setQty(computed);
                        }}
                        className={cn(
                          "px-2 py-1 rounded-lg border text-[11px] font-mono font-semibold transition-colors cursor-pointer",
                          amountInput === String(amt)
                            ? "bg-primary/15 border-primary text-primary"
                            : "bg-background border-border text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Ksh {amt}
                      </button>
                    );
                  })}
                  <input
                    type="number"
                    min={1}
                    placeholder="Custom KES…"
                    value={amountInput}
                    onChange={e => {
                      const raw = e.target.value;
                      setAmountInput(raw);
                      const amt = parseFloat(raw);
                      if (!isNaN(amt) && amt > 0 && price > 0) {
                        setQty(roundQty(Math.min(maxAddQty, Math.max(qtyMin, amt / price))));
                      }
                    }}
                    className="h-7 w-24 rounded-lg border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Unit Price Pill Row */}
          <div className="rounded-2xl border border-border/80 bg-muted/25 px-3.5 py-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor="quick-add-unit-price" className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold block">
                Unit Price (KES)
              </Label>
              {price !== product.sellingPrice ? (
                <button
                  type="button"
                  onClick={() => setPrice(product.sellingPrice || 0)}
                  className="text-[11px] font-semibold text-primary hover:underline cursor-pointer mt-0.5"
                >
                  Reset to {formatKES(product.sellingPrice || 0)}
                </button>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-0.5">Standard rate</p>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background px-2.5 h-10 shrink-0 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
              <span className="text-xs font-bold font-mono text-muted-foreground">Ksh</span>
              <input
                id="quick-add-unit-price"
                type="number"
                min={0}
                value={price}
                onChange={e => setPrice(Math.max(0, Number(e.target.value)))}
                className="w-24 text-right text-base font-bold font-mono tabular-nums bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {/* Financial Breakdown */}
          <div className="bg-muted/25 rounded-2xl border border-border/80 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              {isOwner && product.purchasePrice > 0 ? (
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Cost Price
                  </span>
                  <span className="text-xs font-mono font-semibold text-muted-foreground">
                    {formatKES(product.purchasePrice)}
                  </span>
                </div>
              ) : (
                <span className="text-xs font-medium text-muted-foreground">Line subtotal</span>
              )}
              <div className="text-right ml-auto">
                {isOwner && product.purchasePrice > 0 && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                    Line Subtotal
                  </span>
                )}
                <span className="text-xl font-display font-bold font-mono tabular-nums text-foreground">
                  {formatKES(qty * price)}
                </span>
              </div>
            </div>

            {isOwner && profit !== null && (
              <div className="pt-2 border-t border-border/60 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <TrendingUp
                      className={cn(
                        "h-3.5 w-3.5",
                        profit < 0
                          ? "text-destructive"
                          : (marginPct ?? 0) < 10
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      )}
                    />
                    Est. Profit
                    {marginPct !== null && (
                      <span
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full font-mono",
                          profit < 0
                            ? "bg-destructive/15 text-destructive"
                            : marginPct < 10
                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                            : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {marginPct.toFixed(0)}%
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "font-bold font-mono text-sm tabular-nums",
                      profit >= 0
                        ? ((marginPct ?? 0) < 10
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400")
                        : "text-destructive"
                    )}
                  >
                    {profit < 0 ? "-" : "+"}{formatKES(Math.abs(profit))}
                  </span>
                </div>
                {marginPct !== null && (
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        profit < 0 ? "bg-destructive" : marginPct < 10 ? "bg-amber-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${Math.max(4, Math.min(100, marginPct))}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {profit !== null && profit < 0 && (
            <div className="flex items-start gap-2.5 bg-destructive/10 border border-destructive/30 rounded-2xl px-3.5 py-2.5">
              <span className="text-destructive text-sm font-bold shrink-0">⚠</span>
              <div>
                <p className="text-xs font-bold text-destructive">Selling below cost</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Price is {formatKES(Math.abs(price - product.purchasePrice))} below buying price.
                </p>
              </div>
            </div>
          )}
          {profit !== null && profit >= 0 && marginPct !== null && marginPct < 10 && (
            <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl px-3.5 py-2.5">
              <span className="text-amber-600 dark:text-amber-400 text-sm font-bold shrink-0">↓</span>
              <div>
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400">Low margin ({marginPct.toFixed(0)}%)</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Consider raising the price — typical target margin is above 10%.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border/70 bg-muted/15 px-5 py-3.5 flex gap-2.5 shrink-0">
          <Button variant="outline" className="h-11 px-5 rounded-xl font-semibold cursor-pointer" onClick={onClose}>
            Cancel
          </Button>
          <Button
            className="flex-1 h-11 rounded-xl font-bold text-sm bg-primary text-primary-foreground shadow-md shadow-primary/20 cursor-pointer"
            disabled={isOut || isCartLimitReached}
            onClick={submit}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Add {formatQty(qty)} · {formatKES(qty * price)}
          </Button>
        </div>
      </div>
    </div>
  );
}
