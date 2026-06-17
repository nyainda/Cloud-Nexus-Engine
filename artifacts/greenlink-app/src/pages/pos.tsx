import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { useListProducts, useCreateSale, getListProductsQueryKey, getListDebtsQueryKey, getListInventoryMovementsQueryKey, customFetch } from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { enqueueMutation } from "@/lib/offline-queue";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatKES } from "@/lib/format";
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  AlertTriangle, PackageX, Package, CreditCard, Banknote, X,
  ChevronRight, TrendingUp, Scale, User2, Phone, ChevronDown, ArrowUpDown,
  ReceiptText, RotateCcw, ChevronUp, Ban, LayoutGrid, LayoutList,
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

const WEIGHT_UNITS = new Set(["kg", "g", "gram", "grams", "litre", "liter", "l", "ml", "ton", "tonne"]);
function isWeighedUnit(unit: string): boolean {
  return WEIGHT_UNITS.has((unit || "").trim().toLowerCase());
}

interface CartItem {
  product: any;
  qty: number;
  unitPrice: number;
}

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

// ── Customer Autocomplete ─────────────────────────────────────────────────────
function CustomerAutocomplete({
  shopId, value, onChange, onSelect,
}: {
  shopId: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (name: string, phone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const debouncedValue = useDebounce(value, 300);
  const ref = useRef<HTMLDivElement>(null);

  const { data: suggestions } = useQuery<any[]>({
    queryKey: ["customers", shopId, debouncedValue],
    queryFn: () => customFetch<any[]>(`/customers?shopId=${encodeURIComponent(shopId)}&q=${encodeURIComponent(debouncedValue)}`),
    enabled: !!shopId && debouncedValue.length >= 2,
    staleTime: 60_000,
  });

  const hasSuggestions = open && suggestions && suggestions.length > 0;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <User2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder="e.g. John Kamau"
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 pl-9 pr-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
        />
      </div>
      {hasSuggestions && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
          {suggestions!.map((s: any, i: number) => (
            <button
              key={i}
              onMouseDown={e => { e.preventDefault(); onSelect(s.customerName, s.customerPhone ?? ""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-center gap-2.5 border-b border-border/30 last:border-0"
            >
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User2 className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{s.customerName}</p>
                {s.customerPhone && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Phone className="h-2.5 w-2.5" />{s.customerPhone}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_stock", label: "In Stock" },
  { value: "low_stock", label: "Low" },
  { value: "out_of_stock", label: "Out" },
];

// ── QuickAdd bottom sheet — no Radix Dialog, no CSS transforms ────────────────
function QuickAddSheet({
  product, open, onClose, onAdd, isOwner, cartQty,
}: {
  product: any | null; open: boolean; onClose: () => void;
  onAdd: (product: any, qty: number, price: number) => void; isOwner: boolean;
  cartQty: number;
}) {
  const [qty, setQty] = useState<number>(1);
  const [price, setPrice] = useState(0);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && product) {
      const isMeasured = product.productType === "measured" || isWeighedUnit(product.unit || "");
      setQty(isMeasured ? 0.5 : 1);
      setPrice(product.sellingPrice || 0);
      // Auto-focus qty input after sheet animation
      setTimeout(() => qtyInputRef.current?.select(), 80);
    }
  }, [open, product]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open || !product) return null;

  const weighed = product.productType === "measured" || isWeighedUnit(product.unit || "");
  const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
  const isOut = product.stockQty === 0;
  const margin = product.purchasePrice && price
    ? (((price - product.purchasePrice) / price) * 100).toFixed(0) : null;
  const profit = product.purchasePrice
    ? qty * (price - product.purchasePrice) : null;

  const qtyStep = weighed ? 0.25 : 1;
  const qtyMin = weighed ? 0.1 : 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl border border-border overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className={cn(
              "w-11 h-11 rounded-xl border flex items-center justify-center shrink-0",
              weighed ? "bg-primary/10 border-primary/20 text-primary" : "bg-muted/60 border-border/50 text-muted-foreground/50"
            )}>
              {weighed ? <Scale className="h-5 w-5" /> : <Package className="h-5 w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground leading-snug">{product.canonicalName}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {product.category && <span className="text-[10px] text-muted-foreground">{product.category}</span>}
                {product.unit && (
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 rounded border font-mono",
                    weighed ? "text-primary/80 border-primary/20 bg-primary/5" : "text-muted-foreground/50 border-border/30"
                  )}>{product.unit}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className={cn(
                "text-[10px] font-bold px-2 py-1 rounded-full",
                isOut ? "bg-destructive/15 text-destructive" :
                isLow ? "bg-orange-500/15 text-orange-400" : "bg-emerald-500/15 text-emerald-400"
              )}>
                {isOut ? "Out of Stock" : isLow ? `Low: ${product.stockQty}` : `${product.stockQty} ${product.unit || "units"}`}
              </div>
              {cartQty > 0 && (
                <div className="flex items-center gap-1 bg-primary/15 border border-primary/30 text-primary rounded-full px-2 py-0.5">
                  <ShoppingCart className="h-2.5 w-2.5" />
                  <span className="text-[10px] font-bold">{cartQty} in cart</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 block">
              How many? {weighed ? `(${product.unit || "kg"})` : `(${product.unit || "units"})`}
            </Label>
            <div className="flex items-center gap-3">
              <button
                className="w-11 h-11 rounded-xl bg-muted border border-border flex items-center justify-center"
                onClick={() => setQty(q => Math.max(qtyMin, parseFloat((q - qtyStep).toFixed(2))))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                ref={qtyInputRef}
                type="number" min={qtyMin} step={qtyStep} max={product.stockQty}
                value={qty}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= qtyMin) setQty(v); }}
                onFocus={e => e.target.select()}
                className="flex-1 h-14 text-center text-3xl font-bold font-mono bg-muted border border-border rounded-xl focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              />
              <button
                className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
                onClick={() => setQty(q => Math.min(product.stockQty, parseFloat((q + qtyStep).toFixed(2))))}
                disabled={qty >= product.stockQty}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {/* Quick-pick presets */}
            <div className="flex gap-1.5 flex-wrap mt-2.5">
              {(weighed
                ? (product.unit?.toLowerCase() === "g" ? [100, 250, 500, 1000] : [0.5, 1, 2, 5, 10])
                : [1, 2, 3, 5, 10, 20, 50]
              ).filter(v => v <= product.stockQty).map(v => (
                <button key={v} type="button" onClick={() => setQty(v)} className={cn(
                  "text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors",
                  qty === v
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-muted border-border text-muted-foreground hover:text-foreground"
                )}>
                  {weighed ? `${v}${product.unit}` : `×${v}`}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 block">
              Unit Price (KES)
            </Label>
            <input
              type="number" value={price} onChange={e => setPrice(Number(e.target.value))}
              className="w-full h-11 text-right text-xl font-bold font-mono bg-muted/40 border border-border rounded-xl px-4 focus:outline-none focus:border-primary/60"
            />
          </div>

          <div className="bg-muted/40 rounded-xl border border-border p-3 space-y-1.5">
            {product.purchasePrice > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Buy price</span>
                <span className="font-mono text-xs text-muted-foreground">{formatKES(product.purchasePrice)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Subtotal</span>
              <span className="font-bold font-mono text-foreground">{formatKES(qty * price)}</span>
            </div>
            {profit !== null && (
              <div className="flex justify-between items-center pt-1 border-t border-border/40">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <TrendingUp className={cn("h-3 w-3", profit < 0 ? "text-destructive" : Number(margin) < 10 ? "text-orange-400" : "text-emerald-400")} />
                  Est. Profit
                  {margin && (
                    <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      profit < 0 ? "bg-destructive/15 text-destructive" :
                      Number(margin) < 10 ? "bg-orange-500/15 text-orange-400" :
                      "bg-emerald-500/10 text-emerald-400"
                    )}>
                      {margin}%
                    </span>
                  )}
                </span>
                <span className={cn("font-bold font-mono text-sm", profit >= 0 ? (Number(margin) < 10 ? "text-orange-400" : "text-emerald-400") : "text-destructive")}>
                  {formatKES(profit)}
                </span>
              </div>
            )}
          </div>

          {/* Low / negative margin warning */}
          {profit !== null && profit < 0 && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-xl px-3 py-2.5">
              <span className="text-destructive text-sm font-bold shrink-0">⚠</span>
              <div>
                <p className="text-xs font-bold text-destructive">Selling below cost!</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Price is KES {formatKES(price - product.purchasePrice)} below buying price. You will lose money on this sale.</p>
              </div>
            </div>
          )}
          {profit !== null && profit >= 0 && Number(margin) < 10 && Number(margin) >= 0 && (
            <div className="flex items-start gap-2 bg-orange-500/8 border border-orange-500/25 rounded-xl px-3 py-2.5">
              <span className="text-orange-400 text-sm font-bold shrink-0">↓</span>
              <div>
                <p className="text-xs font-bold text-orange-400">Low margin ({margin}%)</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Consider raising the price — typical margin should be above 10%.</p>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <Button variant="outline" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1 h-12 font-bold text-sm bg-primary text-primary-foreground"
            disabled={isOut}
            onClick={() => { onAdd(product, qty, price); onClose(); }}
          >
            <ShoppingCart className="h-4 w-4 mr-2" />
            Add to Cart
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── CartPanel — plain divs, no Radix ScrollArea ───────────────────────────────
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
  updateQty: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  updatePrice: (id: string, price: number) => void;
  handleCheckout: (type: "cash" | "debt") => void;
  setQtyDirect: (id: string, qty: number) => void;
}

const CartPanel = memo(function CartPanel({
  cart, discount, debtCustomerName, debtCustomerPhone, isOwner,
  createSalePending, subtotal, total, totalProfit, cartCount,
  setDiscount, setDebtCustomerName, setDebtCustomerPhone, setCart,
  setShowCartMobile, updateQty, removeFromCart, updatePrice, handleCheckout, setQtyDirect,
}: CartPanelProps) {
  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <span className="font-bold text-sm">Cart</span>
          {cartCount > 0 && (
            <Badge className="bg-primary/20 text-primary border-0 text-[10px] font-bold px-1.5 py-0.5 h-auto">
              {cartCount} {cartCount === 1 ? "item" : "items"}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button className="lg:hidden text-muted-foreground p-1" onClick={() => setShowCartMobile(false)}>
            <X className="h-4 w-4" />
          </button>
          {cartCount > 0 && (
            <button className="text-[11px] text-muted-foreground hover:text-destructive" onClick={() => { setCart([]); setDiscount(0); }}>
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Plain overflow div — no Radix ScrollArea */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <ShoppingCart className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="text-xs text-muted-foreground/50 text-center px-6">Tap any product to add it</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {cart.map(item => {
              const isMeasured = item.product.productType === "measured" || isWeighedUnit(item.product.unit || "");
              const cartStep = isMeasured ? 0.25 : 1;
              const cartMin = isMeasured ? 0.1 : 1;
              const itemProfit = isOwner && item.product.purchasePrice
                ? item.qty * (item.unitPrice - item.product.purchasePrice) : null;
              const itemMarginPct = item.product.purchasePrice && item.unitPrice
                ? ((item.unitPrice - item.product.purchasePrice) / item.unitPrice) * 100 : null;
              const isLoss = itemProfit !== null && itemProfit < 0;
              const isLowMargin = !isLoss && itemMarginPct !== null && itemMarginPct < 10;
              return (
                <div key={item.product.id} className={cn("px-4 py-3", isLoss ? "bg-destructive/5" : isLowMargin ? "bg-orange-500/5" : "")}>
                  <div className="flex justify-between items-start gap-2 mb-2.5">
                    <div className="flex-1 pr-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-foreground leading-snug">{item.product.canonicalName}</span>
                        {isMeasured && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">{item.qty}{item.product.unit || "kg"}</span>}
                        {isOwner && isLoss && <span className="text-[9px] font-bold bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">LOSS</span>}
                        {isOwner && isLowMargin && <span className="text-[9px] font-bold bg-orange-500/15 text-orange-400 px-1.5 py-0.5 rounded-full">LOW MARGIN</span>}
                      </div>
                    </div>
                    <button onClick={() => removeFromCart(item.product.id)} className="text-muted-foreground/40 hover:text-destructive shrink-0 p-0.5">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center bg-muted rounded-lg border border-border overflow-hidden">
                      <button className="h-8 w-8 flex items-center justify-center text-muted-foreground" onClick={() => updateQty(item.product.id, -cartStep)}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={cartMin}
                        step={cartStep}
                        max={item.product.stockQty}
                        value={item.qty}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          if (!isNaN(v) && v >= cartMin) setQtyDirect(item.product.id, Math.min(v, item.product.stockQty));
                        }}
                        onFocus={e => e.target.select()}
                        className="w-12 h-8 text-center text-sm font-bold bg-transparent border-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button className="h-8 w-8 flex items-center justify-center text-primary" onClick={() => updateQty(item.product.id, cartStep)} disabled={item.qty >= item.product.stockQty}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">KSh</span>
                      <input type="number" value={item.unitPrice} onChange={e => updatePrice(item.product.id, Number(e.target.value))}
                        className="w-20 h-8 text-right text-sm font-medium bg-muted/30 border border-border/60 rounded-lg px-2 focus:outline-none focus:border-primary/60" />
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm font-mono">{formatKES(item.qty * item.unitPrice)}</p>
                      {isOwner && itemProfit !== null && (
                        <p className={cn("text-[10px] font-mono", itemProfit >= 0 ? "text-emerald-400" : "text-destructive")}>
                          +{formatKES(itemProfit)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {cart.length > 0 && (
        <div className="shrink-0 border-t border-border">
          <div className="px-4 py-3 space-y-1.5 bg-card">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Subtotal ({cartCount} items)</span>
              <span className="font-mono">{formatKES(subtotal)}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Discount (KSh)</span>
                <input type="number" min={0} max={subtotal} value={discount || ""} onChange={e => setDiscount(Number(e.target.value))}
                  placeholder="0" className="w-24 h-7 text-right text-sm font-mono bg-muted/30 border border-border/60 rounded-lg px-2 focus:outline-none focus:border-primary/60" />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[5, 10, 15, 20].map(pct => (
                  <button key={pct} onClick={() => setDiscount(Math.round(subtotal * pct / 100))} className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-full",
                    discount === Math.round(subtotal * pct / 100) ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground"
                  )}>
                    {pct}%
                  </button>
                ))}
                {discount > 0 && (
                  <button onClick={() => setDiscount(0)} className="text-[10px] font-bold px-2 py-1 rounded-full bg-destructive/15 text-destructive">
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-border/60">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-primary font-mono">{formatKES(total)}</span>
            </div>
            {isOwner && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground/60 flex items-center gap-1">
                  <TrendingUp className={cn("h-3 w-3", totalProfit < 0 ? "text-destructive" : totalProfit === 0 ? "text-muted-foreground" : "text-emerald-400")} />
                  Est. Profit
                </span>
                <span className={cn("font-mono font-semibold", totalProfit < 0 ? "text-destructive" : totalProfit === 0 ? "text-muted-foreground" : "text-emerald-400")}>
                  {totalProfit < 0 ? "-" : "+"}{formatKES(Math.abs(totalProfit))}
                </span>
              </div>
            )}
            {isOwner && cart.some(i => i.product.purchasePrice && i.unitPrice < i.product.purchasePrice) && (
              <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/25 rounded-lg px-2.5 py-2 mt-1">
                <span className="text-destructive font-bold text-xs shrink-0">⚠</span>
                <p className="text-[11px] text-destructive font-semibold">
                  {cart.filter(i => i.product.purchasePrice && i.unitPrice < i.product.purchasePrice).length} item{cart.filter(i => i.product.purchasePrice && i.unitPrice < i.product.purchasePrice).length > 1 ? "s" : ""} priced below cost — selling at a loss
                </p>
              </div>
            )}
          </div>

          <div className="px-4 pb-3 space-y-2 bg-card">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Customer name (required for debt)
              </Label>
              <CustomerAutocomplete
                shopId={localStorage.getItem("greenlink_shopId") || ""}
                value={debtCustomerName}
                onChange={setDebtCustomerName}
                onSelect={(name, phone) => {
                  setDebtCustomerName(name);
                  if (phone) setDebtCustomerPhone(phone);
                }}
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={debtCustomerPhone}
                onChange={e => setDebtCustomerPhone(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 pl-9 pr-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
            </div>
          </div>

          <div className="px-4 pb-4 grid grid-cols-2 gap-2 bg-card">
            <Button variant="outline" className="h-12 font-bold text-sm border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={createSalePending} onClick={() => handleCheckout("debt")}>
              <CreditCard className="h-4 w-4 mr-1.5" />Debt Sale
            </Button>
            <Button className="h-12 font-bold text-sm bg-primary text-primary-foreground" disabled={createSalePending} onClick={() => handleCheckout("cash")}>
              <Banknote className="h-4 w-4 mr-1.5" />Cash Sale
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── Recent Sales Drawer ──────────────────────────────────────────────────────
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
    // customFetch already parses the body and throws ApiError on non-2xx responses
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
      // customFetch throws ApiError on non-2xx — no manual .ok/.json() check needed
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={onClose} className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-foreground">Today's Sales</h2>
          <p className="text-[11px] text-muted-foreground/60">{salesList.length} transaction{salesList.length !== 1 ? "s" : ""} · tap to expand · void to reverse</p>
        </div>
        <button onClick={() => refetch()} className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-primary">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* Sales list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2 animate-pulse">
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
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
            <ReceiptText className="w-10 h-10 text-muted-foreground/20" />
            <p className="text-sm font-medium">No sales yet today</p>
            <p className="text-xs text-muted-foreground/50">Sales will appear here after checkout</p>
          </div>
        ) : (
          salesList.map((sale, idx) => {
            const isVoided = sale.isDeleted || localVoided.has(sale.id);
            const isExpanded = expandedId === sale.id;
            const isDebt = sale.saleType === "debt";
            const time = new Date(sale.createdAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
            const num = salesList.length - idx;

            return (
              <div key={sale.id} className={cn(
                "rounded-xl border overflow-hidden transition-all",
                isVoided ? "bg-muted/20 border-border/30 opacity-60" : "bg-card border-border"
              )}>
                {/* Sale row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                >
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold",
                    isVoided ? "bg-muted text-muted-foreground" :
                    isDebt ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  )}>
                    {isVoided ? <Ban className="h-4 w-4" /> : num}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-foreground">{formatKES(sale.totalAmount)}</span>
                      {isVoided && <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">VOIDED</span>}
                      {isDebt && !isVoided && <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">DEBT</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground/60 truncate">
                      {time} · by {sale.servedBy ?? "staff"}
                      {sale.deleteReason && ` · ${sale.deleteReason}`}
                    </p>
                  </div>
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                </button>

                {/* Expanded items */}
                {isExpanded && (
                  <div className="border-t border-border/40 bg-muted/20">
                    {expandedItems ? (
                      <div className="divide-y divide-border/30">
                        {expandedItems.map((item: any) => (
                          <div key={item.id ?? item.productId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                            <span className="text-foreground/80 flex-1 min-w-0 truncate">{item.productName}</span>
                            <span className="text-muted-foreground font-mono text-xs shrink-0 ml-3">×{item.qty} @ {formatKES(item.unitPrice)}</span>
                            <span className="font-bold font-mono text-xs text-foreground ml-3 shrink-0">{formatKES(item.totalPrice)}</span>
                          </div>
                        ))}
                        {sale.discount > 0 && (
                          <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                            <span>Discount</span>
                            <span className="font-mono text-destructive">-{formatKES(sale.discount)}</span>
                          </div>
                        )}
                        {!isVoided && (
                          <div className="px-4 py-3">
                            {confirmId === sale.id ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-foreground">Void this sale?</p>
                                <p className="text-[11px] text-muted-foreground/70">Stock will be restored.{isDebt ? " The linked debt will be cancelled." : ""}</p>
                                <input
                                  type="text"
                                  value={voidReason}
                                  onChange={e => setVoidReason(e.target.value)}
                                  placeholder="Reason (optional)…"
                                  className="w-full h-8 rounded-lg border border-border/50 bg-background px-3 text-xs focus:outline-none focus:border-primary/50"
                                />
                                <div className="flex gap-2">
                                  <button onClick={() => { setConfirmId(null); setVoidReason(""); }}
                                    className="flex-1 h-8 rounded-lg bg-muted text-muted-foreground text-xs font-semibold">
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => handleVoid(sale.id)}
                                    disabled={voidingId === sale.id}
                                    className="flex-1 h-8 rounded-lg bg-destructive text-destructive-foreground text-xs font-bold disabled:opacity-50">
                                    {voidingId === sale.id ? "Voiding…" : "Confirm Void"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmId(sale.id)}
                                className="w-full h-8 rounded-lg border border-destructive/40 text-destructive text-xs font-bold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5">
                                <Ban className="h-3.5 w-3.5" />
                                Void This Sale
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <RotateCcw className="h-3 w-3 animate-spin" />Loading items…
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
  );
}

export default function POS() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 100);
  const [stockFilter, setStockFilter] = useState<StockFilter>("in_stock");
  const [sortBy, setSortBy] = useState<"az" | "za" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc" | "newest">("newest");
  const [viewMode, setViewMode] = useState<"cards" | "table">(() =>
    (localStorage.getItem("pos_view_mode") as "cards" | "table") || "cards"
  );
  const [showRecentSales, setShowRecentSales] = useState(false);

  const { data: productsData, isLoading, isRefetching, dataUpdatedAt } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId, refetchInterval: 30_000, refetchIntervalInBackground: false } }
  );

  // Sync freshness: stale if last update > 35s ago and not currently refetching
  // (matches the 30s refetchInterval with 5s grace — avoids showing "stale" mid-cycle)
  const isStale = !isRefetching && dataUpdatedAt > 0 && (Date.now() - dataUpdatedAt) > 35_000;

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
  }, [productsData, debouncedSearch, stockFilter, sortBy]);

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
  const [debtCustomerName, setDebtCustomerName] = useState("");
  const [debtCustomerPhone, setDebtCustomerPhone] = useState("");
  const createSale = useCreateSale();
  // Guard against double-tapping the checkout button — cleared in onSettled / onError / offline path
  const submittingRef = useRef(false);

  const [quickAddProduct, setQuickAddProduct] = useState<any | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // ── Load pending cart from quotation "Convert to Sale" ──
  useEffect(() => {
    const raw = sessionStorage.getItem("greenlink_pending_cart");
    if (!raw) return;
    const products = productsData?.products;
    if (!products?.length) return; // wait until products loaded
    try {
      const pending = JSON.parse(raw);
      const cartItems: CartItem[] = [];
      for (const item of pending.items ?? []) {
        const product = products.find((p: any) => p.id === item.productId);
        if (product) {
          cartItems.push({ product, qty: item.qty, unitPrice: item.unitPrice });
        } else {
          // Product not found by ID — create a minimal stub so nothing is silently lost
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
        toast.success(`${pending.fromQuote ?? "Quote"} loaded into cart (${cartItems.length} item${cartItems.length !== 1 ? "s" : ""})`);
      }
    } catch {}
    sessionStorage.removeItem("greenlink_pending_cart");
  }, [productsData]);

  // Lock body scroll when mobile cart is open
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
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, qty: Math.min(i.qty + qty, product.stockQty), unitPrice: price }
            : i
        );
      }
      return [...prev, { product, qty, unitPrice: price }];
    });
    toast.success(`${product.canonicalName} added`);
  };

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart(prev =>
      prev.map(i => {
        if (i.product.id !== productId) return i;
        const isMeasured = i.product.productType === "measured" || isWeighedUnit(i.product.unit || "");
        const minQty = isMeasured ? 0.1 : 1;
        const newQty = parseFloat((i.qty + delta).toFixed(3));
        return { ...i, qty: Math.max(minQty, newQty) };
      }).filter(i => i.qty > 0)
    );
  }, []);

  const setQtyDirect = useCallback((productId: string, qty: number) => {
    setCart(prev =>
      prev.map(i => {
        if (i.product.id !== productId) return i;
        const isMeasured = i.product.productType === "measured" || isWeighedUnit(i.product.unit || "");
        const minQty = isMeasured ? 0.1 : 1;
        return { ...i, qty: Math.max(minQty, qty) };
      }).filter(i => i.qty > 0)
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => setCart(prev => prev.filter(i => i.product.id !== productId)), []);
  const updatePrice = useCallback((productId: string, price: number) => setCart(prev => prev.map(i => i.product.id === productId ? { ...i, unitPrice: price } : i)), []);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.qty * i.unitPrice, 0), [cart]);
  const total = Math.max(0, subtotal - discount);
  const totalProfit = useMemo(() => cart.reduce((s, i) => {
    const cost = i.product.purchasePrice || 0;
    return s + i.qty * (i.unitPrice - cost);
  }, 0), [cart]);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const handleCheckout = useCallback(async (saleType: "cash" | "debt") => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (cart.length === 0) { submittingRef.current = false; toast.error("Cart is empty"); return; }
    if (saleType === "debt" && !debtCustomerName.trim()) { submittingRef.current = false; toast.error("Enter customer name for debt sale"); return; }
    const cartSnapshot = [...cart];
    const discountSnapshot = discount;
    const debtName = debtCustomerName;
    const debtPhone = debtCustomerPhone;
    const mutationId = newMutationId();
    const ts = () => new Date().toISOString();

    logInventory({ stage: "pending_added", mutationId, source: "pos", timestamp: ts(), extra: { saleType, items: cartSnapshot.length } });

    // Cancel in-flight fetches BEFORE optimistic update — prevents stale refetch overwriting our state
    await qc.cancelQueries({ queryKey: getListProductsQueryKey() });

    // Snapshot all matching entries for rollback on error
    const productsSnapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });

    // Optimistic: immediately deduct sold quantities from stock
    const optimisticNow = ts();
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.map((p: any) => {
        const cartItem = cartSnapshot.find(i => i.product.id === p.id);
        if (!cartItem) return p;
        const updated = { ...p, stockQty: Math.max(0, p.stockQty - cartItem.qty), updatedAt: optimisticNow };
        recordMutationResult(updated);
        logInventory({ stage: "optimistic_applied", mutationId, source: "pos", timestamp: optimisticNow, productId: p.id, previousQty: p.stockQty, nextQty: updated.stockQty });
        return updated;
      }) };
    });

    setCart([]); setDiscount(0); setDebtCustomerName(""); setDebtCustomerPhone(""); setShowCartMobile(false);
    // Show confirmation immediately — don't wait for the network
    toast.success(saleType === "cash" ? "✓ Cash sale complete!" : "✓ Debt recorded!");

    logInventory({ stage: "mutation_started", mutationId, source: "pos", timestamp: ts(), extra: { saleType } });

    const salePayload = {
      shopId, saleType,
      discount: discountSnapshot,
      items: cartSnapshot.map(i => ({ productId: i.product.id, qty: i.qty, unitPrice: i.unitPrice })),
      servedBy: userName,
      debtCustomerName: saleType === "debt" ? debtName : undefined,
      debtCustomerPhone: saleType === "debt" ? debtPhone : undefined,
    };

    // If offline, queue the sale and return — sync will fire on reconnect
    if (!navigator.onLine) {
      await enqueueMutation("sale", shopId, salePayload);
      logInventory({ stage: "queued_offline", mutationId, source: "pos", timestamp: ts(), extra: { saleType } });
      submittingRef.current = false;
      return;
    }

    createSale.mutate(
      { data: salePayload },
      {
        onError: (err: any) => {
          submittingRef.current = false;
          // Rollback all product cache entries to pre-sale state
          productsSnapshot.forEach(([key, data]) => qc.setQueryData(key, data));
          setCart(cartSnapshot); setDiscount(discountSnapshot);
          logInventory({ stage: "rollback_triggered", mutationId, source: "pos", timestamp: new Date().toISOString(), extra: { error: err?.message } });
          toast.error(err?.message || "Sale failed — please retry");
        },
        onSettled: () => {
          submittingRef.current = false;
          // Invalidate only after mutation is committed — avoids stale-refetch race
          if (saleType === "debt") qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
          qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
          logInventory({ stage: "invalidate_triggered", mutationId, source: "pos", timestamp: new Date().toISOString(), extra: { pending_removed: true } });
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, discount, debtCustomerName, debtCustomerPhone, shopId, userName]);

  const cartPanelProps: CartPanelProps = {
    cart, discount, debtCustomerName, debtCustomerPhone, isOwner,
    createSalePending: createSale.isPending,
    subtotal, total, totalProfit, cartCount,
    setDiscount, setDebtCustomerName, setDebtCustomerPhone, setCart,
    setShowCartMobile, updateQty, removeFromCart, updatePrice, handleCheckout, setQtyDirect,
  };

  return (
    <div className="flex flex-col lg:flex-row h-full bg-background overflow-hidden">
      {/* Products Panel */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Search + Filter Header */}
        <div className="p-3 md:p-4 border-b border-border bg-card shrink-0 space-y-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search products…"
              className="pl-9 h-10 text-sm bg-muted/50 border-border/80 rounded-xl"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide flex-1">
              {FILTERS.map(f => (
                <button key={f.value} onClick={() => setStockFilter(f.value)} className={cn(
                  "shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold",
                  stockFilter === f.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                )}>
                  {f.label}
                  <span className={cn("text-[10px] font-bold", stockFilter === f.value ? "text-primary-foreground/70" : "text-muted-foreground/50")}>
                    {filterCounts[f.value]}
                  </span>
                </button>
              ))}
            </div>
            {/* Sort selector */}
            <div className="shrink-0 relative">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="appearance-none h-8 pl-7 pr-2 rounded-full text-[11px] font-semibold bg-muted border border-border text-muted-foreground focus:outline-none focus:border-primary/60 cursor-pointer"
              >
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
                <option value="newest">Newest</option>
                <option value="stock_asc">Stock ↑</option>
                <option value="stock_desc">Stock ↓</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
              </select>
              <ArrowUpDown className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            {/* Layout toggle */}
            <button
              onClick={() => setViewMode(v => {
                const next = v === "cards" ? "table" : "cards";
                localStorage.setItem("pos_view_mode", next);
                return next;
              })}
              className="shrink-0 flex items-center justify-center h-8 w-8 rounded-full bg-muted border border-border text-muted-foreground hover:text-foreground transition-colors"
              title={viewMode === "cards" ? "Switch to table view" : "Switch to card view"}
            >
              {viewMode === "cards" ? <LayoutList className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            </button>
            {/* Recent Sales button */}
            <button
              onClick={() => setShowRecentSales(true)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-muted text-muted-foreground text-xs font-semibold hover:bg-muted/70 border border-border/40 transition-colors"
              title="Today's sales history"
            >
              <ReceiptText className="h-3.5 w-3.5" />
              <span className="hidden sm:block">Sales</span>
            </button>
            {/* Live sync indicator */}
            <div className="shrink-0 flex items-center gap-1.5 pr-0.5" title={isStale ? "Reconnecting…" : isRefetching ? "Syncing…" : "Live"}>
              <span className={cn(
                "w-2 h-2 rounded-full transition-colors duration-500",
                isStale
                  ? "bg-muted-foreground/30"
                  : isRefetching
                  ? "bg-primary animate-pulse"
                  : "bg-primary/60"
              )} />
              <span className="text-[10px] text-muted-foreground/50 font-medium hidden sm:block">
                {isStale ? "Offline" : isRefetching ? "Syncing" : "Live"}
              </span>
            </div>
          </div>
        </div>

        {/* Product Grid — plain overflow-y-auto */}
        <div className="flex-1 overflow-y-auto p-3" style={{ transform: "translateZ(0)", backfaceVisibility: "hidden" }}>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
              {Array.from({ length: 18 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-7 h-7 rounded-lg bg-muted" />
                    <div className="w-2 h-2 rounded-full bg-muted" />
                  </div>
                  <div className="h-3 bg-muted rounded w-4/5" />
                  <div className="h-2.5 bg-muted rounded w-3/5" />
                  <div className="h-3.5 bg-muted rounded w-2/5 mt-1" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <PackageX className="w-10 h-10 text-muted-foreground/20" />
              <p className="text-sm font-medium">No products found</p>
              {search && <p className="text-xs text-muted-foreground/50">Try a different search term</p>}
            </div>
          ) : (
            <>
              {!debouncedSearch && (stockFilter === "all" || stockFilter === "in_stock") && filteredProducts.length > 200 && (
                <div className="flex items-center gap-2 mb-3 px-1 py-2.5 rounded-xl bg-muted/30 border border-border/40">
                  <Search className="h-3.5 w-3.5 text-muted-foreground/50 ml-2 shrink-0" />
                  <p className="text-[11px] text-muted-foreground/60">
                    Showing first <span className="font-bold text-foreground/60">200</span> of{" "}
                    <span className="font-bold text-foreground/60">{filteredProducts.length.toLocaleString()}</span>{" "}
                    in-stock products — search above to find any product instantly
                  </p>
                </div>
              )}

              {viewMode === "table" ? (
                /* ── Table view ── */
                <div className="rounded-xl border border-border overflow-hidden">
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_72px_88px_36px] gap-0 bg-muted border-b border-border px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Product</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">Stock</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">Price</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">Cart</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {(debouncedSearch || (stockFilter !== "all" && stockFilter !== "in_stock") ? filteredProducts : filteredProducts.slice(0, 200)).map(product => {
                      const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
                      const isOut = product.stockQty === 0;
                      const inCart = cart.find(i => i.product.id === product.id);
                      return (
                        <button
                          key={product.id}
                          onClick={() => !isOut && openQuickAdd(product)}
                          disabled={isOut}
                          className={cn(
                            "w-full grid grid-cols-[1fr_72px_88px_36px] gap-0 items-center px-3 py-2.5 text-left transition-colors",
                            isOut
                              ? "opacity-40 cursor-not-allowed bg-muted/20"
                              : inCart
                              ? "bg-primary/[0.07] hover:bg-primary/10"
                              : "hover:bg-muted/40 cursor-pointer"
                          )}
                        >
                          {/* Name + category dot */}
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              isOut ? "bg-destructive" : isLow ? "bg-orange-400" : "bg-emerald-500"
                            )} />
                            <span className="text-xs font-medium text-foreground truncate leading-tight">{product.canonicalName}</span>
                            {product.category && (
                              <span className="hidden sm:inline shrink-0 text-[9px] text-muted-foreground/50 font-medium">{product.category}</span>
                            )}
                          </div>
                          {/* Stock */}
                          <span className={cn(
                            "text-xs font-mono font-bold text-right",
                            isOut ? "text-destructive" : isLow ? "text-orange-400" : "text-muted-foreground"
                          )}>
                            {isOut ? "—" : `${product.stockQty}${product.unit ? ` ${product.unit}` : ""}`}
                          </span>
                          {/* Price */}
                          <span className="text-sm font-bold font-mono text-foreground text-right">
                            {formatKES(product.sellingPrice || 0)}
                          </span>
                          {/* Cart indicator */}
                          <div className="flex justify-center">
                            <div className={cn(
                              "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold",
                              inCart ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground/30"
                            )}>
                              {inCart ? inCart.qty : <Plus className="h-2.5 w-2.5" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* ── Card grid view ── */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {(debouncedSearch || (stockFilter !== "all" && stockFilter !== "in_stock") ? filteredProducts : filteredProducts.slice(0, 200)).map(product => {
                    const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
                    const isOut = product.stockQty === 0;
                    const weighed = (product as any).productType === "measured" || isWeighedUnit(product.unit || "");
                    const inCart = cart.find(i => i.product.id === product.id);

                    return (
                      <button
                        key={product.id}
                        onClick={() => !isOut && openQuickAdd(product)}
                        disabled={isOut}
                        className={cn(
                          "relative flex flex-col text-left rounded-xl border p-3",
                          isOut
                            ? "opacity-40 cursor-not-allowed bg-muted/30 border-border/40"
                            : inCart
                            ? "bg-primary/10 border-primary/50"
                            : "bg-card border-border cursor-pointer"
                        )}
                        style={{ contain: "layout style paint", isolation: "isolate" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className={cn(
                            "w-7 h-7 rounded-lg flex items-center justify-center",
                            weighed ? "bg-primary/10 text-primary" : "bg-muted/60 text-muted-foreground/40"
                          )}>
                            {weighed ? <Scale className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                          </div>
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            isOut ? "bg-destructive" : isLow ? "bg-orange-400" : "bg-emerald-500"
                          )} />
                        </div>

                        <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 mb-1.5 flex-1">{product.canonicalName}</p>

                        <p className={cn(
                          "text-[10px] font-mono font-bold mb-2",
                          isOut ? "text-destructive" : isLow ? "text-orange-400" : "text-muted-foreground/50"
                        )}>
                          {isOut ? "Out of stock" : `${product.stockQty} ${product.unit || "units"}`}
                        </p>

                        <div className="flex items-center justify-between mt-auto">
                          <span className="text-sm font-bold font-mono text-foreground">{formatKES(product.sellingPrice || 0)}</span>
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center",
                            inCart ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground/50"
                          )}>
                            {inCart ? <span className="text-[9px] font-bold">{inCart.qty}</span> : <Plus className="h-3 w-3" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {filteredProducts.length > 0 && (
                <p className="text-center text-[11px] text-muted-foreground/40 mt-4 pb-2">
                  {debouncedSearch
                    ? `${filteredProducts.length.toLocaleString()} results`
                    : stockFilter !== "all"
                    ? `${filteredProducts.length.toLocaleString()} products`
                    : filteredProducts.length > 200
                    ? `Showing 200 of ${filteredProducts.length.toLocaleString()} — search to see all`
                    : `${filteredProducts.length.toLocaleString()} products`}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Desktop Cart — hidden until first item added, then slides in */}
      <div className={cn(
        "hidden lg:flex flex-col shrink-0 border-border overflow-hidden transition-[width,opacity] duration-300 ease-out",
        cart.length > 0
          ? "w-[340px] xl:w-[380px] border-l opacity-100"
          : "w-0 opacity-0"
      )}>
        {cart.length > 0 && <CartPanel {...cartPanelProps} />}
      </div>

      {/* Mobile: Cart FAB — always in DOM, opacity-toggled to avoid mount repaints on Android */}
      <button
        className={cn(
          "lg:hidden fixed bottom-[4.5rem] right-4 z-40 bg-primary text-primary-foreground rounded-2xl h-14 px-4 flex items-center gap-2 border border-primary/40",
          "transition-opacity duration-150",
          cartCount > 0 && !showCartMobile ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setShowCartMobile(true)}
        aria-hidden={cartCount === 0 || showCartMobile}
      >
          <ShoppingCart className="h-5 w-5" />
          <div className="text-left">
            <p className="text-[10px] font-bold leading-none text-primary-foreground/80">{cartCount} items</p>
            <p className="text-sm font-bold font-mono leading-tight">{formatKES(total)}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-primary-foreground/60" />
        </button>

      {/* Mobile: Cart overlay — plain div, no Radix Dialog, no CSS transforms */}
      {showCartMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col">
          <div
            className="flex-1 bg-black/60"
            onClick={() => setShowCartMobile(false)}
          />
          <div className="bg-card h-[92svh] flex flex-col rounded-t-2xl border-t border-border overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <CartPanel {...cartPanelProps} />
            </div>
          </div>
        </div>
      )}

      {/* QuickAdd bottom sheet — plain div, no Radix Dialog */}
      <QuickAddSheet
        product={quickAddProduct} open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)} onAdd={handleQuickAdd} isOwner={isOwner}
        cartQty={cart.find(i => i.product.id === quickAddProduct?.id)?.qty ?? 0}
      />

      {/* Recent Sales Drawer */}
      {showRecentSales && (
        <RecentSalesDrawer
          shopId={shopId}
          userName={userName}
          onClose={() => setShowRecentSales(false)}
        />
      )}
    </div>
  );
}
