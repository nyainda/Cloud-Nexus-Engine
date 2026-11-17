import type React from "react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatKES } from "@/lib/format";
import { X, Share2, Check, Search, SearchX } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  getPsDateRange,
  fmtQty,
  type ProductSearchResult,
  type PsQuickRange,
  type ProductSearchRequest,
} from "./report-utils";

export function ProductSearchSection({ shopId }: { shopId: string }) {
  const [inputValue, setInputValue] = useState("");
  const [psRange, setPsRange] = useState<PsQuickRange>("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState<ProductSearchRequest | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const dateRange = psRange === "custom"
    ? customFrom && customTo && customFrom <= customTo && customTo <= today
      ? { from: customFrom, to: customTo }
      : null
    : getPsDateRange(psRange);
  const searchText = inputValue.trim();
  const canSubmitSearch = !!shopId && searchText.length >= 2 && dateRange !== null;
  const query = submittedSearch?.query ?? "";
  const resultsCurrent = !!submittedSearch
    && searchText === submittedSearch.query
    && dateRange?.from === submittedSearch.from
    && dateRange?.to === submittedSearch.to;

  const { data, isLoading, isFetching, isError, isStale, refetch } = useQuery<ProductSearchResult>({
    queryKey: [
      "product-search",
      shopId,
      submittedSearch?.query ?? "",
      submittedSearch?.from ?? "",
      submittedSearch?.to ?? "",
    ],
    queryFn: () => {
      const request = submittedSearch!;
      return customFetch(
        `/api/reports/product-search?shopId=${encodeURIComponent(shopId)}&q=${encodeURIComponent(request.query)}&from=${request.from}&to=${request.to}`,
      ) as Promise<ProductSearchResult>;
    },
    enabled: !!shopId && !!submittedSearch,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmitSearch || !dateRange) return;
    const nextSearch = {
      query: searchText,
      from: dateRange.from,
      to: dateRange.to,
      range: psRange,
    };
    const sameQuery = submittedSearch?.query === nextSearch.query
      && submittedSearch.from === nextSearch.from
      && submittedSearch.to === nextSearch.to;
    setSubmittedSearch(nextSearch);
    if (sameQuery && isStale) void refetch();
  };

  const variants = resultsCurrent ? data?.variants ?? [] : [];
  const summary = resultsCurrent ? data?.summary ?? null : null;
  const noResults = resultsCurrent && !isLoading && !isFetching && !!data && variants.length === 0;
  const showTotal = variants.length > 1 && summary !== null;
  const periodLabel = submittedSearch?.range === "custom"
    ? `${submittedSearch.from} – ${submittedSearch.to}`
    : submittedSearch?.range === "this_month" ? "This Month"
    : submittedSearch?.range === "last_month" ? "Last Month"
    : submittedSearch?.range === "last_3_months" ? "Last 3 Months"
    : "This Year";

  const handleShare = async () => {
    if (!summary || variants.length === 0) return;
    const shopName = localStorage.getItem("greenlink_shopName") ?? "Shop";
    const lines = [
      `📦 *${query.toUpperCase()} — Sales Report*`,
      `🏪 ${shopName}`,
      `📅 ${periodLabel}`,
      ``,
      ...variants.map(v =>
        `• ${v.productName}\n  Qty: ${fmtQty(v.totalQty)} | Revenue: ${formatKES(v.totalRevenue)} | Est. cost: ${formatKES(v.totalRevenue - v.totalProfit)} | Profit: ${formatKES(v.totalProfit)}`
      ),
    ];
    if (variants.length > 1) {
      lines.push(
        ``,
        `*TOTAL (${variants.length} variants)*`,
        `Qty: ${fmtQty(summary.totalQty)}`,
        `Revenue: ${formatKES(summary.totalRevenue)}`,
        `Estimated cost (revenue minus recorded profit): ${formatKES(summary.totalRevenue - summary.totalProfit)}`,
        `Profit: ${formatKES(summary.totalProfit)}`,
      );
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setShareCopied(false);
    }
  };

  const QUICK: { label: string; value: PsQuickRange }[] = [
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
    { label: "Last 3 Months", value: "last_3_months" },
    { label: "This Year", value: "this_year" },
    { label: "Custom", value: "custom" },
  ];

  return (
    <Card className="reports-search-card rounded-2xl border-border/80 bg-card/95 shadow-none">
      <CardHeader className="pb-3 pt-4 px-4 sm:px-5 border-b border-border/60">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0 mt-0.5">
              <Search className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="font-display text-sm sm:text-base font-bold tracking-normal">
                Product Sales Lookup
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Search any product or pack size. Variants stay separate, with a combined supplier-reconciliation total.
              </p>
            </div>
          </div>
          {resultsCurrent && variants.length > 0 && (
            <button
              type="button"
              onClick={handleShare}
              aria-label="Copy product sales report"
              className="reports-search-share shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-primary/12 border border-primary/25 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1.5"
            >
              {shareCopied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
              {shareCopied ? "Copied" : "Copy report"}
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5 reports-search-body">
        {/* Period pills */}
        <div className="flex flex-wrap gap-1.5 reports-search-periods" role="group" aria-label="Product sales period">
          {QUICK.map(q => (
            <button
              key={q.value}
              type="button"
              onClick={() => setPsRange(q.value)}
              aria-pressed={psRange === q.value}
              className={cn(
                "reports-search-range px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors",
                psRange === q.value
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:border-primary/40",
              )}
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Custom date range inputs */}
        {psRange === "custom" && (
          <div className="flex items-center gap-2 reports-search-date-range">
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              aria-label="Product lookup start date"
              max={customTo || today}
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-background/70 text-xs focus:outline-none focus:border-primary"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              aria-label="Product lookup end date"
              min={customFrom || undefined}
              max={today}
              className="flex-1 h-9 px-3 rounded-lg border border-border bg-background/70 text-xs focus:outline-none focus:border-primary"
            />
          </div>
        )}

        <form className="reports-search-form" onSubmit={handleSearch}>
          <div className="reports-search-input-wrap relative min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="Product name or size, e.g. Urea 50kg or Roundup 1L"
              aria-label="Search product sales by name or pack size"
              className="reports-search-input w-full h-11 pl-10 pr-10 rounded-xl border border-border bg-background/70 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
            />
            {inputValue && (
              <button
                type="button"
                aria-label="Clear product search"
                onClick={() => { setInputValue(""); setSubmittedSearch(null); setShareCopied(false); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!canSubmitSearch || (resultsCurrent && (isLoading || isFetching))}
            className="reports-search-submit h-11 px-5 rounded-xl bg-primary text-primary-foreground font-bold text-sm inline-flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
        </form>

        {psRange === "custom" && !dateRange && (
          <p role="alert" className="reports-search-validation text-xs text-destructive">
            Choose both dates. The end date must be on or after the start date, and neither date can be in the future.
          </p>
        )}
        <p className="reports-search-query-note text-[11px] text-muted-foreground">
          Searches run only after you press Search. Typing and changing filters do not send lookup requests.
        </p>

        {/* Loading */}
        {resultsCurrent && (isLoading || isFetching) && (
          <div className="space-y-2" role="status" aria-live="polite">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            <span className="sr-only">Searching product sales…</span>
          </div>
        )}

        {resultsCurrent && isError && !isFetching && (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-3 py-3 flex items-center justify-between gap-3" role="alert">
            <p className="text-xs text-muted-foreground">Unable to load this lookup. Check your connection, then try again.</p>
            <button
              type="button"
              onClick={() => { void refetch(); }}
              className="shrink-0 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {submittedSearch && !resultsCurrent && (
          <div className="reports-search-pending rounded-xl border border-border bg-muted/30 px-3.5 py-2.5" role="status">
            <p className="text-xs font-semibold text-foreground">Search settings changed</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Press Search to apply the new product name or period. No lookup runs automatically.</p>
          </div>
        )}

        {/* No results */}
        {noResults && (
          <div className="flex flex-col items-center gap-1.5 py-8 text-muted-foreground" role="status">
            <SearchX className="h-8 w-8 text-muted-foreground/25" />
            <p className="text-xs font-semibold">No sales found for &ldquo;{query}&rdquo;</p>
            <p className="text-[11px] text-muted-foreground/60">Try a shorter name or a wider date range</p>
          </div>
        )}

        {/* Results */}
        {resultsCurrent && !isLoading && !isFetching && variants.length > 0 && (
          <>
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">
              Results for &ldquo;{query}&rdquo; · {periodLabel}
            </p>

            {/* ── MOBILE: card per variant ── */}
            <div className="sm:hidden space-y-2.5">
              {variants.map(v => {
                const cost = v.totalRevenue - v.totalProfit;
                const margin = v.totalRevenue > 0 ? (v.totalProfit / v.totalRevenue) * 100 : 0;
                return (
                  <div key={v.productId} className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold leading-snug">{v.productName}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{v.category} · {v.salesCount} {v.salesCount === 1 ? "sale line" : "sale lines"}</p>
                      </div>
                      <span className={cn(
                        "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums",
                        margin >= 20 ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                          : margin >= 10 ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                          : "bg-destructive/12 text-destructive"
                      )}>{margin.toFixed(0)}% margin</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Qty Sold</p>
                        <p className="text-sm font-bold font-mono tabular-nums mt-0.5">{fmtQty(v.totalQty)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Revenue</p>
                        <p className="text-sm font-bold font-mono tabular-nums mt-0.5">{formatKES(v.totalRevenue)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Est. cost</p>
                        <p className="text-sm font-bold font-mono tabular-nums mt-0.5 text-muted-foreground">{formatKES(cost)}</p>
                      </div>
                      <div className={cn("rounded-lg px-2.5 py-2", v.totalProfit >= 0 ? "bg-emerald-500/10" : "bg-destructive/10")}>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Profit</p>
                        <p className={cn("text-sm font-bold font-mono tabular-nums mt-0.5", v.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{formatKES(v.totalProfit)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}

              {showTotal && summary && (() => {
                const totalCost = summary.totalRevenue - summary.totalProfit;
                const totalMargin = summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;
                return (
                  <div className="rounded-xl border border-primary/35 bg-primary/8 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-wider text-primary">Combined Total</p>
                        <p className="text-[11px] text-muted-foreground">{variants.length} variants · {summary.salesCount} matching sale lines</p>
                      </div>
                      <span className={cn(
                        "shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums",
                        totalMargin >= 20 ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                          : totalMargin >= 10 ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                          : "bg-destructive/12 text-destructive"
                      )}>{totalMargin.toFixed(0)}% margin</span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-lg bg-primary/10 px-2.5 py-2">
                        <p className="text-[10px] text-primary/80 uppercase tracking-wide font-semibold">Total Qty</p>
                        <p className="text-sm font-extrabold font-mono tabular-nums mt-0.5 text-primary">{fmtQty(summary.totalQty)}</p>
                      </div>
                      <div className="rounded-lg bg-primary/10 px-2.5 py-2">
                        <p className="text-[10px] text-primary/80 uppercase tracking-wide font-semibold">Revenue</p>
                        <p className="text-sm font-extrabold font-mono tabular-nums mt-0.5 text-primary">{formatKES(summary.totalRevenue)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Est. cost</p>
                        <p className="text-sm font-extrabold font-mono tabular-nums mt-0.5 text-muted-foreground">{formatKES(totalCost)}</p>
                      </div>
                      <div className="rounded-lg bg-emerald-500/10 px-2.5 py-2">
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-wide font-semibold">Profit</p>
                        <p className={cn("text-sm font-extrabold font-mono tabular-nums mt-0.5", summary.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>{formatKES(summary.totalProfit)}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── TABLET / DESKTOP: full table ── */}
            <div className="hidden sm:block rounded-xl border border-border/80 overflow-x-auto bg-card/60">
              <div className="reports-variant-table min-w-[660px] grid grid-cols-[minmax(180px,1fr)_56px_100px_100px_100px_48px] gap-x-3 px-4 py-2.5 bg-muted/40 border-b border-border/70 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                <span>Product / Variant</span>
                <span className="text-right">Qty</span>
                <span className="text-right">Revenue</span>
                <span className="text-right">Est. cost</span>
                <span className="text-right">Profit</span>
                <span className="text-right">Lines</span>
              </div>

              {variants.map(v => {
                const cost = v.totalRevenue - v.totalProfit;
                const margin = v.totalRevenue > 0 ? (v.totalProfit / v.totalRevenue) * 100 : 0;
                return (
                  <div
                    key={v.productId}
                    className="reports-variant-table min-w-[660px] grid grid-cols-[minmax(180px,1fr)_56px_100px_100px_100px_48px] gap-x-3 px-4 py-3 border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-tight truncate">{v.productName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[11px] text-muted-foreground">{v.category}</span>
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums",
                          margin >= 20 ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                            : margin >= 10 ? "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                            : "bg-destructive/12 text-destructive"
                        )}>{margin.toFixed(0)}%</span>
                      </div>
                    </div>
                    <span className="text-sm font-mono font-semibold text-right self-center tabular-nums">{fmtQty(v.totalQty)}</span>
                    <span className="text-sm font-mono text-right self-center tabular-nums">{formatKES(v.totalRevenue)}</span>
                    <span className="text-sm font-mono text-right self-center tabular-nums text-muted-foreground">{formatKES(cost)}</span>
                    <span className={cn("text-sm font-mono text-right self-center tabular-nums", v.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                      {formatKES(v.totalProfit)}
                    </span>
                    <span className="text-sm text-right self-center text-muted-foreground tabular-nums">{v.salesCount}</span>
                  </div>
                );
              })}

              {showTotal && summary && (() => {
                const totalCost = summary.totalRevenue - summary.totalProfit;
                const totalMargin = summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue) * 100 : 0;
                return (
                  <div className="reports-variant-table min-w-[660px] grid grid-cols-[minmax(180px,1fr)_56px_100px_100px_100px_48px] gap-x-3 px-4 py-3 bg-primary/8 border-t border-primary/25">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-wider text-primary leading-tight">Combined Total</p>
                      <p className="text-[11px] text-muted-foreground">{variants.length} variants · {summary.salesCount} matching sale lines · {totalMargin.toFixed(0)}% margin</p>
                    </div>
                    <span className="text-sm font-extrabold font-mono text-right self-center tabular-nums text-primary">{fmtQty(summary.totalQty)}</span>
                    <span className="text-sm font-extrabold font-mono text-right self-center tabular-nums text-primary">{formatKES(summary.totalRevenue)}</span>
                    <span className="text-sm font-extrabold font-mono text-right self-center tabular-nums text-muted-foreground">{formatKES(totalCost)}</span>
                    <span className={cn("text-sm font-extrabold font-mono text-right self-center tabular-nums", summary.totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                      {formatKES(summary.totalProfit)}
                    </span>
                    <span className="text-sm font-extrabold text-right self-center text-primary tabular-nums">{summary.salesCount}</span>
                  </div>
                );
              })()}
            </div>

            <p className="reports-search-cost-note text-[11px] text-muted-foreground">
              Estimated cost is revenue minus recorded profit; use it for reconciliation, not as a supplier balance due.
            </p>
            {showTotal && summary && (
              <p className="text-[11px] text-muted-foreground">
                Combined total includes all {variants.length} matching product variants for this period.
              </p>
            )}
          </>
        )}

        {/* Empty prompt */}
        {!submittedSearch && (
          <div className="flex flex-col items-center gap-1 py-6 text-muted-foreground/70 rounded-xl border border-dashed border-border/70 bg-muted/15">
            <Search className="h-5 w-5 opacity-50" />
            <p className="text-xs font-medium">{searchText.length < 2 ? "Enter at least two letters, then press Search." : "Press Search to load this product’s sales."}</p>
            <p className="text-[11px] text-muted-foreground/60">Variants appear individually, then roll up into one combined total.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
