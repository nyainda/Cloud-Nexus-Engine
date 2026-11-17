import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/format";
import { ChevronDown } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import type { MonthlySalesResponse } from "./report-utils";

export function MonthlyRevenueCard({
  monthlySalesYear,
  onYearChange,
  prevMonthlySalesYear,
  comparePrevYear,
  onToggleCompare,
  monthlyMetric,
  onMetricChange,
  currentYear,
  monthlySales,
  prevMonthlySales,
  monthlySalesLoading,
  monthlySalesError,
  onRetryMonthlySales,
  monthlySalesChartData,
}: {
  monthlySalesYear: number;
  onYearChange: (year: number) => void;
  prevMonthlySalesYear: number;
  comparePrevYear: boolean;
  onToggleCompare: () => void;
  monthlyMetric: "revenue" | "profit" | "salesCount";
  onMetricChange: (metric: "revenue" | "profit" | "salesCount") => void;
  currentYear: number;
  monthlySales: MonthlySalesResponse | undefined;
  prevMonthlySales: MonthlySalesResponse | undefined;
  monthlySalesLoading: boolean;
  monthlySalesError: unknown;
  onRetryMonthlySales: () => void;
  monthlySalesChartData: Array<{
    month: number;
    monthLabel: string;
    revenue: number;
    profit: number;
    salesCount: number;
    prevRevenue: number;
    prevProfit: number;
    prevSalesCount: number;
  }>;
}) {
  return (
    <Card className="reports-monthly rounded-2xl border-border/80 bg-card/95 shadow-none overflow-hidden">
      <CardHeader className="pb-3 pt-4 px-4 sm:px-5 border-b border-border/60">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="font-display text-base sm:text-lg font-bold tracking-normal">Monthly Revenue</CardTitle>
              <Badge variant="outline" className="text-[10px] font-bold border-primary/30 bg-primary/10 text-primary">
                {monthlySalesYear} {comparePrevYear && prevMonthlySalesYear >= 2000 ? `vs ${prevMonthlySalesYear}` : ""}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              12-month trajectory comparing {monthlySalesYear} against {prevMonthlySalesYear} performance
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-muted/45 p-1">
              {([
                { id: "revenue", label: "Revenue" },
                { id: "profit", label: "Profit" },
                { id: "salesCount", label: "Orders" },
              ] as { id: "revenue" | "profit" | "salesCount"; label: string }[]).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onMetricChange(m.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
                    monthlyMetric === m.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onToggleCompare}
              className={cn(
                "px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-colors",
                comparePrevYear
                  ? "border-sky-500/35 bg-sky-500/10 text-sky-600 dark:text-sky-300"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
              )}
            >
              vs {prevMonthlySalesYear}
            </button>

            <label className="reports-year-select">
              <span className="sr-only">Choose year</span>
              <select
                aria-label="Year for monthly sales"
                value={monthlySalesYear}
                onChange={event => onYearChange(Number(event.target.value))}
              >
                {Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index).map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 pointer-events-none text-muted-foreground" />
            </label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 sm:p-5 space-y-4">
        {monthlySalesLoading ? (
          <Skeleton className="h-[310px] w-full rounded-xl" />
        ) : monthlySalesError ? (
          <div className="reports-monthly-error flex items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs" role="alert">
            <span className="text-destructive">Monthly sales could not be loaded.</span>
            <Button variant="outline" size="sm" onClick={onRetryMonthlySales}>Try again</Button>
          </div>
        ) : monthlySales ? (() => {
          const currKey = monthlyMetric;
          const prevKey = monthlyMetric === "revenue" ? "prevRevenue" : monthlyMetric === "profit" ? "prevProfit" : "prevSalesCount";
          const metricColor = monthlyMetric === "profit" ? "#10b981" : monthlyMetric === "salesCount" ? "#38bdf8" : "hsl(var(--primary))";
          const activeMonths = monthlySalesChartData.filter((m: any) => m.revenue > 0 || m.salesCount > 0);
          const bestMonth = monthlySalesChartData.reduce((b: any, m: any) => (m[currKey] > (b?.[currKey] ?? -1) ? m : b), monthlySalesChartData[0]);

          const revDelta = prevMonthlySales && prevMonthlySales.totalRevenue > 0
            ? ((monthlySales.totalRevenue - prevMonthlySales.totalRevenue) / prevMonthlySales.totalRevenue) * 100
            : null;
          const profitDelta = prevMonthlySales && prevMonthlySales.totalProfit > 0
            ? ((monthlySales.totalProfit - prevMonthlySales.totalProfit) / prevMonthlySales.totalProfit) * 100
            : null;
          const txDelta = prevMonthlySales && prevMonthlySales.totalSalesCount > 0
            ? ((monthlySales.totalSalesCount - prevMonthlySales.totalSalesCount) / prevMonthlySales.totalSalesCount) * 100
            : null;
          const yearMargin = monthlySales.totalRevenue > 0
            ? (monthlySales.totalProfit / monthlySales.totalRevenue) * 100
            : 0;

          return (
            <>
              {/* Legend row */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    <span className="h-2.5 w-2.5 rounded-sm inline-block" style={{ background: metricColor }} />
                    {monthlySalesYear} {monthlyMetric === "revenue" ? "Revenue" : monthlyMetric === "profit" ? "Gross Profit" : "Transactions"}
                  </span>
                  {comparePrevYear && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/35 inline-block" />
                      {prevMonthlySalesYear} Comparison
                    </span>
                  )}
                </div>
                <span className="tabular-nums">
                  {activeMonths.length} active month{activeMonths.length !== 1 ? "s" : ""} recorded
                </span>
              </div>

              <div className="h-[300px] sm:h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlySalesChartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }} barGap={4}>
                    <defs>
                      <linearGradient id="monthlyMainBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={metricColor} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={metricColor} stopOpacity={0.45} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                    <XAxis
                      dataKey="monthLabel"
                      interval={0}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      width={54}
                      tickFormatter={value => {
                        if (monthlyMetric === "salesCount") return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
                        if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
                        if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                        return String(value);
                      }}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as any;
                        if (!row) return null;
                        const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
                        const yoy = row.prevRevenue > 0 ? ((row.revenue - row.prevRevenue) / row.prevRevenue) * 100 : null;
                        return (
                          <div className="rounded-xl border border-border bg-card/95 backdrop-blur-md p-3 shadow-xl text-xs space-y-1.5 min-w-[205px]">
                            <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-1.5">
                              <span className="font-bold text-foreground">{row.monthLabel} {monthlySalesYear}</span>
                              {yoy !== null && (
                                <span className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                                  yoy >= 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-destructive/15 text-destructive"
                                )}>
                                  {yoy >= 0 ? "+" : ""}{yoy.toFixed(1)}% YoY
                                </span>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">Revenue</span>
                              <span className="font-mono font-bold text-primary tabular-nums">{formatKES(row.revenue)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">Profit ({margin.toFixed(0)}%)</span>
                              <span className="font-mono font-semibold text-emerald-500 tabular-nums">{formatKES(row.profit)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-muted-foreground">Transactions</span>
                              <span className="font-mono font-semibold text-foreground tabular-nums">{row.salesCount.toLocaleString()}</span>
                            </div>
                            {comparePrevYear && (
                              <div className="border-t border-border/60 pt-1.5 mt-1 space-y-1 text-[11px] text-muted-foreground">
                                <div className="flex items-center justify-between gap-4">
                                  <span>{row.monthLabel} {prevMonthlySalesYear} Rev</span>
                                  <span className="font-mono tabular-nums">{formatKES(row.prevRevenue)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                  <span>{row.monthLabel} {prevMonthlySalesYear} Orders</span>
                                  <span className="font-mono tabular-nums">{row.prevSalesCount.toLocaleString()}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {comparePrevYear && (
                      <Bar
                        dataKey={prevKey}
                        name={`${prevMonthlySalesYear}`}
                        fill="hsl(var(--muted-foreground) / 0.28)"
                        radius={[5, 5, 0, 0]}
                        maxBarSize={20}
                        isAnimationActive={false}
                      />
                    )}
                    <Bar
                      dataKey={currKey}
                      name={`${monthlySalesYear}`}
                      fill="url(#monthlyMainBarGrad)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={comparePrevYear ? 24 : 34}
                      isAnimationActive={false}
                    >
                      {monthlySalesChartData.map((month: any) => {
                        const isCurrentMonth = month.month === new Date().getMonth() + 1 && monthlySalesYear === currentYear;
                        return (
                          <Cell
                            key={month.month}
                            fill={isCurrentMonth ? metricColor : "url(#monthlyMainBarGrad)"}
                          />
                        );
                      })}
                    </Bar>
                    {comparePrevYear && (
                      <Line
                        type="monotone"
                        dataKey={currKey}
                        stroke={metricColor}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: metricColor, strokeWidth: 0 }}
                        activeDot={{ r: 4 }}
                        isAnimationActive={false}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {monthlySales.totalSalesCount === 0 ? (
                <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No sales recorded in {monthlySalesYear}.
                </p>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div className="rounded-xl border border-primary/25 bg-primary/8 p-3.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Year Revenue</span>
                      {revDelta !== null && (
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums",
                          revDelta >= 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-destructive/15 text-destructive"
                        )}>
                          {revDelta >= 0 ? "+" : ""}{revDelta.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="font-display text-lg sm:text-xl font-bold tabular-nums text-foreground mt-1">
                      {formatKES(monthlySales.totalRevenue)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                      {prevMonthlySales ? `vs ${prevMonthlySalesYear}: ${formatKES(prevMonthlySales.totalRevenue)}` : `${monthlySalesYear} cumulative`}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/75 bg-muted/25 p-3.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gross Profit</span>
                      {profitDelta !== null && (
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums",
                          profitDelta >= 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-destructive/15 text-destructive"
                        )}>
                          {profitDelta >= 0 ? "+" : ""}{profitDelta.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="font-display text-lg sm:text-xl font-bold tabular-nums text-emerald-500 mt-1">
                      {formatKES(monthlySales.totalProfit)}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                      {yearMargin.toFixed(1)}% margin{prevMonthlySales ? ` · prev ${formatKES(prevMonthlySales.totalProfit)}` : ""}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/75 bg-muted/25 p-3.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Transactions</span>
                      {txDelta !== null && (
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums",
                          txDelta >= 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-destructive/15 text-destructive"
                        )}>
                          {txDelta >= 0 ? "+" : ""}{txDelta.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="font-display text-lg sm:text-xl font-bold tabular-nums text-foreground mt-1">
                      {monthlySales.totalSalesCount.toLocaleString()}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                      {prevMonthlySales ? `vs ${prevMonthlySalesYear}: ${prevMonthlySales.totalSalesCount.toLocaleString()} orders` : "Completed sales"}
                    </p>
                  </div>

                  <div className="rounded-xl border border-border/75 bg-muted/25 p-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Peak & Average</span>
                    <p className="font-display text-lg sm:text-xl font-bold tabular-nums text-foreground mt-1 truncate">
                      {bestMonth ? `${bestMonth.monthLabel} · ${bestMonth[currKey] && monthlyMetric !== "salesCount" ? formatKES(bestMonth[currKey]) : `${bestMonth.salesCount}`}` : "—"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums truncate">
                      Avg {activeMonths.length > 0 ? formatKES(monthlySales.totalRevenue / activeMonths.length) : "—"}/active mo
                    </p>
                  </div>
                </div>
              )}
            </>
          );
        })() : null}
      </CardContent>
    </Card>
  );
}
