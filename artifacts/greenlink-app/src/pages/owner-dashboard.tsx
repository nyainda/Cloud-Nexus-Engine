import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useGetDashboard,
  getGetDashboardQueryKey,
  useGetReportRange,
  getGetReportRangeQueryKey,
  type DashboardSummary,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/format";
import {
  TrendingUp,
  CreditCard,
  Package,
  AlertTriangle,
  Store,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  ArrowUpRight,
  Banknote,
  Smartphone,
  Wallet,
  RefreshCw,
  ShoppingCart,
  BarChart3,
  Receipt,
  Users,
  CheckCircle2,
  PackageCheck,
} from "lucide-react";
import { format, subDays, addDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type ExtendedDashboardSummary = DashboardSummary & {
  cashOnlySales?: number;
  bankSales?: number;
  cashCollectedToday?: number;
};

function formatCompactKES(val: number) {
  const abs = Math.abs(val);
  if (abs >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(val / 1_000)}k`;
  return String(Math.round(val));
}

function SevenDayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-border bg-card/95 backdrop-blur-md px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 min-w-[165px]">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-1">
        <span className="font-bold text-foreground">{row?.fullDate ?? label}</span>
        <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
          {row?.salesCount ?? 0} sale{row?.salesCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Revenue
        </span>
        <span className="font-bold font-mono tabular-nums text-foreground">
          {formatKES(row?.revenue ?? 0)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-sky-500" />
          Gross Profit
        </span>
        <span className="font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
          {formatKES(row?.profit ?? 0)}
        </span>
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "sky" | "amber" | "rose" | "primary";
  href?: string;
  badge?: string;
}

const TONE_CLASSES: Record<MetricCardProps["tone"], { iconBg: string; iconText: string; badge: string; borderHover: string }> = {
  primary: {
    iconBg: "bg-primary/12",
    iconText: "text-primary",
    badge: "bg-primary/10 text-primary border-primary/20",
    borderHover: "hover:border-primary/40",
  },
  emerald: {
    iconBg: "bg-emerald-500/12",
    iconText: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    borderHover: "hover:border-emerald-500/40",
  },
  sky: {
    iconBg: "bg-sky-500/12",
    iconText: "text-sky-600 dark:text-sky-400",
    badge: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20",
    borderHover: "hover:border-sky-500/40",
  },
  amber: {
    iconBg: "bg-amber-500/12",
    iconText: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
    borderHover: "hover:border-amber-500/40",
  },
  rose: {
    iconBg: "bg-rose-500/12",
    iconText: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    borderHover: "hover:border-rose-500/40",
  },
};

function ExecutiveStatCard({ label, value, sub, icon: Icon, tone, href, badge }: MetricCardProps) {
  const styles = TONE_CLASSES[tone];
  const card = (
    <Card
      className={cn(
        "bg-card text-card-foreground border-border/80 shadow-none transition-[border-color,box-shadow] duration-150 rounded-2xl h-full",
        href && cn("cursor-pointer group", styles.borderHover)
      )}
    >
      <CardContent className="p-3.5 sm:p-4 flex flex-col justify-between h-full gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center shrink-0", styles.iconBg)}>
            <Icon className={cn("h-4 w-4", styles.iconText)} />
          </div>
          {badge ? (
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 tabular-nums whitespace-nowrap", styles.badge)}>
              {badge}
            </span>
          ) : href ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
          ) : null}
        </div>

        <div className="min-w-0 space-y-0.5">
          <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground leading-tight">
            {label}
          </p>
          <p className="text-lg sm:text-xl xl:text-[22px] font-bold font-mono tracking-tight tabular-nums text-card-foreground leading-snug break-words">
            {value}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1 pt-0.5">
            {sub}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  return href ? <Link href={href}>{card}</Link> : card;
}

export default function OwnerDashboard() {
  const todayStr = format(new Date(), "yyyy-MM-dd");
  const yesterdayStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [showDateInput, setShowDateInput] = useState(false);

  const isToday = selectedDate === todayStr;
  const isYesterday = selectedDate === yesterdayStr;
  const dateLabel = isToday
    ? "Today"
    : isYesterday
    ? "Yesterday"
    : format(parseISO(selectedDate), "EEE, d MMM yyyy");
  const shortDateLabel = isToday
    ? "Today"
    : isYesterday
    ? "Yesterday"
    : format(parseISO(selectedDate), "d MMM");

  // Scope this dashboard to the shop selected during authenticated login.
  const shopId = localStorage.getItem("greenlink_shopId") ?? "";
  const shopName = localStorage.getItem("greenlink_shopName") ?? "Current Shop";

  const {
    data: rawData,
    isLoading: dashLoading,
    isFetching: dashFetching,
    refetch: refetchDash,
  } = useGetDashboard(
    { shopId, date: selectedDate },
    {
      query: {
        queryKey: getGetDashboardQueryKey({ shopId, date: selectedDate }),
        enabled: !!shopId,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
      },
    }
  );

  const rangeFrom = format(subDays(parseISO(selectedDate), 6), "yyyy-MM-dd");
  const {
    data: rangeData,
    isLoading: rangeLoading,
    isFetching: rangeFetching,
    refetch: refetchRange,
  } = useGetReportRange(
    { shopId, from: rangeFrom, to: selectedDate },
    {
      query: {
        queryKey: getGetReportRangeQueryKey({ shopId, from: rangeFrom, to: selectedDate }),
        enabled: !!shopId,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
      },
    }
  );

  const data = rawData as ExtendedDashboardSummary | undefined;
  const isRefreshing = dashFetching || rangeFetching;

  const metrics = useMemo(() => {
    if (!data) return null;
    const totalRevenue = Number(data.totalRevenue ?? 0);
    const totalProfit = Number(data.totalProfit ?? 0);
    const totalCost = Number(data.totalCost ?? 0);
    const salesCount = Number(data.salesCount ?? 0);
    const marginPct = Number(
      data.marginPct ?? (totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0)
    );
    const cashSalesTotal = Number(data.cashSales ?? 0);
    const bankSales = Number(data.bankSales ?? 0);
    const cashOnlySales = Number(
      data.cashOnlySales ?? Math.max(0, cashSalesTotal - bankSales)
    );
    const debtSales = Number(data.debtSales ?? 0);
    const cashCollectedToday = Number(data.cashCollectedToday ?? 0);
    const pendingDebtsTotal = Number(data.pendingDebtsTotal ?? 0);
    const lowStockCount = Number(data.lowStockCount ?? 0);
    const outOfStockCount = Number(data.outOfStockCount ?? 0);
    const topProducts = Array.isArray(data.topProducts) ? data.topProducts : [];
    const avgTicket = salesCount > 0 ? totalRevenue / salesCount : 0;
    const netInflow = cashSalesTotal + cashCollectedToday;
    const totalStockAlerts = outOfStockCount + lowStockCount;

    return {
      totalRevenue,
      totalProfit,
      totalCost,
      salesCount,
      marginPct,
      cashSalesTotal,
      bankSales,
      cashOnlySales,
      debtSales,
      cashCollectedToday,
      pendingDebtsTotal,
      lowStockCount,
      outOfStockCount,
      totalStockAlerts,
      topProducts,
      avgTicket,
      netInflow,
    };
  }, [data]);

  const sevenDayChartData = useMemo(() => {
    const mapByDate = new Map(
      (rangeData?.dailyBreakdown ?? []).map((d) => [d.date, d])
    );
    const days: Array<{
      date: string;
      label: string;
      fullDate: string;
      revenue: number;
      profit: number;
      salesCount: number;
    }> = [];

    const end = parseISO(selectedDate);
    for (let i = 6; i >= 0; i--) {
      const d = subDays(end, i);
      const iso = format(d, "yyyy-MM-dd");
      const entry = mapByDate.get(iso);
      days.push({
        date: iso,
        label: iso === selectedDate ? `${format(d, "EEE")} *` : format(d, "EEE"),
        fullDate: format(d, "EEE, d MMM"),
        revenue: Number(entry?.revenue ?? 0),
        profit: Number(entry?.profit ?? 0),
        salesCount: Number(entry?.salesCount ?? 0),
      });
    }
    return days;
  }, [rangeData, selectedDate]);

  const paymentChannels = useMemo(() => {
    if (!metrics) return [];
    const denom = Math.max(metrics.totalRevenue, 1);
    return [
      {
        label: "Cash Sales",
        amount: metrics.cashOnlySales,
        pct: (metrics.cashOnlySales / denom) * 100,
        icon: Banknote,
        barColor: "bg-emerald-500",
        textColor: "text-emerald-600 dark:text-emerald-400",
        pillBg: "bg-emerald-500/10",
      },
      {
        label: "M-Pesa / Bank",
        amount: metrics.bankSales,
        pct: (metrics.bankSales / denom) * 100,
        icon: Smartphone,
        barColor: "bg-sky-500",
        textColor: "text-sky-600 dark:text-sky-400",
        pillBg: "bg-sky-500/10",
      },
      {
        label: "Issued on Credit",
        amount: metrics.debtSales,
        pct: (metrics.debtSales / denom) * 100,
        icon: CreditCard,
        barColor: "bg-amber-500",
        textColor: "text-amber-600 dark:text-amber-400",
        pillBg: "bg-amber-500/10",
      },
    ];
  }, [metrics]);

  const quickLinks = useMemo(
    () => [
      { label: "New Sale", href: "/pos", icon: ShoppingCart },
      {
        label: "Debts",
        href: "/debts",
        icon: CreditCard,
        badge: metrics && metrics.pendingDebtsTotal > 0 ? formatCompactKES(metrics.pendingDebtsTotal) : undefined,
      },
      {
        label: "Inventory",
        href: "/stock",
        icon: Package,
        badge: metrics && metrics.totalStockAlerts > 0 ? String(metrics.totalStockAlerts) : undefined,
      },
      { label: "Analytics", href: "/reports", icon: BarChart3 },
      { label: "Sales Log", href: "/sales-history", icon: Receipt },
      { label: "Customers", href: "/customers", icon: Users },
    ],
    [metrics]
  );

  const stepDate = (delta: number) => {
    const current = parseISO(selectedDate);
    const next = delta < 0 ? subDays(current, Math.abs(delta)) : addDays(current, delta);
    const nextIso = format(next, "yyyy-MM-dd");
    if (nextIso <= todayStr) {
      setSelectedDate(nextIso);
      setShowDateInput(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Executive Header */}
      <div className="border-b border-border bg-card/90 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            {/* Title + Shop Context */}
            <div className="flex items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg sm:text-xl font-bold font-display tracking-tight text-foreground">
                      Owner Overview
                    </h1>
                    <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                      {dateLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {shopName} · Daily operations, cash inflow &amp; margin pulse
                  </p>
                </div>
              </div>

              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  void refetchDash();
                  void refetchRange();
                }}
                className="lg:hidden h-9 w-9 rounded-xl shrink-0"
                title="Refresh metrics"
              >
                <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              </Button>
            </div>

            {/* Date Controls + Desktop Refresh */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
                <button
                  onClick={() => stepDate(-1)}
                  className="h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center p-1 rounded-xl border border-border bg-muted/40 flex-1 sm:flex-none gap-1">
                  {[
                    { label: "Today", date: todayStr },
                    { label: "Yesterday", date: yesterdayStr },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setSelectedDate(opt.date);
                        setShowDateInput(false);
                      }}
                      className={cn(
                        "flex-1 sm:flex-none px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                        selectedDate === opt.date && !showDateInput
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowDateInput((v) => !v)}
                    className={cn(
                      "flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all",
                      (!isToday && !isYesterday) || showDateInput
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>{!isToday && !isYesterday ? format(parseISO(selectedDate), "d MMM") : "Pick"}</span>
                  </button>
                </div>

                <button
                  onClick={() => stepDate(1)}
                  disabled={selectedDate >= todayStr}
                  className="h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 disabled:opacity-35 disabled:pointer-events-none"
                  title="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {showDateInput && (
                <input
                  type="date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setShowDateInput(false);
                    }
                  }}
                  className="h-9 rounded-xl border border-border bg-muted/40 px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void refetchDash();
                  void refetchRange();
                }}
                className="hidden lg:inline-flex h-9 rounded-xl gap-1.5 text-xs font-semibold"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          {/* Quick Workspace Jumps */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {quickLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/80 bg-background/60 hover:bg-muted/60 hover:border-primary/40 text-xs font-semibold text-foreground transition-colors shrink-0"
              >
                <item.icon className="h-3.5 w-3.5 text-primary" />
                <span>{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 tabular-nums">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5 flex-1">
        {dashLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-muted/40 border border-border/50 animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 h-72 rounded-2xl bg-muted/40 border border-border/50 animate-pulse" />
              <div className="lg:col-span-5 h-72 rounded-2xl bg-muted/40 border border-border/50 animate-pulse" />
            </div>
          </div>
        ) : !metrics ? (
          <Card className="bg-card border-border rounded-2xl shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-14 text-center gap-3">
              <AlertTriangle className="h-9 w-9 text-amber-500/70" />
              <div>
                <p className="text-sm font-semibold text-foreground">No shop summary available</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try picking another date or refreshing this view.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelectedDate(todayStr)} className="rounded-xl">
                Jump to Today
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* 4-Card Executive KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <ExecutiveStatCard
                label={`Revenue (${shortDateLabel})`}
                value={formatKES(metrics.totalRevenue)}
                sub={`${metrics.salesCount} sale${metrics.salesCount === 1 ? "" : "s"} · Avg ${formatKES(metrics.avgTicket)}`}
                icon={TrendingUp}
                tone="emerald"
                href="/sales-history"
                badge={`${metrics.salesCount} txns`}
              />

              <ExecutiveStatCard
                label="Gross Profit"
                value={formatKES(metrics.totalProfit)}
                sub={`COGS ${formatKES(metrics.totalCost)}`}
                icon={Wallet}
                tone="sky"
                href="/reports"
                badge={`${metrics.marginPct.toFixed(1)}% margin`}
              />

              <ExecutiveStatCard
                label="Shop Debt Book"
                value={formatKES(metrics.pendingDebtsTotal)}
                sub={`+${formatKES(metrics.cashCollectedToday)} collected ${shortDateLabel.toLowerCase()}`}
                icon={CreditCard}
                tone={metrics.pendingDebtsTotal > 0 ? "amber" : "emerald"}
                href="/debts"
                badge={metrics.debtSales > 0 ? `+${formatCompactKES(metrics.debtSales)} new` : "Clear"}
              />

              <ExecutiveStatCard
                label="Stock Health"
                value={
                  metrics.totalStockAlerts === 0
                    ? "All Healthy"
                    : `${metrics.totalStockAlerts} Alert${metrics.totalStockAlerts === 1 ? "" : "s"}`
                }
                sub={`${metrics.outOfStockCount} out of stock · ${metrics.lowStockCount} low`}
                icon={metrics.totalStockAlerts > 0 ? AlertTriangle : PackageCheck}
                tone={
                  metrics.outOfStockCount > 0
                    ? "rose"
                    : metrics.lowStockCount > 0
                    ? "amber"
                    : "emerald"
                }
                href="/stock"
                badge={metrics.outOfStockCount > 0 ? `${metrics.outOfStockCount} out` : undefined}
              />
            </div>

            {/* Middle Bento Row: 7-Day Trend + Payment & Cash Recovery Mix */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* 7-Day Performance Chart */}
              <Card className="lg:col-span-7 bg-card border-border/80 shadow-none rounded-2xl">
                <CardHeader className="pb-2 pt-4 px-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        7-Day Revenue &amp; Profit Trend
                      </CardTitle>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {format(parseISO(rangeFrom), "d MMM")} – {format(parseISO(selectedDate), "d MMM yyyy")} (* selected day)
                      </p>
                    </div>
                    {rangeData && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 tabular-nums">
                          7d Rev {formatCompactKES(rangeData.totalRevenue)}
                        </span>
                        <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-400 tabular-nums">
                          7d Profit {formatCompactKES(rangeData.totalProfit)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-3 sm:px-5 pb-4 pt-2">
                  {rangeLoading ? (
                    <div className="h-60 rounded-xl bg-muted/30 animate-pulse" />
                  ) : (
                    <>
                      <div className="h-60 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={sevenDayChartData}
                            margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                            barGap={4}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              vertical={false}
                              stroke="currentColor"
                              className="text-border/70"
                            />
                            <XAxis
                              dataKey="label"
                              tick={{ fontSize: 11, fill: "currentColor" }}
                              className="text-muted-foreground"
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 11, fill: "currentColor" }}
                              className="text-muted-foreground"
                              tickFormatter={(v) => formatCompactKES(Number(v))}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip content={<SevenDayTooltip />} cursor={{ fill: "rgba(128,128,128,0.08)" }} />
                            <Bar
                              dataKey="revenue"
                              name="Revenue"
                              fill="#10b981"
                              radius={[6, 6, 0, 0]}
                              maxBarSize={28}
                            />
                            <Bar
                              dataKey="profit"
                              name="Gross Profit"
                              fill="#0ea5e9"
                              radius={[6, 6, 0, 0]}
                              maxBarSize={28}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border/50 mt-2 text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-4">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                            Revenue
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                            Gross Profit
                          </span>
                        </div>
                        {rangeData && (
                          <span className="font-semibold tabular-nums">
                            {rangeData.salesCount} sales · {rangeData.marginPct.toFixed(1)}% 7d margin
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Payment Channels & Cash Recovery */}
              <Card className="lg:col-span-5 bg-card border-border/80 shadow-none rounded-2xl flex flex-col">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-primary" />
                    Payment &amp; Cash Flow Mix
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Revenue split &amp; debt collections for {shortDateLabel}
                  </p>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-2 flex-1 flex flex-col justify-between gap-4">
                  {/* Stacked proportional bar */}
                  <div className="space-y-3.5">
                    <div className="h-3 rounded-full bg-muted/70 overflow-hidden flex">
                      {metrics.totalRevenue > 0 ? (
                        paymentChannels.map((ch) =>
                          ch.pct > 0 ? (
                            <div
                              key={ch.label}
                              className={cn("h-full transition-all", ch.barColor)}
                              style={{ width: `${Math.max(ch.pct, 2)}%` }}
                              title={`${ch.label}: ${formatKES(ch.amount)} (${ch.pct.toFixed(0)}%)`}
                            />
                          ) : null
                        )
                      ) : (
                        <div className="w-full h-full bg-muted/50" />
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {paymentChannels.map((ch) => (
                        <div
                          key={ch.label}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", ch.pillBg)}>
                              <ch.icon className={cn("h-4 w-4", ch.textColor)} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">{ch.label}</p>
                              <p className="text-[10px] text-muted-foreground tabular-nums">
                                {ch.pct.toFixed(1)}% of sales
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-bold font-mono tabular-nums text-foreground shrink-0">
                            {formatKES(ch.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Debt Collection + Net Drawer Inflow Callout */}
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-muted-foreground font-medium">
                        Old Debts Collected ({shortDateLabel})
                      </span>
                      <span className="font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        +{formatKES(metrics.cashCollectedToday)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-emerald-500/20">
                      <div>
                        <p className="text-xs font-bold text-foreground">Total Cash &amp; M-Pesa Inflow</p>
                        <p className="text-[10px] text-muted-foreground">
                          Paid sales ({formatCompactKES(metrics.cashSalesTotal)}) + debt collected
                        </p>
                      </div>
                      <span className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatKES(metrics.netInflow)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row: Top Products Sold + Operational Health */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pb-4">
              {/* Top Products Sold on Selected Date */}
              <Card className="lg:col-span-7 bg-card border-border/80 shadow-none rounded-2xl">
                <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      Top Products Sold ({shortDateLabel})
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Ranked by revenue on {format(parseISO(selectedDate), "d MMM yyyy")}
                    </p>
                  </div>
                  <Link
                    href="/reports"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Full Analytics
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-2">
                  {metrics.topProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                      <ShoppingCart className="h-8 w-8 text-muted-foreground/30" />
                      <p className="text-xs font-medium text-muted-foreground">
                        No products sold on {dateLabel.toLowerCase()}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(() => {
                        const maxRev = Math.max(
                          ...metrics.topProducts.map((p) => Number(p.totalRevenue ?? 0)),
                          1
                        );
                        return metrics.topProducts.slice(0, 6).map((item, idx) => {
                          const rev = Number(item.totalRevenue ?? 0);
                          const prof = item.totalProfit != null ? Number(item.totalProfit) : null;
                          const pct = Math.max(4, (rev / maxRev) * 100);
                          return (
                            <div key={item.productId || item.productName} className="space-y-1.5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="w-5 h-5 rounded-md bg-muted/80 text-[10px] font-bold flex items-center justify-center text-muted-foreground shrink-0 tabular-nums">
                                    {idx + 1}
                                  </span>
                                  <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                                    {item.productName}
                                  </span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 tabular-nums">
                                    ×{item.totalQtySold}
                                  </span>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs sm:text-sm font-bold font-mono tabular-nums text-foreground">
                                    {formatKES(rev)}
                                  </p>
                                  {prof !== null && (
                                    <p className="text-[10px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                                      +{formatKES(prof)} profit
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-primary/80"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Daily Economics & Action Checklist */}
              <Card className="lg:col-span-5 bg-card border-border/80 shadow-none rounded-2xl">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Store className="h-4 w-4 text-primary" />
                    Shop Ledger &amp; Health
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    Margin efficiency, cost &amp; inventory readiness
                  </p>
                </CardHeader>
                <CardContent className="px-5 pb-5 pt-2 space-y-3">
                  <div className="rounded-xl border border-border/70 divide-y divide-border/60 bg-background/40">
                    {[
                      {
                        label: "Total Sales Revenue",
                        value: formatKES(metrics.totalRevenue),
                        tone: "text-foreground",
                      },
                      {
                        label: "Cost of Goods Sold",
                        value: formatKES(metrics.totalCost),
                        tone: "text-muted-foreground",
                      },
                      {
                        label: "Gross Margin",
                        value: `${formatKES(metrics.totalProfit)} (${metrics.marginPct.toFixed(1)}%)`,
                        tone: "text-emerald-600 dark:text-emerald-400",
                      },
                      {
                        label: "Average Sale Value",
                        value: formatKES(metrics.avgTicket),
                        tone: "text-foreground",
                      },
                      {
                        label: "Open Customer Debts",
                        value: formatKES(metrics.pendingDebtsTotal),
                        tone: metrics.pendingDebtsTotal > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs">
                        <span className="text-muted-foreground">{row.label}</span>
                        <span className={cn("font-bold font-mono tabular-nums", row.tone)}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Inventory Health Banner */}
                  <div
                    className={cn(
                      "rounded-xl border p-3.5 flex items-center justify-between gap-3",
                      metrics.outOfStockCount > 0
                        ? "border-rose-500/25 bg-rose-500/8"
                        : metrics.lowStockCount > 0
                        ? "border-amber-500/25 bg-amber-500/8"
                        : "border-emerald-500/25 bg-emerald-500/8"
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {metrics.totalStockAlerts > 0 ? (
                        <AlertTriangle
                          className={cn(
                            "h-4 w-4 shrink-0",
                            metrics.outOfStockCount > 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-amber-600 dark:text-amber-400"
                          )}
                        />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">
                          {metrics.totalStockAlerts === 0
                            ? "Inventory levels healthy"
                            : `${metrics.outOfStockCount} out of stock · ${metrics.lowStockCount} low`}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {metrics.totalStockAlerts === 0
                            ? "No products below restock thresholds"
                            : "Review stock & top up fast-moving items"}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/stock"
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-card border border-border text-[11px] font-semibold text-foreground hover:border-primary/40 transition-colors"
                    >
                      Inventory
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
