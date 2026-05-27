import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboard, useGetReportRange, useGetTopProducts,
  useGetCategoryBreakdown, useGetHourlySales,
  useListProducts,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatKES } from "@/lib/format";
import {
  TrendingUp, ShoppingBag, CreditCard, AlertTriangle,
  Package, TrendingDown, Percent, BarChart2, Trophy, Flame,
  Layers, Clock, ArrowUp, ArrowDown, Minus, Database,
} from "lucide-react";
import { format, startOfWeek, startOfMonth, subDays } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/utils";

type QuickRange = "today" | "week" | "month";

const QUICK_RANGES: { value: QuickRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

function getDateRange(range: QuickRange): { from: string; to: string } {
  const today = new Date();
  const to = format(today, "yyyy-MM-dd");
  if (range === "today") return { from: to, to };
  if (range === "week") return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), to };
  return { from: format(startOfMonth(today), "yyyy-MM-dd"), to };
}

function getPrevDateRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from + "T12:00:00");
  const t = new Date(to + "T12:00:00");
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const prevTo = subDays(f, 1);
  const prevFrom = subDays(prevTo, days - 1);
  return { from: format(prevFrom, "yyyy-MM-dd"), to: format(prevTo, "yyyy-MM-dd") };
}

const STALE = 60_000;
const GC = 5 * 60_000;

