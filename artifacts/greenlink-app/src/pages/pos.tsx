import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import {
  useListProducts,
  useCreateSale,
  getListProductsQueryKey,
  getListDebtsQueryKey,
  getListInventoryMovementsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { enqueueMutation } from "@/lib/offline-queue";
import { useOfflineSyncCtx } from "@/lib/offline-context";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatKES, formatQty, roundQty } from "@/lib/format";
import {
  Search, Plus, Minus, ShoppingCart,
  PackageX, Package, CreditCard, Banknote, X,
  ChevronRight, TrendingUp, Scale, User2, Phone, ChevronDown, ArrowUpDown,
  ReceiptText, RotateCcw, ChevronUp, Ban, LayoutGrid, LayoutList, WifiOff, RefreshCw,
  Landmark, Printer, CheckCircle2, Tag, Percent, Trash2, Calculator,
  PanelRightClose, PanelRightOpen, SlidersHorizontal,
} from "lucide-react";
import { printSaleReceipt } from "@/lib/print-receipt";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { CustomerAutocomplete, toTitleCase, type SelectedCustomer } from "@/components/customer-autocomplete";

const WEIGHT_UNITS = new Set(["kg", "g", "gram", "grams", "litre", "liter", "l", "ml", "ton", "tonne"]);
function isWeighedUnit(unit: string): boolean {
  return WEIGHT_UNITS.has((unit || "").trim().toLowerCase());
}

const CART_DRAFT_KEY = "greenlink_cart_draft";
const AUTO_PRINT_KEY = "greenlink_auto_print";

interface CartItem {
  product: any;
  qty: number;
  unitPrice: number;
}

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
type PaymentMode = "cash" | "bank" | "debt";

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "in_stock", label: "In Stock" },
  { value: "all", label: "All" },
  { value: "low_stock", label: "Low" },
  { value: "out_of_stock", label: "Out" },
];

