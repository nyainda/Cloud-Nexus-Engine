import { useState, useMemo, useEffect } from "react";
import {
  useListProducts,
  getListProductsQueryKey,
  getListInventoryMovementsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { StockProductCardDialog } from "@/components/StockProductCardDialog";
import { formatKES, formatQty } from "@/lib/format";
import {
  Search, Plus, Package, Edit2, AlertTriangle, ArrowUpRight,
  PackageX, TrendingUp, Scale,
  Calendar, Trash2, ArrowLeftRight, Zap, X, ArrowUpDown, Square, CheckSquare2
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { getCategoryStyle } from "@/lib/product-utils";
import { RestockDialog } from "@/features/stock/RestockDialog";
import { EditProductDialog } from "@/features/stock/EditProductDialog";
import { AddProductDialog } from "@/features/stock/AddProductDialog";
import {
  TransferDialog,
  DeleteProductButton,
  CleanupDialog,
  TransferHistory,
} from "@/features/stock/StockTransferAndCleanupDialogs";
import { BulkRestockSheet } from "@/features/stock/BulkRestockSheet";
import { StockSpotlightModal } from "@/features/stock/StockSpotlightModal";


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
  const [detailProductId, setDetailProductId] = useState<string | null>(null);

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
  const detailProduct = useMemo(
    () => (detailProductId ? allProducts.find((p: any) => p.id === detailProductId) ?? null : null),
    [detailProductId, allProducts]
  );

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
                        <StockSpotlightModal
                          onOpenChange={setSearchOpen}
                          search={search}
                          onSearchChange={setSearch}
                          searchResults={searchResults}
                          isOwner={isOwner}
                          shopId={shopId}
                          onRefresh={refresh}
                          onSelectDetail={(id) => { setSearchOpen(false); setDetailProductId(id); }}
                          onFilterTable={(name) => {
                            setSearch(name);
                            setSearchOpen(false);
                            setView("all");
                            setCategoryFilter("all");
                          }}
                        />
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
                                  onClick={() => setDetailProductId(p.id)}
                                  className={cn(
                                    "cursor-pointer transition-colors hover:bg-muted/35",
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
                                          onClick={e => e.stopPropagation()}
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

                                  <td
                                    onClick={e => e.stopPropagation()}
                                    className="w-px py-3 pl-3 pr-4 align-middle text-right whitespace-nowrap"
                                  >
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
                            <div
                              key={p.id}
                              onClick={() => setDetailProductId(p.id)}
                              className={cn("p-4 cursor-pointer transition-colors hover:bg-muted/25", isOut && "bg-destructive/[0.03]", isLow && "bg-amber-500/[0.03]")}
                            >
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
                                        onClick={e => e.stopPropagation()}
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

                                  <div onClick={e => e.stopPropagation()} className="mt-3 flex flex-wrap gap-1.5">
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

      <StockProductCardDialog
        product={detailProduct}
        open={!!detailProduct}
        onOpenChange={(o) => { if (!o) setDetailProductId(null); }}
        isOwner={isOwner}
        categoryStyle={getCategoryStyle(detailProduct?.category)}
        actions={
          detailProduct ? (
            <>
              <RestockDialog
                product={detailProduct}
                trigger={
                  <Button size="sm" className="flex-1 min-w-[110px] h-10 rounded-xl font-bold cursor-pointer">
                    <ArrowUpRight className="mr-1.5 h-4 w-4" />
                    Restock
                  </Button>
                }
              />
              {isOwner && (
                <>
                  <EditProductDialog
                    product={detailProduct}
                    onSuccess={refresh}
                    trigger={
                      <Button size="sm" variant="outline" className="flex-1 min-w-[96px] h-10 rounded-xl font-semibold bg-background cursor-pointer">
                        <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                    }
                  />
                  <TransferDialog
                    product={detailProduct}
                    shopId={shopId}
                    onSuccess={refresh}
                    trigger={
                      <Button size="sm" variant="outline" className="flex-1 min-w-[100px] h-10 rounded-xl font-semibold border-sky-500/30 bg-sky-500/[0.08] text-sky-700 hover:bg-sky-500/15 dark:text-sky-300 cursor-pointer">
                        <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" />
                        Transfer
                      </Button>
                    }
                  />
                  <DeleteProductButton
                    productId={detailProduct.id}
                    productName={detailProduct.canonicalName}
                    onSuccess={refresh}
                    onDeleted={() => setDetailProductId(null)}
                    trigger={
                      <Button
                        size="sm"
                        variant="outline"
                        aria-label={`Delete ${detailProduct.canonicalName}`}
                        title="Delete product"
                        className="h-10 w-10 p-0 rounded-xl text-destructive border-destructive/30 bg-destructive/5 hover:bg-destructive/15 shrink-0 cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    }
                  />
                </>
              )}
            </>
          ) : null
        }
      />
    </div>
  );
}