const CATEGORY_COLORS = [
  "#C8FF00", "#22c55e", "#3b82f6", "#f59e0b", "#ec4899",
  "#8b5cf6", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

function KpiCard({ label, value, sub, icon: Icon, accentClass, isLoading, changePct }: {
  label: string; value?: string; sub?: string; icon: React.ElementType;
  accentClass: string; isLoading?: boolean; changePct?: number | null;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className={cn("w-8 h-8 rounded-lg border flex items-center justify-center", accentClass)}>
            <Icon className="h-4 w-4" />
          </div>
          {changePct != null && (
            <span className={cn(
              "flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              changePct > 0 ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
              : changePct < 0 ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
            )}>
              {changePct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : changePct < 0 ? <ArrowDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
              {Math.abs(changePct).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
        {isLoading
          ? <Skeleton className="h-7 w-24 mt-1" />
          : <p className="text-xl font-bold font-mono text-foreground">{value ?? "—"}</p>}
        {isLoading
          ? <Skeleton className="h-3 w-16 mt-2" />
          : sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function Reports() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  const [quickRange, setQuickRange] = useState<QuickRange>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const dateRange = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getDateRange(quickRange);

  const isToday = dateRange.from === today && dateRange.to === today;

  const prevRange = useMemo(() => getPrevDateRange(dateRange.from, dateRange.to), [dateRange.from, dateRange.to]);

  const { data: dashboard, isLoading: dashLoading } = useGetDashboard(
    { shopId, date: today },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC } }
  );

  const { data: reportRange, isLoading: rangeLoading } = useGetReportRange(
    { shopId, from: dateRange.from, to: dateRange.to },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC } }
  );

  const { data: prevReport } = useGetReportRange(
    { shopId, from: prevRange.from, to: prevRange.to },
    { query: { enabled: !!shopId, staleTime: STALE * 10, gcTime: GC } }
  );

  const { data: topProducts, isLoading: topLoading } = useGetTopProducts(
    { shopId, from: dateRange.from, to: dateRange.to, limit: 10 },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC } }
  );

  const { data: categoryData, isLoading: catLoading } = useGetCategoryBreakdown(
    { shopId, from: dateRange.from, to: dateRange.to },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC } }
  );

  const { data: hourlyData } = useGetHourlySales(
    { shopId, date: today },
    { query: { enabled: !!shopId && isToday, staleTime: STALE, gcTime: GC } }
  );

  const { data: productsData } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC } }
  );

  const lowMarginProducts = useMemo(() => {
    const all = productsData?.products ?? [];
    return all
      .filter(p => {
        const buy = p.purchasePrice ?? 0;
        const sell = p.sellingPrice ?? 0;
        return sell > 0 && buy > 0;
      })
      .map(p => {
        const margin = ((p.sellingPrice! - p.purchasePrice!) / p.sellingPrice!) * 100;
        return { ...p, margin };
      })
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 10);
  }, [productsData]);

  const inventoryValue = useMemo(() => {
    return (productsData?.products ?? []).reduce(
      (s, p) => s + (p.stockQty ?? 0) * (p.purchasePrice ?? 0), 0
    );
  }, [productsData]);

  const activeProductCount = useMemo(
    () => (productsData?.products ?? []).filter(p => p.isActive && (p.stockQty ?? 0) > 0).length,
    [productsData]
  );

  const stats = reportRange ?? dashboard;
  const statsLoading = !stats && (rangeLoading || dashLoading);
  const revenue = stats?.totalRevenue ?? 0;
  const profit = stats?.totalProfit ?? 0;
  const salesCount = stats?.salesCount ?? 0;
  const profitPct = revenue > 0 ? (profit / revenue * 100) : 0;
  const avgTxValue = salesCount > 0 ? revenue / salesCount : 0;
  const debtSales = (reportRange as any)?.debtSales ?? dashboard?.debtSales ?? 0;
  const debtRatio = revenue > 0 ? (debtSales / revenue * 100) : 0;
  const cashCollected = (reportRange as any)?.cashCollected ?? (dashboard as any)?.cashCollectedToday ?? 0;

  const revChangePct = prevReport?.totalRevenue && prevReport.totalRevenue > 0
    ? ((revenue - prevReport.totalRevenue) / prevReport.totalRevenue) * 100 : null;
  const profitChangePct = prevReport?.totalProfit && prevReport.totalProfit > 0
    ? ((profit - prevReport.totalProfit) / prevReport.totalProfit) * 100 : null;

  const hourlyChartData = useMemo(() => {
    if (!hourlyData) return [];
    return (hourlyData as any[]).filter(h => h.hour >= 6 && h.hour <= 21).map(h => ({
      ...h,
      label: h.hour < 12 ? `${h.hour}am` : h.hour === 12 ? "12pm" : `${h.hour - 12}pm`,
    }));
  }, [hourlyData]);

  const peakHour = useMemo(() => {
    if (!hourlyData) return null;
    return (hourlyData as any[]).reduce((best, h) => h.salesCount > (best?.salesCount ?? 0) ? h : best, null as any);
  }, [hourlyData]);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Analytics</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
          </div>
          <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 text-[10px]">
            Live
          </Badge>
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {QUICK_RANGES.map(r => (
            <button
              key={r.value}
              onClick={() => { setQuickRange(r.value); setUseCustom(false); }}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                !useCustom && quickRange === r.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {r.label}
            </button>
          ))}
          <button
            onClick={() => setUseCustom(true)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
              useCustom ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            Custom
          </button>
        </div>

        {useCustom && (
          <div className="flex items-center gap-2">
            <input type="date" className="h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring flex-1" value={customFrom} onChange={e => setCustomFrom(e.target.value)} max={today} />
            <span className="text-sm text-muted-foreground shrink-0">→</span>
            <input type="date" className="h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring flex-1" value={customTo} onChange={e => setCustomTo(e.target.value)} max={today} />
          </div>
        )}
      </div>

      <div className="p-4 space-y-4 pb-8">

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="Revenue"
            value={formatKES(revenue)}
            sub={`${salesCount} transaction${salesCount !== 1 ? "s" : ""}`}
            icon={TrendingUp}
            accentClass="border-primary/30 bg-primary/5 text-primary"
            isLoading={statsLoading}
            changePct={revChangePct}
          />
          <KpiCard
            label="Gross Profit"
            value={formatKES(profit)}
            sub={`${profitPct.toFixed(1)}% margin`}
            icon={BarChart2}
            accentClass="border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400"
            isLoading={statsLoading}
            changePct={profitChangePct}
          />
          <KpiCard
            label="Avg Sale"
            value={formatKES(avgTxValue)}
            sub="per transaction"
            icon={Percent}
            accentClass="border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400"
            isLoading={statsLoading}
          />
          <KpiCard
            label="Cash Collected"
            value={formatKES(cashCollected)}
            sub={debtSales > 0 ? `${formatKES(debtSales)} issued on credit` : "debt payments received"}
            icon={CreditCard}
            accentClass="border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 text-orange-600 dark:text-orange-400"
            isLoading={statsLoading}
          />
        </div>

        {/* Inventory Value — full-width */}
        <Card className="shadow-none">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg border border-violet-300 dark:border-violet-800 bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-400 flex items-center justify-center">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Stock Value</p>
                  {!productsData
                    ? <Skeleton className="h-7 w-28 mt-1" />
                    : <p className="text-xl font-bold font-mono">{formatKES(inventoryValue)}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">{activeProductCount} products with stock</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Capital Tied Up</p>
                <p className="text-xs text-muted-foreground mt-0.5">purchase prices</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Outstanding debts */}
        {dashboard?.pendingDebtsTotal != null && dashboard.pendingDebtsTotal > 0 && (
          <Card className="shadow-none border-destructive/40">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-bold text-destructive">Outstanding Debt</p>
                  <p className="text-xs text-muted-foreground">Pending collection</p>
                </div>
              </div>
              <span className="font-bold font-mono text-destructive">{formatKES(dashboard.pendingDebtsTotal)}</span>
            </CardContent>
          </Card>
        )}

        {/* Inventory health */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="shadow-none border-destructive/40">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wide font-bold text-destructive">Out of Stock</p>
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
              </div>
              {dashLoading
                ? <Skeleton className="h-9 w-12 mt-1" />
                : <p className="text-3xl font-bold text-destructive font-mono">{dashboard?.outOfStockCount ?? 0}</p>}
              <p className="text-xs text-muted-foreground mt-1">need restocking</p>
            </CardContent>
          </Card>
          <Card className="shadow-none border-orange-300 dark:border-orange-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] uppercase tracking-wide font-bold text-orange-600 dark:text-orange-400">Low Stock</p>
                <Package className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
              </div>
              {dashLoading
                ? <Skeleton className="h-9 w-12 mt-1" />
                : <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 font-mono">{dashboard?.lowStockCount ?? 0}</p>}
              <p className="text-xs text-muted-foreground mt-1">below alert threshold</p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue + Profit Chart */}
        <Card className="shadow-none">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold">Revenue & Profit Trend</CardTitle>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />Revenue</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Profit</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {rangeLoading ? (
              <div className="h-52 flex items-center justify-center">
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            ) : !reportRange?.dailyBreakdown || reportRange.dailyBreakdown.length <= 1 ? (
              <div className="h-52 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart2 className="h-8 w-8 mx-auto opacity-20 mb-2" />
                  <p className="text-xs">Not enough data to draw a trend</p>
                  <p className="text-xs opacity-60">Select a wider date range</p>
                </div>
              </div>
            ) : (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={reportRange.dailyBreakdown} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#84cc16" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#84cc16" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={v => { try { return format(new Date(v + "T00:00:00"), "MMM d"); } catch { return v; } }}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatKES(v), name === "revenue" ? "Revenue" : "Profit"]}
                      labelFormatter={l => { try { return format(new Date(l + "T00:00:00"), "EEEE, MMM d yyyy"); } catch { return l; } }}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--card-foreground))" }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#84cc16" strokeWidth={2} fill="url(#revGrad)" activeDot={{ r: 4, fill: "#84cc16", strokeWidth: 0 }} isAnimationActive={false} />
                    <Area type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2} fill="url(#profGrad)" activeDot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hourly Activity — today only */}
        {isToday && (
          <Card className="shadow-none">
            <CardHeader className="pb-2 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-blue-500" />
                  Hourly Activity
                </CardTitle>
                {peakHour && peakHour.salesCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Peak: <span className="font-semibold text-foreground">{peakHour.hour < 12 ? `${peakHour.hour}am` : peakHour.hour === 12 ? "12pm" : `${peakHour.hour - 12}pm`}</span>
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              {!hourlyData ? (
                <Skeleton className="h-32 w-full rounded-xl mx-2" />
              ) : hourlyChartData.every(h => h.salesCount === 0) ? (
                <div className="h-32 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Clock className="h-6 w-6 mx-auto opacity-20 mb-2" />
                    <p className="text-xs">No sales recorded today yet</p>
                  </div>
                </div>
              ) : (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyChartData} margin={{ top: 4, right: 8, left: -28, bottom: 0 }} barSize={12}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip
                        formatter={(v: number) => [v, "Sales"]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px", color: "hsl(var(--card-foreground))" }}
                      />
                      <Bar dataKey="salesCount" radius={[3, 3, 0, 0]}>
                        {hourlyChartData.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={entry.hour === peakHour?.hour ? "#C8FF00" : "hsl(var(--muted))"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Top Selling Products */}
        <Card className="shadow-none">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-500" />
              Top Selling Products
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {dateRange.from === dateRange.to ? "Today" : `${dateRange.from} – ${dateRange.to}`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topLoading ? (
              <div className="px-4 pb-4 space-y-3 pt-1">
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
              <div className="divide-y divide-border">
                {topProducts.map((p, i) => {
                  const maxRevenue = topProducts[0]?.totalRevenue || 1;
                  const pct = Math.max(6, (p.totalRevenue / maxRevenue) * 100);
                  return (
                    <div key={p.productId} className="flex items-center gap-3 px-4 py-3">
                      <span className={cn(
                        "w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0",
                        i === 0 ? "border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400" :
                        i === 1 ? "border-slate-300 dark:border-slate-700 text-slate-500" :
                        i === 2 ? "border-orange-300 dark:border-orange-800 text-orange-600 dark:text-orange-400" :
                        "border-border text-muted-foreground"
                      )}>#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.productName}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[90px]">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{p.totalQtySold} sold</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-sm font-mono">{formatKES(p.totalRevenue)}</p>
                        {p.totalProfit != null && p.totalProfit > 0 && (
                          <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">+{formatKES(p.totalProfit)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card className="shadow-none">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-1.5">
              <Layers className="h-4 w-4 text-violet-500" />
              Category Breakdown
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {dateRange.from === dateRange.to ? "Today" : `${dateRange.from} – ${dateRange.to}`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {catLoading ? (
              <div className="px-4 pb-4 pt-1 space-y-3">
                {[1,2,3,4].map(i => (
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
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <Layers className="h-7 w-7 opacity-20" />
                <p className="text-xs">No category data for this period</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(categoryData as any[]).map((cat, i) => {
                  const maxRev = (categoryData as any[])[0]?.totalRevenue || 1;
                  const pct = Math.max(4, (cat.totalRevenue / maxRev) * 100);
                  const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
                  const totalRev = (categoryData as any[]).reduce((s, c) => s + c.totalRevenue, 0);
                  const share = totalRev > 0 ? (cat.totalRevenue / totalRev * 100) : 0;
                  return (
                    <div key={cat.category} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold truncate">{cat.category}</p>
                          <span className="text-xs text-muted-foreground ml-2 shrink-0">{share.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="font-bold text-sm font-mono">{formatKES(cat.totalRevenue)}</p>
                        {cat.totalProfit > 0 && (
                          <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">+{formatKES(cat.totalProfit)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low Margin Alert */}
        {lowMarginProducts.length > 0 && (
          <Card className="shadow-none">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-orange-500" />
                Low Margin Alert
                <span className="text-xs font-normal text-muted-foreground ml-1">Bottom 10 by profit margin</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {lowMarginProducts.map((p, i) => {
                  const marginColor =
                    p.margin < 5 ? "text-destructive" :
                    p.margin < 15 ? "text-orange-500" :
                    "text-amber-500";
                  const bgColor =
                    p.margin < 5 ? "bg-destructive/10" :
                    p.margin < 15 ? "bg-orange-500/10" :
                    "bg-amber-500/10";
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={cn(
                        "w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0",
                        p.margin < 5 ? "border-destructive/40 text-destructive" :
                        p.margin < 15 ? "border-orange-400/40 text-orange-500" :
                        "border-amber-400/40 text-amber-500"
                      )}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.canonicalName}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground font-mono">
                          <span>Buy {formatKES(p.purchasePrice ?? 0)}</span>
                          <span>→</span>
                          <span>Sell {formatKES(p.sellingPrice ?? 0)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn("text-sm font-bold font-mono px-2 py-0.5 rounded-lg", bgColor, marginColor)}>
                          {p.margin.toFixed(1)}%
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-1">margin</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
