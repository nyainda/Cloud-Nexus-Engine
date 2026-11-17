import { useState, useMemo } from "react";
import {
  useDeleteProduct,
  getListProductsQueryKey,
  getListInventoryMovementsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { formatQty, roundQty } from "@/lib/format";
import { Plus, Minus, Trash2, ArrowLeftRight, Truck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isWeighedUnit } from "@/lib/product-utils";

export function TransferDialog({
  product,
  shopId,
  trigger,
}: {
  product: any;
  shopId: string;
  onSuccess?: () => void;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number>(1);
  const [notes, setNotes] = useState("");
  const [isPending, setIsPending] = useState(false);
  const weighed = product.productType === "measured" || isWeighedUnit(product.unit || "");
  const targetShopId = shopId === "shop-greenlink" ? "shop-sunrise" : "shop-greenlink";
  const targetLabel = targetShopId === "shop-greenlink" ? "GreenLink" : "Sunrise Agrovet";

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
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            aria-label="Transfer stock"
            title="Transfer stock"
            className="h-8 rounded-lg border-sky-500/25 bg-sky-500/[0.07] px-2.5 text-xs font-medium text-sky-700 hover:border-sky-500/45 hover:bg-sky-500/15 dark:text-sky-300 transition-colors focus-visible:ring-2 focus-visible:ring-sky-500/25 cursor-pointer"
          >
            <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /><span>Transfer</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1.5rem)] sm:max-w-sm rounded-3xl border border-border/80 p-0 gap-0 overflow-hidden">
        <DialogHeader className="border-b border-border/70 bg-muted/25 px-5 py-4 pr-11 text-left">
          <DialogTitle className="font-display text-base font-bold">Transfer to {targetLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-5">
          <div className="border border-border/80 bg-muted/20 rounded-2xl p-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Product</p>
            <p className="font-semibold text-sm mt-0.5">{product.canonicalName}</p>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">Available: {formatQty(product.stockQty)} {product.unit || "units"}</p>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Qty to Transfer</Label>
            <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 rounded-2xl border border-border/80 bg-muted/35 p-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-10 w-[44px] shrink-0 rounded-xl bg-background"
                disabled={isPending}
                onClick={() => setQty(q => roundQty(Math.max(weighed ? 0.25 : 1, q - (weighed && q <= 1 ? 0.25 : 1))))}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Input
                type="number"
                size={4}
                step={weighed ? "0.25" : "1"}
                min={weighed ? "0.25" : "1"}
                max={product.stockQty}
                value={qty}
                disabled={isPending}
                onChange={e => setQty(weighed ? parseFloat(e.target.value) || 0.25 : Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="h-10 w-full min-w-0 text-center font-bold font-mono bg-background border-border/70 rounded-xl [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <Button
                type="button"
                size="icon"
                className="h-10 w-[44px] shrink-0 rounded-xl"
                disabled={isPending}
                onClick={() => setQty(q => roundQty(Math.min(product.stockQty, q + (weighed && q < 1 ? 0.25 : 1))))}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Notes (optional)</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Weekly restock" disabled={isPending} className="rounded-xl" />
          </div>
        </div>
        <DialogFooter className="border-t border-border/70 bg-muted/15 px-5 py-3.5">
          <Button variant="outline" className="rounded-xl cursor-pointer" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
          <Button className="rounded-xl font-bold cursor-pointer" onClick={handleTransfer} disabled={isPending || qty <= 0 || qty > product.stockQty}>
            {isPending ? "Transferring…" : `Transfer ${formatQty(qty)} ${product.unit || "units"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProductButton({
  productId,
  productName,
  onSuccess: _onSuccess,
  onDeleted,
  trigger,
}: {
  productId: string;
  productName: string;
  onSuccess: () => void;
  onDeleted?: () => void;
  trigger?: React.ReactNode;
}) {
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
    onDeleted?.();
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
        {trigger ?? (
          <Button
            size="sm"
            variant="outline"
            aria-label={`Delete ${productName}`}
            title="Delete product"
            className="h-8 w-8 p-0 rounded-lg text-destructive border-destructive/30 bg-destructive/5 hover:bg-destructive/15 transition-colors cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Product?</AlertDialogTitle>
          <AlertDialogDescription>
            Remove <span className="font-semibold">&quot;{productName}&quot;</span> from inventory. Sales history is preserved.
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
export function CleanupDialog({ products: allProds, shopId: _shopId }: { products: any[]; shopId: string }) {
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

export function TransferHistory({ shopId, isOwner }: { shopId: string; isOwner: boolean }) {
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
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-xl border",
              isSent ? "bg-orange-500/[0.04] border-orange-500/20" : "bg-emerald-500/[0.04] border-emerald-500/20"
            )}
          >
            <div
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
                isSent ? "bg-orange-500/15 text-orange-400" : "bg-emerald-500/15 text-emerald-400"
              )}
            >
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
                      This will restore <span className="font-semibold">{t.qty} {t.unit || "units"}</span> of <span className="font-semibold">&quot;{t.productName}&quot;</span> back to this shop and deduct from {otherShopLabel}. Only possible if {otherShopLabel} still has sufficient stock.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        cancelTransfer.mutate(t.id, {
                          onSuccess: () => {
                            toast.success("Transfer cancelled & stock restored");
                            refetch();
                            qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
                            qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
                          },
                        });
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
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
