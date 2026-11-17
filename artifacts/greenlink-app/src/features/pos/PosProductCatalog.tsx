import type React from "react";
import { formatKES, formatQty } from "@/lib/format";
import { Search, Plus, Minus, PackageX, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { isWeighedUnit, getCategoryTone } from "@/lib/product-utils";
import type { CartItem, StockFilter } from "./pos-types";

export function PosProductCatalog({
  isLoading,
  showDesktopDrawer,
  filteredProducts,
  visibleProducts,
  visibleLimit,
  onLoadMore,
  search,
  debouncedSearch,
  selectedCategory,
  stockFilter,
  onResetFilters,
  viewMode,
  cart,
  onOpenQuickAdd,
  onUpdateQty,
  onInstantAdd,
}: {
  isLoading: boolean;
  showDesktopDrawer: boolean;
  filteredProducts: any[];
  visibleProducts: any[];
  visibleLimit: number;
  onLoadMore: () => void;
  search: string;
  debouncedSearch: string;
  selectedCategory: string;
  stockFilter: StockFilter;
  onResetFilters: () => void;
  viewMode: "cards" | "table";
  cart: CartItem[];
  onOpenQuickAdd: (product: any) => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onInstantAdd: (e: React.MouseEvent, product: any) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto p-3.5 md:p-5">
      {isLoading ? (
        <div
          className={cn(
            "grid gap-3",
            showDesktopDrawer
              ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4"
              : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
          )}
        >
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
              onClick={onResetFilters}
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
                onClick={onLoadMore}
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
                      onClick={() => !isOut && onOpenQuickAdd(product)}
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
                              onClick={() => onUpdateQty(product.id, -step)}
                              className="h-7 w-7 flex items-center justify-center hover:bg-black/15 cursor-pointer"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="px-1.5 text-[11px] font-mono font-bold">{formatQty(inCart.qty)}</span>
                            <button
                              type="button"
                              onClick={() => onUpdateQty(product.id, step)}
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
                            onClick={(e) => onInstantAdd(e, product)}
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
            <div
              className={cn(
                "grid gap-3 transition-all",
                showDesktopDrawer
                  ? "grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4"
                  : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
              )}
            >
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
                    onClick={() => !isOut && onOpenQuickAdd(product)}
                    onKeyDown={e => {
                      if (!isOut && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onOpenQuickAdd(product);
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
                            onClick={() => onUpdateQty(product.id, -step)}
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
                            onClick={() => onUpdateQty(product.id, step)}
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
                          onClick={(e) => onInstantAdd(e, product)}
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
                  onClick={onLoadMore}
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
  );
}