function getCategoryTone(category: string | undefined | null) {
  const c = (category || "").toLowerCase();
  if (c.includes("herb")) return { dot: "bg-amber-400", badge: "bg-amber-500/12 text-amber-400 border-amber-500/25" };
  if (c.includes("fung")) return { dot: "bg-violet-400", badge: "bg-violet-500/12 text-violet-400 border-violet-500/25" };
  if (c.includes("insect")) return { dot: "bg-rose-400", badge: "bg-rose-500/12 text-rose-400 border-rose-500/25" };
  if (c.includes("fert")) return { dot: "bg-emerald-400", badge: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25" };
  if (c.includes("seed")) return { dot: "bg-lime-400", badge: "bg-lime-500/12 text-lime-400 border-lime-500/25" };
  if (c.includes("animal") || c.includes("vet")) return { dot: "bg-sky-400", badge: "bg-sky-500/12 text-sky-400 border-sky-500/25" };
  return { dot: "bg-muted-foreground/50", badge: "bg-muted/70 text-muted-foreground border-border/60" };
}

// ── QtyTextInput (prevents 5.0000000 float noise & cursor jumps on decimals) ──
function QtyTextInput({
  value,
  min,
  max,
  isDecimal,
  onChange,
  inputRef,
  className,
}: {
  value: number;
  min: number;
  max: number;
  isDecimal: boolean;
  onChange: (next: number) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatQty(value));

  useEffect(() => {
    if (!focused) {
      setDraft(formatQty(value));
    }
  }, [value, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (isDecimal) {
      if (!/^\d*\.?\d{0,3}$/.test(raw)) return;
    } else {
      if (!/^\d*$/.test(raw)) return;
    }
    setDraft(raw);
    if (raw === "" || raw === ".") return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= min) {
      onChange(roundQty(Math.min(parsed, max)));
    }
  };

  const commitDraft = () => {
    setFocused(false);
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < min) {
      setDraft(formatQty(value));
      return;
    }
    const clamped = roundQty(Math.min(Math.max(min, parsed), max));
    onChange(clamped);
    setDraft(formatQty(clamped));
  };

  return (
    <input
      ref={inputRef}
      type="text"
      size={4}
      inputMode={isDecimal ? "decimal" : "numeric"}
      value={focused ? draft : formatQty(value)}
      onFocus={e => {
        setFocused(true);
        setDraft(formatQty(value));
        setTimeout(() => e.target.select(), 0);
      }}
      onBlur={commitDraft}
      onChange={handleChange}
      onKeyDown={e => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className={cn("min-w-0", className)}
    />
  );
}

// ── QuickAdd Sheet ─────────────────────────────────────────────────────────────
function QuickAddSheet({
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

// ─── Sale Complete Overlay ───────────────────────────────────────────────────
function SaleCompleteOverlay({ sale, onDismiss }: { sale: any; onDismiss: () => void }) {
  const [countdown, setCountdown] = useState(8);
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); onDismiss(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onDismiss]);

  const isDebt = sale.saleType === "debt";
  const payLabel = isDebt
    ? "Credit / Debt"
    : sale.paymentMethod === "bank"
    ? "M-Pesa / Bank"
    : "Cash";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onDismiss} />
      <div className="relative bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-primary to-emerald-400" />
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold leading-tight">Sale Complete</h2>
              <p className="text-xs font-semibold text-muted-foreground mt-0.5 uppercase tracking-wider">
                {payLabel}
              </p>
            </div>
          </div>

          <div className="bg-muted/40 border border-border/70 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">
              Total Settled
            </p>
            <p className="text-3xl font-bold font-mono text-primary">{formatKES(sale.totalAmount)}</p>
            {isDebt && sale.debtCustomerName && (
              <p className="text-sm text-amber-400 font-semibold mt-2 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                {sale.debtCustomerName}
              </p>
            )}
            {sale.discount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Includes {formatKES(sale.discount)} discount
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-2 font-mono">
              REF #{(sale.id || "").slice(0, 8).toUpperCase() || "LOCAL"}
            </p>
          </div>

          {sale.items?.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1.5 max-h-28 overflow-y-auto">
              {sale.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate text-foreground/85">{it.productName} × {formatQty(Number(it.qty ?? 0))}</span>
                  <span className="font-mono font-semibold shrink-0">{formatKES(it.totalPrice)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => printSaleReceipt(sale)}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl border border-border bg-muted/50 hover:bg-muted text-sm font-semibold transition-colors cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="flex-1 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:brightness-105 transition-all cursor-pointer"
            >
              New Sale ({countdown}s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CartPanel — Retractable High-Clarity Checkout Ticket ──────────────────────
interface CartPanelProps {
  cart: CartItem[];
  discount: number;
  debtCustomerName: string;
  debtCustomerPhone: string;
  isOwner: boolean;
  createSalePending: boolean;
  subtotal: number;
  total: number;
  totalProfit: number;
  cartCount: number;
  setDiscount: (v: number) => void;
  setDebtCustomerName: (v: string) => void;
  setDebtCustomerPhone: (v: string) => void;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setShowCartMobile: (v: boolean) => void;
  onRetractDesktop: () => void;
  updateQty: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  updatePrice: (id: string, price: number) => void;
  handleCheckout: (type: "cash" | "debt", method?: "cash" | "bank") => void;
  setQtyDirect: (id: string, qty: number) => void;
  paymentMethod: "cash" | "bank";
  setPaymentMethod: (v: "cash" | "bank") => void;
  selectedCustomerBalance: number | null;
  setSelectedCustomerBalance: (v: number | null) => void;
  selectedCustomerCredit: number | null;
  setSelectedCustomerCredit: (v: number | null) => void;
  autoPrint: boolean;
  onAutoPrintChange: (v: boolean) => void;
}

const CartPanel = memo(function CartPanel({
  cart,
  discount,
  debtCustomerName,
  debtCustomerPhone,
  isOwner,
  createSalePending,
  subtotal,
  total,
  totalProfit,
  cartCount,
  setDiscount,
  setDebtCustomerName,
  setDebtCustomerPhone,
  setCart,
  setShowCartMobile,
  onRetractDesktop,
  updateQty,
  removeFromCart,
  updatePrice,
  handleCheckout,
  setQtyDirect,
  paymentMethod,
  setPaymentMethod,
  selectedCustomerBalance,
  setSelectedCustomerBalance,
  selectedCustomerCredit,
  setSelectedCustomerCredit,
  autoPrint,
  onAutoPrintChange,
}: CartPanelProps) {
  const [payMode, setPayMode] = useState<PaymentMode>(paymentMethod);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState<string>("");

  useEffect(() => {
    if (payMode !== "debt") setPayMode(paymentMethod);
  }, [paymentMethod, payMode]);

  useEffect(() => {
    if (cart.length === 0) {
      setCashTendered("");
      setCalcOpen(false);
      setDiscountOpen(false);
    }
  }, [cart.length]);

  const selectPaymentMode = (mode: PaymentMode) => {
    setPayMode(mode);
    if (mode === "cash" || mode === "bank") {
      setPaymentMethod(mode);
    } else {
      setCustomerOpen(true);
    }
  };

  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue = tenderedNum > 0 ? tenderedNum - total : 0;
  const marginPct = total > 0 ? (totalProfit / total) * 100 : 0;
  const showCustomerFields = customerOpen || payMode === "debt" || !!debtCustomerName;
  const showDiscountBar = discountOpen || discount > 0;

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-muted/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm shrink-0">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm">Current Ticket</span>
              <span className="rounded-full bg-primary/15 border border-primary/25 text-primary px-2 py-0.5 text-[10px] font-bold font-mono">
                {cart.length} {cart.length === 1 ? "item" : "items"} · {formatQty(cartCount)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            onClick={() => {
              setCart([]);
              setDiscount(0);
              setCashTendered("");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
          <button
            type="button"
            onClick={onRetractDesktop}
            title="Retract ticket panel to browse full width"
            className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-xl border border-border/80 bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="lg:hidden w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground flex items-center justify-center"
            onClick={() => setShowCartMobile(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Compact 1-Line Customer Bar */}
      <div className="px-4 py-2 border-b border-border/70 bg-muted/10 shrink-0">
        {!showCustomerFields ? (
          <button
            type="button"
            onClick={() => setCustomerOpen(true)}
            className="w-full flex items-center justify-between gap-2 rounded-xl border border-dashed border-border/80 hover:border-primary/45 bg-muted/25 hover:bg-muted/45 px-3 py-1.5 text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <User2 className="h-3.5 w-3.5 text-primary" />
              Walk-in Customer
            </span>
            <span className="text-[11px] font-semibold text-primary">+ Attach customer</span>
          </button>
        ) : (
          <div className="space-y-2 py-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                <User2 className="h-3 w-3 text-primary" />
                {payMode === "debt" ? "Customer (Required for Debt)" : "Customer"}
              </span>
              {payMode !== "debt" && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerOpen(false);
                    setDebtCustomerName("");
                    setDebtCustomerPhone("");
                    setSelectedCustomerBalance(null);
                    setSelectedCustomerCredit(null);
                  }}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Walk-in
                </button>
              )}
            </div>

            <CustomerAutocomplete
              shopId={localStorage.getItem("greenlink_shopId") || ""}
              value={debtCustomerName}
              onChange={(v) => {
                setDebtCustomerName(v);
                setSelectedCustomerBalance(null);
                setSelectedCustomerCredit(null);
              }}
              onSelect={(c: SelectedCustomer) => {
                setDebtCustomerName(c.name);
                if (c.phone) setDebtCustomerPhone(c.phone);
                setSelectedCustomerBalance(c.totalBalance);
                setSelectedCustomerCredit(c.totalCredit);
              }}
              showBalanceWarning
              selectedBalance={selectedCustomerBalance ?? undefined}
            />

            {selectedCustomerCredit != null && selectedCustomerCredit > 0 && (
              <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-400">
                Available credit: <strong>{formatKES(selectedCustomerCredit)}</strong>
                {payMode === "debt" && ` — up to ${formatKES(Math.min(selectedCustomerCredit, total))} auto-applied`}
              </p>
            )}

            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={debtCustomerPhone}
                onChange={e => setDebtCustomerPhone(e.target.value)}
                className="flex h-8 w-full rounded-xl border border-border/70 bg-muted/30 pl-9 pr-3 py-1 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
            </div>
          </div>
        )}
      </div>

      {/* Hero Chosen Items Area — Spacious & Ultra-Legible */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-background/35">
        {cart.map((item, idx) => {
          const isMeasured = item.product.productType === "measured" || isWeighedUnit(item.product.unit || "");
          const cartStep = isMeasured ? 0.25 : 1;
          const cartMin = isMeasured ? 0.01 : 1;
          const itemProfit = isOwner && item.product.purchasePrice
            ? item.qty * (item.unitPrice - item.product.purchasePrice)
            : null;
          const itemMarginPct = item.product.purchasePrice && item.unitPrice
            ? ((item.unitPrice - item.product.purchasePrice) / item.unitPrice) * 100
            : null;
          const isLoss = itemProfit !== null && itemProfit < 0;
          const isLowMargin = !isLoss && itemMarginPct !== null && itemMarginPct < 10;
          const lineTotal = item.qty * item.unitPrice;

          return (
            <div
              key={item.product.id}
              className={cn(
                "rounded-2xl border p-3 transition-colors shadow-sm",
                isLoss
                  ? "bg-destructive/8 border-destructive/40"
                  : isLowMargin
                  ? "bg-amber-500/8 border-amber-500/35"
                  : "bg-card border-border/90 hover:border-primary/35"
              )}
            >
              {/* Item Title Row */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="mt-0.5 inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-md bg-muted text-[10px] font-bold font-mono text-muted-foreground shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-foreground leading-snug break-words">
                      {item.product.canonicalName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {formatQty(item.qty)} {item.product.unit || "unit"} × {formatKES(item.unitPrice)}
                      </span>
                      {isMeasured && (
                        <span className="text-[9px] font-bold text-primary bg-primary/12 px-1.5 py-0.5 rounded-full">
                          Weighed
                        </span>
                      )}
                      {isOwner && isLoss && (
                        <span className="text-[9px] font-bold bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">
                          LOSS
                        </span>
                      )}
                      {isOwner && isLowMargin && (
                        <span className="text-[9px] font-bold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">
                          LOW MARGIN
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Line Total + Delete */}
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm font-mono text-primary">
                      {formatKES(lineTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-muted-foreground/50 hover:text-destructive p-1 rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                      aria-label={`Remove ${item.product.canonicalName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isOwner && itemProfit !== null && (
                    <span className={cn("text-[10px] font-mono font-semibold pr-1", itemProfit >= 0 ? "text-emerald-400" : "text-destructive")}>
                      {itemProfit >= 0 ? "+" : "-"}{formatKES(Math.abs(itemProfit))}
                    </span>
                  )}
                </div>
              </div>

              {/* Item Quick Controls Row */}
              <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                <div className="flex items-center bg-muted/65 rounded-xl border border-border overflow-hidden">
                  <button
                    type="button"
                    className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => updateQty(item.product.id, -cartStep)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <QtyTextInput
                    value={item.qty}
                    min={cartMin}
                    max={item.product.stockQty}
                    isDecimal={isMeasured}
                    onChange={next => setQtyDirect(item.product.id, next)}
                    className="w-16 h-8 text-center text-xs font-bold font-mono tabular-nums bg-transparent border-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    className="h-8 w-8 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors disabled:opacity-35 cursor-pointer"
                    onClick={() => updateQty(item.product.id, cartStep)}
                    disabled={item.qty >= item.product.stockQty}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-muted/35 px-2.5 h-8">
                  <span className="text-[10px] font-semibold text-muted-foreground">Unit KES</span>
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={e => updatePrice(item.product.id, Number(e.target.value))}
                    className="w-16 text-right text-xs font-bold font-mono bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact, Progressive Checkout Footer */}
      <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-3.5 space-y-2.5">
        {/* Compact Subtotal + Discount Trigger */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-mono font-semibold text-foreground">{formatKES(subtotal)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {payMode === "cash" && (
              <button
                type="button"
                onClick={() => setCalcOpen(v => !v)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer",
                  calcOpen || tenderedNum > 0
                    ? "bg-primary/12 border-primary/30 text-primary"
                    : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <Calculator className="h-3 w-3" />
                Change
              </button>
            )}
            <button
              type="button"
              onClick={() => setDiscountOpen(v => !v)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer",
                showDiscountBar
                  ? "bg-primary/12 border-primary/30 text-primary"
                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Percent className="h-3 w-3" />
              {discount > 0 ? `-${formatKES(discount)}` : "Discount"}
            </button>
          </div>
        </div>

        {/* Expandable Discount Bar */}
        {showDiscountBar && (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1 flex-wrap">
                {[5, 10, 15, 20].map(pct => {
                  const amt = Math.round((subtotal * pct) / 100);
                  const active = discount === amt && amt > 0;
                  return (
                    <button
                      type="button"
                      key={pct}
                      onClick={() => setDiscount(amt)}
                      className={cn(
                        "text-[10px] font-bold font-mono px-2 py-1 rounded-lg border transition-colors cursor-pointer",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background/70 border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={subtotal}
                  value={discount || ""}
                  onChange={e => setDiscount(Number(e.target.value))}
                  placeholder="KES 0"
                  className="w-20 h-7 text-right text-xs font-bold font-mono bg-background border border-border rounded-lg px-2 focus:outline-none focus:border-primary"
                />
                {discount > 0 && (
                  <button
                    type="button"
                    onClick={() => { setDiscount(0); setDiscountOpen(false); }}
                    className="h-7 px-2 rounded-lg text-[10px] font-bold bg-destructive/12 text-destructive cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Expandable Cash Change Helper */}
        {payMode === "cash" && (calcOpen || tenderedNum > 0) && (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCashTendered(String(total))}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-background/70 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Exact
                </button>
                {[500, 1000, 2000, 5000].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCashTendered(String(n))}
                    className="text-[10px] font-bold font-mono px-1.5 py-1 rounded-lg bg-background/70 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {n.toLocaleString()}
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder={String(Math.ceil(total))}
                value={cashTendered}
                onChange={e => setCashTendered(e.target.value)}
                className="w-20 h-7 text-right text-xs font-bold font-mono bg-background border border-border rounded-lg px-2 focus:outline-none focus:border-primary"
              />
            </div>
            {tenderedNum > 0 && (
              <p className={cn("text-[11px] font-bold font-mono text-right", changeDue >= 0 ? "text-emerald-400" : "text-destructive")}>
                {changeDue >= 0 ? `Change due: ${formatKES(changeDue)}` : `Short by ${formatKES(Math.abs(changeDue))}`}
              </p>
            )}
          </div>
        )}

        {/* Below-cost warning */}
        {isOwner && cart.some(i => i.product.purchasePrice && i.unitPrice < i.product.purchasePrice) && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/25 rounded-xl px-2.5 py-1.5">
            <span className="text-destructive font-bold text-xs shrink-0">⚠</span>
            <p className="text-[11px] text-destructive font-semibold">
              {cart.filter(i => i.product.purchasePrice && i.unitPrice < i.product.purchasePrice).length} item(s) priced below cost
            </p>
          </div>
        )}

        {/* Payment Mode Selector */}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/60 p-1 border border-border/70">
          <button
            type="button"
            onClick={() => selectPaymentMode("cash")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer",
              payMode === "cash"
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Banknote className="h-3.5 w-3.5 text-emerald-400" />
            Cash
          </button>
          <button
            type="button"
            onClick={() => selectPaymentMode("bank")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer",
              payMode === "bank"
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Landmark className="h-3.5 w-3.5 text-sky-400" />
            M-Pesa
          </button>
          <button
            type="button"
            onClick={() => selectPaymentMode("debt")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer",
              payMode === "debt"
                ? "bg-destructive/15 text-destructive border border-destructive/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Debt
          </button>
        </div>

        {/* Hero Total + Auto-print + Primary CTA */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary/25 bg-primary/[0.06] px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Total Due
            </p>
            {isOwner && (
              <p className={cn("text-[10px] font-mono font-semibold", totalProfit < 0 ? "text-destructive" : "text-emerald-400")}>
                {totalProfit < 0 ? "-" : "+"}{formatKES(Math.abs(totalProfit))} ({marginPct.toFixed(0)}%)
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onAutoPrintChange(!autoPrint)}
              title={autoPrint ? "Auto-print ON" : "Auto-print OFF"}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors cursor-pointer",
                autoPrint
                  ? "bg-primary/15 border-primary/35 text-primary"
                  : "bg-background/60 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Printer className="h-3 w-3" />
              {autoPrint ? "Auto" : "Print"}
            </button>
            <span className="text-xl font-bold font-mono text-primary">
              {formatKES(total)}
            </span>
          </div>
        </div>

        {payMode === "debt" ? (
          <Button
            variant="destructive"
            className="w-full h-11 rounded-2xl font-bold text-sm shadow-lg shadow-destructive/20 cursor-pointer"
            disabled={createSalePending}
            onClick={() => handleCheckout("debt")}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Record Debt Sale · {formatKES(total)}
          </Button>
        ) : (
          <Button
            className="w-full h-11 rounded-2xl font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-105 cursor-pointer"
            disabled={createSalePending}
            onClick={() => handleCheckout("cash", payMode)}
          >
            {payMode === "bank" ? (
              <Landmark className="h-4 w-4 mr-2" />
            ) : (
              <Banknote className="h-4 w-4 mr-2" />
            )}
            {payMode === "bank" ? "Complete M-Pesa Sale" : "Complete Cash Sale"} · {formatKES(total)}
          </Button>
        )}
      </div>
    </div>
  );
});

// ─── Recent Sales Slide-Over Drawer ──────────────────────────────────────────
function RecentSalesDrawer({ shopId, userName, onClose }: { shopId: string; userName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [localVoided, setLocalVoided] = useState<Set<string>>(new Set());

  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ["recent-sales", shopId, today],
    queryFn: () => customFetch<any[]>(`/api/sales?shopId=${encodeURIComponent(shopId)}&date=${today}&includeVoided=true&limit=50`),
    enabled: !!shopId,
    staleTime: 0,
  });

  const { data: expandedItems } = useQuery({
    queryKey: ["sale-detail", expandedId],
    queryFn: async () => {
      const data = await customFetch<any>(`/api/sales/${expandedId}`);
      return (data.items ?? []) as any[];
    },
    enabled: !!expandedId,
  });

  const handleVoid = async (saleId: string) => {
    setVoidingId(saleId);
    try {
      await customFetch(`/api/sales/${saleId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason || "Voided at POS", performedBy: userName }),
      });
      setLocalVoided(prev => new Set([...prev, saleId]));
      setConfirmId(null);
      setVoidReason("");
      toast.success("Sale voided — stock restored");
      refetch();
      qc.invalidateQueries({ queryKey: ["recent-sales"] });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
    } catch (err: any) {
      toast.error(err?.message || "Could not void sale");
    } finally {
      setVoidingId(null);
    }
  };

  const salesList = salesData ?? [];
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let cashTotal = 0;
    let bankTotal = 0;
    let debtTotal = 0;
    let activeCount = 0;
    for (const s of salesList) {
      if (s.isDeleted || localVoided.has(s.id)) continue;
      activeCount++;
      const amt = Number(s.totalAmount || 0);
      totalRevenue += amt;
      if (s.saleType === "debt") debtTotal += amt;
      else if (s.paymentMethod === "bank") bankTotal += amt;
      else cashTotal += amt;
    }
    return { totalRevenue, cashTotal, bankTotal, debtTotal, activeCount };
  }, [salesList, localVoided]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full flex flex-col bg-background border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-card shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-base font-bold text-foreground">Today&apos;s Sales</h2>
            <p className="text-[11px] text-muted-foreground">
              {summary.activeCount} active · {salesList.length} total transactions
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-primary cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border bg-card/50 grid grid-cols-3 gap-2 shrink-0">
          <div className="rounded-xl border border-border/80 bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-xs font-bold font-mono text-primary mt-0.5">{formatKES(summary.totalRevenue)}</p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Cash / Bank</p>
            <p className="text-xs font-bold font-mono text-emerald-400 mt-0.5">
              {formatKES(summary.cashTotal + summary.bankTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Debt</p>
            <p className="text-xs font-bold font-mono text-destructive mt-0.5">{formatKES(summary.debtTotal)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-2 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded w-1/3" />
                    <div className="h-2.5 bg-muted rounded w-1/2" />
                  </div>
                  <div className="h-5 bg-muted rounded w-16" />
                </div>
              </div>
            ))
          ) : salesList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-muted-foreground gap-3">
              <ReceiptText className="w-10 h-10 text-muted-foreground/25" />
              <p className="text-sm font-semibold">No sales yet today</p>
              <p className="text-xs text-muted-foreground/70">Completed transactions appear here automatically</p>
            </div>
          ) : (
            salesList.map((sale, idx) => {
              const isVoided = sale.isDeleted || localVoided.has(sale.id);
              const isExpanded = expandedId === sale.id;
              const isDebt = sale.saleType === "debt";
              const time = new Date(sale.createdAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
              const num = salesList.length - idx;

              return (
                <div
                  key={sale.id}
                  className={cn(
                    "rounded-2xl border overflow-hidden transition-all",
                    isVoided ? "bg-muted/20 border-border/40 opacity-60" : "bg-card border-border"
                  )}
                >
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold font-mono",
                        isVoided
                          ? "bg-muted text-muted-foreground"
                          : isDebt
                          ? "bg-destructive/12 text-destructive"
                          : "bg-primary/12 text-primary"
                      )}
                    >
                      {isVoided ? <Ban className="h-4 w-4" /> : `#${num}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold font-mono text-foreground">
                          {formatKES(sale.totalAmount)}
                        </span>
                        {isVoided && (
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            VOIDED
                          </span>
                        )}
                        {isDebt && !isVoided && (
                          <span className="text-[10px] font-bold text-destructive bg-destructive/12 px-1.5 py-0.5 rounded-full">
                            DEBT
                          </span>
                        )}
                        {!isDebt && !isVoided && sale.paymentMethod === "bank" && (
                          <span className="text-[10px] font-bold text-sky-400 bg-sky-500/12 px-1.5 py-0.5 rounded-full">
                            M-PESA / BANK
                          </span>
                        )}
                        {!isDebt && !isVoided && (!sale.paymentMethod || sale.paymentMethod === "cash") && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/12 px-1.5 py-0.5 rounded-full">
                            CASH
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {time} · {sale.servedBy ?? "staff"}
                        {sale.deleteReason && ` · ${sale.deleteReason}`}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/20">
                      {expandedItems ? (
                        <div className="divide-y divide-border/40">
                          {expandedItems.map((item: any) => (
                            <div key={item.id ?? item.productId} className="flex items-center justify-between px-4 py-2.5 text-xs">
                              <span className="text-foreground font-medium flex-1 min-w-0 truncate">
                                {item.productName}
                              </span>
                              <span className="text-muted-foreground font-mono shrink-0 ml-3">
                                ×{formatQty(Number(item.qty ?? 0))} @ {formatKES(item.unitPrice)}
                              </span>
                              <span className="font-bold font-mono text-foreground ml-3 shrink-0">
                                {formatKES(item.totalPrice)}
                              </span>
                            </div>
                          ))}
                          {sale.discount > 0 && (
                            <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                              <span>Discount</span>
                              <span className="font-mono text-destructive">-{formatKES(sale.discount)}</span>
                            </div>
                          )}
                          <div className="px-4 py-3 flex flex-col gap-2">
                            {!isVoided && (
                              <button
                                type="button"
                                onClick={() => printSaleReceipt({ ...sale, items: expandedItems })}
                                className="w-full h-9 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Reprint Receipt
                              </button>
                            )}
                            {!isVoided && (
                              confirmId === sale.id ? (
                                <div className="space-y-2 pt-1">
                                  <p className="text-xs font-semibold text-foreground">Void this sale?</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Stock will be restored.{isDebt ? " Linked debt will be cancelled." : ""}
                                  </p>
                                  <input
                                    type="text"
                                    value={voidReason}
                                    onChange={e => setVoidReason(e.target.value)}
                                    placeholder="Reason (optional)…"
                                    className="w-full h-8 rounded-xl border border-border bg-background px-3 text-xs focus:outline-none focus:border-primary"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => { setConfirmId(null); setVoidReason(""); }}
                                      className="flex-1 h-8 rounded-xl bg-muted text-muted-foreground text-xs font-semibold cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleVoid(sale.id)}
                                      disabled={voidingId === sale.id}
                                      className="flex-1 h-8 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold disabled:opacity-50 cursor-pointer"
                                    >
                                      {voidingId === sale.id ? "Voiding…" : "Confirm Void"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmId(sale.id)}
                                  className="w-full h-8 rounded-xl border border-destructive/35 text-destructive text-xs font-bold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                  Void This Sale
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <RotateCcw className="h-3 w-3 animate-spin" />
                          Loading items…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main POS Page ────────────────────────────────────────────────────────────
export default function POS() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";
  const qc = useQueryClient();
  const { pendingCount, isOnline: offlineIsOnline, syncing: offlineSyncing, refreshCount: refreshOfflineCount } = useOfflineSyncCtx();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 100);
  const [stockFilter, setStockFilter] = useState<StockFilter>("in_stock");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"az" | "za" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc" | "newest">("newest");
  const [viewMode, setViewMode] = useState<"cards" | "table">(() =>
    (localStorage.getItem("pos_view_mode") as "cards" | "table") || "cards"
  );
  const [visibleLimit, setVisibleLimit] = useState(200);
  const [showRecentSales, setShowRecentSales] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: productsData, isLoading, isRefetching, dataUpdatedAt } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId, refetchInterval: 60_000, refetchIntervalInBackground: false } as any }
  );

  const isStale = !isRefetching && dataUpdatedAt > 0 && (Date.now() - dataUpdatedAt) > 90_000;

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of productsData?.products || []) {
      const cat = (p.category || "").trim();
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }, [productsData]);

  const filteredProducts = useMemo(() => {
    let all = productsData?.products || [];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      all = all.filter(p =>
        p.canonicalName.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    if (selectedCategory !== "all") {
      all = all.filter(p => (p.category || "").trim() === selectedCategory);
    }
    if (stockFilter === "in_stock") all = all.filter(p => p.stockQty > 0);
    else if (stockFilter === "low_stock") all = all.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty);
    else if (stockFilter === "out_of_stock") all = all.filter(p => p.stockQty === 0);

    return [...all].sort((a, b) => {
      switch (sortBy) {
        case "az": return a.canonicalName.localeCompare(b.canonicalName);
        case "za": return b.canonicalName.localeCompare(a.canonicalName);
        case "stock_asc": return a.stockQty - b.stockQty;
        case "stock_desc": return b.stockQty - a.stockQty;
        case "price_asc": return (a.sellingPrice || 0) - (b.sellingPrice || 0);
        case "price_desc": return (b.sellingPrice || 0) - (a.sellingPrice || 0);
        case "newest": return new Date((b as any).updatedAt || (b as any).createdAt || 0).getTime() - new Date((a as any).updatedAt || (a as any).createdAt || 0).getTime();
        default: return a.canonicalName.localeCompare(b.canonicalName);
      }
    });
  }, [productsData, debouncedSearch, selectedCategory, stockFilter, sortBy]);

  const filterCounts = useMemo(() => {
    const all = productsData?.products || [];
    return {
      all: all.length,
      in_stock: all.filter(p => p.stockQty > 0).length,
      low_stock: all.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty).length,
      out_of_stock: all.filter(p => p.stockQty === 0).length,
    };
  }, [productsData]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [showCartMobile, setShowCartMobile] = useState(false);
  // Desktop ticket drawer auto-opens when first item enters cart, auto-retracts when empty,
  // and can also be manually retracted/expanded anytime while keeping items in the cart.
  const [ticketExpanded, setTicketExpanded] = useState(false);
  const prevCartLenRef = useRef(0);

  useEffect(() => {
    if (prevCartLenRef.current === 0 && cart.length > 0) {
      setTicketExpanded(true);
    } else if (cart.length === 0) {
      setTicketExpanded(false);
    }
    prevCartLenRef.current = cart.length;
  }, [cart.length]);

  const [debtCustomerName, setDebtCustomerName] = useState("");
  const [debtCustomerPhone, setDebtCustomerPhone] = useState("");
  const [selectedCustomerBalance, setSelectedCustomerBalance] = useState<number | null>(null);
  const [selectedCustomerCredit, setSelectedCustomerCredit] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("cash");
  const createSale = useCreateSale();
  const submittingRef = useRef(false);

  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem(AUTO_PRINT_KEY) === "true");
  const autoPrintRef = useRef(autoPrint);
  useEffect(() => { autoPrintRef.current = autoPrint; }, [autoPrint]);
  const handleAutoPrintChange = useCallback((v: boolean) => {
    setAutoPrint(v);
    localStorage.setItem(AUTO_PRINT_KEY, String(v));
  }, []);

  const [quickAddProduct, setQuickAddProduct] = useState<any | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const draftRestoredRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.key === "/" && !inInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "Escape" && document.activeElement === searchInputRef.current && search) {
        setSearch("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [search]);

  useEffect(() => {
    if (cart.length === 0 && discount === 0 && !debtCustomerName) {
      if (draftRestoredRef.current) {
        sessionStorage.removeItem(CART_DRAFT_KEY);
      }
      return;
    }
    try {
      sessionStorage.setItem(CART_DRAFT_KEY, JSON.stringify({
        items: cart.map(i => ({ productId: i.product.id, qty: i.qty, unitPrice: i.unitPrice })),
        discount,
        debtCustomerName,
        debtCustomerPhone,
      }));
    } catch {}
  }, [cart, discount, debtCustomerName, debtCustomerPhone]);

  useEffect(() => {
    const products = productsData?.products;
    if (!products?.length) return;

    const quotationRaw = sessionStorage.getItem("greenlink_pending_cart");
    if (quotationRaw) {
      try {
        const pending = JSON.parse(quotationRaw);
        const cartItems: CartItem[] = [];
        for (const item of pending.items ?? []) {
          const product = products.find((p: any) => p.id === item.productId);
          if (product) {
            cartItems.push({ product, qty: item.qty, unitPrice: item.unitPrice });
          } else {
            cartItems.push({
              product: {
                id: item.productId || `stub-${Math.random()}`,
                canonicalName: item.productName,
                normalizedName: item.productName,
                sellingPrice: item.unitPrice,
                purchasePrice: 0,
                stockQty: 9999,
                unit: item.unit || "unit",
                category: "",
                sku: "",
                isActive: true,
              },
              qty: item.qty,
              unitPrice: item.unitPrice,
            });
          }
        }
        if (cartItems.length > 0) {
          setCart(cartItems);
          if (pending.discount > 0) setDiscount(pending.discount);
          if (pending.customerName) setDebtCustomerName(pending.customerName);
          toast.success(`${pending.fromQuote ?? "Quote"} loaded into ticket (${cartItems.length} item${cartItems.length !== 1 ? "s" : ""})`);
        }
      } catch {}
      sessionStorage.removeItem("greenlink_pending_cart");
      draftRestoredRef.current = true;
      return;
    }

    const draftRaw = sessionStorage.getItem(CART_DRAFT_KEY);
    if (!draftRaw) {
      draftRestoredRef.current = true;
      return;
    }
    try {
      const draft = JSON.parse(draftRaw);
      if (!draft.items?.length) {
        draftRestoredRef.current = true;
        return;
      }
      const cartItems: CartItem[] = [];
      for (const item of draft.items) {
        const product = products.find((p: any) => p.id === item.productId);
        if (!product) continue;
        const maxQty = product.stockQty;
        if (maxQty <= 0) continue;
        const restoredQty = roundQty(Math.min(item.qty, maxQty));
        cartItems.push({ product, qty: restoredQty, unitPrice: item.unitPrice });
      }
      if (cartItems.length > 0) {
        setCart(cartItems);
        if (draft.discount > 0) setDiscount(draft.discount);
        if (draft.debtCustomerName) setDebtCustomerName(draft.debtCustomerName);
        if (draft.debtCustomerPhone) setDebtCustomerPhone(draft.debtCustomerPhone);
        toast.success(`Ticket restored (${cartItems.length} item${cartItems.length !== 1 ? "s" : ""})`);
      }
    } catch {}
    draftRestoredRef.current = true;
  }, [productsData]);

  useEffect(() => {
    if (showCartMobile) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [showCartMobile]);

  const openQuickAdd = (product: any) => {
    if (product.stockQty === 0) { toast.error("Out of stock"); return; }
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  const handleQuickAdd = (product: any, qty: number, price: number) => {
    const cleanQty = roundQty(qty);
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, qty: roundQty(Math.min(i.qty + cleanQty, product.stockQty)), unitPrice: price }
            : i
        );
      }
      return [...prev, { product, qty: roundQty(Math.min(cleanQty, product.stockQty)), unitPrice: price }];
    });
    toast.success(`${product.canonicalName} added`);
  };

  const handleInstantAdd = (e: React.MouseEvent, product: any) => {
    e.stopPropagation();
    if (product.stockQty === 0) { toast.error("Out of stock"); return; }
    const weighed = (product as any).productType === "measured" || isWeighedUnit(product.unit || "");
    if (weighed) {
      openQuickAdd(product);
      return;
    }
    const existing = cart.find(i => i.product.id === product.id);
    if (existing && existing.qty >= product.stockQty) {
      toast.error(`Only ${formatQty(product.stockQty)} in stock`);
      return;
    }
    handleQuickAdd(product, 1, existing ? existing.unitPrice : product.sellingPrice || 0);
  };

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart(prev =>
      prev.flatMap(i => {
        if (i.product.id !== productId) return [i];
        const isMeasured = i.product.productType === "measured" || isWeighedUnit(i.product.unit || "");
        const minQty = isMeasured ? 0.01 : 1;
        const newQty = roundQty(i.qty + delta);
        if (newQty < minQty) return [];
        return [{ ...i, qty: roundQty(Math.min(newQty, i.product.stockQty)) }];
      })
    );
  }, []);

  const setQtyDirect = useCallback((productId: string, qty: number) => {
    setCart(prev =>
      prev.map(i => {
        if (i.product.id !== productId) return i;
        const isMeasured = i.product.productType === "measured" || isWeighedUnit(i.product.unit || "");
        const minQty = isMeasured ? 0.01 : 1;
        return { ...i, qty: roundQty(Math.min(Math.max(minQty, qty), i.product.stockQty)) };
      }).filter(i => i.qty > 0)
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => setCart(prev => prev.filter(i => i.product.id !== productId)), []);
  const updatePrice = useCallback((productId: string, price: number) => setCart(prev => prev.map(i => i.product.id === productId ? { ...i, unitPrice: price } : i)), []);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + roundQty(i.qty) * i.unitPrice, 0), [cart]);
  const total = Math.max(0, Math.round(subtotal) - discount);
  const totalProfit = useMemo(() => cart.reduce((s, i) => {
    const cost = i.product.purchasePrice || 0;
    return s + roundQty(i.qty) * (i.unitPrice - cost);
  }, 0), [cart]);
  const cartCount = roundQty(cart.reduce((s, i) => s + i.qty, 0));

  const handleCheckout = useCallback(async (saleType: "cash" | "debt", method?: "cash" | "bank") => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (cart.length === 0) { submittingRef.current = false; toast.error("Cart is empty"); return; }
    if (saleType === "debt" && !debtCustomerName.trim()) { submittingRef.current = false; toast.error("Enter customer name for debt sale"); return; }
    const zeroPriceItems = cart.filter(i => !i.unitPrice || i.unitPrice <= 0 || !isFinite(i.unitPrice));
    if (zeroPriceItems.length > 0) {
      submittingRef.current = false;
      toast.error(`Set a price for: ${zeroPriceItems.map(i => i.product.canonicalName).join(", ")}`);
      return;
    }

    const cartSnapshot = [...cart];
    const discountSnapshot = discount;
    const debtName = toTitleCase(debtCustomerName);
    const debtPhone = debtCustomerPhone;
    const chosenMethod = saleType === "debt" ? "cash" : (method ?? paymentMethod);
    const mutationId = newMutationId();
    const ts = () => new Date().toISOString();

    logInventory({ stage: "pending_added", mutationId, source: "pos", timestamp: ts(), extra: { saleType, items: cartSnapshot.length } });

    await qc.cancelQueries({ queryKey: getListProductsQueryKey() });
    const productsSnapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });

    const optimisticNow = ts();
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return {
        ...old,
        products: old.products.map((p: any) => {
          const cartItem = cartSnapshot.find(i => i.product.id === p.id);
          if (!cartItem) return p;
          const updated = { ...p, stockQty: roundQty(Math.max(0, p.stockQty - cartItem.qty)), updatedAt: optimisticNow };
          recordMutationResult(updated);
          logInventory({ stage: "optimistic_applied", mutationId, source: "pos", timestamp: optimisticNow, productId: p.id, previousQty: p.stockQty, nextQty: updated.stockQty });
          return updated;
        }),
      };
    });

    setCart([]); setDiscount(0); setDebtCustomerName(""); setDebtCustomerPhone(""); setSelectedCustomerBalance(null); setSelectedCustomerCredit(null); setShowCartMobile(false);
    const successMsg = saleType === "debt" ? "✓ Debt recorded!" : chosenMethod === "bank" ? "✓ Bank payment complete!" : "✓ Cash sale complete!";
    toast.success(successMsg);

    logInventory({ stage: "mutation_started", mutationId, source: "pos", timestamp: ts(), extra: { saleType, paymentMethod: chosenMethod } });

    const rawSubtotal = cartSnapshot.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const safeDiscount = Math.min(Math.max(0, discountSnapshot), rawSubtotal);

    const salePayload = {
      shopId,
      saleType,
      paymentMethod: chosenMethod,
      discount: safeDiscount,
      items: cartSnapshot.map(i => ({
        productId: i.product.id,
        qty: i.qty,
        unitPrice: isFinite(i.unitPrice) && i.unitPrice > 0 ? i.unitPrice : 0,
      })),
      servedBy: userName,
      debtCustomerName: saleType === "debt" ? debtName : undefined,
      debtCustomerPhone: saleType === "debt" ? debtPhone : undefined,
    };

    if (!navigator.onLine) {
      try {
        await enqueueMutation("sale", shopId, salePayload);
        logInventory({ stage: "queued_offline", mutationId, source: "pos", timestamp: ts(), extra: { saleType } });
        await refreshOfflineCount();
      } catch (enqueueErr) {
        productsSnapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        setCart(cartSnapshot); setDiscount(discountSnapshot);
        logInventory({ stage: "offline_enqueue_failed", mutationId, source: "pos", timestamp: ts(), extra: { error: String(enqueueErr) } });
        toast.error("Could not save offline sale — please retry");
      } finally {
        submittingRef.current = false;
      }
      return;
    }

    createSale.mutate(
      { data: salePayload },
      {
        onSuccess: (data: any) => {
          const snapshotTotal = rawSubtotal - safeDiscount;
          const saleForReceipt = {
            ...(data ?? {}),
            id: data?.id ?? data?.saleId ?? "",
            createdAt: data?.createdAt ?? new Date().toISOString(),
            saleType,
            paymentMethod: chosenMethod,
            totalAmount: data?.totalAmount ?? snapshotTotal,
            discount: safeDiscount,
            debtCustomerName: saleType === "debt" ? debtName : undefined,
            servedBy: userName,
            items: cartSnapshot.map(i => ({
              productId: i.product.id,
              productName: i.product.canonicalName,
              qty: i.qty,
              unitPrice: i.unitPrice,
              totalPrice: i.qty * i.unitPrice,
            })),
          };
          setCompletedSale(saleForReceipt);
          if (autoPrintRef.current) printSaleReceipt(saleForReceipt);
        },
        onError: (err: any) => {
          submittingRef.current = false;
          productsSnapshot.forEach(([key, data]) => qc.setQueryData(key, data));
          setCart(cartSnapshot); setDiscount(discountSnapshot);
          logInventory({ stage: "rollback_triggered", mutationId, source: "pos", timestamp: new Date().toISOString(), extra: { error: err?.message } });
          toast.error(err?.message || "Sale failed — please retry");
        },
        onSettled: () => {
          submittingRef.current = false;
          if (saleType === "debt") {
            qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
            qc.invalidateQueries({ queryKey: ["/api/crm"] });
            qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
          }
          qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
          logInventory({ stage: "invalidate_triggered", mutationId, source: "pos", timestamp: new Date().toISOString(), extra: { pending_removed: true } });
        },
      }
    );
  }, [cart, discount, debtCustomerName, debtCustomerPhone, paymentMethod, shopId, userName, qc, createSale, refreshOfflineCount]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filteredProducts.length > 0 && search.trim()) {
      const q = search.trim().toLowerCase();
      const exactSku = filteredProducts.find(p => p.sku && p.sku.toLowerCase() === q && p.stockQty > 0);
      const target = exactSku || (filteredProducts.length === 1 && filteredProducts[0].stockQty > 0 ? filteredProducts[0] : null);
      if (target) {
        e.preventDefault();
        openQuickAdd(target);
      }
    }
  };

  const visibleProducts = useMemo(() => {
    if (debouncedSearch || selectedCategory !== "all" || (stockFilter !== "all" && stockFilter !== "in_stock")) {
      return filteredProducts;
    }
    return filteredProducts.slice(0, visibleLimit);
  }, [filteredProducts, debouncedSearch, selectedCategory, stockFilter, visibleLimit]);

  const showDesktopDrawer = cart.length > 0 && ticketExpanded;

  const cartPanelProps: CartPanelProps = {
    cart,
    discount,
    debtCustomerName,
    debtCustomerPhone,
    isOwner,
    createSalePending: createSale.isPending,
    subtotal,
    total,
    totalProfit,
    cartCount,
    setDiscount,
    setDebtCustomerName,
    setDebtCustomerPhone,
    setCart,
    setShowCartMobile,
    onRetractDesktop: () => setTicketExpanded(false),
    updateQty,
    removeFromCart,
    updatePrice,
    handleCheckout,
    setQtyDirect,
    paymentMethod,
    setPaymentMethod,
    selectedCustomerBalance,
    setSelectedCustomerBalance,
    selectedCustomerCredit,
    setSelectedCustomerCredit,
    autoPrint,
    onAutoPrintChange: handleAutoPrintChange,
  };

  return (
    <div className="relative flex flex-col lg:flex-row h-full bg-background overflow-hidden">
      {/* ── Left Catalog Pane ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Command & Filter Header */}
        <div className="px-3.5 py-3 md:px-5 md:py-3.5 border-b border-border bg-card/85 backdrop-blur-md shrink-0 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                placeholder="Search products, SKU, or category…"
                className="pl-10 pr-20 h-10 text-sm bg-muted/45 border-border/80 rounded-2xl focus-visible:ring-primary/40"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <span className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center rounded-md border border-border bg-background/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground pointer-events-none">
                  /
                </span>
              )}
            </div>

            <div className="shrink-0 relative">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="appearance-none h-10 pl-8 pr-3 rounded-2xl text-xs font-semibold bg-muted/50 border border-border text-muted-foreground hover:text-foreground focus:outline-none focus:border-primary/60 cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
                <option value="stock_asc">Stock ↑</option>
                <option value="stock_desc">Stock ↓</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
              </select>
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>

            <div className="hidden sm:flex items-center rounded-2xl border border-border bg-muted/40 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => { setViewMode("cards"); localStorage.setItem("pos_view_mode", "cards"); }}
                title="Grid view"
                className={cn(
                  "h-8 w-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer",
                  viewMode === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setViewMode("table"); localStorage.setItem("pos_view_mode", "table"); }}
                title="Table view"
                className={cn(
                  "h-8 w-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer",
                  viewMode === "table" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setViewMode(v => {
                const next = v === "cards" ? "table" : "cards";
                localStorage.setItem("pos_view_mode", next);
                return next;
              })}
              className="sm:hidden shrink-0 flex items-center justify-center h-10 w-10 rounded-2xl bg-muted/50 border border-border text-muted-foreground"
              title={viewMode === "cards" ? "Table view" : "Grid view"}
            >
              {viewMode === "cards" ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowRecentSales(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 h-10 rounded-2xl bg-muted/50 hover:bg-muted text-foreground text-xs font-semibold border border-border transition-colors cursor-pointer"
              title="Today's sales history"
            >
              <ReceiptText className="h-3.5 w-3.5 text-primary" />
              <span className="hidden md:inline">Sales</span>
            </button>

            {/* Desktop Retracted Ticket Quick Toggle */}
            {cart.length > 0 && !ticketExpanded && (
              <button
                type="button"
                onClick={() => setTicketExpanded(true)}
                className="hidden lg:inline-flex items-center gap-2 px-3.5 h-10 rounded-2xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 hover:brightness-105 transition-all cursor-pointer"
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
                <span>Ticket ({cart.length}) · {formatKES(total)}</span>
              </button>
            )}

            {(!offlineIsOnline || offlineSyncing || pendingCount > 0) && (
              <div
                className={cn(
                  "lg:hidden shrink-0 flex items-center gap-1 px-2.5 h-8 rounded-full text-[10px] font-bold border",
                  offlineSyncing
                    ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                    : !offlineIsOnline && pendingCount > 0
                    ? "bg-destructive/10 border-destructive/20 text-destructive"
                    : !offlineIsOnline
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-orange-500/10 border-orange-500/20 text-orange-400"
                )}
              >
                {offlineSyncing ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <WifiOff className="h-2.5 w-2.5" />}
                <span>
                  {offlineSyncing ? `Syncing ${pendingCount}` : pendingCount > 0 ? `${pendingCount} queued` : "Offline"}
                </span>
              </div>
            )}
          </div>

          {/* Filter & Category Strip */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            <div className="flex items-center gap-1 shrink-0 pr-2 border-r border-border/70">
              {FILTERS.map(f => {
                const active = stockFilter === f.value;
                return (
                  <button
                    type="button"
                    key={f.value}
                    onClick={() => setStockFilter(f.value)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span>{f.label}</span>
                    <span className={cn("text-[10px] font-mono font-bold", active ? "text-primary-foreground/75" : "text-muted-foreground/60")}>
                      {filterCounts[f.value]}
                    </span>
                  </button>
                );
              })}
            </div>

            {categoryOptions.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                    selectedCategory === "all"
                      ? "bg-card border-primary/40 text-foreground"
                      : "bg-transparent border-border/70 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Tag className="h-3 w-3 text-primary" />
                  All Categories
                </button>
                {categoryOptions.map(cat => {
                  const active = selectedCategory === cat.name;
                  const tone = getCategoryTone(cat.name);
                  return (
                    <button
                      type="button"
                      key={cat.name}
                      onClick={() => setSelectedCategory(active ? "all" : cat.name)}
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                        active
                          ? "bg-primary/15 border-primary/45 text-primary"
                          : "bg-muted/35 border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", tone.dot)} />
                      <span>{cat.name}</span>
                      <span className="text-[10px] font-mono opacity-60">{cat.count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ml-auto shrink-0 flex items-center gap-1.5 pl-2" title={isStale ? "Reconnecting…" : isRefetching ? "Syncing…" : "Live"}>
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  isStale ? "bg-muted-foreground/40" : isRefetching ? "bg-primary animate-pulse" : "bg-emerald-500"
                )}
              />
              <span className="text-[10px] font-semibold text-muted-foreground hidden xl:inline">
                {isStale ? "Stale" : isRefetching ? "Syncing" : "Live"}
              </span>
            </div>
          </div>
        </div>

        {/* Product Catalog Surface */}
        <div className="flex-1 overflow-y-auto p-3.5 md:p-5">
          {isLoading ? (
            <div className={cn(
              "grid gap-3",
              showDesktopDrawer
                ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4"
                : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
            )}>
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-border bg-card p-3.5 space-y-3 animate-pulse">
                  <div className="flex items-center justify-between">
                    <div className="h-5 w-16 rounded-full bg-muted" />
                    <div className="h-4 w-10 rounded-full bg-muted" />
                  </div>
                  <div className="h-4 bg-muted rounded w-4/5" />
                  <div className="h-3 bg-muted rounded w-2/5" />
                  <div className="flex justify-between items-center pt-1">
                    <div className="h-5 w-20 bg-muted rounded" />
                    <div className="h-8 w-8 rounded-xl bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-2.5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border flex items-center justify-center">
                <PackageX className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <p className="font-display text-base font-bold text-foreground">No matching products</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                {search || selectedCategory !== "all"
                  ? "Try clearing your search or category filter."
                  : "No items match this stock status."}
              </p>
              {(search || selectedCategory !== "all" || stockFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setSelectedCategory("all"); setStockFilter("in_stock"); }}
                  className="mt-1 px-3.5 py-1.5 rounded-xl bg-muted text-xs font-semibold text-foreground hover:bg-muted/80 cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <>
              {!debouncedSearch && selectedCategory === "all" && (stockFilter === "all" || stockFilter === "in_stock") && filteredProducts.length > visibleLimit && (
                <div className="flex items-center justify-between gap-3 mb-3.5 px-3.5 py-2 rounded-2xl bg-muted/35 border border-border/70">
                  <div className="flex items-center gap-2 min-w-0">
                    <Search className="h-3.5 w-3.5 text-primary shrink-0" />
                    <p className="text-[11px] text-muted-foreground truncate">
                      Showing <span className="font-bold text-foreground">{visibleLimit}</span> of{" "}
                      <span className="font-bold font-mono text-foreground">{filteredProducts.length.toLocaleString()}</span>{" "}
                      products — search or pick a category to filter instantly
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisibleLimit(l => l + 200)}
                    className="shrink-0 text-[11px] font-bold text-primary hover:underline cursor-pointer"
                  >
                    Show +200
                  </button>
                </div>
              )}

              {viewMode === "table" ? (
                /* ── Table View ── */
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="grid grid-cols-[1fr_92px_100px_96px] gap-2 bg-muted/50 border-b border-border px-4 py-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Product</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground text-right">Stock</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground text-right">Price</span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground text-center">Ticket</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {visibleProducts.map(product => {
                      const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
                      const isOut = product.stockQty === 0;
                      const weighed = (product as any).productType === "measured" || isWeighedUnit(product.unit || "");
                      const step = weighed ? 0.25 : 1;
                      const inCart = cart.find(i => i.product.id === product.id);

                      return (
                        <div
                          key={product.id}
                          onClick={() => !isOut && openQuickAdd(product)}
                          className={cn(
                            "grid grid-cols-[1fr_92px_100px_96px] gap-2 items-center px-4 py-2.5 transition-colors",
                            isOut
                              ? "opacity-45 cursor-not-allowed bg-muted/20"
                              : inCart
                              ? "bg-primary/[0.08] hover:bg-primary/12 cursor-pointer"
                              : "hover:bg-muted/35 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full shrink-0",
                                isOut ? "bg-destructive" : isLow ? "bg-amber-400" : "bg-emerald-500"
                              )}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate">{product.canonicalName}</p>
                              {product.category && (
                                <p className="text-[10px] text-muted-foreground truncate">{product.category}</p>
                              )}
                            </div>
                          </div>

                          <span
                            className={cn(
                              "text-xs font-mono font-bold text-right",
                              isOut ? "text-destructive" : isLow ? "text-amber-400" : "text-muted-foreground"
                            )}
                          >
                            {isOut ? "Out" : `${formatQty(product.stockQty)} ${product.unit || ""}`}
                          </span>

                          <span className="text-sm font-bold font-mono text-foreground text-right">
                            {formatKES(product.sellingPrice || 0)}
                          </span>

                          <div className="flex justify-center" onClick={e => e.stopPropagation()}>
                            {inCart ? (
                              <div className="flex items-center rounded-xl bg-primary text-primary-foreground overflow-hidden shadow-sm">
                                <button
                                  type="button"
                                  onClick={() => updateQty(product.id, -step)}
                                  className="h-7 w-7 flex items-center justify-center hover:bg-black/15 cursor-pointer"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="px-1.5 text-[11px] font-mono font-bold">{formatQty(inCart.qty)}</span>
                                <button
                                  type="button"
                                  onClick={() => updateQty(product.id, step)}
                                  disabled={inCart.qty >= product.stockQty}
                                  className="h-7 w-7 flex items-center justify-center hover:bg-black/15 disabled:opacity-40 cursor-pointer"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isOut}
                                onClick={(e) => handleInstantAdd(e, product)}
                                className="w-8 h-8 rounded-xl flex items-center justify-center bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground transition-colors cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ── Elevated Card Grid View ── */
                <div className={cn(
                  "grid gap-3 transition-all",
                  showDesktopDrawer
                    ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4"
                    : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
                )}>
                  {visibleProducts.map(product => {
                    const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
                    const isOut = product.stockQty === 0;
                    const weighed = (product as any).productType === "measured" || isWeighedUnit(product.unit || "");
                    const step = weighed ? 0.25 : 1;
                    const inCart = cart.find(i => i.product.id === product.id);
                    const tone = getCategoryTone(product.category);

                    return (
                      <div
                        key={product.id}
                        role="button"
                        tabIndex={isOut ? -1 : 0}
                        onClick={() => !isOut && openQuickAdd(product)}
                        onKeyDown={e => {
                          if (!isOut && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            openQuickAdd(product);
                          }
                        }}
                        className={cn(
                          "group relative flex flex-col text-left rounded-2xl border p-3.5 transition-all duration-150 select-none",
                          isOut
                            ? "opacity-45 cursor-not-allowed bg-muted/25 border-border/50"
                            : inCart
                            ? "bg-primary/[0.09] border-primary ring-2 ring-primary/20 shadow-md cursor-pointer"
                            : "bg-card border-border hover:border-primary/45 hover:-translate-y-0.5 cursor-pointer"
                        )}
                      >
                        {/* Top metadata row */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border truncate max-w-[130px]",
                              weighed
                                ? "bg-primary/12 text-primary border-primary/25"
                                : tone.badge
                            )}
                          >
                            {weighed ? <Scale className="h-2.5 w-2.5 shrink-0" /> : <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", tone.dot)} />}
                            <span className="truncate">{product.category || (weighed ? "Weighed" : "Standard")}</span>
                          </span>

                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-mono font-bold shrink-0",
                              isOut ? "text-destructive" : isLow ? "text-amber-400" : "text-emerald-400"
                            )}
                          >
                            <span
                              className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                isOut ? "bg-destructive" : isLow ? "bg-amber-400" : "bg-emerald-500"
                              )}
                            />
                            {isOut ? "Out" : `${formatQty(product.stockQty)} ${product.unit || ""}`}
                          </span>
                        </div>

                        {/* Product Title */}
                        <p className="text-[13px] font-bold text-foreground leading-snug line-clamp-2 mb-1 flex-1">
                          {product.canonicalName}
                        </p>
                        {product.sku && (
                          <p className="text-[10px] font-mono text-muted-foreground/60 truncate mb-2">
                            SKU {product.sku}
                          </p>
                        )}

                        {/* Price & Inline Stepper / Quick Add */}
                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border/50 mt-auto">
                          <div className="min-w-0">
                            <span className="text-sm font-bold font-mono text-foreground">
                              {formatKES(product.sellingPrice || 0)}
                            </span>
                            {product.unit && (
                              <span className="text-[10px] text-muted-foreground ml-1">/{product.unit}</span>
                            )}
                          </div>

                          {inCart ? (
                            <div
                              onClick={e => e.stopPropagation()}
                              className="flex items-center rounded-xl bg-primary text-primary-foreground shadow-sm overflow-hidden shrink-0"
                            >
                              <button
                                type="button"
                                onClick={() => updateQty(product.id, -step)}
                                className="h-7 w-7 flex items-center justify-center hover:bg-black/15 cursor-pointer"
                                title="Decrease"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="px-1.5 text-[11px] font-mono font-bold min-w-[20px] text-center">
                                {formatQty(inCart.qty)}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateQty(product.id, step)}
                                disabled={inCart.qty >= product.stockQty}
                                className="h-7 w-7 flex items-center justify-center hover:bg-black/15 disabled:opacity-40 cursor-pointer"
                                title="Increase"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isOut}
                              onClick={(e) => handleInstantAdd(e, product)}
                              title={weighed ? "Select weight / qty" : "Quick add +1"}
                              className="h-8 w-8 rounded-xl flex items-center justify-center bg-muted/80 text-foreground/80 group-hover:bg-primary/15 group-hover:text-primary hover:!bg-primary hover:!text-primary-foreground transition-all shrink-0 cursor-pointer"
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {filteredProducts.length > 0 && (
                <div className="flex flex-col items-center gap-2 mt-5 pb-16 lg:pb-4">
                  <p className="text-[11px] text-muted-foreground/70">
                    {debouncedSearch || selectedCategory !== "all"
                      ? `${filteredProducts.length.toLocaleString()} matching products`
                      : stockFilter !== "all"
                      ? `Showing ${visibleProducts.length.toLocaleString()} of ${filteredProducts.length.toLocaleString()} products`
                      : `${filteredProducts.length.toLocaleString()} products`}
                  </p>
                  {!debouncedSearch && selectedCategory === "all" && filteredProducts.length > visibleProducts.length && (
                    <button
                      type="button"
                      onClick={() => setVisibleLimit(l => l + 200)}
                      className="px-4 py-1.5 rounded-full border border-border bg-card hover:border-primary/40 text-xs font-semibold text-foreground transition-colors cursor-pointer"
                    >
                      Load 200 more products
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Auto-Retracting Desktop Checkout Drawer ── */}
      <aside
        className={cn(
          "hidden lg:flex flex-col shrink-0 bg-card overflow-hidden transition-[width,opacity] duration-250 ease-out",
          showDesktopDrawer
            ? "w-[420px] xl:w-[460px] border-l border-border opacity-100"
            : "w-0 opacity-0 border-l-0 pointer-events-none"
        )}
      >
        {showDesktopDrawer && <CartPanel {...cartPanelProps} />}
      </aside>

      {/* Desktop Floating Ticket Pill when retracted with items inside */}
      {cart.length > 0 && !ticketExpanded && (
        <button
          type="button"
          onClick={() => setTicketExpanded(true)}
          className="hidden lg:flex fixed bottom-6 right-6 z-40 items-center gap-3 rounded-2xl bg-primary text-primary-foreground px-4 py-3 shadow-2xl shadow-primary/30 border border-primary/50 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-black/15 flex items-center justify-center">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-85">
              Open Current Ticket · {cart.length} {cart.length === 1 ? "item" : "items"}
            </p>
            <p className="text-sm font-bold font-mono">{formatKES(total)}</p>
          </div>
          <PanelRightOpen className="h-4 w-4 ml-1" />
        </button>
      )}

      {/* ── Mobile Cart FAB ── */}
      <button
        type="button"
        className={cn(
          "lg:hidden fixed bottom-[4.75rem] right-4 z-40 bg-primary text-primary-foreground rounded-2xl h-14 px-4 flex items-center gap-2.5 shadow-xl shadow-primary/25 border border-primary/50",
          "transition-all duration-150",
          cartCount > 0 && !showCartMobile ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"
        )}
        onClick={() => setShowCartMobile(true)}
        aria-hidden={cartCount === 0 || showCartMobile}
      >
        <ShoppingCart className="h-5 w-5" />
        <div className="text-left">
          <p className="text-[10px] font-bold leading-none text-primary-foreground/80">
            {formatQty(cartCount)} items
          </p>
          <p className="text-sm font-bold font-mono leading-tight">{formatKES(total)}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-primary-foreground/70" />
      </button>

      {/* Mobile Offline Queue FAB */}
      {pendingCount > 0 && !showCartMobile && (
        <div
          className={cn(
            "lg:hidden fixed bottom-[4.75rem] left-4 z-40 rounded-2xl h-14 px-4 flex items-center gap-2 border",
            offlineSyncing
              ? "bg-blue-500/20 border-blue-500/30 text-blue-300"
              : !offlineIsOnline
              ? "bg-destructive/20 border-destructive/30 text-destructive"
              : "bg-orange-500/20 border-orange-500/30 text-orange-300"
          )}
        >
          {offlineSyncing ? <RefreshCw className="h-4 w-4 animate-spin shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          <div className="text-left">
            <p className="text-[10px] font-bold leading-none opacity-75">
              {offlineSyncing ? "Syncing" : !offlineIsOnline ? "Offline" : "Pending"}
            </p>
            <p className="text-sm font-bold font-mono leading-tight">
              {pendingCount} {pendingCount === 1 ? "sale" : "sales"}
            </p>
          </div>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      {showCartMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col">
          <div className="flex-1 bg-black/65 backdrop-blur-sm" onClick={() => setShowCartMobile(false)} />
          <div className="bg-card h-[92svh] flex flex-col rounded-t-3xl border-t border-border overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <CartPanel {...cartPanelProps} />
            </div>
          </div>
        </div>
      )}

      {/* QuickAdd Sheet */}
      <QuickAddSheet
        product={quickAddProduct}
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onAdd={handleQuickAdd}
        isOwner={isOwner}
        cartQty={cart.find(i => i.product.id === quickAddProduct?.id)?.qty ?? 0}
      />

      {/* Today's Sales Slide-Over */}
      {showRecentSales && (
        <RecentSalesDrawer
          shopId={shopId}
          userName={userName}
          onClose={() => setShowRecentSales(false)}
        />
      )}

      {/* Sale Complete Receipt Overlay */}
      {completedSale && (
        <SaleCompleteOverlay
          sale={completedSale}
          onDismiss={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
}
