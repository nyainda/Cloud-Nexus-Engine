import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/format";
import { toTitleCase } from "@/components/customer-autocomplete";
import type { computeNurseryProjection, NurserySettlementMetrics } from "@/lib/nursery-settlement";
import { X, Search, Sprout, ArrowUpRight, History, Zap } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import type {
  NurserySalesBucket,
  NurserySalesResponse,
  NurserySalesRow,
  NurseryReportResponse,
  NurseryVarietyReportRow,
  NurseryEntriesResponse,
  NurseryEntryRow,
} from "./report-utils";

export function NurseryAnalyticsCard({
  shopName,
  currentYear,
  nurseryScope,
  onNurseryScopeChange,
  nurseryView,
  onNurseryViewChange,
  nurseryDateRange,
  nurseryBucket,
  nurserySales,
  nurserySalesLoading,
  nurserySalesError,
  onRetryNurserySales,
  nurserySalesTotals,
  nurserySalesChartData,
  nurserySettlementMetrics,
  nurserySettlementProjection,
  nurserySearch,
  onNurserySearchChange,
  nurseryVarietiesLoading,
  nurseryVarietyReport,
  nurseryVarietiesError,
  onRetryNurseryVarieties,
  filteredNurseryVarieties,
  nurseryEntriesLoading,
  nurseryEntriesReport,
  nurseryEntriesError,
  onRetryNurseryEntries,
  filteredNurseryEntries,
  nurseryEntriesLimit,
  onLoadMoreEntries,
  onOpenSettlement,
}: {
  shopName: string;
  currentYear: number;
  nurseryScope: "period" | "year" | "all";
  onNurseryScopeChange: (scope: "period" | "year" | "all") => void;
  nurseryView: "chart" | "varieties" | "entries";
  onNurseryViewChange: (view: "chart" | "varieties" | "entries") => void;
  nurseryDateRange: { from: string; to: string };
  nurseryBucket: NurserySalesBucket;
  nurserySales: NurserySalesResponse | undefined;
  nurserySalesLoading: boolean;
  nurserySalesError: boolean;
  onRetryNurserySales: () => void;
  nurserySalesTotals: {
    seedlingsSold: number;
    totalRevenueCents: number;
    cashCents: number;
    mpesaCents: number;
    creditCents: number;
  };
  nurserySalesChartData: Array<NurserySalesRow & { revenue: number; label: string }>;
  nurserySettlementMetrics: NurserySettlementMetrics | undefined;
  nurserySettlementProjection: ReturnType<typeof computeNurseryProjection> | null;
  nurserySearch: string;
  onNurserySearchChange: (value: string) => void;
  nurseryVarietiesLoading: boolean;
  nurseryVarietyReport: NurseryReportResponse | undefined;
  nurseryVarietiesError: boolean;
  onRetryNurseryVarieties: () => void;
  filteredNurseryVarieties: NurseryVarietyReportRow[];
  nurseryEntriesLoading: boolean;
  nurseryEntriesReport: NurseryEntriesResponse | undefined;
  nurseryEntriesError: boolean;
  onRetryNurseryEntries: () => void;
  filteredNurseryEntries: NurseryEntryRow[];
  nurseryEntriesLimit: number;
  onLoadMoreEntries: () => void;
  onOpenSettlement: (tab: "settle" | "history") => void;
}) {
  return (
    <Card className="reports-nursery rounded-2xl border-border/80 bg-card/95 shadow-none" data-testid="card-nursery-analytics">
      <CardHeader className="flex-row items-start justify-between gap-3 pb-3 pt-4 px-4 sm:px-5 border-b border-border/60 flex-wrap">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 rounded-xl border border-primary/25 bg-primary/10 p-2 text-primary shrink-0">
            <Sprout className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="font-display text-sm sm:text-base font-bold tracking-normal">Nursery plant sales</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {nurseryScope === "all"
                ? `All recorded history (${format(new Date(`${nurseryDateRange.from}T12:00:00`), "d MMM yyyy")} – ${format(new Date(`${nurseryDateRange.to}T12:00:00`), "d MMM yyyy")})`
                : nurseryDateRange.from === nurseryDateRange.to
                ? format(new Date(`${nurseryDateRange.from}T12:00:00`), "d MMM yyyy")
                : `${format(new Date(`${nurseryDateRange.from}T12:00:00`), "d MMM yyyy")} – ${format(new Date(`${nurseryDateRange.to}T12:00:00`), "d MMM yyyy")}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/45 p-1" role="group" aria-label="Nursery period">
            {([
              { id: "period", label: "Page range" },
              { id: "year", label: `This Year (${currentYear})` },
              { id: "all", label: "All Time" },
            ] as { id: "period" | "year" | "all"; label: string }[]).map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => onNurseryScopeChange(s.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                  nurseryScope === s.id
                    ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border border-emerald-500/35"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/45 p-1">
            {([
              { id: "chart", label: nurseryBucket === "month" ? "Monthly chart" : "Daily chart" },
              { id: "varieties", label: "Plants sold" },
              { id: "entries", label: "Sales record" },
            ] as { id: "chart" | "varieties" | "entries"; label: string }[]).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onNurseryViewChange(tab.id)}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                  nurseryView === tab.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onOpenSettlement("settle")}
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/35 bg-emerald-500/12 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors cursor-pointer"
          >
            <Sprout className="h-3 w-3" />
            Settle Debts
          </button>
          <button
            type="button"
            onClick={() => onOpenSettlement("history")}
            className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-muted/35 px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors cursor-pointer"
          >
            <History className="h-3 w-3" />
            Debt Ledger
          </button>
          <Link
            href="/nursery"
            className="inline-flex items-center gap-1 rounded-xl border border-border/80 bg-muted/35 px-2.5 py-1.5 text-[11px] font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors"
          >
            Nursery Register
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {nurserySalesLoading && !nurserySales ? (
          <div className="space-y-3" aria-label="Loading nursery analytics">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
              <Skeleton className="h-20 rounded-xl" />
            </div>
            <Skeleton className="h-52 rounded-xl" />
          </div>
        ) : nurserySalesError && !nurserySales ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-destructive">Nursery sales could not be loaded.</p>
            <Button data-testid="button-retry-nursery-analytics" type="button" size="sm" variant="outline" onClick={onRetryNurserySales}>Try again</Button>
          </div>
        ) : nurserySales ? (
          <>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <div className="min-w-0 rounded-xl border border-primary/25 bg-primary/8 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Plant sales value</p>
                <p data-testid="text-nursery-analytics-revenue" className="mt-1 truncate font-display text-lg sm:text-xl font-bold tabular-nums text-foreground">
                  {formatKES(nurserySalesTotals.totalRevenueCents / 100)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Total across period</p>
              </div>

              <div className="min-w-0 rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Cash received</p>
                <p className="mt-1 truncate font-display text-lg sm:text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatKES(nurserySalesTotals.cashCents / 100)}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums truncate">
                  M-Pesa: {formatKES(nurserySalesTotals.mpesaCents / 100)}
                </p>
              </div>

              <div className="min-w-0 rounded-xl border border-border/70 bg-muted/25 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Plants sold</p>
                <p data-testid="text-nursery-analytics-seedlings" className="mt-1 font-display text-lg sm:text-xl font-bold tabular-nums">
                  {nurserySalesTotals.seedlingsSold.toLocaleString()}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Total seedlings & plants</p>
              </div>

              <div className="min-w-0 rounded-xl border border-border/70 bg-muted/25 p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Received · On credit</p>
                <p data-testid="text-nursery-analytics-payments" className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-sm sm:text-base font-bold font-mono tabular-nums leading-snug">
                  <span>{formatKES((nurserySalesTotals.cashCents + nurserySalesTotals.mpesaCents) / 100)}</span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-amber-600 dark:text-amber-400">{formatKES(nurserySalesTotals.creditCents / 100)}</span>
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">Cash+M-Pesa vs Credit</p>
              </div>
            </div>

            {nurserySettlementMetrics && nurserySettlementProjection && (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Sprout className="h-4 w-4 text-emerald-500 shrink-0" />
                    <p className="text-xs font-bold text-foreground">
                      Plant Money Used for Debts &amp; Remaining Balance ({shopName})
                    </p>
                    {nurserySettlementMetrics.autoSyncConfig?.enabled && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        <Zap className="h-2.5 w-2.5" />
                        Auto-Sync → {toTitleCase(nurserySettlementMetrics.autoSyncConfig.ownerCustomerName)}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenSettlement("history")}
                    className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
                  >
                    View Ledger ({nurserySettlementMetrics.settledPayments.length + nurserySettlementMetrics.payouts.length})
                  </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="rounded-lg border border-border/60 bg-background/75 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Used to Pay Debts</p>
                    <p className="mt-0.5 text-sm font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {formatKES(nurserySettlementMetrics.d1SettledNetTotal)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {nurserySettlementMetrics.settledPayments.length} settlement{nurserySettlementMetrics.settledPayments.length === 1 ? "" : "s"} in D1
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/75 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Shop Profit Kept</p>
                    <p className="mt-0.5 text-sm font-bold font-mono tabular-nums text-foreground">
                      {formatKES(nurserySettlementProjection.totalShopProfit)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {nurserySettlementMetrics.shopConfig.commissionPct}% shop share
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/75 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cash/M-Pesa Paid Out</p>
                    <p className="mt-0.5 text-sm font-bold font-mono tabular-nums text-primary">
                      {formatKES(nurserySettlementMetrics.payoutNetTotal)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {nurserySettlementMetrics.payouts.length} payout{nurserySettlementMetrics.payouts.length === 1 ? "" : "s"} recorded
                    </p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Remaining Balance</p>
                    <p className="mt-0.5 text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatKES(nurserySettlementProjection.availableNetProceeds)}
                    </p>
                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
                      {nurserySettlementMetrics.autoSyncConfig?.enabled && nurserySettlementProjection.availableNetProceeds <= 0.01
                        ? "Auto-synced to account"
                        : `From ${nurserySettlementMetrics.shopConfig.poolMode === "collected" ? "Cash+M-Pesa+Paid Credit" : "All Plant Sales"}`}
                    </p>
                  </div>
                </div>
                {nurserySettlementMetrics.settledPayments.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">Recent cleared:</span>
                    {nurserySettlementMetrics.settledPayments.slice(0, 3).map((entry) => (
                      <span
                        key={`${entry.debtId}-${entry.paymentId}`}
                        className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-0.5 font-mono text-[10px]"
                      >
                        {toTitleCase(entry.customerName)} · #{entry.debtId.slice(0, 6).toUpperCase()} · {formatKES(entry.amount)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {nurseryView === "chart" && (
              nurserySalesChartData.length === 0 ? (
                <p data-testid="text-nursery-analytics-empty" className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No nursery plant sales in this period.</p>
              ) : (
                <div className="h-52 sm:h-60" aria-label={nurseryBucket === "month" ? "Monthly nursery plant sales chart" : "Daily nursery plant sales chart"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={nurserySalesChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        interval={nurserySalesChartData.length > 14 ? "preserveStartEnd" : 0}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        width={48}
                        tickFormatter={value => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : String(value)}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatKES(value), "Plant sales"]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "10px", fontSize: "11px", color: "hsl(var(--card-foreground))" }}
                      />
                      <Bar dataKey="revenue" name="Plant sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )
            )}

            {(nurseryView === "varieties" || nurseryView === "entries") && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={nurserySearch}
                    onChange={e => onNurserySearchChange(e.target.value)}
                    placeholder={nurseryView === "varieties" ? "Filter plant varieties sold…" : "Filter records by plant variety, customer, or supplier…"}
                    className="h-9 w-full rounded-xl border border-border/80 bg-background/70 pl-9 pr-8 text-xs focus:outline-none focus:border-primary"
                  />
                  {nurserySearch && (
                    <button
                      type="button"
                      onClick={() => onNurserySearchChange("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {nurseryView === "varieties" ? (
                  nurseryVarietiesLoading && !nurseryVarietyReport ? (
                    <div className="space-y-2"><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /></div>
                  ) : nurseryVarietiesError ? (
                    <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs">
                      <span className="text-destructive">Could not load plant varieties sold.</span>
                      <Button type="button" size="sm" variant="outline" onClick={onRetryNurseryVarieties}>Retry</Button>
                    </div>
                  ) : filteredNurseryVarieties.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No plant varieties sold match this period.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border/80 bg-background/40 max-h-[380px] overflow-y-auto">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 border-b border-border/70 bg-card/95 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          <tr>
                            <th className="py-2.5 pl-4 pr-3">Plant Variety</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap">Plants Sold</th>
                            <th className="py-2.5 px-3 text-right whitespace-nowrap hidden sm:table-cell">Cash · M-Pesa · Credit</th>
                            <th className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">Revenue</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                          {filteredNurseryVarieties.map((row, idx) => (
                            <tr key={row.varietyKey || row.varietyId || idx} className="hover:bg-muted/25">
                              <td className="py-2.5 pl-4 pr-3 font-semibold text-foreground">{row.varietyName}</td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">{Number(row.quantity || 0).toLocaleString()}</td>
                              <td className="py-2.5 px-3 text-right font-mono text-[11px] text-muted-foreground tabular-nums hidden sm:table-cell whitespace-nowrap">
                                {formatKES(Number(row.cashCents || 0) / 100)} · {formatKES(Number(row.mpesaCents || 0) / 100)} · {formatKES(Number(row.creditCents || 0) / 100)}
                              </td>
                              <td className="py-2.5 pl-3 pr-4 text-right font-mono font-bold text-primary tabular-nums whitespace-nowrap">
                                {formatKES(Number(row.totalAmountCents || 0) / 100)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="sticky bottom-0 border-t border-border bg-card/95 backdrop-blur-sm font-bold">
                          <tr>
                            <td className="py-2.5 pl-4 pr-3 text-foreground">
                              TOTAL ({filteredNurseryVarieties.length} {filteredNurseryVarieties.length === 1 ? "variety" : "varieties"})
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums text-foreground">
                              {filteredNurseryVarieties.reduce((s, r) => s + Number(r.quantity || 0), 0).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-[11px] text-emerald-500 tabular-nums hidden sm:table-cell whitespace-nowrap">
                              Cash {formatKES(filteredNurseryVarieties.reduce((s, r) => s + Number(r.cashCents || 0), 0) / 100)} · M-Pesa {formatKES(filteredNurseryVarieties.reduce((s, r) => s + Number(r.mpesaCents || 0), 0) / 100)} · Credit {formatKES(filteredNurseryVarieties.reduce((s, r) => s + Number(r.creditCents || 0), 0) / 100)}
                            </td>
                            <td className="py-2.5 pl-3 pr-4 text-right font-mono text-primary tabular-nums whitespace-nowrap">
                              {formatKES(filteredNurseryVarieties.reduce((s, r) => s + Number(r.totalAmountCents || 0), 0) / 100)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                ) : (
                  nurseryEntriesLoading && !nurseryEntriesReport ? (
                    <div className="space-y-2"><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-10 rounded-xl" /></div>
                  ) : nurseryEntriesError ? (
                    <div className="flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs">
                      <span className="text-destructive">Could not load nursery sales records.</span>
                      <Button type="button" size="sm" variant="outline" onClick={onRetryNurseryEntries}>Retry</Button>
                    </div>
                  ) : filteredNurseryEntries.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">No individual nursery plant sales recorded in this period.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="overflow-x-auto rounded-xl border border-border/80 bg-background/40 max-h-[380px] overflow-y-auto">
                        <table className="w-full border-collapse text-left text-xs">
                          <thead className="sticky top-0 border-b border-border/70 bg-card/95 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            <tr>
                              <th className="py-2.5 pl-4 pr-3 whitespace-nowrap">Date</th>
                              <th className="py-2.5 px-3">Plant & Source</th>
                              <th className="py-2.5 px-3">Customer</th>
                              <th className="py-2.5 px-3 text-right whitespace-nowrap">Qty</th>
                              <th className="py-2.5 px-3 whitespace-nowrap">Payment</th>
                              <th className="py-2.5 pl-3 pr-4 text-right whitespace-nowrap">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/50">
                            {filteredNurseryEntries.map(entry => (
                              <tr key={entry.id} className="hover:bg-muted/25">
                                <td className="py-2.5 pl-4 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                                  {format(new Date(`${entry.businessDate}T12:00:00`), "d MMM yy")}
                                </td>
                                <td className="py-2.5 px-3">
                                  <p className="font-semibold text-foreground">{entry.varietyName}</p>
                                  {entry.sourceSupplierName && (
                                    <p className="text-[10px] text-muted-foreground">From: {entry.sourceSupplierName}</p>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-muted-foreground">
                                  {entry.customerName || "Walk-in"}
                                  {entry.customerPhone ? <span className="ml-1 font-mono text-[10px]">({entry.customerPhone})</span> : null}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">{entry.quantity}</td>
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                  <span className={cn(
                                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                    entry.paymentMethod === "cash" ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
                                    : entry.paymentMethod === "mpesa" ? "bg-sky-500/12 text-sky-600 dark:text-sky-400"
                                    : "bg-amber-500/12 text-amber-600 dark:text-amber-400"
                                  )}>
                                    {entry.paymentMethod}
                                  </span>
                                </td>
                                <td className="py-2.5 pl-3 pr-4 text-right font-mono font-bold text-foreground tabular-nums whitespace-nowrap">
                                  {formatKES(Number(entry.totalAmountCents || 0) / 100)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
                        <span>
                          Showing {filteredNurseryEntries.length.toLocaleString()} of {(nurseryEntriesReport?.total ?? filteredNurseryEntries.length).toLocaleString()} records
                        </span>
                        {(nurseryEntriesReport?.total ?? 0) > nurseryEntriesLimit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 rounded-lg text-xs"
                            onClick={onLoadMoreEntries}
                          >
                            Load +100 more
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            )}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Sales value includes credit transactions. Cash received shows physical cash collected separately from M-Pesa and credit. Nursery totals can be switched to Full Year or All Time independently above.
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
