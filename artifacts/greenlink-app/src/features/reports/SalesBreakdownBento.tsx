import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatKES } from "@/lib/format";
import { ShoppingBag, Trophy, Layers, Download, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  printCategoryPdf,
  downloadCategoryCsv,
  downloadSingleCategoryCsv,
  printSingleCategoryPdf,
} from "@/lib/report-exports";
import { CATEGORY_COLORS } from "./report-utils";

export function SalesBreakdownBento({
  dateRange,
  shopName,
  topLoading,
  topProducts,
  catLoading,
  categoryData,
  expandedCat,
  onToggleCat,
}: {
  dateRange: { from: string; to: string };
  shopName: string;
  topLoading: boolean;
  topProducts: any[] | undefined;
  catLoading: boolean;
  categoryData: any[] | undefined;
  expandedCat: string | null;
  onToggleCat: (category: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Top Selling Products (5 cols) */}
      <Card className="lg:col-span-5 reports-products rounded-2xl border-border/80 bg-card/95 shadow-none">
        <CardHeader className="pb-2.5 pt-4 px-4 sm:px-5 border-b border-border/60">
          <CardTitle className="font-display text-sm sm:text-base font-bold tracking-normal flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500 shrink-0" />
            Top Selling Products
            <span className="text-xs font-normal text-muted-foreground ml-auto">
              {dateRange.from === dateRange.to ? "Today" : `${dateRange.from} – ${dateRange.to}`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {topLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-7 h-7 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-2 w-1/2" />
                  </div>
                  <Skeleton className="h-5 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : !topProducts || topProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <ShoppingBag className="h-8 w-8 opacity-20" />
              <p className="text-sm font-medium">No sales for this period</p>
              <p className="text-xs opacity-60">Complete a sale on the POS to see data here</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {topProducts.map((p: any, i: number) => {
                const maxRevenue = topProducts[0]?.totalRevenue || 1;
                const pct = Math.max(6, (p.totalRevenue / maxRevenue) * 100);
                return (
                  <div key={p.productId} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                    <span className={cn(
                      "w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 tabular-nums",
                      i === 0 ? "border-amber-500/40 bg-amber-500/12 text-amber-600 dark:text-amber-400" :
                      i === 1 ? "border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300" :
                      i === 2 ? "border-orange-500/40 bg-orange-500/10 text-orange-600 dark:text-orange-400" :
                      "border-border text-muted-foreground"
                    )}>#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.productName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[96px]">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">{p.totalQtySold} sold</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm font-mono tabular-nums">{formatKES(p.totalRevenue)}</p>
                      {p.totalProfit != null && p.totalProfit > 0 && (
                        <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">+{formatKES(p.totalProfit)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Breakdown (7 cols) */}
      <Card className="lg:col-span-7 reports-categories rounded-2xl border-border/80 bg-card/95 shadow-none">
        <CardHeader className="pb-2.5 pt-4 px-4 sm:px-5 border-b border-border/60">
          <div className="flex items-center justify-between w-full gap-2 flex-wrap">
            <CardTitle className="font-display text-sm sm:text-base font-bold tracking-normal flex items-center gap-2">
              <Layers className="h-4 w-4 text-violet-500 shrink-0" />
              Category Breakdown
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {dateRange.from === dateRange.to ? "Today" : `${dateRange.from} – ${dateRange.to}`}
              </span>
            </CardTitle>
            {categoryData && (categoryData as any[]).length > 0 && (() => {
              const cats = categoryData as any[];
              const period = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} to ${dateRange.to}`;
              return (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => printCategoryPdf(cats, period, shopName)}
                    className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors bg-rose-500/10 border border-rose-500/20 rounded-lg px-2.5 py-1.5"
                    title="Open print dialog — choose 'Save as PDF'"
                  >
                    <Download className="h-3 w-3" />
                    PDF
                  </button>
                  <button
                    onClick={() => downloadCategoryCsv(cats, period, shopName)}
                    className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted border border-border rounded-lg px-2.5 py-1.5"
                  >
                    <Download className="h-3 w-3" />
                    CSV
                  </button>
                </div>
              );
            })()}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {catLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-2.5 h-2.5 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-16 shrink-0" />
                </div>
              ))}
            </div>
          ) : !categoryData || categoryData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <Layers className="h-7 w-7 opacity-20" />
              <p className="text-xs">No category data for this period</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {(categoryData as any[]).map((cat: any, i: number) => {
                const maxRev = (categoryData as any[])[0]?.totalRevenue || 1;
                const pct = Math.max(4, (cat.totalRevenue / maxRev) * 100);
                const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                const totalRev = (categoryData as any[]).reduce((s: number, c: any) => s + c.totalRevenue, 0);
                const share = totalRev > 0 ? (cat.totalRevenue / totalRev * 100) : 0;
                const marginPct = cat.totalRevenue > 0 ? (cat.totalProfit / cat.totalRevenue * 100) : 0;
                const isExpanded = expandedCat === cat.category;
                const prods: any[] = cat.products ?? [];
                const catPeriod = dateRange.from === dateRange.to ? dateRange.from : `${dateRange.from} to ${dateRange.to}`;
                return (
                  <div key={cat.category}>
                    <button
                      className="w-full text-left px-4 py-3.5 hover:bg-muted/25 transition-colors"
                      onClick={() => onToggleCat(cat.category)}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold truncate">{cat.category}</p>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-xs font-bold text-muted-foreground tabular-nums">{share.toFixed(0)}%</span>
                              {isExpanded
                                ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              }
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm font-mono tabular-nums">{formatKES(cat.totalRevenue)}</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2 ml-5">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="flex items-center gap-2 ml-5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 font-mono tabular-nums">
                          {Number(cat.salesCount).toFixed(0)} units sold
                        </span>
                        {cat.totalProfit > 0 && (
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5 tabular-nums">
                            +{formatKES(cat.totalProfit)} profit
                          </span>
                        )}
                        {marginPct > 0 && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">{marginPct.toFixed(0)}% margin</span>
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="bg-muted/20 border-t border-border/60">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border/40">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            {prods.length} product{prods.length !== 1 ? "s" : ""} sold
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); printSingleCategoryPdf(cat, catPeriod, shopName); }}
                              className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors bg-rose-500/10 rounded px-2 py-1"
                              title="Download PDF for this category"
                            >
                              <FileText className="h-3 w-3" />
                              PDF
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); downloadSingleCategoryCsv(cat, catPeriod, shopName); }}
                              className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors bg-muted/60 hover:bg-muted rounded px-2 py-1"
                              title="Download CSV for this category"
                            >
                              <Download className="h-3 w-3" />
                              CSV
                            </button>
                          </div>
                        </div>

                        {prods.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground px-4 py-3">No product details available</p>
                        ) : (
                          <div className="divide-y divide-border/40">
                            {prods.map((p: any, pi: number) => {
                              const prodMargin = p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue * 100) : 0;
                              return (
                                <div key={p.productId || pi} className="flex items-center gap-2 px-4 py-2">
                                  <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0 text-right">{pi + 1}.</span>
                                  <p className="text-xs flex-1 min-w-0 truncate font-medium">{p.productName}</p>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] font-mono text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 tabular-nums">
                                      ×{Number(p.qtySold).toFixed(2)}
                                    </span>
                                    <span className="text-[10px] font-mono font-bold tabular-nums">{formatKES(p.totalRevenue)}</span>
                                    {prodMargin > 0 && (
                                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono hidden sm:inline tabular-nums">
                                        {prodMargin.toFixed(0)}%
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {categoryData && (categoryData as any[]).length > 0 && (() => {
            const cats = categoryData as any[];
            const totalRev = cats.reduce((s: number, c: any) => s + c.totalRevenue, 0);
            const totalProfit = cats.reduce((s: number, c: any) => s + c.totalProfit, 0);
            const totalItems = cats.reduce((s: number, c: any) => s + c.salesCount, 0);
            const totalMargin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;
            return (
              <div className="border-t border-border/70 bg-muted/25 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-xs font-bold text-foreground">Total</span>
                  <span className="text-[10px] text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5 font-mono tabular-nums">
                    {totalItems} items sold
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5 font-mono tabular-nums">
                    +{formatKES(totalProfit)} profit
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{totalMargin.toFixed(0)}% avg margin</span>
                </div>
                <span className="font-bold text-sm font-mono tabular-nums">{formatKES(totalRev)}</span>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
