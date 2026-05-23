import { useState, useMemo } from "react";
import { useListProducts, useCreateSale, getListProductsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatKES } from "@/lib/format";
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  AlertTriangle, PackageX, Package, CreditCard, Banknote, X,
  ChevronRight, TrendingUp, Scale
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_stock", label: "In Stock" },
  { value: "low_stock", label: "Low" },
  { value: "out_of_stock", label: "Out" },
];

function QuickAddDialog({
  product, open, onClose, onAdd, isOwner,
}: {
  product: any | null; open: boolean; onClose: () => void;
  onAdd: (product: any, qty: number, price: number) => void; isOwner: boolean;
}) {
  const [qty, setQty] = useState<number>(1);
  const [price, setPrice] = useState(0);

  const handleOpen = () => {
    if (product) {
      setQty(isWeighedUnit(product.unit || "") ? 0.5 : 1);
      setPrice(product.sellingPrice || 0);
    }
  };

  const weighed = product ? isWeighedUnit(product.unit || "") : false;
  const isLow = product && product.stockQty > 0 && product.stockQty <= product.alertQty;
  const isOut = product && product.stockQty === 0;
  const margin = product && product.purchasePrice && price
    ? (((price - product.purchasePrice) / price) * 100).toFixed(0) : null;
  const profit = product && product.purchasePrice
    ? qty * (price - product.purchasePrice) : null;

  const qtyStep = weighed ? 0.25 : 1;
  const qtyMin = weighed ? 0.1 : 1;

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden border-border bg-card" onOpenAutoFocus={() => handleOpen()}>
        <DialogHeader className="sr-only"><DialogTitle>Add to Cart</DialogTitle></DialogHeader>
        {product && (
          <div className="flex flex-col">
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
                <div className={cn(
                  "text-[10px] font-bold px-2 py-1 rounded-full shrink-0",
                  isOut ? "bg-destructive/15 text-destructive" :
                  isLow ? "bg-orange-500/15 text-orange-400" : "bg-emerald-500/15 text-emerald-400"
                )}>
                  {isOut ? "Out of Stock" : isLow ? `Low: ${product.stockQty}` : `${product.stockQty} ${product.unit || "units"}`}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 block">
                  Quantity {weighed ? `(${product.unit || "kg"} — enter any amount)` : `(${product.unit || "units"})`}
                </Label>
                <div className="flex items-center gap-3">
                  <button
                    className="w-11 h-11 rounded-xl bg-muted border border-border flex items-center justify-center hover:bg-muted/60 active:scale-95 transition-all"
                    onClick={() => setQty(q => Math.max(qtyMin, parseFloat((q - qtyStep).toFixed(2))))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <input
                    type="number" min={qtyMin} step={qtyStep} max={product.stockQty}
                    value={qty}
                    onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= qtyMin) setQty(v); }}
                    className="flex-1 h-11 text-center text-2xl font-bold font-mono bg-muted/40 border border-border rounded-xl focus:outline-none focus:border-primary/60"
                  />
                  <button
                    className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-40"
                    onClick={() => setQty(q => Math.min(product.stockQty, parseFloat((q + qtyStep).toFixed(2))))}
                    disabled={qty >= product.stockQty}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {weighed && (
                  <div className="flex gap-1.5 flex-wrap mt-2">
                    {(product.unit?.toLowerCase() === "g" ? [100, 250, 500, 1000] : [0.5, 1, 2, 5, 10]).map(v => (
                      <button key={v} type="button" onClick={() => setQty(v)} className={cn(
                        "text-[11px] font-bold px-2.5 py-1 rounded-full border transition-all",
                        qty === v ? "bg-primary/20 border-primary/50 text-primary" : "bg-muted/50 border-border/50 text-muted-foreground hover:border-primary/30 hover:text-primary"
                      )}>
                        {v}{product.unit}
                      </button>
                    ))}
                  </div>
                )}
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
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                      Est. Profit {margin && <span className="text-[10px] text-emerald-400">({margin}%)</span>}
                    </span>
                    <span className={cn("font-bold font-mono text-sm", profit >= 0 ? "text-emerald-400" : "text-destructive")}>
                      {formatKES(profit)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <Button variant="outline" className="flex-1 h-12" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1 h-12 font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground"
                disabled={isOut}
                onClick={() => { onAdd(product, qty, price); onClose(); }}
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Add to Cart
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function POS() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");

  const { data: productsData, isLoading } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId, staleTime: 60_000 } }
  );

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
    if (stockFilter === "in_stock") return all.filter(p => p.stockQty > p.alertQty);
    if (stockFilter === "low_stock") return all.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty);
    if (stockFilter === "out_of_stock") return all.filter(p => p.stockQty === 0);
    return all;
  }, [productsData, debouncedSearch, stockFilter]);

  const filterCounts = useMemo(() => {
    const all = productsData?.products || [];
    return {
      all: all.length,
      in_stock: all.filter(p => p.stockQty > p.alertQty).length,
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

  const [quickAddProduct, setQuickAddProduct] = useState<any | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

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

  const updateQty = (productId: string, delta: number) => {
    setCart(prev =>
      prev.map(i => i.product.id === productId ? { ...i, qty: Math.max(0, i.qty + delta) } : i)
        .filter(i => i.qty > 0)
    );
  };

  const removeFromCart = (productId: string) => setCart(prev => prev.filter(i => i.product.id !== productId));
  const updatePrice = (productId: string, price: number) => setCart(prev => prev.map(i => i.product.id === productId ? { ...i, unitPrice: price } : i));

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.qty * i.unitPrice, 0), [cart]);
  const total = Math.max(0, subtotal - discount);
  const totalProfit = useMemo(() => cart.reduce((s, i) => {
    const cost = i.product.purchasePrice || 0;
    return s + i.qty * (i.unitPrice - cost);
  }, 0), [cart]);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const handleCheckout = (saleType: "cash" | "debt") => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (saleType === "debt" && !debtCustomerName.trim()) { toast.error("Enter customer name for debt sale"); return; }
    createSale.mutate(
      {
        data: {
          shopId, saleType, discount,
          items: cart.map(i => ({ productId: i.product.id, qty: i.qty, unitPrice: i.unitPrice })),
          servedBy: userName,
          debtCustomerName: saleType === "debt" ? debtCustomerName : undefined,
          debtCustomerPhone: saleType === "debt" ? debtCustomerPhone : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(saleType === "cash" ? "✓ Cash sale complete!" : "✓ Debt recorded!");
          setCart([]); setDiscount(0); setDebtCustomerName(""); setDebtCustomerPhone("");
          setShowCartMobile(false);
          qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        },
        onError: (err: any) => toast.error(err?.message || "Sale failed"),
      }
    );
  };

  const CartPanel = () => (
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
          <button className="lg:hidden text-muted-foreground hover:text-foreground p-1" onClick={() => setShowCartMobile(false)}>
            <X className="h-4 w-4" />
          </button>
          {cartCount > 0 && (
            <button className="text-[11px] text-muted-foreground hover:text-destructive transition-colors" onClick={() => { setCart([]); setDiscount(0); }}>
              Clear all
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
            <ShoppingCart className="h-10 w-10 opacity-10" />
            <p className="text-sm font-medium">Cart is empty</p>
            <p className="text-xs opacity-50 text-center px-6">Tap any product to add it</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {cart.map(item => {
              const itemProfit = isOwner && item.product.purchasePrice
                ? item.qty * (item.unitPrice - item.product.purchasePrice) : null;
              return (
                <div key={item.product.id} className="px-4 py-3">
                  <div className="flex justify-between items-start gap-2 mb-2.5">
                    <span className="text-sm font-semibold text-foreground leading-snug flex-1 pr-1">{item.product.canonicalName}</span>
                    <button onClick={() => removeFromCart(item.product.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors shrink-0 p-0.5">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center bg-muted/50 rounded-lg border border-border/60 overflow-hidden">
                      <button className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" onClick={() => updateQty(item.product.id, -1)}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">{item.qty}</span>
                      <button className="h-8 w-8 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors" onClick={() => updateQty(item.product.id, 1)} disabled={item.qty >= item.product.stockQty}>
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
      </ScrollArea>

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
                    "text-[10px] font-bold px-2 py-1 rounded-full transition-all",
                    discount === Math.round(subtotal * pct / 100) ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-primary/20 hover:text-primary"
                  )}>
                    {pct}%
                  </button>
                ))}
                {discount > 0 && (
                  <button onClick={() => setDiscount(0)} className="text-[10px] font-bold px-2 py-1 rounded-full bg-destructive/15 text-destructive hover:bg-destructive/25 transition-all">
                    Clear
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center pt-1.5 border-t border-border/60">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="text-2xl font-bold text-primary font-mono">{formatKES(total)}</span>
            </div>
            {isOwner && totalProfit > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground/60 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-emerald-400" />Est. Profit
                </span>
                <span className="font-mono text-emerald-400 font-semibold">{formatKES(totalProfit)}</span>
              </div>
            )}
          </div>

          <div className="px-4 pb-3 space-y-2 bg-card">
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                Customer name (required for debt)
              </Label>
              <input type="text" placeholder="e.g. John Kamau" value={debtCustomerName} onChange={e => setDebtCustomerName(e.target.value)}
                onPointerDown={e => e.stopPropagation()}
                className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 px-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60" />
            </div>
            <div className="space-y-1.5">
              <input type="tel" placeholder="Phone (optional)" value={debtCustomerPhone} onChange={e => setDebtCustomerPhone(e.target.value)}
                onPointerDown={e => e.stopPropagation()}
                className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 px-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60" />
            </div>
          </div>

          <div className="px-4 pb-4 grid grid-cols-2 gap-2 bg-card">
            <Button variant="outline" className="h-12 font-bold text-sm border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={createSale.isPending} onClick={() => handleCheckout("debt")}>
              <CreditCard className="h-4 w-4 mr-1.5" />Debt Sale
            </Button>
            <Button className="h-12 font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground active:scale-[0.98] transition-all shadow-lg shadow-primary/20" disabled={createSale.isPending} onClick={() => handleCheckout("cash")}>
              <Banknote className="h-4 w-4 mr-1.5" />Cash Sale
            </Button>
          </div>
        </div>
      )}
    </div>
  );

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
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
            {FILTERS.map(f => (
              <button key={f.value} onClick={() => setStockFilter(f.value)} className={cn(
                "shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                stockFilter === f.value ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30" : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}>
                {f.label}
                <span className={cn("text-[10px] font-bold", stockFilter === f.value ? "text-primary-foreground/70" : "text-muted-foreground/50")}>
                  {filterCounts[f.value]}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto p-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-3">
              <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
              <p className="text-sm">Loading products…</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
              <PackageX className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">No products found</p>
              {search && <p className="text-xs opacity-50">Try a different search term</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                {filteredProducts.map(product => {
                  const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
                  const isOut = product.stockQty === 0;
                  const weighed = isWeighedUnit(product.unit || "");
                  const inCart = cart.find(i => i.product.id === product.id);

                  return (
                    <button
                      key={product.id}
                      onClick={() => !isOut && openQuickAdd(product)}
                      disabled={isOut}
                      className={cn(
                        "relative flex flex-col text-left rounded-xl border p-3 transition-all active:scale-[0.97]",
                        isOut
                          ? "opacity-40 cursor-not-allowed bg-muted/30 border-border/40"
                          : inCart
                          ? "bg-primary/10 border-primary/50 hover:bg-primary/15 shadow-sm shadow-primary/10"
                          : "bg-card border-border hover:border-primary/50 hover:bg-muted/20 cursor-pointer shadow-sm"
                      )}
                    >
                      {/* Status dot */}
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

                      {/* Name */}
                      <p className="text-xs font-semibold text-foreground leading-tight line-clamp-2 mb-1.5 flex-1">{product.canonicalName}</p>

                      {/* Stock */}
                      <p className={cn(
                        "text-[10px] font-mono font-bold mb-2",
                        isOut ? "text-destructive" : isLow ? "text-orange-400" : "text-muted-foreground/50"
                      )}>
                        {isOut ? "Out of stock" : `${product.stockQty} ${product.unit || "units"}`}
                      </p>

                      {/* Price + add indicator */}
                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-sm font-bold font-mono text-foreground">{formatKES(product.sellingPrice || 0)}</span>
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center transition-all",
                          inCart ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground/50"
                        )}>
                          {inCart ? <span className="text-[9px] font-bold">{inCart.qty}</span> : <Plus className="h-3 w-3" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {filteredProducts.length > 0 && (
                <p className="text-center text-[11px] text-muted-foreground/40 mt-4 pb-2">
                  {debouncedSearch ? `${filteredProducts.length.toLocaleString()} results` : `${filteredProducts.length.toLocaleString()} products`}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Desktop Cart */}
      <div className="hidden lg:flex flex-col w-[340px] xl:w-[380px] shrink-0 border-l border-border overflow-hidden">
        <CartPanel />
      </div>

      {/* Mobile: Cart FAB */}
      {cartCount > 0 && !showCartMobile && (
        <button
          className="lg:hidden fixed bottom-[4.5rem] right-4 z-40 bg-primary text-primary-foreground rounded-2xl h-14 px-4 flex items-center gap-2 shadow-xl shadow-primary/40 active:scale-95 transition-all"
          onClick={() => setShowCartMobile(true)}
        >
          <ShoppingCart className="h-5 w-5" />
          <div className="text-left">
            <p className="text-[10px] font-bold leading-none opacity-80">{cartCount} items</p>
            <p className="text-sm font-bold font-mono leading-tight">{formatKES(total)}</p>
          </div>
          <ChevronRight className="h-4 w-4 opacity-60" />
        </button>
      )}

      {/* Mobile: Cart Sheet */}
      <Dialog open={showCartMobile} onOpenChange={setShowCartMobile}>
        <DialogContent className="p-0 h-[92svh] max-h-[92svh] flex flex-col sm:max-w-md border-border bg-card rounded-t-2xl">
          <DialogHeader className="sr-only"><DialogTitle>Cart</DialogTitle></DialogHeader>
          <div className="flex-1 flex flex-col min-h-0"><CartPanel /></div>
        </DialogContent>
      </Dialog>

      <QuickAddDialog
        product={quickAddProduct} open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)} onAdd={handleQuickAdd} isOwner={isOwner}
      />
    </div>
  );
}
