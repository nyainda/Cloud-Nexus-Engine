import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useListProducts, useRestockProduct, useCreateProduct, useUpdateProduct,
  useDeleteProduct, useBulkImportProducts, getListProductsQueryKey,
  getListInventoryMovementsQueryKey, customFetch
} from "@workspace/api-client-react";
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
import { formatKES } from "@/lib/format";
import {
  Search, Plus, Minus, Package, Upload, Edit2, AlertTriangle, ArrowUpRight,
  PackageX, Copy, TrendingUp, Scale, Wheat,
  Calendar, Trash2, ArrowLeftRight, Truck, Zap, CheckCircle2, X, ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

const WEIGHT_UNITS = new Set(["kg", "g", "gram", "grams", "litre", "liter", "l", "ml", "ton", "tonne"]);
function isWeighedUnit(unit: string): boolean {
  return WEIGHT_UNITS.has(unit.trim().toLowerCase());
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
  const [qty, setQty] = useState<number | "">(1);
  const [purchasePrice, setPurchasePrice] = useState(product.purchasePrice?.toString() || "");
  const [sellingPrice, setSellingPrice] = useState(product.sellingPrice?.toString() || "");
  const restockMutation = useRestockProduct();
  const qc = useQueryClient();

  const handleRestock = async () => {
    const qtyNum = Number(qty);
    if (!qtyNum || qtyNum <= 0) return;
    // Optimistic update: immediately show new stock qty in the list
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.map((p: any) => p.id !== product.id ? p : {
        ...p, stockQty: p.stockQty + qtyNum,
        ...(purchasePrice && { purchasePrice: Number(purchasePrice) }),
        ...(sellingPrice && { sellingPrice: Number(sellingPrice) }),
      }) };
    });
    restockMutation.mutate(
      { productId: product.id, data: { qty: qtyNum, newPurchasePrice: purchasePrice ? Number(purchasePrice) : undefined, newSellingPrice: sellingPrice ? Number(sellingPrice) : undefined } },
      {
        onSuccess: (updatedProduct: any) => {
          toast.success(`Restocked ${qtyNum} ${product.unit || "units"} of ${product.canonicalName}`);
          setOpen(false);
          setQty(1);
          // Update cache directly from confirmed server response — avoids KV cache race
          // (GET /api/products uses KV caching; refetching immediately after restock
          //  can return the stale cached value before KV is invalidated)
          qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
            if (!old?.products) return old;
            return { ...old, products: old.products.map((p: any) =>
              p.id === updatedProduct.id
                ? { ...p, stockQty: updatedProduct.stockQty, purchasePrice: updatedProduct.purchasePrice, sellingPrice: updatedProduct.sellingPrice }
                : p
            )};
          });
          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
        },
        onError: () => {
          // Revert optimistic update by refetching fresh data from server
          qc.refetchQueries({ queryKey: getListProductsQueryKey() });
          toast.error("Failed to update stock");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2">
          <ArrowUpRight className="h-3 w-3 mr-1" />Restock
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
              <p className="text-2xl font-bold font-mono">{product.stockQty}<span className="text-muted-foreground text-sm font-normal ml-1">{product.unit || "units"}</span></p>
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
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Quantity to Add ({product.unit || "units"}) *</Label>
            {weighed ? (
              <>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQty(q => Math.max(0.25, Number(q || 0) - (Number(q || 0) <= 1 ? 0.25 : 1)))}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input type="number" step="0.25" min="0.1" className="flex-1 h-10 text-xl font-bold font-mono text-center" value={qty} onChange={e => setQty(e.target.value === "" ? "" : parseFloat(e.target.value) || 0)} />
                  <Button type="button" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQty(q => Number(q || 0) + (Number(q || 0) < 1 ? 0.25 : 1))}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <WeightPresets unit={product.unit || "kg"} onSelect={v => setQty(v)} />
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQty(q => Math.max(1, Number(q || 0) - 1))}>
                  <Minus className="h-4 w-4" />
                </Button>
                <Input type="number" step="1" min="1" className="flex-1 h-10 text-xl font-bold font-mono text-center" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} />
                <Button type="button" size="icon" className="h-10 w-10 shrink-0" onClick={() => setQty(q => Number(q || 0) + 1)}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Buy Price (KES)</Label>
              <Input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sell Price (KES)</Label>
              <Input type="number" value={sellingPrice} onChange={e => setSellingPrice(e.target.value)} className="h-9" />
            </div>
          </div>
          {purchasePrice && sellingPrice && Number(sellingPrice) > 0 && (
            <div className="border border-border rounded-lg px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Margin</span>
              <span className="font-bold font-mono">{(((Number(sellingPrice) - Number(purchasePrice)) / Number(sellingPrice)) * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleRestock} disabled={!qty || Number(qty) <= 0 || restockMutation.isPending}>
            {restockMutation.isPending ? "Saving…" : `Add ${qty} ${product.unit || "units"}`}
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
  const [buyPrice, setBuyPrice] = useState(product.purchasePrice?.toString() || "");
  const [sellPrice, setSellPrice] = useState(product.sellingPrice?.toString() || "");
  const [alertQty, setAlertQty] = useState(product.alertQty?.toString() || "5");
  const [expiryDate, setExpiryDate] = useState(product.expiryDate || "");
  const updateProduct = useUpdateProduct();
  const qc = useQueryClient();

  const margin = buyPrice && sellPrice && Number(sellPrice) > 0
    ? (((Number(sellPrice) - Number(buyPrice)) / Number(sellPrice)) * 100).toFixed(1) : null;

  const handleSubmit = async () => {
    const patch: any = { canonicalName: name.trim() || undefined, sku: sku || undefined, category: category || undefined, unit: unit || undefined, purchasePrice: buyPrice ? parseFloat(buyPrice) : undefined, sellingPrice: sellPrice ? parseFloat(sellPrice) : undefined, alertQty: alertQty ? parseFloat(alertQty) : undefined, expiryDate: expiryDate || undefined };
    // Optimistic update
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.map((p: any) => p.id !== product.id ? p : { ...p, ...patch }) };
    });
    updateProduct.mutate(
      { productId: product.id, data: patch },
      {
        onSuccess: () => {
          toast.success("Product updated");
          setOpen(false);
          onSuccess();
          // Optimistic update already applied the correct values to the cache.
          // Do NOT refetch — the GET uses KV caching and a refetch right after
          // the write races the KV invalidation, returning the stale old value.
          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
        },
        onError: () => {
          // Revert optimistic update by refetching fresh data from server
          qc.refetchQueries({ queryKey: getListProductsQueryKey() });
          toast.error("Failed to update product");
        },
      }
    );
  };

  const UNIT_PRESETS = ["bag", "kg", "g", "litre", "ml", "sachet", "unit", "bottle", "pack", "box", "tin"];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2">
          <Edit2 className="h-3 w-3 mr-1" />Edit
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
            <Input value={category} onChange={e => setCategory(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">SKU</Label>
            <Input value={sku} onChange={e => setSku(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Buy Price (KES)</Label>
            <Input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sell Price (KES)</Label>
            <Input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} className="h-9" />
          </div>
          {margin && (
            <div className="col-span-full border border-border rounded-lg px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Profit Margin</span>
              <span className="font-bold font-mono">{margin}%</span>
            </div>
          )}
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
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Low Stock Alert</Label>
            <Input type="number" value={alertQty} onChange={e => setAlertQty(e.target.value)} step={isWeighedUnit(unit) ? "0.5" : "1"} />
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
  const [buyPrice, setBuyPrice] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [qty, setQty] = useState("0");
  const [alertQty, setAlertQty] = useState("5");
  const [expiryDate, setExpiryDate] = useState("");
  const createProduct = useCreateProduct();

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

  const reset = () => { setName(""); setSku(""); setCategory(""); setUnit("bag"); setBuyPrice(""); setSellPrice(""); setQty("0"); setAlertQty("5"); setExpiryDate(""); };

  const handleSubmit = () => {
    if (!name.trim()) return;
    createProduct.mutate(
      { data: { shopId, canonicalName: name.trim(), sku: sku || undefined, category: category || undefined, unit, purchasePrice: buyPrice ? parseFloat(buyPrice) : undefined, sellingPrice: sellPrice ? parseFloat(sellPrice) : undefined, alertQty: parseFloat(alertQty) || 5, stockQty: parseFloat(qty) || 0, expiryDate: expiryDate || undefined } as any },
      { onSuccess: () => { toast.success("Product added!"); reset(); setOpen(false); onSuccess(); }, onError: () => toast.error("Failed to add product") }
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
            <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Fertilizer, Feed…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">SKU</Label>
            <Input value={sku} onChange={e => setSku(e.target.value)} placeholder="SKU-001" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Buy Price (KES)</Label>
            <Input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)} placeholder="0" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sell Price (KES)</Label>
            <Input type="number" value={sellPrice} onChange={e => setSellPrice(e.target.value)} placeholder="0" className="h-9" />
          </div>
          {margin && (
            <div className="col-span-full border border-border rounded-lg px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center justify-between">
              <span className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" />Profit Margin</span>
              <span className="font-bold font-mono">{margin}%</span>
            </div>
          )}
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
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Opening Qty</Label>
            <Input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="0" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Alert Threshold</Label>
            <Input type="number" value={alertQty} onChange={e => setAlertQty(e.target.value)} placeholder="5" className="h-9" />
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

function TransferDialog({ product, shopId, onSuccess }: { product: any; shopId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const weighed = isWeighedUnit(product.unit || "");
  const targetShopId = shopId === "shop-greenlink" ? "shop-sunrise" : "shop-greenlink";
  const targetLabel = targetShopId === "shop-greenlink" ? "GreenLink" : "Sunrise Agrovet";

  const transferMutation = useMutation({
    mutationFn: async () => {
      return await customFetch<any>(`/api/products/${product.id}/transfer`, {
        method: "POST",
        body: JSON.stringify({ targetShopId, qty, notes: notes || undefined }),
      });
    },
    onSuccess: () => { toast.success(`Transferred ${qty} ${product.unit || "units"} to ${targetLabel}`); setOpen(false); setQty(1); setNotes(""); onSuccess(); },
    onError: (e: any) => toast.error(e.message || "Transfer failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2">
          <ArrowLeftRight className="h-3 w-3" />
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
              <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setQty(q => Math.max(weighed ? 0.25 : 1, q - (weighed && q <= 1 ? 0.25 : 1)))}>
                <Minus className="h-4 w-4" />
              </Button>
              <Input type="number" step={weighed ? "0.25" : "1"} min={weighed ? "0.25" : "1"} max={product.stockQty} value={qty} onChange={e => setQty(weighed ? parseFloat(e.target.value) || 0.25 : Math.max(1, parseInt(e.target.value) || 1))} className="flex-1 text-center font-bold font-mono" />
              <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={() => setQty(q => Math.min(product.stockQty, q + (weighed && q < 1 ? 0.25 : 1)))}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Weekly restock" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => transferMutation.mutate()} disabled={qty <= 0 || qty > product.stockQty || transferMutation.isPending}>
            {transferMutation.isPending ? "Transferring…" : `Transfer ${qty} ${product.unit || "units"}`}
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
    await qc.cancelQueries({ queryKey: getListProductsQueryKey() });
    const snapshot = qc.getQueryData(getListProductsQueryKey());
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return { ...old, products: old.products.filter((p: any) => p.id !== productId) };
    });
    delProduct.mutate({ productId }, {
      onSuccess: () => { toast.success("Product removed"); onSuccess(); },
      onError: () => { qc.setQueryData(getListProductsQueryKey(), snapshot); toast.error("Failed to delete product"); },
      onSettled: () => {
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      },
    });
  };
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 px-2 text-destructive border-destructive/40 hover:bg-destructive/10">
          <Trash2 className="h-3 w-3" />
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

function BulkImportDialog({ shopId, onSuccess }: { shopId: string; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const bulkImport = useBulkImportProducts();

  const parseCsv = (raw: string) => {
    const lines = raw.trim().split("\n").filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
    return lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim());
      const row: any = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ""; });
      return { canonicalName: row.name || row.canonical_name || row.product_name || "", sku: row.sku || undefined, category: row.category || undefined, unit: row.unit || "bag", purchasePrice: row.purchase_price || row.buy_price ? parseFloat(row.purchase_price || row.buy_price) : undefined, sellingPrice: row.selling_price || row.sell_price ? parseFloat(row.selling_price || row.sell_price) : undefined, stockQty: row.stock_qty || row.qty ? parseFloat(row.stock_qty || row.qty) : 0, alertQty: row.alert_qty ? parseFloat(row.alert_qty) : 5 };
    }).filter(p => p.canonicalName);
  };

  const handleImport = () => {
    const products = parseCsv(csv);
    if (!products.length) { toast.error("No valid products found"); return; }
    bulkImport.mutate({ data: { shopId, products, deduplicateStrategy: "merge" } }, {
      onSuccess: (result: any) => { toast.success(`${result.created} added · ${result.merged} merged · ${result.skipped} skipped`); setCsv(""); setOpen(false); onSuccess(); },
      onError: () => toast.error("Import failed"),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs px-3">
          <Upload className="h-3.5 w-3.5 mr-1" />Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Bulk Import from CSV</DialogTitle></DialogHeader>
        <div className="space-y-4 py-3">
          <div className="border border-border rounded-lg p-3 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Required columns</p>
            <code className="text-primary text-xs">name</code>
            <span className="text-xs ml-1">— then optionally:</span>
            <code className="text-xs ml-1 text-muted-foreground">sku, category, unit, buy_price, sell_price, qty, alert_qty</code>
          </div>
          <Textarea placeholder={"name,sku,category,unit,buy_price,sell_price,qty\nDAP Fertilizer 50KG,SKU-001,Fertilizer,bag,2500,3000,20"} value={csv} onChange={e => setCsv(e.target.value)} rows={7} className="font-mono text-xs" />
          {csv && <p className="text-sm font-semibold text-primary">{parseCsv(csv).length} products detected</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleImport} disabled={!csv.trim() || bulkImport.isPending}>
            {bulkImport.isPending ? "Importing…" : "Run Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    onSuccess: () => { toast.success("Transfer cancelled & stock restored"); refetch(); qc.invalidateQueries({ queryKey: getListProductsQueryKey() }); qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() }); },
    onError: (e: any) => toast.error(e.message || "Failed to cancel transfer"),
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
                    <AlertDialogAction onClick={() => cancelTransfer.mutate(t.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={cancelTransfer.isPending}>
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
    Object.entries(entries).filter(([, v]) => v !== "" && Number(v) > 0),
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

    await Promise.all(
      changedEntries.map(async ([productId, qtyStr]) => {
        const qty = Number(qtyStr);
        if (!qty || qty <= 0) return;
        try {
          const result = await customFetch<any>(`/api/products/${productId}/restock`, {
            method: "POST",
            body: JSON.stringify({ qty }),
          });
          // Optimistically update query cache
          qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
            if (!old?.products) return old;
            return {
              ...old,
              products: old.products.map((p: any) =>
                p.id === productId
                  ? { ...p, stockQty: result.stockQty ?? p.stockQty + qty }
                  : p
              ),
            };
          });
          newSaved.add(productId);
          ok++;
        } catch {
          fail++;
        }
      })
    );

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
            <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur border-b border-border px-4 py-1.5 grid grid-cols-[1fr_80px_80px_72px] gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
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
                  const newTotal = addQty > 0 ? p.stockQty + addQty : null;
                  const isSaved = savedIds.has(p.id);
                  const isLow = p.stockQty > 0 && p.stockQty <= p.alertQty;
                  const isOut = p.stockQty === 0;
                  const cat = getCategoryStyle(p.category);

                  return (
                    <div key={p.id} className={cn(
                      "grid grid-cols-[1fr_80px_80px_72px] gap-2 items-center px-4 py-2.5 transition-colors",
                      isSaved ? "bg-emerald-500/5" : qty && addQty > 0 ? "bg-primary/[0.03]" : "hover:bg-muted/30"
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
                          {p.stockQty}
                        </span>
                        <span className="text-[9px] text-muted-foreground/50 ml-0.5">{p.unit || "u"}</span>
                      </div>

                      {/* Input */}
                      <div className="flex justify-center">
                        <input
                          ref={el => { inputRefs.current[p.id] = el; }}
                          type="number"
                          min="0"
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
                            qty && addQty > 0
                              ? "border-primary/50 text-primary"
                              : "border-border text-foreground",
                            "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          )}
                        />
                      </div>

                      {/* New total */}
                      <div className="text-center">
                        {newTotal !== null ? (
                          <span className="text-sm font-bold font-mono text-primary tabular-nums">{newTotal}</span>
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

type StockView = "all" | "low" | "out" | "expiring" | "transfers";

export default function Stock() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 100);
  const [view, setView] = useState<StockView>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const qc = useQueryClient();

  const { data: productsData, isLoading } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId } }
  );

  const allProducts = productsData?.products || [];

  const categories = useMemo(() => {
    const cats = new Set<string>();
    allProducts.forEach(p => { if (p.category) cats.add(p.category); });
    return Array.from(cats).sort();
  }, [allProducts]);

  const filtered = useMemo(() => {
    let list = allProducts;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(p => p.canonicalName.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)) || (p.category && p.category.toLowerCase().includes(q)));
    }
    if (view === "out") list = list.filter(p => p.stockQty === 0);
    else if (view === "low") list = list.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty);
    else if (view === "expiring") {
      const soonStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      list = list.filter(p => p.expiryDate && p.expiryDate <= soonStr);
    }
    if (categoryFilter !== "all") list = list.filter(p => p.category === categoryFilter);
    return list;
  }, [allProducts, debouncedSearch, view, categoryFilter]);

  const counts = useMemo(() => {
    const soonStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    return {
      all: allProducts.length,
      low: allProducts.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty).length,
      out: allProducts.filter(p => p.stockQty === 0).length,
      expiring: allProducts.filter(p => p.expiryDate && p.expiryDate <= soonStr).length,
      totalItems: allProducts.reduce((s, p) => s + p.stockQty, 0),
    };
  }, [allProducts]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
    qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
  };

  const todayStr = new Date().toISOString().split("T")[0];
  const soonStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // The list's own scroll container ref — fixes the black-screen bug caused by
  // useWindowVirtualizer listening to window.scrollY while the actual scroll
  // happens on the layout's inner div.
  const listRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 68,
    overscan: 12,
  });

  // Scroll to top when filter / search changes
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [debouncedSearch, view, categoryFilter]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header — shrinks, never scrolls */}
      <div className="shrink-0 bg-background border-b border-border px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-foreground">Inventory</h1>
            <p className="text-xs text-muted-foreground">{counts.all.toLocaleString()} products · {counts.totalItems.toLocaleString()} units</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <BulkRestockSheet products={allProducts} shopId={shopId} onDone={refresh} />
            {isOwner && <BulkImportDialog shopId={shopId} onSuccess={refresh} />}
            <AddProductDialog shopId={shopId} onSuccess={refresh} existingProducts={allProducts} isOwner={isOwner} />
          </div>
        </div>

        {/* Stats */}
        {isOwner && (
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "SKUs", value: counts.all.toLocaleString(), warn: false, accent: false },
              { label: "Units", value: counts.totalItems.toLocaleString(), warn: false, accent: false },
              { label: "Low/Out", value: (counts.low + counts.out).toString(), warn: (counts.low + counts.out) > 0, accent: false },
              { label: "Expiring", value: counts.expiring.toString(), warn: false, accent: counts.expiring > 0 },
            ].map(stat => (
              <div key={stat.label} className={cn(
                "rounded-xl border px-2 py-2 text-center",
                stat.warn ? "bg-orange-500/[0.06] border-orange-500/20" :
                stat.accent ? "bg-amber-500/[0.06] border-amber-500/20" :
                "bg-card border-border/60"
              )}>
                <p className={cn("text-sm font-bold font-mono leading-none",
                  stat.warn ? "text-orange-400" : stat.accent ? "text-amber-400" : "text-primary"
                )}>{stat.value}</p>
                <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        {view !== "transfers" && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search name, SKU or category…" className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        )}

        {/* View tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {([
            { value: "all",       count: counts.all,       label: "All",       activeClass: "bg-primary border-primary text-primary-foreground",       countClass: "text-primary" },
            { value: "low",       count: counts.low,       label: "Low",       activeClass: "bg-orange-500 border-orange-500 text-white",               countClass: "text-orange-400" },
            { value: "out",       count: counts.out,       label: "Out",       activeClass: "bg-destructive border-destructive text-destructive-foreground", countClass: "text-destructive" },
            { value: "expiring",  count: counts.expiring,  label: "Expiring",  activeClass: "bg-amber-500 border-amber-500 text-white",                  countClass: "text-amber-400" },
            { value: "transfers", count: null,             label: "Transfers", activeClass: "bg-primary border-primary text-primary-foreground",         countClass: "text-foreground" },
          ] as { value: StockView; count: number | null; label: string; activeClass: string; countClass: string }[]).map(tab => (
            <button key={tab.value} onClick={() => setView(tab.value)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
                view === tab.value ? tab.activeClass : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
              )}>
              {tab.count !== null && (
                <span className={cn("font-bold font-mono tabular-nums",
                  view === tab.value ? "text-inherit opacity-90" : tab.countClass
                )}>{tab.count.toLocaleString()}</span>
              )}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Category filter */}
        {categories.length > 0 && view !== "transfers" && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {(["all", ...categories] as string[]).map(cat => (
              <button key={cat} onClick={() => setCategoryFilter(cat)}
                className={cn("shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                  categoryFilter === cat ? "bg-muted border-foreground/30 text-foreground" : "bg-background border-border text-muted-foreground hover:text-foreground")}>
                {cat === "all" ? "All categories" : cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content — owns its scroll so useVirtualizer works correctly */}
      <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
        {view === "transfers" ? (
          <TransferHistory shopId={shopId} isOwner={isOwner} />
        ) : isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 rounded-full border-2 border-border border-t-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <PackageX className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No products found</p>
            {search && <p className="text-xs">Try a different search term</p>}
          </div>
        ) : (
          <>
            {(debouncedSearch || view !== "all" || categoryFilter !== "all") && (
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <p className="text-xs text-muted-foreground">Showing <span className="font-semibold text-foreground">{filtered.length.toLocaleString()}</span> products</p>
              </div>
            )}

            {/* Virtual list — only ~10 rows in DOM at a time */}
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
              {virtualizer.getVirtualItems().map(virtualRow => {
                const p = filtered[virtualRow.index] as any;
                const isLow = p.stockQty > 0 && p.stockQty <= p.alertQty;
                const isOut = p.stockQty === 0;
                const isExpired = p.expiryDate && p.expiryDate < todayStr;
                const isExpiringSoon = p.expiryDate && !isExpired && p.expiryDate <= soonStr;
                const margin = p.purchasePrice && p.sellingPrice
                  ? (((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100).toFixed(0) : null;
                const cat = getCategoryStyle(p.category);

                return (
                  <div
                    key={p.id}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }}
                    className="px-3 py-1.5"
                  >
                    <div className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors",
                      isOut   ? "bg-destructive/[0.04] border-destructive/25" :
                      isLow   ? "bg-orange-500/[0.04] border-orange-500/25" :
                      isExpired ? "bg-red-500/[0.04] border-red-500/20" :
                      "bg-card border-border/50"
                    )}>
                      {/* Category chip */}
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold border",
                        cat.bg, cat.text, cat.border
                      )}>
                        {cat.abbr}
                      </div>

                      {/* Product info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-foreground leading-tight">{p.canonicalName}</span>
                          {isExpired && <Badge variant="destructive" className="text-[9px] h-3.5 px-1 shrink-0">Exp!</Badge>}
                          {isExpiringSoon && !isExpired && <Badge className="bg-amber-500/15 text-amber-400 border-0 text-[9px] h-3.5 px-1 shrink-0">Soon</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {p.sku && <span className="text-[10px] font-mono text-muted-foreground/50">{p.sku}</span>}
                          {isWeighedUnit(p.unit || "") && <span className="text-[10px] text-primary/70">⚖ {p.unit}</span>}
                        </div>
                      </div>

                      {/* Stock qty — large & prominent */}
                      <div className="text-center shrink-0 min-w-[40px]">
                        <p className={cn("text-lg font-bold font-mono leading-none",
                          isOut ? "text-destructive" : isLow ? "text-orange-400" : "text-primary"
                        )}>{p.stockQty}</p>
                        <p className="text-[9px] text-muted-foreground/60 mt-0.5 uppercase tracking-wide truncate max-w-[44px]">{p.unit || "u"}</p>
                      </div>

                      {/* Price — owner only, sm+ screens */}
                      {isOwner && (
                        <div className="text-right shrink-0 hidden sm:block min-w-[68px]">
                          {p.sellingPrice ? (
                            <>
                              <p className="text-sm font-bold font-mono">{formatKES(p.sellingPrice)}</p>
                              {margin && <p className="text-[10px] text-emerald-400 font-mono">{margin}%</p>}
                            </>
                          ) : <span className="text-muted-foreground/40 text-sm">—</span>}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
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
                );
              })}
            </div>
            <div className="py-4 text-center border-t border-border/40">
              <p className="text-xs text-muted-foreground">{filtered.length.toLocaleString()} products</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
