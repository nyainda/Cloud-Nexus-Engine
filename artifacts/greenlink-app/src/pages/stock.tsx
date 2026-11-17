import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  useListProducts, useRestockProduct, useCreateProduct, useUpdateProduct,
  useDeleteProduct, getListProductsQueryKey,
  getListInventoryMovementsQueryKey, customFetch
} from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { enqueueMutation } from "@/lib/offline-queue";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKES, formatQty } from "@/lib/format";
import {
  Search, Plus, Minus, Package, Edit2, AlertTriangle, ArrowUpRight,
  PackageX, Copy, TrendingUp, Scale, Wheat,
  Calendar, Trash2, ArrowLeftRight, Truck, Zap, CheckCircle2, X, ChevronDown, ArrowUpDown, Square, CheckSquare2
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Herbicides","Fungicides","Insecticides","Fertilizers","Seeds","Acaricides","Animal Health","Equipment","Agrochemicals"];

function CategoryPicker({ value, onChange, autoDetected }: { value: string; onChange: (v: string) => void; autoDetected?: boolean }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isPreset = CATEGORIES.includes(value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          value ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span className="flex items-center gap-2">
          {value ? (
            <>
              {isPreset && (
                <span className={cn("w-2 h-2 rounded-full shrink-0", getCategoryStyle(value).text.replace("text-", "bg-"))} />
              )}
              <span>{value}</span>
              {autoDetected && !isPreset && (
                <span className="text-[10px] text-primary font-semibold">Auto-inferred</span>
              )}
              {autoDetected && isPreset && (
                <span className="text-[10px] text-primary/70">Auto-inferred</span>
              )}
            </>
          ) : (
            "Select or type a category…"
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border/60 bg-popover shadow-xl p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => {
              const s = getCategoryStyle(cat);
              const active = value === cat;
              return (
                <button key={cat} type="button"
                  onClick={() => { onChange(active ? "" : cat); setOpen(false); }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all",
                    active
                      ? `${s.bg} ${s.text} ${s.border} ring-1 ring-current/30`
                      : "bg-muted/50 text-muted-foreground border-border/40 hover:bg-muted"
                  )}>
                  {cat}
                </button>
              );
            })}
          </div>
          <div className="border-t border-border/40 pt-2.5 flex gap-2">
            <input
              type="text"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && custom.trim()) { onChange(custom.trim()); setCustom(""); setOpen(false); } }}
              placeholder="Custom category…"
              className="flex-1 h-8 rounded-lg border border-border/50 bg-muted/30 px-3 text-xs focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
            <button
              type="button"
              disabled={!custom.trim()}
              onClick={() => { if (custom.trim()) { onChange(custom.trim()); setCustom(""); setOpen(false); } }}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 transition-opacity"
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const WEIGHT_UNITS = new Set(["kg", "g", "gram", "grams", "litre", "liter", "l", "ml", "ton", "tonne"]);
function isWeighedUnit(unit: string): boolean {
  return WEIGHT_UNITS.has(unit.trim().toLowerCase());
}

