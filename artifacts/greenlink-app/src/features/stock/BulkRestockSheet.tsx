import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  getListProductsQueryKey,
  getListInventoryMovementsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatQty } from "@/lib/format";
import { Search, PackageX, Zap, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { isWeighedUnit, getCategoryStyle } from "@/lib/product-utils";

export interface RestockEntry {
  productId: string;
  qty: string;
}

export function BulkRestockSheet({
  products: allProds,
  shopId,
  onDone,
}: {
  products: any[];
  shopId: string;
  onDone: () => void;
}) {
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
      <Button
        size="sm"
        variant="outline"
        className={cn(
          "h-8 text-xs px-3 gap-1.5 relative",
          draftRestored
            ? "border-amber-500/60 text-amber-400 hover:bg-amber-500/10"
            : "border-primary/40 text-primary hover:bg-primary/10"
        )}
        onClick={() => setOpen(true)}
      >
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
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  className={cn(
                    "shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                    catFilter === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                  )}
                >
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
                {filtered.map((p) => {
                  const qty = entries[p.id] ?? "";
                  const addQty = Number(qty);
                  const newTotal = addQty !== 0 ? p.stockQty + addQty : null;
                  const isSaved = savedIds.has(p.id);
                  const isLow = p.stockQty > 0 && p.stockQty <= p.alertQty;
                  const isOut = p.stockQty === 0;
                  const cat = getCategoryStyle(p.category);

                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "grid grid-cols-[1fr_80px_80px_72px] gap-2 items-center px-4 py-2.5 transition-colors",
                        isSaved ? "bg-emerald-500/5" : qty && addQty !== 0 ? (addQty < 0 ? "bg-orange-500/[0.03]" : "bg-primary/[0.03]") : "hover:bg-muted/30"
                      )}
                    >
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
                          <span className="text-sm font-bold font-mono text-primary tabular-nums">{formatQty(newTotal)}</span>
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
