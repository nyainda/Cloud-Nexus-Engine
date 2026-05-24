import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatKES } from "@/lib/format";
import {
  Package, Plus, Search, Pencil, Trash2, X, ShoppingCart,
  Layers, ChevronRight, ChevronDown, ChevronUp, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useListProducts } from "@workspace/api-client-react";

const shopId = () => localStorage.getItem("greenlink_shopId") || "";
const isOwner = () => localStorage.getItem("greenlink_role") === "owner";

function fetchBundles() {
  return customFetch<any[]>("/api/bundles");
}
function createBundle(data: any) {
  return customFetch<any>("/api/bundles", { method: "POST", body: JSON.stringify(data) });
}
function updateBundle(id: string, data: any) {
  return customFetch<any>(`/api/bundles/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}
function deleteBundle(id: string) {
  return customFetch<any>(`/api/bundles/${id}`, { method: "DELETE" });
}

interface BundleItemDraft {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
}

function BundleForm({
  initial,
  products,
  onSave,
  onCancel,
  loading,
}: {
  initial?: any;
  products: any[];
  onSave: (data: any) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [priceOverride, setPriceOverride] = useState(initial?.priceOverride?.toString() ?? "");
  const [items, setItems] = useState<BundleItemDraft[]>(
    initial?.items?.map((i: any) => {
      const prod = products.find((p) => p.id === i.productId);
      return { ...i, unitPrice: prod?.sellingPrice ?? 0 };
    }) ?? [],
  );
  const [productSearch, setProductSearch] = useState("");
  const [showProductPicker, setShowProductPicker] = useState(false);

  const filteredProducts = productSearch.trim()
    ? products.filter(
        (p) =>
          p.canonicalName.toLowerCase().includes(productSearch.toLowerCase()) ||
          (p.sku ?? "").toLowerCase().includes(productSearch.toLowerCase()),
      ).slice(0, 20)
    : [];

  const addItem = (product: any) => {
    if (items.find((i) => i.productId === product.id)) {
      toast.info("Already in bundle");
      return;
    }
    setItems((prev) => [
      ...prev,
      { productId: product.id, productName: product.canonicalName, qty: 1, unitPrice: product.sellingPrice ?? 0 },
    ]);
    setProductSearch("");
    setShowProductPicker(false);
  };

  const removeItem = (productId: string) => setItems((prev) => prev.filter((i) => i.productId !== productId));
  const updateQty = (productId: string, qty: number) =>
    setItems((prev) => prev.map((i) => (i.productId === productId ? { ...i, qty: Math.max(0.1, qty) } : i)));

  const naturalTotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const bundlePrice = priceOverride ? parseFloat(priceOverride) : naturalTotal;

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto">
      <div className="space-y-1.5">
        <Label>Bundle Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Starter Kit, Herbicide Pack…" />
      </div>

      <div className="space-y-1.5">
        <Label>Description (optional)</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description…" rows={2} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Bundle Items *</Label>
          <button
            type="button"
            onClick={() => setShowProductPicker((v) => !v)}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> Add product
          </button>
        </div>

        {showProductPicker && (
          <div className="bg-muted/40 border border-border rounded-xl p-3 mb-3 space-y-2">
            <Input
              autoFocus
              placeholder="Search products…"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {filteredProducts.length === 0 && productSearch.trim() && (
                <p className="text-xs text-muted-foreground text-center py-2">No products found</p>
              )}
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addItem(p)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-primary/10 hover:text-primary transition-colors text-left"
                >
                  <span className="text-xs font-medium truncate">{p.canonicalName}</span>
                  <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{formatKES(p.sellingPrice ?? 0)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-xl">
              No items yet — add at least one product
            </p>
          )}
          {items.map((item) => (
            <div key={item.productId} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{item.productName}</p>
                <p className="text-[10px] text-muted-foreground">{formatKES(item.unitPrice)} each</p>
              </div>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={item.qty}
                onChange={(e) => updateQty(item.productId, parseFloat(e.target.value) || 1)}
                className="w-14 h-7 text-center text-xs bg-muted border border-border rounded-lg font-mono"
              />
              <button type="button" onClick={() => removeItem(item.productId)} className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {items.length > 0 && (
        <div className="bg-muted/40 rounded-xl px-3 py-2 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Natural total</span>
            <span className="font-mono font-semibold">{formatKES(naturalTotal)}</span>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Bundle price (leave blank to use natural total)</Label>
            <Input
              type="number"
              placeholder={`Default: ${formatKES(naturalTotal)}`}
              value={priceOverride}
              onChange={(e) => setPriceOverride(e.target.value)}
              className="h-8 text-sm font-mono"
            />
          </div>
          {priceOverride && bundlePrice < naturalTotal && (
            <p className="text-[10px] text-primary">
              Saving {formatKES(naturalTotal - bundlePrice)} per bundle
            </p>
          )}
        </div>
      )}

      <DialogFooter className="gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button
          onClick={() =>
            onSave({
              name,
              description: description || undefined,
              priceOverride: priceOverride ? parseFloat(priceOverride) : undefined,
              items: items.map(({ productId, productName, qty }) => ({ productId, productName, qty })),
            })
          }
          disabled={!name.trim() || items.length === 0 || loading}
          className="bg-primary text-primary-foreground"
        >
          {loading ? "Saving…" : initial ? "Save Changes" : "Create Bundle"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function BundleCard({
  bundle,
  products,
  onEdit,
  onDelete,
}: {
  bundle: any;
  products: any[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const naturalTotal = bundle.items.reduce((s: number, i: any) => {
    const prod = products.find((p) => p.id === i.productId);
    return s + i.qty * (prod?.sellingPrice ?? 0);
  }, 0);
  const displayPrice = bundle.priceOverride ?? naturalTotal;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
          <Layers className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-sm text-foreground">{bundle.name}</p>
            {!bundle.isActive && (
              <Badge className="text-[9px] bg-muted text-muted-foreground border-border">Inactive</Badge>
            )}
          </div>
          {bundle.description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{bundle.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1">
            <span className="text-base font-black font-mono text-primary">{formatKES(displayPrice)}</span>
            {bundle.priceOverride && bundle.priceOverride < naturalTotal && (
              <span className="text-[10px] text-emerald-400">Save {formatKES(naturalTotal - displayPrice)}</span>
            )}
            <span className="text-[10px] text-muted-foreground">{bundle.items.length} item{bundle.items.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isOwner() && (
            <>
              <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <button onClick={() => setExpanded((v) => !v)} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-1.5">
          {bundle.items.map((item: any) => {
            const prod = products.find((p) => p.id === item.productId);
            return (
              <div key={item.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    ×{item.qty}
                  </span>
                  <span className="text-xs text-foreground">{item.productName}</span>
                </div>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {formatKES((prod?.sellingPrice ?? 0) * item.qty)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Bundles() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editingBundle, setEditingBundle] = useState<any | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: bundleList = [], isLoading } = useQuery({
    queryKey: ["bundles"],
    queryFn: fetchBundles,
    staleTime: 30_000,
  });

  const { data: products = [] } = useListProducts(
    { shopId: shopId(), limit: 3000 },
    { query: { staleTime: 60_000 } },
  );

  const addMut = useMutation({
    mutationFn: (data: any) => createBundle({ ...data, shopId: shopId() }),
    onSuccess: () => { toast.success("Bundle created"); setAdding(false); qc.invalidateQueries({ queryKey: ["bundles"] }); },
    onError: () => toast.error("Failed to create bundle"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateBundle(id, data),
    onSuccess: () => { toast.success("Bundle updated"); setEditingBundle(null); qc.invalidateQueries({ queryKey: ["bundles"] }); },
    onError: () => toast.error("Failed to update bundle"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteBundle(id),
    onSuccess: () => { toast.success("Bundle deleted"); setDeletingId(null); qc.invalidateQueries({ queryKey: ["bundles"] }); },
    onError: () => toast.error("Failed to delete bundle"),
  });

  const deletingBundle = bundleList.find((b: any) => b.id === deletingId);

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 pt-4 pb-3 space-y-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black font-display leading-tight">Product Bundles</h1>
            <p className="text-xs text-muted-foreground">{bundleList.length} bundle{bundleList.length !== 1 ? "s" : ""} · Add to cart in one tap</p>
          </div>
          {isOwner() && (
            <Button size="sm" className="h-9 gap-1.5 bg-primary text-primary-foreground" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> New
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : bundleList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center mt-8">
            <Layers className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-semibold text-muted-foreground">No bundles yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
              Create pre-set product combos so you can add them to the POS cart in one tap
            </p>
          </div>
        ) : (
          bundleList.map((bundle: any) => (
            <BundleCard
              key={bundle.id}
              bundle={bundle}
              products={products as any[]}
              onEdit={() => setEditingBundle(bundle)}
              onDelete={() => setDeletingId(bundle.id)}
            />
          ))
        )}
      </div>

      {/* Add dialog */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Bundle</DialogTitle></DialogHeader>
          <BundleForm
            products={products as any[]}
            onSave={(data) => addMut.mutate(data)}
            onCancel={() => setAdding(false)}
            loading={addMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingBundle} onOpenChange={(v) => !v && setEditingBundle(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Bundle</DialogTitle></DialogHeader>
          {editingBundle && (
            <BundleForm
              initial={editingBundle}
              products={products as any[]}
              onSave={(data) => updateMut.mutate({ id: editingBundle.id, data })}
              onCancel={() => setEditingBundle(null)}
              loading={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deletingId} onOpenChange={(v) => !v && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Bundle?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Remove <span className="font-bold text-foreground">{deletingBundle?.name}</span>? This cannot be undone.
          </p>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMut.mutate(deletingId!)} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