function generateSku(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 4).map(w => w[0].toUpperCase()).join("");
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${initials}-${suffix}`;
}

function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (/herbicide|weed killer|weedkiller|glyphosate|roundup|atrazine|pendimethalin|metolachlor|acetochlor|2,4-d|paraquat|dicamba/.test(n)) return "Herbicides";
  if (/fungicide|mancozeb|metalaxyl|carbendazim|propiconazole|thiophanate|copper oxychloride|ridomil|dithane|mancozeb/.test(n)) return "Fungicides";
  if (/insecticide|lambda|cypermethrin|imidacloprid|dimethoate|chlorpyrifos|acetamiprid|emamectin|abamectin|karate|actellic|decis/.test(n)) return "Insecticides";
  if (/fertilizer|fertiliser|\bdap\b|\bcan\b|\bnpk\b|\burea\b|triple super|\btsp\b|muriate|potash|sulphate of ammonia|\bcrf\b|micronutrient|foliar|top dress|calcium ammonium/.test(n)) return "Fertilizers";
  if (/\bseed\b|maize|bean|sorghum|sunflower|wheat|barley|kale|spinach|tomato seed|onion|cabbage|carrot seed/.test(n)) return "Seeds";
  if (/acaricide|cattle dip|tick|mange|ectoparasit|coopers dip/.test(n)) return "Acaricides";
  if (/animal health|veterinary|livestock|poultry|vaccine|dewormer|antibiotic|injection|bolus|vet |ivermectin|oxytetracycline/.test(n)) return "Animal Health";
  if (/pump|sprayer|knapsack|hose|nozzle|equipment|spade|hoe|fork|wheelbarrow|watering/.test(n)) return "Equipment";
  if (/agrochemical|pesticide/.test(n)) return "Agrochemicals";
  return "";
}

function getCategoryStyle(category: string | null | undefined) {
  const c = (category || "").toLowerCase();
  if (c.includes("herbicide")) return { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/25", abbr: "HB" };
  if (c.includes("fungicide")) return { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/25", abbr: "FG" };
  if (c.includes("insecticide")) return { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/25", abbr: "IN" };
  if (c.includes("fertilizer")) return { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/25", abbr: "FE" };
  if (c.includes("seed")) return { bg: "bg-lime-500/15", text: "text-lime-400", border: "border-lime-500/25", abbr: "SD" };
  if (c.includes("equipment")) return { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/25", abbr: "EQ" };
  if (c.includes("acaricide")) return { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/25", abbr: "AC" };
  if (c.includes("animal")) return { bg: "bg-teal-500/15", text: "text-teal-400", border: "border-teal-500/25", abbr: "AH" };
  if (c.includes("agrochemical")) return { bg: "bg-indigo-500/15", text: "text-indigo-400", border: "border-indigo-500/25", abbr: "AG" };
  const abbr = category ? category.slice(0, 2).toUpperCase() : "—";
  return { bg: "bg-muted/60", text: "text-muted-foreground", border: "border-border", abbr };
}

function BagCalculator({ unit, setBuyPrice, setSellPrice }: {
  unit: string;
  setBuyPrice: (v: string) => void;
  setSellPrice: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [bagSize, setBagSize] = useState("");
  const [bagBuy, setBagBuy] = useState("");
  const [bagSell, setBagSell] = useState("");

  const perUnitBuy = bagSize && bagBuy && parseFloat(bagSize) > 0
    ? (parseFloat(bagBuy) / parseFloat(bagSize)).toFixed(2) : null;
  const perUnitSell = bagSize && bagSell && parseFloat(bagSize) > 0
    ? (parseFloat(bagSell) / parseFloat(bagSize)).toFixed(2) : null;

  return (
    <div className="col-span-full">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline">
        <Zap className="h-3.5 w-3.5" />
        {open ? "Hide" : "Use"} Bag Price Calculator
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 border border-primary/20 bg-primary/5 rounded-xl p-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Enter your bag size and buy/sell price — we'll calculate the price per <strong>{unit}</strong> for you.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bag size ({unit})</Label>
              <Input type="number" value={bagSize} onChange={e => setBagSize(e.target.value)} placeholder="e.g. 50" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bag buy (KES)</Label>
              <Input type="number" value={bagBuy} onChange={e => setBagBuy(e.target.value)} placeholder="6000" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bag sell (KES)</Label>
              <Input type="number" value={bagSell} onChange={e => setBagSell(e.target.value)} placeholder="7200" className="h-8 text-sm" />
            </div>
          </div>
          {(perUnitBuy || perUnitSell) && (
            <div className="bg-background border border-border rounded-lg px-3 py-2 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-bold">Per {unit} price:</p>
              <div className="flex items-center gap-4 flex-wrap">
                {perUnitBuy && <span className="text-xs font-mono font-bold text-blue-400">Buy: KES {perUnitBuy}/{unit}</span>}
                {perUnitSell && <span className="text-xs font-mono font-bold text-emerald-500">Sell: KES {perUnitSell}/{unit}</span>}
              </div>
              <Button size="sm" className="mt-1.5 h-7 text-xs w-full" onClick={() => {
                if (perUnitBuy) setBuyPrice(perUnitBuy);
                if (perUnitSell) setSellPrice(perUnitSell);
                setOpen(false);
              }}>
                Apply prices
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WeightPresets({ unit, onSelect }: { unit: string; onSelect: (v: number) => void }) {
  const u = unit.toLowerCase().trim();
  const presets = u === "g" || u === "gram" || u === "grams"
    ? [100, 250, 500, 1000]
    : u === "ml"
    ? [250, 500, 1000]
    : [0.5, 1, 2, 5, 10, 25, 50];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {presets.map(p => (
        <button key={p} type="button" onClick={() => onSelect(p)}
          className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/70 border border-border transition-colors">
          {p}{unit}
        </button>
      ))}
    </div>
  );
}

function RestockDialog({ product }: { product: any }) {
  const [open, setOpen] = useState(false);
  const weighed = isWeighedUnit(product.unit || "");
  const [qty, setQty] = useState<number | "">(0);
  const [purchasePrice, setPurchasePrice] = useState(product.purchasePrice?.toString() || "");
  const [sellingPrice, setSellingPrice] = useState(product.sellingPrice?.toString() || "");
  const [submitting, setSubmitting] = useState(false);

  // Sync prices from the latest product data every time the dialog opens.
  // Without this, editing a price via the Edit dialog and then opening Restock
  // would show the stale price from the initial component mount.
  useEffect(() => {
    if (open) {
      setPurchasePrice(product.purchasePrice?.toString() || "");
      setSellingPrice(product.sellingPrice?.toString() || "");
      setQty(0);
    }
  }, [open, product.purchasePrice, product.sellingPrice]);
  const restockMutation = useRestockProduct();
  const qc = useQueryClient();

  const handleRestock = async () => {
    const qtyNum = Number(qty);
    if (qtyNum === 0 || submitting) return;

    // Guard against double-tap immediately — before any async work
    setSubmitting(true);

    // Snapshot for rollback on error
    const snapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });

    // Optimistic update: immediately show new stock qty in the list
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.map((p: any) => p.id !== product.id ? p : {
        ...p, stockQty: p.stockQty + qtyNum,
        ...(purchasePrice && { purchasePrice: Number(purchasePrice) }),
        ...(sellingPrice && { sellingPrice: Number(sellingPrice) }),
      }) };
    });

    // Close + confirm immediately — don't wait for the network
    toast.success(qtyNum > 0
      ? `Restocked ${qtyNum} ${product.unit || "units"} of ${product.canonicalName}`
      : `Removed ${Math.abs(qtyNum)} ${product.unit || "units"} from ${product.canonicalName}`);
    setOpen(false);
    setQty(0);
    setSubmitting(false);

    // If offline, queue the restock and return — sync will fire on reconnect
    if (!navigator.onLine) {
      await enqueueMutation("restock", (product.shopId as string) || "", {
        productId: product.id,
        qty: qtyNum,
        ...(purchasePrice ? { newPurchasePrice: Number(purchasePrice) } : {}),
        ...(sellingPrice ? { newSellingPrice: Number(sellingPrice) } : {}),
      });
      toast.success(`Restock saved offline — will sync on reconnect`);
      return;
    }

    // Async IIFE: runs to completion even after the dialog component unmounts.
    // Per-call .mutate() callbacks are NOT guaranteed to fire after unmount in TanStack Query v5,
    // so we use mutateAsync + try/catch/finally to guarantee the cache is always synced.
    (async () => {
      try {
        const updatedProduct = await restockMutation.mutateAsync(
          { productId: product.id, data: { qty: qtyNum, newPurchasePrice: purchasePrice ? Number(purchasePrice) : undefined, newSellingPrice: sellingPrice ? Number(sellingPrice) : undefined } as any },
        );
        // Register with version guard so any concurrent background refetch that returns
        // a stale KV response for this product gets silently replaced with this version.
        recordMutationResult(updatedProduct as any);
        // Sync cache with server-confirmed values (authoritative values replace optimistic)
        qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
          if (!old?.products) return old;
          return { ...old, products: old.products.map((p: any) =>
            p.id === (updatedProduct as any).id
              ? { ...p, stockQty: (updatedProduct as any).stockQty, purchasePrice: (updatedProduct as any).purchasePrice, sellingPrice: (updatedProduct as any).sellingPrice }
              : p
          )};
        });
      } catch {
        // Rollback to snapshot, never leave UI in an inconsistent state
        snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        toast.error("Restock failed — please retry");
      } finally {
        // Always sync after mutation settles — guaranteed even if dialog unmounted
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg border-primary/35 bg-primary/12 px-2.5 text-xs font-semibold text-primary hover:bg-primary hover:text-primary-foreground transition-colors focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <ArrowUpRight className="mr-1 h-3.5 w-3.5" />Restock
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restock — {product.canonicalName}</DialogTitle>
        </DialogHeader>
        <div className="border border-border rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Current Stock</p>
              <p className="text-2xl font-bold font-mono">{formatQty(product.stockQty)}<span className="text-muted-foreground text-sm font-normal ml-1">{product.unit || "units"}</span></p>
            </div>
            {product.alertQty && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Alert at</p>
                <p className="text-lg font-bold font-mono text-orange-500">{product.alertQty} {product.unit || "units"}</p>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <span className="text-blue-400 font-mono">↓</span> Buy Price (KES)
              </Label>
              <Input
                type="number"
                value={purchasePrice}
                onChange={e => setPurchasePrice(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder={product.purchasePrice?.toString() || "0"}
                className="h-10 font-mono text-center"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <span className="text-emerald-400 font-mono">↑</span> Sell Price (KES)
              </Label>
              <Input
                type="number"
                value={sellingPrice}
                onChange={e => setSellingPrice(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder={product.sellingPrice?.toString() || "0"}
                className="h-10 font-mono text-center"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Qty adjustment — <span className="text-emerald-400">+ adds stock</span> / <span className="text-orange-400">− removes stock</span>
            </Label>
            {weighed ? (
              <>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQty(q => Number(q || 0) - (Math.abs(Number(q || 0)) <= 1 ? 0.25 : 1))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input type="number" step="0.25" className="flex-1 h-10 text-xl font-bold font-mono text-center" value={qty} onChange={e => setQty(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)} />
                  <Button type="button" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQty(q => Number(q || 0) + (Math.abs(Number(q || 0)) < 1 ? 0.25 : 1))}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <WeightPresets unit={product.unit || "kg"} onSelect={v => setQty(v)} />
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQty(q => Number(q || 0) - 1)}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input type="number" step="1" className="flex-1 h-10 text-xl font-bold font-mono text-center" value={qty} onChange={e => setQty(e.target.value === "" ? "" : parseInt(e.target.value) || 0)} />
                <Button type="button" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQty(q => Number(q || 0) + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
            {Number(qty) < 0 && (
              <p className={cn("text-xs font-medium", product.stockQty + Number(qty) < 0 ? "text-destructive" : "text-orange-400")}>
                {product.stockQty + Number(qty) < 0
                  ? `Cannot remove more than current stock (${formatQty(product.stockQty)} ${product.unit || "units"})`
                  : `Stock will drop to ${formatQty(product.stockQty + Number(qty))} ${product.unit || "units"}`}
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleRestock}
            disabled={Number(qty) === 0 || submitting || (Number(qty) < 0 && product.stockQty + Number(qty) < 0)}
            className="min-w-[140px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                Saving…
              </span>
            ) : Number(qty) > 0 ? (
              `Add ${qty} ${product.unit || "units"}`
            ) : (
              `Remove ${Math.abs(Number(qty))} ${product.unit || "units"}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditProductDialog({ product, onSuccess }: { product: any; onSuccess: () => void }) {
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

  const UNIT_PRESETS = ["bag", "kg", "g", "litre", "ml", "sachet", "unit", "bottle", "pack", "box", "tin"];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-lg border-border/80 bg-background/70 px-2.5 text-xs font-medium hover:border-primary/40 hover:bg-muted/60 transition-colors focus-visible:ring-2 focus-visible:ring-primary/20"
        >
          <Edit2 className="mr-1 h-3.5 w-3.5" />Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit — {product.canonicalName}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 py-2">
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Product Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
            <CategoryPicker
              value={category}
              onChange={v => { setCategory(v); categoryManuallyEdited.current = true; }}
              autoDetected={!categoryManuallyEdited.current && !!category}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">SKU</Label>
              {sku && (
                <button type="button" onClick={() => { setSku(generateSku(name)); skuManuallyEdited.current = false; }}
                  className="text-[10px] text-primary font-semibold hover:underline flex items-center gap-1">
                  <X className="h-2.5 w-2.5" />Regenerate
                </button>
              )}
            </div>
            <Input value={sku} onChange={e => { setSku(e.target.value); skuManuallyEdited.current = true; }}
              className={cn("h-9 font-mono text-sm", sku && !skuManuallyEdited.current && "text-primary")} />
            {sku && !skuManuallyEdited.current && (
              <p className="text-[10px] text-muted-foreground">Auto-generated — edit manually or click Regenerate</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Buy Price {productType === "measured" ? <span className="text-primary font-bold">(KES / {unit})</span> : "(KES)"}
            </Label>
            <Input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} className="h-9" placeholder={productType === "measured" ? `e.g. 136 per ${unit}` : "0"} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Sell Price {productType === "measured" ? <span className="text-primary font-bold">(KES / {unit})</span> : "(KES)"}
            </Label>
            <Input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} className="h-9" placeholder={productType === "measured" ? `e.g. 144 per ${unit}` : "0"} />
          </div>
          {buyPrice && sellPrice && Number(sellPrice) > 0 && (
            <div className="col-span-full border border-border rounded-lg px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Profit Margin</span>
              <span className="font-bold font-mono">{(((Number(sellPrice) - Number(buyPrice)) / Number(sellPrice)) * 100).toFixed(1)}%</span>
            </div>
          )}
          {productType === "measured" && (
            <BagCalculator unit={unit} setBuyPrice={setBuyPrice} setSellPrice={setSellPrice} />
          )}
          <div className="col-span-full">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Product Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setProductType("normal")}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                  productType === "normal" ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground hover:border-primary/50")}>
                <Package className="h-4 w-4 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-bold">Normal</p>
                  <p className="text-[10px] opacity-70 font-normal">Whole units (pcs, bags)</p>
                </div>
              </button>
              <button type="button" onClick={() => { setProductType("measured"); if (!["kg","g","litre","ml","l"].includes(unit)) setUnit("kg"); }}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                  productType === "measured" ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground hover:border-primary/50")}>
                <Scale className="h-4 w-4 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-bold">Measured</p>
                  <p className="text-[10px] opacity-70 font-normal">Decimal qty (kg, L, g)</p>
                </div>
              </button>
            </div>
          </div>
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Unit</Label>
            <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. kg, bag, litre..." />
            <div className="flex gap-1.5 flex-wrap">
              {UNIT_PRESETS.map(u => (
                <button key={u} type="button" onClick={() => setUnit(u)}
                  className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors",
                    unit === u ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50")}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Low Stock Alert {productType === "measured" ? `(${unit})` : ""}
            </Label>
            <Input type="number" value={alertQty} onChange={e => setAlertQty(e.target.value)} step={productType === "measured" ? "0.5" : "1"} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />Expiry Date
            </Label>
            <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="h-9" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={updateProduct.isPending}>
            {updateProduct.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddProductDialog({ shopId, onSuccess, existingProducts, isOwner }: { shopId: string; onSuccess: () => void; existingProducts: any[]; isOwner: boolean }) {
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

  const UNIT_PRESETS = ["bag", "kg", "g", "litre", "ml", "sachet", "unit", "bottle", "pack", "box", "tin"];

  function similarity(a: string, b: string): number {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const na = normalize(a); const nb = normalize(b);
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.9;
    const wordsA = na.split(/\s+/).filter(w => w.length > 2);
    const wordsB = nb.split(/\s+/).filter(w => w.length > 2);
    if (wordsA.length === 0 || wordsB.length === 0) return 0;
    const common = wordsA.filter(w => wordsB.includes(w)).length;
    return common / Math.max(wordsA.length, wordsB.length);
  }

  const duplicates = useMemo(() => {
    if (name.trim().length < 3) return [];
    return existingProducts.filter(p => similarity(p.canonicalName, name) >= 0.7).slice(0, 3);
  }, [name, existingProducts]);

  const margin = buyPrice && sellPrice && Number(sellPrice) > 0
    ? (((Number(sellPrice) - Number(buyPrice)) / Number(sellPrice)) * 100).toFixed(1) : null;

  const reset = () => { setName(""); setSku(""); setCategory(""); setUnit("bag"); setProductType("normal"); setBuyPrice(""); setSellPrice(""); setQty("0"); setAlertQty("5"); setExpiryDate(""); skuManuallyEdited.current = false; categoryManuallyEdited.current = false; };

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
    reset(); setOpen(false);
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

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs px-3">
          <Plus className="h-3.5 w-3.5 mr-1" />Add Product
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Product</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3 py-2">
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Product Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. DAP Fertilizer 50KG" className="h-10" autoFocus />
            {duplicates.length > 0 && (
              <div className="border border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 rounded-lg px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 text-xs font-bold">
                  <Copy className="h-3.5 w-3.5" />Possible duplicates:
                </div>
                {duplicates.map(d => (
                  <div key={d.id} className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium">{d.canonicalName}</span>
                    <span className="font-mono">Stock: {d.stockQty} {d.unit || "units"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Category</Label>
            <CategoryPicker
              value={category}
              onChange={v => { setCategory(v); categoryManuallyEdited.current = true; }}
              autoDetected={!categoryManuallyEdited.current && !!category}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">SKU</Label>
              {sku && (
                <button type="button" onClick={() => { setSku(generateSku(name)); skuManuallyEdited.current = false; }}
                  className="text-[10px] text-primary font-semibold hover:underline flex items-center gap-1">
                  <X className="h-2.5 w-2.5" />Regenerate
                </button>
              )}
            </div>
            <Input value={sku}
              onChange={e => { setSku(e.target.value); skuManuallyEdited.current = true; }}
              placeholder="Type product name above to auto-generate"
              className={cn("h-9 font-mono text-sm", sku && !skuManuallyEdited.current && "text-primary")} />
            {sku && !skuManuallyEdited.current && (
              <p className="text-[10px] text-muted-foreground">Auto-generated — edit manually or click Regenerate for a different code</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Buy Price {productType === "measured" ? <span className="text-primary font-bold">(KES / {unit})</span> : "(KES)"}
            </Label>
            <Input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder={productType === "measured" ? `e.g. 136 per ${unit}` : "0"} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Sell Price {productType === "measured" ? <span className="text-primary font-bold">(KES / {unit})</span> : "(KES)"}
            </Label>
            <Input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder={productType === "measured" ? `e.g. 144 per ${unit}` : "0"} className="h-9" />
          </div>
          {margin && (
            <div className="col-span-full border border-border rounded-lg px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Profit Margin</span>
              <span className="font-bold font-mono">{margin}%</span>
            </div>
          )}
          {productType === "measured" && (
            <BagCalculator unit={unit} setBuyPrice={setBuyPrice} setSellPrice={setSellPrice} />
          )}
          <div className="col-span-full">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground mb-2 block">Product Type</Label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setProductType("normal")}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                  productType === "normal" ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground hover:border-primary/50")}>
                <Package className="h-4 w-4 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-bold">Normal</p>
                  <p className="text-[10px] opacity-70 font-normal">Whole units (pcs, bags)</p>
                </div>
              </button>
              <button type="button" onClick={() => { setProductType("measured"); if (!["kg","g","litre","ml","l"].includes(unit)) setUnit("kg"); }}
                className={cn("flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                  productType === "measured" ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border text-muted-foreground hover:border-primary/50")}>
                <Scale className="h-4 w-4 shrink-0" />
                <div className="text-left">
                  <p className="text-xs font-bold">Measured</p>
                  <p className="text-[10px] opacity-70 font-normal">Decimal qty (kg, L, g)</p>
                </div>
              </button>
            </div>
          </div>
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Unit</Label>
            <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="bag, kg, litre..." className="h-9" />
            <div className="flex gap-1.5 flex-wrap">
              {UNIT_PRESETS.map(u => (
                <button key={u} type="button" onClick={() => setUnit(u)}
                  className={cn("text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors",
                    unit === u ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:border-primary/50")}>
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              {productType === "measured" ? `Total ${unit} in stock` : "Opening Qty"}
            </Label>
            {productType === "measured" && (
              <p className="text-[11px] text-muted-foreground">Enter total {unit} — e.g. 1 bag of 50kg → enter <strong>50</strong></p>
            )}
            <Input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" step={productType === "measured" ? "0.5" : "1"} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Alert Threshold {productType === "measured" ? `(${unit})` : ""}
            </Label>
            <Input type="number" value={alertQty} onChange={e => setAlertQty(e.target.value)} placeholder="5" step={productType === "measured" ? "0.5" : "1"} className="h-9" />
          </div>
          <div className="col-span-full space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Expiry Date (optional)</Label>
            <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} className="h-9" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || createProduct.isPending}>
            {createProduct.isPending ? "Adding…" : "Add Product"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ product, shopId }: { product: any; shopId: string; onSuccess?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [isPending, setIsPending] = useState(false);
  const weighed = product.productType === "measured" || isWeighedUnit(product.unit || "");
  const targetShopId = shopId === "shop-greenlink" ? "shop-sunrise" : "shop-greenlink";
  const targetLabel = targetShopId === "shop-greenlink" ? "GreenLink" : "Sunrise Agrovet";

  const productsKey = getListProductsQueryKey({ shopId, limit: 3000 });
  const targetProductsKey = getListProductsQueryKey({ shopId: targetShopId, limit: 3000 });

  const handleTransfer = async () => {
    if (isPending || qty <= 0 || qty > product.stockQty) return;

    // Capture qty/notes from this render's closure BEFORE any state resets below
    const transferQty = qty;
    const transferNotes = notes;
    const mutationId = newMutationId();

    logInventory({ stage: "pending_added", mutationId, source: "stock/transfer", timestamp: new Date().toISOString(), productId: product.id, previousQty: product.stockQty, nextQty: Math.max(0, product.stockQty - transferQty), extra: { qty: transferQty, target: targetShopId } });

    setIsPending(true);

    // Cancel ALL in-flight product queries (broad match) so none race with our optimistic update
    await qc.cancelQueries({ queryKey: getListProductsQueryKey() });

    // Snapshot ALL variants for rollback on failure
    const snapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });

    // Optimistic update: immediately show the deducted qty in the source shop's list.
    // Use setQueriesData (broad) so every cached query variant reflects the change.
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      const hasProduct = old.products.some((p: any) => p.id === product.id);
      if (!hasProduct) return old;
      return {
        ...old,
        products: old.products.map((p: any) =>
          p.id !== product.id ? p : { ...p, stockQty: Math.max(0, p.stockQty - transferQty) }
        ),
      };
    });
    logInventory({ stage: "optimistic_applied", mutationId, source: "stock/transfer", timestamp: new Date().toISOString(), productId: product.id, previousQty: product.stockQty, nextQty: Math.max(0, product.stockQty - transferQty) });

    // Close the dialog immediately — the optimistic update is already visible.
    // Reset state for the next open.
    setOpen(false);
    setQty(1);
    setNotes("");

    // Async IIFE: runs to completion even after this dialog component unmounts
    // (TanStack Query v5 per-call .mutate() callbacks are dropped on unmount).
    // We use direct customFetch + try/catch/finally to guarantee the cache is
    // always reconciled regardless of component lifecycle.
    (async () => {
      try {
        const result = await customFetch<any>(`/api/products/${product.id}/transfer`, {
          method: "POST",
          body: JSON.stringify({ targetShopId, qty: transferQty, notes: transferNotes || undefined }),
        });

        // result = { ok, transferId, sourceQtyAfter, targetQtyAfter, targetProductId }
        const now = new Date().toISOString();

        // Use server-confirmed source qty (replaces our optimistic guess with the
        // atomic DB value — critical if another mutation ran concurrently).
        qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
          if (!old?.products) return old;
          const hasProduct = old.products.some((p: any) => p.id === product.id);
          if (!hasProduct) return old;
          return {
            ...old,
            products: old.products.map((p: any) =>
              p.id !== product.id
                ? p
                : { ...p, stockQty: result.sourceQtyAfter, updatedAt: now }
            ),
          };
        });

        // Register source product with version guard so any concurrent background
        // refetch that returns a stale KV response gets silently rejected.
        recordMutationResult({ ...product, stockQty: result.sourceQtyAfter, updatedAt: now });
        logInventory({ stage: "mutation_success", mutationId, source: "stock/transfer", timestamp: now, productId: product.id, previousQty: product.stockQty, nextQty: result.sourceQtyAfter, extra: { targetProductId: result.targetProductId, targetQtyAfter: result.targetQtyAfter } });

        // Also update the target shop's cache if it's already loaded in memory
        // (e.g. if the user recently visited the other shop's stock page).
        qc.setQueriesData({ queryKey: targetProductsKey }, (old: any) => {
          if (!old?.products) return old;
          const updated = old.products.map((p: any) => {
            if (p.id !== result.targetProductId) return p;
            const updatedProd = { ...p, stockQty: result.targetQtyAfter, updatedAt: now };
            recordMutationResult(updatedProd);
            return updatedProd;
          });
          return { ...old, products: updated };
        });

        toast.success(`Transferred ${transferQty} ${product.unit || "units"} to ${targetLabel}`);
      } catch (e: any) {
        // Rollback ALL cached product query variants to pre-transfer state
        snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        toast.error(e.message || "Transfer failed — please retry");
      } finally {
        setIsPending(false);
        // Inventory movements and the transfers history list need a fresh fetch.
        // We do NOT invalidate products here — the cache is already authoritative
        // from the server response above, and invalidating would fire a GET that
        // could hit a stale KV edge node and flicker the qty back to its old value.
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
        qc.invalidateQueries({ queryKey: ["transfers", shopId] });
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label="Transfer stock"
          title="Transfer stock"
          className="h-8 rounded-lg border-sky-500/25 bg-sky-500/[0.07] px-2.5 text-xs font-medium text-sky-700 hover:border-sky-500/45 hover:bg-sky-500/15 dark:text-sky-300 transition-colors focus-visible:ring-2 focus-visible:ring-sky-500/25"
        >
          <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /><span>Transfer</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Transfer Stock to {targetLabel}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="border border-border rounded-lg p-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Product</p>
            <p className="font-semibold text-sm mt-0.5">{product.canonicalName}</p>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">Available: {product.stockQty} {product.unit || "units"}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Qty to Transfer</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                disabled={isPending}
                onClick={() => setQty(q => Math.max(weighed ? 0.25 : 1, q - (weighed && q <= 1 ? 0.25 : 1)))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input type="number" step={weighed ? "0.25" : "1"} min={weighed ? "0.25" : "1"} max={product.stockQty} value={qty}
                disabled={isPending}
                onChange={e => setQty(weighed ? parseFloat(e.target.value) || 0.25 : Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 text-center font-bold font-mono" />
              <Button type="button" size="icon" className="h-9 w-9 shrink-0"
                disabled={isPending}
                onClick={() => setQty(q => Math.min(product.stockQty, q + (weighed && q < 1 ? 0.25 : 1)))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Weekly restock" disabled={isPending} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleTransfer} disabled={isPending || qty <= 0 || qty > product.stockQty}>
            {isPending ? "Transferring…" : `Transfer ${qty} ${product.unit || "units"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProductButton({ productId, productName, onSuccess }: { productId: string; productName: string; onSuccess: () => void }) {
  const qc = useQueryClient();
  const delProduct = useDeleteProduct();
  const handleDelete = async () => {
    // Cancel ALL in-flight product queries (broad match) so none can race and restore the product
    await qc.cancelQueries({ queryKey: getListProductsQueryKey() });
    // Snapshot ALL variants for rollback
    const snapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });
    // Remove from every cached query variant at once — exact key + any other params
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.filter((p: any) => p.id !== productId) };
    });
    // Confirm immediately — do NOT call onSuccess()/refresh() here.
    // Calling invalidateQueries before the DELETE reaches the server hits the still-warm
    // KV cache which returns the old list (product still present), overwriting the optimistic remove.
    toast.success("Product removed");
    delProduct.mutate({ productId }, {
      onError: () => {
        snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        toast.error("Failed to delete product — please retry");
      },
      onSettled: () => {
        // KV cache is now busted by the DELETE — safe to background-sync
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      },
    });
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          aria-label={`Delete ${productName}`}
          title="Delete product"
          className="h-8 w-8 p-0 rounded-lg text-destructive border-destructive/30 bg-destructive/5 hover:bg-destructive/15 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Product?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove <span className="font-semibold">"{productName}"</span> from inventory. Sales history is preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Clean Up Dialog — removes products with no prices and zero stock ──────────
function CleanupDialog({ products: allProds, shopId }: { products: any[]; shopId: string }) {
  const [open, setOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const qc = useQueryClient();

  const junkProducts = useMemo(() =>
    allProds.filter(p => !p.purchasePrice && !p.sellingPrice && p.stockQty === 0),
  [allProds]);

  const handleCleanup = async () => {
    if (!junkProducts.length) return;
    setCleaning(true);
    const ids = junkProducts.map(p => p.id);

    // Optimistic remove all at once
    const snapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });
    const idSet = new Set(ids);
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.filter((p: any) => !idSet.has(p.id)), total: Math.max(0, (old.total || 0) - ids.length) };
    });
    setOpen(false);

    let ok = 0;
    for (const id of ids) {
      try {
        await customFetch(`/api/products/${id}`, { method: "DELETE" });
        ok++;
      } catch { /* individual failures are silent */ }
    }

    if (ok > 0) {
      toast.success(`Cleaned up ${ok} incomplete product${ok !== 1 ? "s" : ""}`);
    } else {
      snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error("Cleanup failed — please retry");
    }
    qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    setCleaning(false);
  };

  if (junkProducts.length === 0) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs px-3 gap-1 text-orange-400 border-orange-500/30 hover:bg-orange-500/10">
          <Trash2 className="h-3.5 w-3.5" />
          Clean DB ({junkProducts.length})
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {junkProducts.length} Incomplete Products?</AlertDialogTitle>
          <AlertDialogDescription>
            These products have <strong>no price</strong> and <strong>zero stock</strong> — likely leftover from a bulk import. Sales history is preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-40 overflow-y-auto border border-border rounded-lg p-2 text-xs text-muted-foreground space-y-1">
          {junkProducts.slice(0, 25).map(p => (
            <div key={p.id} className="truncate py-0.5">{p.canonicalName}</div>
          ))}
          {junkProducts.length > 25 && (
            <div className="text-muted-foreground/60 pt-1">…and {junkProducts.length - 25} more</div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCleanup}
            disabled={cleaning}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {cleaning ? "Cleaning…" : `Remove ${junkProducts.length} Products`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


function TransferHistory({ shopId, isOwner }: { shopId: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const { data: transfers, isLoading, refetch } = useQuery({
    queryKey: ["transfers", shopId],
    queryFn: () => customFetch<any[]>(`/api/transfers?shopId=${shopId}&limit=200`),
    enabled: !!shopId,
  });

  const cancelTransfer = useMutation({
    mutationFn: (id: string) => customFetch<any>(`/api/transfers/${id}`, { method: "DELETE" }),
    onError: (e: any) => toast.error(e.message || "Failed to cancel transfer — please retry"),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <div className="w-6 h-6 rounded-full border-2 border-border border-t-primary animate-spin" />
    </div>
  );

  if (!transfers?.length) return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground px-6 text-center">
      <Truck className="h-10 w-10 opacity-20" />
      <p className="text-sm font-semibold">No transfers recorded yet</p>
      <p className="text-xs max-w-xs leading-relaxed">Use the transfer button on any product to move stock between shops.</p>
    </div>
  );

  return (
    <div className="px-3 py-2 space-y-1.5">
      {(transfers as any[]).map((t: any) => {
        const isSent = t.fromShopId === shopId;
        const otherShopLabel = (isSent ? t.toShopId : t.fromShopId) === "shop-greenlink" ? "GreenLink" : "Sunrise Agrovet";
        const dateObj = new Date(t.createdAt);
        return (
          <div key={t.id} className={cn(
            "flex items-center gap-3 px-3 py-3 rounded-xl border",
            isSent ? "bg-orange-500/[0.04] border-orange-500/20" : "bg-emerald-500/[0.04] border-emerald-500/20"
          )}>
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
              isSent ? "bg-orange-500/15 text-orange-400" : "bg-emerald-500/15 text-emerald-400"
            )}>
              <Truck className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{t.productName}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className={cn("font-bold", isSent ? "text-orange-400" : "text-emerald-400")}>{isSent ? "Sent" : "Received"}</span>
                {" · "}<span className="font-mono">{t.qty}</span> {t.unit || "units"}{" · "}{isSent ? `→ ${otherShopLabel}` : `← ${otherShopLabel}`}
              </p>
              {t.notes && <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{t.notes}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs text-muted-foreground font-mono">{dateObj.toLocaleDateString("en-KE", { day: "2-digit", month: "short" })}</p>
              <p className="text-[10px] text-muted-foreground/60">{dateObj.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            {isOwner && isSent && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-destructive shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="max-w-sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Transfer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restore <span className="font-semibold">{t.qty} {t.unit || "units"}</span> of <span className="font-semibold">"{t.productName}"</span> back to this shop and deduct from {otherShopLabel}. Only possible if {otherShopLabel} still has sufficient stock.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                      cancelTransfer.mutate(t.id, {
                        onSuccess: () => {
                          toast.success("Transfer cancelled & stock restored");
                          refetch();
                          qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
                          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
                        },
                      });
                    }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Cancel Transfer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Bulk Restock Sheet ────────────────────────────────────────────────────────
interface RestockEntry { productId: string; qty: string; }

function BulkRestockSheet({ products: allProds, shopId, onDone }: { products: any[]; shopId: string; onDone: () => void }) {
  const DRAFT_KEY = `greenlink_restock_draft_${shopId}`;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [entries, setEntries] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch { return {}; }
  });
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [draftRestored, setDraftRestored] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
      return Object.values(d).some((v: any) => Number(v) > 0);
    } catch { return false; }
  });
  const qc = useQueryClient();
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Persist draft on every change
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(entries)); } catch {}
  }, [entries, DRAFT_KEY]);

  const debouncedSearch = useDebounce(search, 80);

  const categories = useMemo(() => {
    const s = new Set<string>();
    allProds.forEach(p => { if (p.category) s.add(p.category); });
    return Array.from(s).sort();
  }, [allProds]);

  const filtered = useMemo(() => {
    let list = allProds;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(p =>
        p.canonicalName.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    if (catFilter !== "all") list = list.filter(p => p.category === catFilter);
    return list;
  }, [allProds, debouncedSearch, catFilter]);

  const changedEntries = useMemo(() =>
    Object.entries(entries).filter(([, v]) => v !== "" && Number(v) !== 0),
  [entries]);

  const handleQtyChange = useCallback((id: string, val: string) => {
    setEntries(prev => ({ ...prev, [id]: val }));
  }, []);

  const focusNext = useCallback((currentId: string) => {
    const ids = filtered.map(p => p.id);
    const idx = ids.indexOf(currentId);
    if (idx >= 0 && idx < ids.length - 1) {
      inputRefs.current[ids[idx + 1]]?.focus();
      inputRefs.current[ids[idx + 1]]?.select();
    }
  }, [filtered]);

  const handleSaveAll = async () => {
    if (!changedEntries.length) return;
    setSaving(true);
    let ok = 0; let fail = 0;
    const newSaved = new Set(savedIds);
    const batchId = newMutationId();

    logInventory({ stage: "mutation_started", mutationId: batchId, source: "stock/restock", timestamp: new Date().toISOString(), extra: { count: changedEntries.length } });

    // Cancel any in-flight product fetches so they don't overwrite cache updates mid-batch
    await qc.cancelQueries({ queryKey: getListProductsQueryKey() });

    // Serialized loop — inventory mutations must never run concurrently.
    // Promise.all would fire all restocks simultaneously; if two requests arrive
    // close together they each read a stale stockQty and the last write wins,
    // losing the earlier delta. A sequential for-of guarantees each mutation
    // fully commits before the next one reads the updated stock level.
    for (const [productId, qtyStr] of changedEntries) {
      const qty = Number(qtyStr);
      if (qty === 0) continue;
      const mutId = newMutationId();
      try {
        const prevQty = (qc.getQueryData<any>(getListProductsQueryKey())?.products as any[] | undefined)?.find((p: any) => p.id === productId)?.stockQty ?? 0;
        const result = await customFetch<any>(`/api/products/${productId}/restock`, {
          method: "POST",
          body: JSON.stringify({ qty }),
        });
        // Register with version guard before updating the cache
        recordMutationResult(result);
        const nextQty = result.stockQty ?? prevQty + qty;
        // Update cache with server-confirmed value (not guessed)
        qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
          if (!old?.products) return old;
          return {
            ...old,
            products: old.products.map((p: any) =>
              p.id === productId ? { ...p, stockQty: nextQty } : p
            ),
          };
        });
        logInventory({ stage: "mutation_success", mutationId: mutId, source: "stock/restock", timestamp: new Date().toISOString(), productId, previousQty: prevQty, nextQty });
        newSaved.add(productId);
        ok++;
      } catch (e: any) {
        logInventory({ stage: "mutation_error", mutationId: mutId, source: "stock/restock", timestamp: new Date().toISOString(), productId, extra: { error: e?.message } });
        fail++;
      }
    }

    setSaving(false);
    setSavedIds(newSaved);
    // Clear saved entries and wipe the persisted draft for saved items
    setEntries(prev => {
      const next = { ...prev };
      changedEntries.forEach(([id]) => { delete next[id]; });
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
    setDraftRestored(false);

    if (ok > 0) toast.success(`Restocked ${ok} product${ok !== 1 ? "s" : ""} successfully`);
    if (fail > 0) toast.error(`${fail} product${fail !== 1 ? "s" : ""} failed — try again`);

    qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
    if (ok > 0) onDone();
  };

  const handleClear = () => {
    setEntries({});
    setSavedIds(new Set());
    setDraftRestored(false);
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
  };

  return (
    <>
      <Button size="sm" variant="outline"
        className={cn(
          "h-8 text-xs px-3 gap-1.5 relative",
          draftRestored
            ? "border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
            : "border-primary/40 text-primary hover:bg-primary/10"
        )}
        onClick={() => setOpen(true)}>
        <Zap className="h-3.5 w-3.5" />
        Quick Restock
        {draftRestored && (
          <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-amber-400 border-2 border-background animate-pulse" />
        )}
      </Button>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) { setSearch(""); setCatFilter("all"); } }}>
        <DialogContent className="max-w-2xl w-full h-[90dvh] flex flex-col p-0 gap-0" aria-describedby={undefined}>
          {/* Header */}
          <div className="shrink-0 px-5 pt-5 pb-3 border-b border-border space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Quick Restock
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Enter quantities to add — Tab between rows — Save All at once
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {changedEntries.length > 0 && (
                  <span className="text-xs font-bold text-primary bg-primary/10 border border-primary/30 rounded-full px-2.5 py-1">
                    {changedEntries.length} pending
                  </span>
                )}
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Draft restored banner */}
            {draftRestored && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400">
                <span className="text-sm">⚡</span>
                <p className="text-xs font-semibold flex-1">Draft restored — your unsaved quantities are back</p>
                <button onClick={() => setDraftRestored(false)} className="text-amber-400/60 hover:text-amber-400 transition-colors shrink-0">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search products…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>

            {/* Category pills */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {["all", ...categories].map(cat => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className={cn(
                    "shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                    catFilter === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                  )}>
                  {cat === "all" ? "All" : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Column headers */}
            <div className="sticky top-0 z-10 bg-muted border-b border-border px-4 py-1.5 grid grid-cols-[1fr_80px_80px_72px] gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span>Product</span>
              <span className="text-right">Current</span>
              <span className="text-center">Add qty</span>
              <span className="text-center">New total</span>
            </div>

            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                <PackageX className="h-8 w-8 opacity-20" />
                <p className="text-sm">No products match</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {filtered.map((p, i) => {
                  const qty = entries[p.id] ?? "";
                  const addQty = Number(qty);
                  const newTotal = addQty !== 0 ? p.stockQty + addQty : null;
                  const isSaved = savedIds.has(p.id);
                  const isLow = p.stockQty > 0 && p.stockQty <= p.alertQty;
                  const isOut = p.stockQty === 0;
                  const cat = getCategoryStyle(p.category);

                  return (
                    <div key={p.id} className={cn(
                      "grid grid-cols-[1fr_80px_80px_72px] gap-2 items-center px-4 py-2.5 transition-colors",
                      isSaved ? "bg-emerald-500/5" : qty && addQty !== 0 ? (addQty < 0 ? "bg-orange-500/[0.03]" : "bg-primary/[0.03]") : "hover:bg-muted/30"
                    )}>
                      {/* Product name + badge */}
                      <div className="min-w-0 flex items-center gap-2">
                        <div className={cn(
                          "w-6 h-6 rounded text-[9px] font-bold flex items-center justify-center shrink-0 border",
                          cat.bg, cat.text, cat.border
                        )}>
                          {cat.abbr}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate leading-tight">{p.canonicalName}</p>
                          {p.sku && <p className="text-[9px] font-mono text-muted-foreground/50 truncate">{p.sku}</p>}
                        </div>
                        {isSaved && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                      </div>

                      {/* Current qty */}
                      <div className="text-right">
                        <span className={cn(
                          "text-sm font-bold font-mono tabular-nums",
                          isOut ? "text-destructive" : isLow ? "text-orange-400" : "text-muted-foreground"
                        )}>
                          {formatQty(p.stockQty)}
                        </span>
                        <span className="text-[9px] text-muted-foreground/50 ml-0.5">{p.unit || "u"}</span>
                      </div>

                      {/* Input */}
                      <div className="flex justify-center">
                        <input
                          ref={el => { inputRefs.current[p.id] = el; }}
                          type="number"
                          step={isWeighedUnit(p.unit || "") ? "0.25" : "1"}
                          value={qty}
                          placeholder="0"
                          onChange={e => handleQtyChange(p.id, e.target.value)}
                          onFocus={e => e.target.select()}
                          onKeyDown={e => {
                            if (e.key === "Enter" || e.key === "Tab") {
                              e.preventDefault();
                              focusNext(p.id);
                            }
                          }}
                          className={cn(
                            "w-16 h-8 rounded-lg border text-center text-sm font-bold font-mono tabular-nums bg-background transition-all outline-none",
                            "focus:border-primary focus:ring-2 focus:ring-primary/20",
                            qty && addQty !== 0
                              ? addQty < 0 ? "border-orange-500/50 text-orange-400" : "border-primary/50 text-primary"
                              : "border-border text-foreground",
                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          )}
                        />
                      </div>

                      {/* New total */}
                      <div className="text-center">
                        {newTotal !== null ? (
                          <span className="text-sm font-bold font-mono text-primary tabular-nums">{formatQty(newTotal!)}</span>
                        ) : (
                          <span className="text-muted-foreground/30 text-sm">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer actions */}
          <div className="shrink-0 border-t border-border px-5 py-4 flex items-center justify-between gap-3 bg-background">
            <div className="text-xs text-muted-foreground">
              {changedEntries.length > 0
                ? <span className="text-foreground font-medium">{changedEntries.length} product{changedEntries.length !== 1 ? "s" : ""} ready to save</span>
                : "Enter quantities above"}
            </div>
            <div className="flex gap-2">
              {changedEntries.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClear} className="text-xs h-8">
                  Clear all
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-xs h-8">
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs px-4 gap-1.5 font-bold"
                disabled={changedEntries.length === 0 || saving}
                onClick={handleSaveAll}
              >
                {saving ? (
                  <>
                    <div className="w-3 h-3 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Save {changedEntries.length > 0 ? changedEntries.length : ""} Restock{changedEntries.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

type StockView = "all" | "low" | "out" | "expiring" | "noprice" | "transfers";

export default function Stock() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 100);
  const [view, setView] = useState<StockView>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"az" | "za" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc" | "newest">("az");
  const [showFinancialColumns, setShowFinancialColumns] = useState(false);
  const [visibleCount, setVisibleCount] = useState(10);
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Clear selection when switching away from cleanup views
  useEffect(() => {
    if (view !== "out" && view !== "noprice") setSelectedIds(new Set());
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: productsData, isLoading } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId, refetchInterval: 120_000, refetchIntervalInBackground: false } as any }
  );

  const allProducts = productsData?.products || [];

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return allProducts.filter((p: any) => p.canonicalName.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)) || (p.category && p.category.toLowerCase().includes(q))).slice(0, 8);
  }, [allProducts, search]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    allProducts.forEach((p: any) => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [allProducts]);

  const filtered = useMemo(() => {
    let list = allProducts;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((p: any) => p.canonicalName.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)) || (p.category && p.category.toLowerCase().includes(q)));
    }
    if (view === "out") list = list.filter((p: any) => p.stockQty === 0);
    else if (view === "low") list = list.filter((p: any) => p.stockQty > 0 && p.stockQty <= p.alertQty);
    else if (view === "expiring") {
      const day90Str = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      list = list.filter((p: any) => p.expiryDate && p.expiryDate <= day90Str);
    } else if (view === "noprice") list = list.filter((p: any) => !p.sellingPrice || !p.purchasePrice);
    if (categoryFilter !== "all") list = list.filter((p: any) => p.category === categoryFilter);

    return [...list].sort((a: any, b: any) => {
      switch (sortBy) {
        case "az": return a.canonicalName.localeCompare(b.canonicalName);
        case "za": return b.canonicalName.localeCompare(a.canonicalName);
        case "stock_asc": return a.stockQty - b.stockQty;
        case "stock_desc": return b.stockQty - a.stockQty;
        case "price_asc": return (a.sellingPrice || 0) - (b.sellingPrice || 0);
        case "price_desc": return (b.sellingPrice || 0) - (a.sellingPrice || 0);
        case "newest": return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
        default: return a.canonicalName.localeCompare(b.canonicalName);
      }
    });
  }, [allProducts, debouncedSearch, view, categoryFilter, sortBy]);

  const counts = useMemo(() => {
    const day90Str = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    return {
      all: allProducts.length,
      low: allProducts.filter((p: any) => p.stockQty > 0 && p.stockQty <= p.alertQty).length,
      out: allProducts.filter((p: any) => p.stockQty === 0).length,
      expiring: allProducts.filter((p: any) => p.expiryDate && p.expiryDate <= day90Str).length,
      noprice: allProducts.filter((p: any) => !p.sellingPrice || !p.purchasePrice).length,
      totalItems: allProducts.reduce((s: number, p: any) => s + p.stockQty, 0),
    };
  }, [allProducts]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || bulkDeleting) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const key = getListProductsQueryKey({ shopId, limit: 3000 });
    const snapshot = qc.getQueryData(key);
    // Optimistic removal — UI updates instantly
    qc.setQueryData(key, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.filter((p: any) => !ids.includes(p.id)) };
    });
    setSelectedIds(new Set());
    try {
      await Promise.all(ids.map(id => customFetch(`/api/products/${id}`, { method: "DELETE" })));
      toast.success(`${ids.length} product${ids.length !== 1 ? "s" : ""} removed from inventory`);
    } catch {
      qc.setQueryData(key, snapshot);
      toast.error("Some deletions failed — please retry");
    } finally {
      setBulkDeleting(false);
    }
  };

  const isBulkView = view === "out" || view === "noprice";
  const allBulkSelected = filtered.length > 0 && isBulkView && filtered.every((p: any) => selectedIds.has(p.id));
  const toggleSelectAll = () => {
    if (allBulkSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p: any) => p.id)));
    }
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const soonStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const day90Str = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Reset to top 10 rows whenever search, filter tabs, category or sort changes.
  useEffect(() => {
    setVisibleCount(10);
  }, [debouncedSearch, view, categoryFilter, sortBy]);

  const visibleProducts = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  );

  return (
    <div className="min-h-full bg-background text-foreground pb-10">
      {isBulkView && selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-destructive/25 bg-destructive/10 backdrop-blur-md px-4 py-2.5 sm:px-6">
          <p className="text-sm font-semibold text-destructive">{selectedIds.size} product{selectedIds.size !== 1 ? "s" : ""} selected</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>{bulkDeleting ? "Deleting…" : <><Trash2 className="mr-1.5 h-4 w-4" />Delete selected</>}</Button>
          </div>
        </div>
      )}
      {/* Executive Header */}
      <header className="border-b border-border/70 bg-background/90 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 border border-primary/25 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-primary">
                <span>Inventory Control</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-normal leading-tight text-foreground">
                Stock Overview
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">
                Monitor availability, shelf alerts, pricing coverage & transfers.
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <BulkRestockSheet products={allProducts} shopId={shopId} onDone={refresh} />
            {isOwner && <CleanupDialog products={allProducts} shopId={shopId} />}
            <AddProductDialog shopId={shopId} onSuccess={refresh} existingProducts={allProducts} isOwner={isOwner} />
          </div>
        </div>

        {/* Interactive KPI Strip */}
        {isOwner && (
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
            <button
              type="button"
              onClick={() => setView("all")}
              className={cn(
                "text-left relative overflow-hidden rounded-2xl border p-3 sm:p-3.5 transition-all hover:border-primary/40",
                view === "all"
                  ? "border-primary/40 bg-primary/[0.06]"
                  : "border-border/80 bg-card/95"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Total Products</p>
                  <p className="font-display mt-1 text-2xl font-bold tracking-normal tabular-nums text-foreground">
                    {counts.all.toLocaleString()}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 border border-primary/25 text-primary shrink-0">
                  <Package className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Active SKUs in catalog</p>
            </button>

            <button
              type="button"
              onClick={() => { setView("all"); setSortBy("stock_desc"); }}
              className="text-left relative overflow-hidden rounded-2xl border border-border/80 bg-card/95 p-3 sm:p-3.5 transition-all hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Units On Hand</p>
                  <p className="font-display mt-1 text-2xl font-bold tracking-normal tabular-nums text-foreground">
                    {parseFloat(counts.totalItems.toFixed(3)).toLocaleString()}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/12 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Scale className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Combined unit quantity</p>
            </button>

            <button
              type="button"
              onClick={() => setView(v => v === "low" ? "all" : "low")}
              className={cn(
                "text-left relative overflow-hidden rounded-2xl border p-3 sm:p-3.5 transition-all hover:border-amber-500/50",
                view === "low"
                  ? "border-amber-500/50 bg-amber-500/[0.08]"
                  : "border-border/80 bg-card/95"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Low Stock</p>
                  <p className="font-display mt-1 text-2xl font-bold tracking-normal tabular-nums text-amber-600 dark:text-amber-400">
                    {counts.low.toLocaleString()}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/12 border border-amber-500/25 text-amber-600 dark:text-amber-400 shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {counts.low ? (view === "low" ? "Filtering low stock" : "Click to review") : "Stock levels healthy"}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setView(v => v === "out" ? "all" : "out")}
              className={cn(
                "text-left relative overflow-hidden rounded-2xl border p-3 sm:p-3.5 transition-all hover:border-destructive/50",
                view === "out"
                  ? "border-destructive/50 bg-destructive/[0.08]"
                  : "border-border/80 bg-card/95"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-destructive">Out of Stock</p>
                  <p className="font-display mt-1 text-2xl font-bold tracking-normal tabular-nums text-destructive">
                    {counts.out.toLocaleString()}
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/12 border border-destructive/25 text-destructive shrink-0">
                  <PackageX className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {counts.out ? (view === "out" ? "Filtering zero stock" : "Click to restock") : "Nothing unavailable"}
              </p>
            </button>
          </div>
        )}
      </header>

        {view === "transfers" ? (
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => setView("all")}>
                ← Back to inventory
              </Button>
            </div>
            <TransferHistory shopId={shopId} isOwner={isOwner} />
          </div>
        ) : (
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_300px]">
              <section className="min-w-0 space-y-4">
                {/* Command Search & Filter Deck */}
                <div className="rounded-2xl border border-border/80 bg-card/95 p-3.5 sm:p-4 space-y-3.5">
                  <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder={counts.all ? `Search ${counts.all.toLocaleString()} products by name, SKU or category…` : "Search products by name, SKU or category…"}
                        className="h-11 rounded-xl border-border/80 bg-background/70 pl-10 pr-24 text-sm transition-colors placeholder:text-muted-foreground/65 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Escape") {
                            setSearch("");
                            setSearchOpen(false);
                          }
                        }}
                      />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {search && (
                          <button
                            type="button"
                            aria-label="Clear product search"
                            onClick={() => setSearch("")}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSearchOpen(true)}
                          title="Open quick-action Spotlight (Ctrl+K)"
                          className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-border/80 bg-muted/60 px-2 py-1 text-[10px] font-bold text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
                        >
                          <Zap className="h-3 w-3 text-primary" />
                          Spotlight
                          <kbd className="ml-0.5 rounded bg-background/80 px-1 text-[9px] font-mono">⌘K</kbd>
                        </button>
                      </div>

                      {/* Intentional Quick-Action Spotlight Modal */}
                      {searchOpen && (
                        <div className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-md animate-in fade-in-0 duration-150" role="dialog" aria-modal="true" aria-label="Search inventory">
                          <div className="border-b border-border/70 bg-card/60 px-4 py-3.5 sm:px-6 sm:py-4">
                            <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
                              <Search className="h-5 w-5 shrink-0 text-primary" />
                              <Input
                                autoFocus
                                placeholder="Quick Spotlight — search products by name, SKU or category…"
                                aria-label="Search inventory products"
                                className="h-12 min-w-0 flex-1 rounded-xl border-border/80 bg-background text-base focus-visible:ring-2 focus-visible:ring-primary/20 sm:h-13 sm:text-lg"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Escape") setSearchOpen(false);
                                  if (e.key === "Enter" && searchResults.length === 1) {
                                    setSearch(searchResults[0].canonicalName);
                                    setSearchOpen(false);
                                  }
                                }}
                              />
                              {search && (
                                <Button type="button" variant="ghost" size="icon" aria-label="Clear product search" onClick={() => setSearch("")} className="h-10 w-10 shrink-0">
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl px-3 font-semibold sm:h-11 sm:px-4" onClick={() => setSearchOpen(false)}>
                                <X className="mr-1.5 h-4 w-4" />
                                <span className="hidden sm:inline">Close</span>
                                <span className="sm:hidden">Done</span>
                              </Button>
                            </div>
                            <div className="mx-auto mt-2.5 flex w-full max-w-5xl items-center justify-between gap-3">
                              <p className="text-xs font-bold uppercase tracking-wider text-primary">Quick Action Spotlight</p>
                              <p className="text-xs text-muted-foreground">
                                {search.trim().length < 2 ? "Type at least 2 characters" : searchResults.length ? `${searchResults.length} matching products shown` : "No matching products"}
                              </p>
                            </div>
                          </div>
                          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
                            <div className="mx-auto w-full max-w-5xl space-y-3">
                              {search.trim().length < 2 ? (
                                <div className="flex min-h-[35vh] flex-col items-center justify-center text-center">
                                  <Search className="h-12 w-12 text-muted-foreground/25" />
                                  <p className="mt-4 text-base font-semibold">Jump directly to product actions</p>
                                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                                    Type a product name, SKU or category to restock, transfer or edit without scrolling.
                                  </p>
                                </div>
                              ) : searchResults.length === 0 ? (
                                <div className="flex min-h-[35vh] flex-col items-center justify-center text-center">
                                  <PackageX className="h-10 w-10 text-muted-foreground/35" />
                                  <p className="mt-3 text-base font-semibold">No products found</p>
                                  <p className="mt-1 text-sm text-muted-foreground">Try a shorter name, SKU or category.</p>
                                </div>
                              ) : (
                                searchResults.map((p: any) => {
                                  const cat = getCategoryStyle(p.category);
                                  const isOut = p.stockQty === 0;
                                  const isLow = p.stockQty > 0 && p.stockQty <= p.alertQty;
                                  return (
                                    <div key={p.id} className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 transition-all hover:border-primary/40 sm:p-5">
                                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                                        <div className="flex min-w-0 flex-1 items-center gap-3.5">
                                          <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border text-xs font-bold", cat.bg, cat.text, cat.border)}>
                                            {cat.abbr}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="break-words text-sm font-bold leading-snug sm:text-base">{p.canonicalName}</p>
                                            <p className="mt-1 break-words text-xs text-muted-foreground">{p.sku || "No SKU"} · {p.category || "Uncategorised"}</p>
                                          </div>
                                          <div className="shrink-0 text-right">
                                            <p className={cn("font-mono text-base font-bold tabular-nums sm:text-lg", isOut ? "text-destructive" : isLow ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                                              {formatQty(p.stockQty)} <span className="text-xs font-normal text-muted-foreground">{p.unit || "units"}</span>
                                            </p>
                                            <p className={cn("mt-1 text-xs font-medium", isOut ? "text-destructive" : isLow ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
                                              {isOut ? "Out of stock" : isLow ? "Low stock · alert " + formatQty(p.alertQty) : "In stock"}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex w-full flex-wrap items-center gap-2 border-t border-border/60 pt-3 [&>button]:min-h-10 [&>button]:rounded-xl sm:w-auto sm:justify-end sm:border-0 sm:pt-0">
                                          <RestockDialog product={p} />
                                          {isOwner && (
                                            <>
                                              <TransferDialog product={p} shopId={shopId} onSuccess={refresh} />
                                              <EditProductDialog product={p} onSuccess={refresh} />
                                            </>
                                          )}
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="h-10 rounded-xl px-3"
                                            onClick={() => {
                                              setSearch(p.canonicalName);
                                              setSearchOpen(false);
                                              setView("all");
                                              setCategoryFilter("all");
                                            }}
                                          >
                                            <ArrowUpRight className="mr-1.5 h-4 w-4" />
                                            Filter table
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                              {search.trim().length >= 2 && searchResults.length > 0 && (
                                <p className="pt-2 text-center text-xs text-muted-foreground">
                                  Instant local search from loaded inventory — no extra network queries sent.
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSearchOpen(true)}
                        className="sm:hidden inline-flex h-11 items-center gap-1.5 rounded-xl border border-border/80 bg-background/70 px-3 text-xs font-semibold text-foreground"
                      >
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        Spotlight
                      </button>
                      <div className="relative inline-flex items-center">
                        <select
                          value={sortBy}
                          onChange={e => setSortBy(e.target.value as typeof sortBy)}
                          style={{ WebkitAppearance: "none", MozAppearance: "none", appearance: "none" }}
                          className="h-11 appearance-none rounded-xl border border-border/80 bg-background/70 pl-3.5 pr-9 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer"
                        >
                          <option value="az">Name: A to Z</option>
                          <option value="za">Name: Z to A</option>
                          <option value="newest">Recently updated</option>
                          <option value="stock_asc">Stock: lowest first</option>
                          <option value="stock_desc">Stock: highest first</option>
                          <option value="price_asc">Price: lowest first</option>
                          <option value="price_desc">Price: highest first</option>
                        </select>
                        <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      </div>
                      {isBulkView && filtered.length > 0 && (
                        <Button variant="outline" className="h-11 rounded-xl" onClick={toggleSelectAll}>
                          {allBulkSelected ? <CheckSquare2 className="mr-2 h-4 w-4" /> : <Square className="mr-2 h-4 w-4" />}
                          {allBulkSelected ? "Deselect all" : "Select all"}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* View Tabs Rail */}
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
                    {([
                      { value: "all", count: counts.all, label: "All products", icon: Package },
                      { value: "low", count: counts.low, label: "Low stock", icon: AlertTriangle },
                      { value: "out", count: counts.out, label: "Out of stock", icon: PackageX },
                      { value: "noprice", count: counts.noprice, label: "Missing price", icon: Scale },
                      { value: "expiring", count: counts.expiring, label: "Expiring soon", icon: Calendar },
                      { value: "transfers", count: null, label: "Transfers", icon: ArrowLeftRight },
                    ] as { value: StockView; count: number | null; label: string; icon: any }[]).map(tab => {
                      const Icon = tab.icon;
                      const active = view === tab.value;
                      return (
                        <button
                          key={tab.value}
                          onClick={() => setView(tab.value)}
                          className={cn(
                            "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all",
                            active
                              ? "border-primary/40 bg-primary/12 text-primary shadow-sm"
                              : "border-border/60 bg-muted/35 text-muted-foreground hover:border-border hover:bg-muted/70 hover:text-foreground"
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <span className="text-xs font-semibold">{tab.label}</span>
                          {tab.count !== null && (
                            <span className={cn(
                              "rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                              active ? "bg-primary/20 text-primary" : "bg-background/80 text-foreground"
                            )}>
                              {tab.count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {categories.length > 0 && (
                    <div className="flex items-center gap-2 border-t border-border/60 pt-3">
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</span>
                      <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                        {(["all", ...categories] as string[]).map(cat => {
                          const style = cat === "all" ? null : getCategoryStyle(cat);
                          const active = categoryFilter === cat;
                          return (
                            <button
                              key={cat}
                              onClick={() => setCategoryFilter(cat)}
                              className={cn(
                                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                                active
                                  ? "border-primary/40 bg-primary/12 text-primary font-semibold"
                                  : "border-border/60 bg-background/60 text-muted-foreground hover:text-foreground"
                              )}
                            >
                              {style && <span className={cn("h-2 w-2 rounded-full border", style.bg, style.border)} />}
                              {cat === "all" ? "All categories" : cat}
                            </button>
                          );
                        })}
                      </div>
                      {isOwner && (
                        <Button
                          type="button"
                          size="sm"
                          variant={showFinancialColumns ? "secondary" : "outline"}
                          className="hidden lg:inline-flex h-8 shrink-0 rounded-lg text-xs"
                          onClick={() => setShowFinancialColumns(v => !v)}
                        >
                          {showFinancialColumns ? "Hide pricing columns" : "Show pricing"}
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Product Ledger Card */}
                <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/95">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-muted/25 px-4 py-3">
                    <div>
                      <h2 className="font-display text-sm sm:text-base font-bold tracking-normal">
                        {view === "low" ? "Low-stock products" : view === "out" ? "Out-of-stock products" : view === "expiring" ? "Expiry watchlist" : view === "noprice" ? "Products missing prices" : "Product inventory"}
                      </h2>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Showing {visibleProducts.length.toLocaleString()} of {filtered.length.toLocaleString()} matching item{filtered.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOwner && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="lg:hidden h-7 rounded-lg text-[11px]"
                          onClick={() => setShowFinancialColumns(v => !v)}
                        >
                          {showFinancialColumns ? "Hide prices" : "Show prices"}
                        </Button>
                      )}
                      <Badge variant="outline" className="rounded-lg border-border/80 text-[11px] font-semibold">
                        {isLoading ? "Syncing…" : "Live catalog"}
                      </Badge>
                    </div>
                  </div>

                  {isLoading ? (
                    <div className="flex h-52 items-center justify-center">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-border border-t-primary" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex h-60 flex-col items-center justify-center gap-2 text-muted-foreground">
                      <PackageX className="h-10 w-10 opacity-30" />
                      <p className="font-semibold text-sm text-foreground">No products found</p>
                      <p className="text-xs">{search ? "Try clearing your search or switching category." : "Products matching this filter will appear here."}</p>
                      {(search || categoryFilter !== "all" || view !== "all") && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-1 rounded-xl"
                          onClick={() => { setSearch(""); setCategoryFilter("all"); setView("all"); }}
                        >
                          Reset filters
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Desktop Clean Semantic Table (Zero Overlap, Native Smooth Scroll) */}
                      <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full border-collapse text-left">
                          <thead className="border-b border-border/70 bg-muted/25 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="py-3 pl-4 pr-3 font-bold">Product</th>
                              <th className="py-3 px-3 font-bold whitespace-nowrap">Category / Unit</th>
                              <th className="py-3 px-3 font-bold text-right whitespace-nowrap">Stock Health</th>
                              {isOwner && showFinancialColumns && (
                                <>
                                  <th className="py-3 px-3 font-bold text-right whitespace-nowrap">Unit Price</th>
                                  <th className="py-3 px-3 font-bold text-right whitespace-nowrap">Stock Value</th>
                                </>
                              )}
                              <th className="py-3 pl-3 pr-4 font-bold text-right whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {visibleProducts.map((p: any) => {
                              const isLow = p.stockQty > 0 && p.stockQty <= p.alertQty;
                              const isOut = p.stockQty === 0;
                              const isExpired = p.expiryDate && p.expiryDate < todayStr;
                              const isExpiringSoon = p.expiryDate && !isExpired && p.expiryDate <= soonStr;
                              const isExpiryWarning = p.expiryDate && !isExpired && !isExpiringSoon && p.expiryDate <= day90Str;
                              const cat = getCategoryStyle(p.category);
                              const healthTarget = Math.max(p.alertQty * 2, 10);
                              const healthPct = isOut ? 0 : Math.min(100, Math.max(8, (p.stockQty / healthTarget) * 100));
                              return (
                                <tr
                                  key={p.id}
                                  className={cn(
                                    "transition-colors hover:bg-muted/30",
                                    isOut && "bg-destructive/[0.03]",
                                    isLow && "bg-amber-500/[0.03]",
                                    isBulkView && selectedIds.has(p.id) && "bg-primary/[0.07]"
                                  )}
                                >
                                  <td className="py-3 pl-4 pr-3 align-middle">
                                    <div className="flex min-w-[200px] max-w-[380px] items-center gap-3">
                                      {isBulkView && (
                                        <input
                                          type="checkbox"
                                          checked={selectedIds.has(p.id)}
                                          onChange={e => setSelectedIds(prev => { const next = new Set(prev); e.target.checked ? next.add(p.id) : next.delete(p.id); return next; })}
                                          className="h-4 w-4 shrink-0 accent-primary"
                                        />
                                      )}
                                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[10px] font-bold", cat.bg, cat.text, cat.border)}>
                                        {cat.abbr}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">{p.canonicalName}</p>
                                        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                                          <span className="font-mono">{p.sku || "No SKU"}</span>
                                          {(isExpired || isExpiringSoon || isExpiryWarning) && (
                                            <span className={cn(
                                              "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                                              isExpired ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                                            )}>
                                              {isExpired ? "Expired" : isExpiringSoon ? "<30d exp" : "<90d exp"}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="py-3 px-3 align-middle whitespace-nowrap">
                                    <Badge variant="secondary" className={cn("max-w-[160px] truncate rounded-md border", cat.bg, cat.text, cat.border)}>
                                      {p.category || "Uncategorised"}
                                    </Badge>
                                    <p className="mt-1 text-[11px] text-muted-foreground">per {p.unit || "unit"}</p>
                                  </td>

                                  <td className="py-3 px-3 align-middle text-right whitespace-nowrap">
                                    <p className={cn("font-mono text-sm font-bold tabular-nums", isOut ? "text-destructive" : isLow ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                                      {formatQty(p.stockQty)}
                                    </p>
                                    <div className="ml-auto mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                      <div
                                        className={cn("h-full rounded-full", isOut ? "bg-destructive" : isLow ? "bg-amber-500" : "bg-primary")}
                                        style={{ width: `${healthPct}%` }}
                                      />
                                    </div>
                                    <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">Alert: {formatQty(p.alertQty)}</p>
                                  </td>

                                  {isOwner && showFinancialColumns && (
                                    <>
                                      <td className="py-3 px-3 align-middle text-right whitespace-nowrap text-sm font-medium font-mono tabular-nums">
                                        {p.sellingPrice ? formatKES(p.sellingPrice) : <span className="text-xs font-sans text-amber-600 dark:text-amber-400">Set price</span>}
                                      </td>
                                      <td className="py-3 px-3 align-middle text-right whitespace-nowrap text-sm font-semibold font-mono tabular-nums">
                                        {p.sellingPrice ? formatKES(p.stockQty * p.sellingPrice) : "—"}
                                      </td>
                                    </>
                                  )}

                                  <td className="w-px py-3 pl-3 pr-4 align-middle text-right whitespace-nowrap">
                                    <div className="inline-flex items-center justify-end gap-1.5">
                                      <RestockDialog product={p} />
                                      {isOwner && (
                                        <>
                                          <TransferDialog product={p} shopId={shopId} onSuccess={refresh} />
                                          <EditProductDialog product={p} onSuccess={refresh} />
                                          <DeleteProductButton productId={p.id} productName={p.canonicalName} onSuccess={refresh} />
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Cards */}
                      <div className="divide-y divide-border/60 lg:hidden">
                        {visibleProducts.map((p: any) => {
                          const isLow = p.stockQty > 0 && p.stockQty <= p.alertQty;
                          const isOut = p.stockQty === 0;
                          const cat = getCategoryStyle(p.category);
                          const healthTarget = Math.max(p.alertQty * 2, 10);
                          const healthPct = isOut ? 0 : Math.min(100, Math.max(8, (p.stockQty / healthTarget) * 100));
                          return (
                            <div key={p.id} className={cn("p-4", isOut && "bg-destructive/[0.03]", isLow && "bg-amber-500/[0.03]")}>
                              <div className="flex items-start gap-3">
                                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-[10px] font-bold", cat.bg, cat.text, cat.border)}>
                                  {cat.abbr}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="font-semibold text-sm">{p.canonicalName}</p>
                                    {isBulkView && (
                                      <input
                                        type="checkbox"
                                        checked={selectedIds.has(p.id)}
                                        onChange={e => setSelectedIds(prev => { const next = new Set(prev); e.target.checked ? next.add(p.id) : next.delete(p.id); return next; })}
                                        className="h-4 w-4 accent-primary"
                                      />
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted-foreground">{p.category || "Uncategorised"} · {p.sku || "No SKU"}</p>

                                  <div className="mt-3 flex items-end justify-between gap-3">
                                    <div className="min-w-[120px]">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">On hand</p>
                                      <p className={cn("mt-0.5 font-display text-xl font-bold tabular-nums", isOut ? "text-destructive" : isLow ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>
                                        {formatQty(p.stockQty)} <span className="text-xs font-medium text-muted-foreground font-sans">{p.unit || "units"}</span>
                                      </p>
                                      <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                                        <div className={cn("h-full rounded-full", isOut ? "bg-destructive" : isLow ? "bg-amber-500" : "bg-primary")} style={{ width: `${healthPct}%` }} />
                                      </div>
                                    </div>
                                    {isOwner && (
                                      <div className="text-right">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unit price</p>
                                        <p className="mt-0.5 font-mono font-bold text-sm tabular-nums">{p.sellingPrice ? formatKES(p.sellingPrice) : "—"}</p>
                                      </div>
                                    )}
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-1.5">
                                    <RestockDialog product={p} />
                                    {isOwner && (
                                      <>
                                        <TransferDialog product={p} shopId={shopId} onSuccess={refresh} />
                                        <EditProductDialog product={p} onSuccess={refresh} />
                                        <DeleteProductButton productId={p.id} productName={p.canonicalName} onSuccess={refresh} />
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Lightweight on-demand pagination footer (10 rows by default) */}
                      <div className="border-t border-border/70 bg-muted/20 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                        <span>
                          Showing <strong className="text-foreground">{visibleProducts.length.toLocaleString()}</strong> of{" "}
                          <strong className="text-foreground">{filtered.length.toLocaleString()}</strong> matching products
                          {filtered.length > visibleCount && " — use Search above to jump straight to any item"}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {visibleCount > 10 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 rounded-lg px-2.5 text-xs"
                              onClick={() => setVisibleCount(10)}
                            >
                              Show 10
                            </Button>
                          )}
                          {filtered.length > visibleCount && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-lg px-2.5 text-xs font-semibold"
                                onClick={() => setVisibleCount(n => Math.min(n + 10, filtered.length))}
                              >
                                Load 10 more
                              </Button>
                              {filtered.length - visibleCount > 10 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 rounded-lg px-2.5 text-xs"
                                  onClick={() => setVisibleCount(n => Math.min(n + 25, filtered.length))}
                                >
                                  +25
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Right Telemetry & Actions Sidebar */}
              {isOwner && (
                <aside className="space-y-4">
                  <div className="rounded-2xl border border-border/80 bg-card/95 p-4">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <h2 className="font-display font-bold text-sm">Stock Health</h2>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">Live catalog distribution across thresholds.</p>
                    <div className="mt-4 space-y-3.5">
                      {[
                        { label: "In stock", value: Math.max(0, counts.all - counts.low - counts.out), color: "bg-primary" },
                        { label: "Low stock", value: counts.low, color: "bg-amber-500" },
                        { label: "Out of stock", value: counts.out, color: "bg-destructive" },
                        { label: "Expiring (<90d)", value: counts.expiring, color: "bg-violet-500" },
                      ].map(item => (
                        <div key={item.label}>
                          <div className="mb-1.5 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground font-medium">{item.label}</span>
                            <span className="font-bold font-mono tabular-nums">{item.value}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full transition-all", item.color)} style={{ width: `${counts.all ? Math.min(100, item.value / counts.all * 100) : 0}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl bg-muted/40 border border-border/60 p-3">
                      <p className="text-xs font-bold">
                        {counts.low + counts.out ? `${counts.low + counts.out} products need stock attention` : "Stock levels look healthy"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">Click the KPI cards or filter pills above to focus on items.</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-card/95 p-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display font-bold text-sm">Quick Actions</h2>
                      <Zap className="h-4 w-4 text-primary" />
                    </div>
                    <div className="mt-3 space-y-2.5">
                      <div className="rounded-xl border border-primary/20 bg-primary/[0.06] p-3">
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <Plus className="h-3.5 w-3.5 text-primary" />
                          Add a product
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Register a new item or pack size.</p>
                        <div className="mt-2">
                          <AddProductDialog shopId={shopId} onSuccess={refresh} existingProducts={allProducts} isOwner={isOwner} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
                          Bulk restock
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Update multiple stock counts at once.</p>
                        <div className="mt-2">
                          <BulkRestockSheet products={allProducts} shopId={shopId} onDone={refresh} />
                        </div>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                        <div className="flex items-center gap-2 text-xs font-bold">
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Inventory cleanup
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Audit records needing cleanup.</p>
                        <div className="mt-2">
                          <CleanupDialog products={allProducts} shopId={shopId} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-card/95 p-4">
                    <div className="flex items-center gap-2 text-primary">
                      <TrendingUp className="h-4 w-4" />
                      <h2 className="font-display font-bold text-sm">Catalog Hygiene</h2>
                    </div>
                    <p className="mt-1.5 text-xs text-muted-foreground">Resolve pricing gaps and shelf-life warnings quickly.</p>
                    <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                      <button
                        type="button"
                        onClick={() => setView("noprice")}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-muted-foreground">Missing prices</span>
                        <span className="font-mono font-bold text-foreground tabular-nums">{counts.noprice}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setView("expiring")}
                        className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-muted-foreground">Expiry watchlist</span>
                        <span className="font-mono font-bold text-foreground tabular-nums">{counts.expiring}</span>
                      </button>
                    </div>
                  </div>
                </aside>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
