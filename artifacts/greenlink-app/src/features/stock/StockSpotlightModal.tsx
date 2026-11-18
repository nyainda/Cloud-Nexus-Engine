import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatQty } from "@/lib/format";
import { Search, PackageX, ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getCategoryStyle } from "@/lib/product-utils";
import { RestockDialog } from "./RestockDialog";
import { EditProductDialog } from "./EditProductDialog";
import { TransferDialog } from "./StockTransferAndCleanupDialogs";

export function StockSpotlightModal({
  onOpenChange,
  search,
  onSearchChange,
  searchResults,
  isOwner,
  shopId,
  onRefresh,
  onSelectDetail,
  onFilterTable,
}: {
  onOpenChange: (open: boolean) => void;
  search: string;
  onSearchChange: (value: string) => void;
  searchResults: any[];
  isOwner: boolean;
  shopId: string;
  onRefresh: () => void;
  onSelectDetail: (productId: string) => void;
  onFilterTable: (canonicalName: string) => void;
}) {
  return (
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
            onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Escape") onOpenChange(false);
              if (e.key === "Enter" && searchResults.length === 1) {
                onSearchChange(searchResults[0].canonicalName);
                onOpenChange(false);
              }
            }}
          />
          {search && (
            <Button type="button" variant="ghost" size="icon" aria-label="Clear product search" onClick={() => onSearchChange("")} className="h-10 w-10 shrink-0">
              <X className="h-4 w-4" />
            </Button>
          )}
          <Button type="button" variant="outline" className="h-10 shrink-0 rounded-xl px-3 font-semibold sm:h-11 sm:px-4" onClick={() => onOpenChange(false)}>
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
                    <button
                      type="button"
                      onClick={() => onSelectDetail(p.id)}
                      className="flex min-w-0 flex-1 items-center gap-3.5 text-left cursor-pointer"
                    >
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
                    </button>
                    <div className="flex w-full flex-wrap items-center gap-2 border-t border-border/60 pt-3 [&>button]:min-h-10 [&>button]:rounded-xl sm:w-auto sm:justify-end sm:border-0 sm:pt-0">
                      <RestockDialog product={p} />
                      {isOwner && (
                        <>
                          <TransferDialog product={p} shopId={shopId} onSuccess={onRefresh} />
                          <EditProductDialog product={p} onSuccess={onRefresh} />
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-10 rounded-xl px-3"
                        onClick={() => onFilterTable(p.canonicalName)}
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
  );
}
