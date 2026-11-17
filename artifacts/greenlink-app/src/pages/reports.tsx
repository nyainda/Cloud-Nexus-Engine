import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboard, useGetReportRange, useGetTopProducts,
  useGetCategoryBreakdown, useGetHourlySales,
  useListProducts, useListDebts, getListDebtsQueryKey, customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatKES } from "@/lib/format";
import { NurseryDebtSettlementDialog } from "@/components/NurseryDebtSettlementDialog";
import {
  computeNurseryProjection,
  loadNurserySettlementState,
  type NurserySettlementMetrics,
} from "@/lib/nursery-settlement";
import {
  TrendingUp, CreditCard, AlertTriangle,
  Package, TrendingDown, Percent, BarChart2, Flame,
  Clock, ArrowUp, ArrowDown, Database,
  ClipboardCheck, Wallet, Ban,
  Calendar, ChevronDown, ChevronUp,
  RefreshCw, Activity,
} from "lucide-react";
import { format } from "date-fns";
import {
  ComposedChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  QUICK_RANGES,
  getDateRange,
  getPrevDateRange,
  STALE,
  GC,
  MONTH_LABELS,
  dateRangeDayCount,
  type QuickRange,
  type MonthlySalesResponse,
  type NurserySalesBucket,
  type NurserySalesResponse,
  type NurseryReportResponse,
  type NurseryEntriesResponse,
} from "@/features/reports/report-utils";
import { CashUpModal } from "@/features/reports/CashUpModal";
import { KpiCard } from "@/features/reports/ReportKpiCard";
import { ProductSearchSection } from "@/features/reports/ProductSearchSection";
import { NurseryAnalyticsCard } from "@/features/reports/NurseryAnalyticsCard";
import { MonthlyRevenueCard } from "@/features/reports/MonthlyRevenueCard";
import { SalesBreakdownBento } from "@/features/reports/SalesBreakdownBento";
import "./reports.css";


export default function Reports() {
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  const [quickRange, setQuickRange] = useState<QuickRange>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [showCashUp, setShowCashUp] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [showSalesDetails, setShowSalesDetails] = useState(false);
  const [showInventoryDetails, setShowInventoryDetails] = useState(false);
  const [showMonthlySales, setShowMonthlySales] = useState(false);
  const [monthlySalesYear, setMonthlySalesYear] = useState(() => new Date().getFullYear());
  const [monthlyMetric, setMonthlyMetric] = useState<"revenue" | "profit" | "salesCount">("revenue");
  const [comparePrevYear, setComparePrevYear] = useState(true);
  const [nurseryView, setNurseryView] = useState<"chart" | "varieties" | "entries">("chart");
  const [nurseryScope, setNurseryScope] = useState<"period" | "year" | "all">("period");
  const [nurserySearch, setNurserySearch] = useState("");
  const [nurseryEntriesLimit, setNurseryEntriesLimit] = useState(100);
  const [plantSettleOpen, setPlantSettleOpen] = useState(false);
  const [plantSettleTab, setPlantSettleTab] = useState<"settle" | "history">("settle");
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [lastManualRefreshAt, setLastManualRefreshAt] = useState<number | null>(null);
  const shopName = localStorage.getItem("greenlink_shopName") ?? "Shop";

  const { data: shopDebtsData, isLoading: shopDebtsLoading } = useListDebts(
    { shopId },
    {
      query: {
        queryKey: getListDebtsQueryKey({ shopId }),
        enabled: !!shopId,
        staleTime: 30_000,
      },
    },
  );
  const shopDebts = (shopDebtsData as any[]) || [];

  const { data: nurserySettlementMetrics } = useQuery<NurserySettlementMetrics>({
    queryKey: [
      "nursery-settlement-state",
      shopId,
      "analytics-summary",
      shopDebts.length,
      shopDebts.reduce((s, d) => s + Number(d?.balance || 0), 0),
    ],
    queryFn: () =>
      loadNurserySettlementState({
        qc,
        shopId,
        shopName,
        allDebts: shopDebts,
      }),
    enabled: !!shopId && !shopDebtsLoading,
    staleTime: 30_000,
  });

  const nurserySettlementProjection = useMemo(() => {
    if (!nurserySettlementMetrics) return null;
    return computeNurseryProjection({
      metrics: nurserySettlementMetrics,
      poolMode: nurserySettlementMetrics.shopConfig.poolMode,
      shopCommissionPct: nurserySettlementMetrics.shopConfig.commissionPct,
    });
  }, [nurserySettlementMetrics]);

  const today = format(new Date(), "yyyy-MM-dd");
  const currentYear = new Date().getFullYear();
  const prevMonthlySalesYear = monthlySalesYear - 1;
  const dateRange = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getDateRange(quickRange);

  const isToday = dateRange.from === today && dateRange.to === today;
  const nurseryDateRange = useMemo(() => {
    if (nurseryScope === "year") return { from: `${currentYear}-01-01`, to: today };
    if (nurseryScope === "all") return { from: "2020-01-01", to: today };
    return dateRange;
  }, [nurseryScope, currentYear, today, dateRange]);
  const nurseryBucket: NurserySalesBucket = dateRangeDayCount(nurseryDateRange.from, nurseryDateRange.to) > 45 ? "month" : "day";

  const { data: voidedSales, refetch: refetchVoidedSales } = useQuery({
    queryKey: ["voided-sales", shopId, dateRange.from],
    queryFn: async () => {
      // customFetch returns parsed data directly and throws on non-2xx
      const all = await customFetch(`/api/sales?shopId=${encodeURIComponent(shopId)}&date=${dateRange.from}&includeVoided=true&limit=100`) as any[];
      return all.filter((s: any) => s.isDeleted);
    },
    enabled: !!shopId && isToday,
    staleTime: STALE,
  });

  const prevRange = useMemo(() => getPrevDateRange(dateRange.from, dateRange.to), [dateRange.from, dateRange.to]);

  const { data: dashboard, isLoading: dashLoading, refetch: refetchDashboard } = useGetDashboard(
    { shopId, date: today },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC } as any }
  );

  const { data: reportRange, isLoading: rangeLoading, refetch: refetchReportRange } = useGetReportRange(
    { shopId, from: dateRange.from, to: dateRange.to },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC } as any }
  );

  const { data: prevReport, refetch: refetchPrevReport } = useGetReportRange(
    { shopId, from: prevRange.from, to: prevRange.to },
    { query: { enabled: !!shopId, staleTime: STALE * 10, gcTime: GC } as any }
  );

  const { data: topProducts, isLoading: topLoading, refetch: refetchTopProducts } = useGetTopProducts(
    { shopId, from: dateRange.from, to: dateRange.to, limit: 10 },
    { query: { enabled: !!shopId && showSalesDetails, staleTime: STALE, gcTime: GC } as any }
  );

  const { data: categoryData, isLoading: catLoading, refetch: refetchCategoryData } = useGetCategoryBreakdown(
    { shopId, from: dateRange.from, to: dateRange.to },
    { query: { enabled: !!shopId && showSalesDetails, staleTime: STALE, gcTime: GC } as any }
  );

  const { data: hourlyData, refetch: refetchHourlySales } = useGetHourlySales(
    { shopId, date: today },
    { query: { enabled: !!shopId && isToday, staleTime: STALE, gcTime: GC } as any }
  );

  const { data: productsData, refetch: refetchProductsData } = useListProducts(
    { shopId, limit: 3000 },
    // The full catalog is fetched only when the optional inventory panels open.
    // Other app pages can still warm and share the same query-cache entry.
    { query: { enabled: !!shopId && showInventoryDetails, staleTime: 1_800_000, gcTime: 1_800_000 } as any }
  );

  const {
    data: monthlySales,
    isLoading: monthlySalesLoading,
    error: monthlySalesError,
    refetch: refetchMonthlySales,
  } = useQuery<MonthlySalesResponse>({
    queryKey: ["reports", "monthly-sales", shopId, monthlySalesYear],
    queryFn: () => customFetch<MonthlySalesResponse>(
      `/api/reports/monthly-sales?shopId=${encodeURIComponent(shopId)}&year=${monthlySalesYear}`,
    ),
    enabled: !!shopId && showMonthlySales,
    staleTime: monthlySalesYear === currentYear ? 15 * 60_000 : 30 * 60_000,
    gcTime: GC,
  });

  const {
    data: prevMonthlySales,
    refetch: refetchPrevMonthlySales,
  } = useQuery<MonthlySalesResponse>({
    queryKey: ["reports", "monthly-sales", shopId, prevMonthlySalesYear],
    queryFn: () => customFetch<MonthlySalesResponse>(
      `/api/reports/monthly-sales?shopId=${encodeURIComponent(shopId)}&year=${prevMonthlySalesYear}`,
    ),
    enabled: !!shopId && showMonthlySales && prevMonthlySalesYear >= 2000,
    staleTime: 30 * 60_000,
    gcTime: GC,
  });

  const {
    data: nurserySales,
    isLoading: nurserySalesLoading,
    isError: nurserySalesError,
    refetch: refetchNurserySales,
  } = useQuery<NurserySalesResponse>({
    queryKey: ["nursery-analytics-sales", shopId, nurseryDateRange.from, nurseryDateRange.to, nurseryBucket],
    queryFn: () => customFetch<NurserySalesResponse>(
      `/api/nursery/analytics?from=${encodeURIComponent(nurseryDateRange.from)}&to=${encodeURIComponent(nurseryDateRange.to)}&bucket=${nurseryBucket}`,
    ),
    enabled: !!shopId,
    staleTime: STALE,
    gcTime: GC,
  });

  const {
    data: nurseryVarietyReport,
    isLoading: nurseryVarietiesLoading,
    isError: nurseryVarietiesError,
    refetch: refetchNurseryVarieties,
  } = useQuery<NurseryReportResponse>({
    queryKey: ["nursery-analytics-varieties", shopId, nurseryDateRange.from, nurseryDateRange.to],
    queryFn: () => customFetch<NurseryReportResponse>(
      `/api/nursery/report?from=${encodeURIComponent(nurseryDateRange.from)}&to=${encodeURIComponent(nurseryDateRange.to)}&businessDate=${encodeURIComponent(today)}&page=1&pageSize=250`,
    ),
    enabled: !!shopId && nurseryView === "varieties",
    staleTime: STALE,
    gcTime: GC,
  });

  const {
    data: nurseryEntriesReport,
    isLoading: nurseryEntriesLoading,
    isError: nurseryEntriesError,
    refetch: refetchNurseryEntries,
  } = useQuery<NurseryEntriesResponse>({
    queryKey: ["nursery-analytics-entries", shopId, nurseryDateRange.from, nurseryDateRange.to, nurseryEntriesLimit],
    queryFn: () => customFetch<NurseryEntriesResponse>(
      `/api/nursery/entries?from=${encodeURIComponent(nurseryDateRange.from)}&to=${encodeURIComponent(nurseryDateRange.to)}&page=1&pageSize=${nurseryEntriesLimit}`,
    ),
    enabled: !!shopId && nurseryView === "entries",
    staleTime: STALE,
    gcTime: GC,
  });

  const nurserySalesTotals = useMemo(() => (nurserySales?.rows ?? []).reduce((totals, row) => ({
    seedlingsSold: totals.seedlingsSold + Number(row.seedlingsSold || 0),
    totalRevenueCents: totals.totalRevenueCents + Number(row.totalRevenueCents || 0),
    cashCents: totals.cashCents + Number(row.cashCents || 0),
    mpesaCents: totals.mpesaCents + Number(row.mpesaCents || 0),
    creditCents: totals.creditCents + Number(row.creditCents || 0),
  }), { seedlingsSold: 0, totalRevenueCents: 0, cashCents: 0, mpesaCents: 0, creditCents: 0 }), [nurserySales?.rows]);

  const nurserySalesChartData = useMemo(() => (nurserySales?.rows ?? []).map(row => {
    const dateForLabel = nurseryBucket === "month" ? `${row.period}-01` : row.period;
    return {
      ...row,
      revenue: Number(row.totalRevenueCents || 0) / 100,
      label: format(new Date(`${dateForLabel}T12:00:00`), nurseryBucket === "month" ? "MMM yy" : "d MMM"),
    };
  }), [nurserySales?.rows, nurseryBucket]);

  const filteredNurseryVarieties = useMemo(() => {
    const rows = nurseryVarietyReport?.rows ?? [];
    const q = nurserySearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.varietyName.toLowerCase().includes(q));
  }, [nurseryVarietyReport?.rows, nurserySearch]);

  const filteredNurseryEntries = useMemo(() => {
    const rows = nurseryEntriesReport?.rows ?? [];
    const q = nurserySearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.varietyName.toLowerCase().includes(q) ||
      (r.customerName || "").toLowerCase().includes(q) ||
      (r.customerPhone || "").toLowerCase().includes(q) ||
      (r.sourceSupplierName || "").toLowerCase().includes(q)
    );
  }, [nurseryEntriesReport?.rows, nurserySearch]);

  const monthlySalesChartData = useMemo(() => {
    const currMap = new Map<number, { month: number; revenue: number; profit: number; salesCount: number }>();
    (monthlySales?.monthlyBreakdown ?? []).forEach(m => currMap.set(m.month, m));
    const prevMap = new Map<number, { month: number; revenue: number; profit: number; salesCount: number }>();
    (prevMonthlySales?.monthlyBreakdown ?? []).forEach(m => prevMap.set(m.month, m));

    return MONTH_LABELS.map((label, idx) => {
      const mNum = idx + 1;
      const curr = currMap.get(mNum) ?? { month: mNum, revenue: 0, profit: 0, salesCount: 0 };
      const prev = prevMap.get(mNum) ?? { month: mNum, revenue: 0, profit: 0, salesCount: 0 };
      return {
        month: mNum,
        monthLabel: label,
        revenue: curr.revenue,
        profit: curr.profit,
        salesCount: curr.salesCount,
        prevRevenue: prev.revenue,
        prevProfit: prev.profit,
        prevSalesCount: prev.salesCount,
      };
    });
  }, [monthlySales?.monthlyBreakdown, prevMonthlySales?.monthlyBreakdown]);

  const refreshReportData = async () => {
    if (isManualRefreshing) return;
    setIsManualRefreshing(true);
    try {
      await Promise.all([
        refetchDashboard(),
        refetchReportRange(),
        refetchPrevReport(),
        ...(isToday ? [refetchHourlySales(), refetchVoidedSales()] : []),
        ...(showSalesDetails ? [refetchTopProducts(), refetchCategoryData()] : []),
        ...(showInventoryDetails ? [refetchProductsData()] : []),
        ...(showMonthlySales ? [refetchMonthlySales(), refetchPrevMonthlySales()] : []),
        refetchNurserySales(),
        ...(nurseryView === "varieties" ? [refetchNurseryVarieties()] : []),
        ...(nurseryView === "entries" ? [refetchNurseryEntries()] : []),
      ]);
      setLastManualRefreshAt(Date.now());
    } finally {
      setIsManualRefreshing(false);
    }
  };

  const lowMarginProducts = useMemo(() => {
    const all = productsData?.products ?? [];
    return all
      .filter((p: any) => {
        const buy = p.purchasePrice ?? 0;
        const sell = p.sellingPrice ?? 0;
        return sell > 0 && buy > 0;
      })
      .map((p: any) => {
        const margin = ((p.sellingPrice! - p.purchasePrice!) / p.sellingPrice!) * 100;
        return { ...p, margin };
      })
      .sort((a: any, b: any) => a.margin - b.margin)
      .slice(0, 10);
  }, [productsData]);

  const inventoryValue = useMemo(() => {
    return (productsData?.products ?? []).reduce(
      (s: number, p: any) => s + (p.stockQty ?? 0) * (p.purchasePrice ?? 0), 0
    );
  }, [productsData]);

  const activeProductCount = useMemo(
    () => (productsData?.products ?? []).filter((p: any) => p.isActive && (p.stockQty ?? 0) > 0).length,
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
  const bankSales: number = (reportRange as any)?.bankSales ?? (dashboard as any)?.bankSales ?? 0;
  const cashOnlySales: number = (reportRange as any)?.cashOnlySales ?? (dashboard as any)?.cashOnlySales ?? 0;

  const revChangePct = prevReport?.totalRevenue && prevReport.totalRevenue > 0
    ? ((revenue - prevReport.totalRevenue) / prevReport.totalRevenue) * 100 : null;
  const profitChangePct = prevReport?.totalProfit && prevReport.totalProfit > 0
    ? ((profit - prevReport.totalProfit) / prevReport.totalProfit) * 100 : null;
  // Revenue and Profit show a trend badge but Avg Sale and Cash Collected
  // didn't, even though the same previous-period data needed for both is
  // already being fetched — just not used for these two. Filling that in
  // for visual/informational consistency across all four KPI cards.
  const prevAvgTx = (prevReport?.salesCount ?? 0) > 0
    ? (prevReport!.totalRevenue ?? 0) / prevReport!.salesCount : 0;
  const avgTxChangePct = prevAvgTx > 0 ? ((avgTxValue - prevAvgTx) / prevAvgTx) * 100 : null;
  const prevCashCollected = (prevReport as any)?.cashCollected ?? 0;
  const cashCollectedChangePct = prevCashCollected > 0
    ? ((cashCollected - prevCashCollected) / prevCashCollected) * 100 : null;

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
    <div className="reports-page flex flex-col min-h-full bg-background">
      {/* Cash-Up Modal */}
      {showCashUp && (
        <CashUpModal
          dashboard={dashboard}
          shopName={shopName}
          onClose={() => setShowCashUp(false)}
        />
      )}

      {/* Executive Command Header */}
      <header className="reports-header border-b border-border/70 bg-background/90 backdrop-blur-md px-4 sm:px-6 py-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3 max-w-[1520px] mx-auto w-full">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
              <span className="inline-flex items-center gap-1 text-primary">
                <Activity className="h-3 w-3" />
                Executive Intelligence
              </span>
              <span className="text-border">•</span>
              <span className="truncate">{shopName}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-normal text-foreground leading-none">
                Analytics
              </h1>
              <span className="text-xs text-muted-foreground font-medium">
                {format(new Date(), "EEEE, d MMMM yyyy")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="reports-status-badge text-muted-foreground border-border/80 text-[10px] font-semibold hidden sm:inline-flex">
              Manual sync
            </Badge>
            <button
              type="button"
              onClick={() => void refreshReportData()}
              disabled={isManualRefreshing}
              title="Refresh the analytics reports now"
              className="reports-header-refresh inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border/80 bg-card text-foreground text-xs font-semibold hover:border-primary/50 hover:bg-muted/40 disabled:opacity-60 transition-colors"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isManualRefreshing && "animate-spin")} />
              {isManualRefreshing ? "Updating" : lastManualRefreshAt ? `Updated ${format(lastManualRefreshAt, "h:mm a")}` : "Refresh"}
            </button>
            <button
              onClick={() => setShowCashUp(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 shadow-sm transition-colors"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Cash Up
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 max-w-[1520px] mx-auto w-full">
          <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/50 border border-border/70 flex-wrap">
            {QUICK_RANGES.map(r => (
              <button
                key={r.value}
                onClick={() => { setQuickRange(r.value); setUseCustom(false); }}
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                  !useCustom && quickRange === r.value
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/60"
                )}
              >
                {r.label}
              </button>
            ))}
            <button
              onClick={() => setUseCustom(true)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                useCustom
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              )}
            >
              Custom
            </button>
          </div>

          <span className="text-xs text-muted-foreground font-medium tabular-nums">
            Showing:{" "}
            <strong className="text-foreground">
              {dateRange.from === dateRange.to
                ? format(new Date(`${dateRange.from}T12:00:00`), "d MMM yyyy")
                : `${format(new Date(`${dateRange.from}T12:00:00`), "d MMM")} – ${format(new Date(`${dateRange.to}T12:00:00`), "d MMM yyyy")}`}
            </strong>
          </span>
        </div>

        {useCustom && (
          <div className="flex items-center gap-2 max-w-[1520px] mx-auto w-full sm:max-w-md">
            <input
              type="date"
              className="h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring flex-1"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              max={today}
            />
            <span className="text-sm text-muted-foreground shrink-0">→</span>
            <input
              type="date"
              className="h-9 px-3 text-sm rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring flex-1"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              max={today}
            />
          </div>
        )}
      </header>

      <div className="reports-content p-4 sm:p-6 space-y-5 pb-10">

        {/* ── 4-Card KPI Executive Strip ── */}
        <div className="reports-kpis grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <KpiCard
            label="Revenue"
            value={formatKES(revenue)}
            sub={`${salesCount} transaction${salesCount !== 1 ? "s" : ""}`}
            icon={TrendingUp}
            accentClass="border-primary/30 bg-primary/10 text-primary"
            isLoading={statsLoading}
            changePct={revChangePct}
          />
          <KpiCard
            label="Gross Profit"
            value={formatKES(profit)}
            sub={`${profitPct.toFixed(1)}% margin`}
            icon={BarChart2}
            accentClass="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            isLoading={statsLoading}
            changePct={profitChangePct}
          />
          <KpiCard
            label="Avg Sale"
            value={formatKES(avgTxValue)}
            sub="per transaction"
            icon={Percent}
            accentClass="border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
            isLoading={statsLoading}
            changePct={avgTxChangePct}
          />
          <KpiCard
            label="Cash Collected"
            value={formatKES(cashCollected)}
            sub={debtSales > 0 ? `${formatKES(debtSales)} issued on credit` : "debt payments received"}
            icon={CreditCard}
            accentClass="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            isLoading={statsLoading}
            changePct={cashCollectedChangePct}
          />
        </div>

        {/* ── Primary 12-Column Bento Telemetry Grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Primary Charts (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-4 min-w-0">
            {/* Revenue + Profit + Transaction Count Chart */}
            <Card className="reports-trend rounded-2xl border-border/80 bg-card/95 shadow-none">
              <CardHeader className="pb-2 pt-4 px-4 sm:px-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="font-display text-sm sm:text-base font-bold tracking-normal">Sales Trend</CardTitle>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Daily revenue, gross profit, and transaction volume</p>
                  </div>
                  <div className="flex items-center gap-3.5 text-[11px] font-medium text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" />Revenue</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />Profit</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/40 inline-block" />Tx Count</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-2 sm:px-4 pb-4">
                {rangeLoading ? (
                  <div className="h-64 flex items-center justify-center px-2">
                    <Skeleton className="h-56 w-full rounded-xl" />
                  </div>
                ) : !reportRange?.dailyBreakdown || reportRange.dailyBreakdown.length === 0 ? (
                  <div className="h-64 flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <BarChart2 className="h-8 w-8 mx-auto opacity-20 mb-2" />
                      <p className="text-xs font-medium">No sales data for this period</p>
                      <p className="text-xs opacity-60">Try a wider date range</p>
                    </div>
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={reportRange.dailyBreakdown} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.22} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={v => { try { return format(new Date(v + "T00:00:00"), "d"); } catch { return v; } }}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false} tickLine={false}
                          interval={reportRange.dailyBreakdown.length > 20 ? 2 : 0}
                        />
                        <YAxis
                          yAxisId="left"
                          tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false} tickLine={false}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          axisLine={false} tickLine={false}
                          allowDecimals={false}
                          width={24}
                        />
                        <Tooltip
                          formatter={(v: number, name: string) =>
                            name === "salesCount" ? [v, "Transactions"] :
                            name === "revenue" ? [formatKES(v), "Revenue"] :
                            [formatKES(v), "Profit"]
                          }
                          labelFormatter={l => { try { return format(new Date(l + "T00:00:00"), "EEEE, MMM d yyyy"); } catch { return l; } }}
                          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "10px", fontSize: "11px", color: "hsl(var(--card-foreground))" }}
                        />
                        <Bar yAxisId="right" dataKey="salesCount" fill="hsl(var(--muted-foreground))" radius={[3, 3, 0, 0]} barSize={7} opacity={0.25} />
                        <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#revGrad)" activeDot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }} isAnimationActive={false} />
                        <Area yAxisId="left" type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={1.75} fill="url(#profGrad)" activeDot={{ r: 3.5, fill: "#10b981", strokeWidth: 0 }} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {reportRange?.dailyBreakdown && reportRange.dailyBreakdown.length > 0 && (() => {
                  const best = (reportRange.dailyBreakdown as any[]).reduce((b: any, d: any) => d.revenue > b.revenue ? d : b);
                  const total = (reportRange.dailyBreakdown as any[]).reduce((s: number, d: any) => s + d.salesCount, 0);
                  const activeDays = (reportRange.dailyBreakdown as any[]).filter((d: any) => d.salesCount > 0).length;
                  return (
                    <div className="grid grid-cols-3 gap-2.5 px-2 mt-3">
                      <div className="rounded-xl border border-primary/25 bg-primary/8 px-3 py-2">
                        <p className="text-[10px] text-primary font-bold uppercase tracking-wider">Best Day</p>
                        <p className="text-xs sm:text-sm font-bold text-foreground mt-0.5 truncate">
                          {(() => { try { return format(new Date(best.date + "T00:00:00"), "EEE, d MMM"); } catch { return best.date; } })()}
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/35 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Total Sales</p>
                        <p className="text-xs sm:text-sm font-bold tabular-nums mt-0.5">{total} orders</p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-muted/35 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Avg / Active Day</p>
                        <p className="text-xs sm:text-sm font-bold font-mono tabular-nums mt-0.5">
                          {activeDays > 0 ? formatKES(Math.round(revenue / activeDays)) : "—"}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Hourly Activity — today only */}
            {isToday && (
              <Card className="reports-hourly rounded-2xl border-border/80 bg-card/95 shadow-none">
                <CardHeader className="pb-2 pt-4 px-4 sm:px-5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display text-sm sm:text-base font-bold tracking-normal flex items-center gap-2">
                      <Clock className="h-4 w-4 text-sky-500" />
                      Hourly Activity
                    </CardTitle>
                    {peakHour && peakHour.salesCount > 0 && (
                      <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/12 text-primary border border-primary/25">
                        Peak: {peakHour.hour < 12 ? `${peakHour.hour}am` : peakHour.hour === 12 ? "12pm" : `${peakHour.hour - 12}pm`}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-2 sm:px-4 pb-4">
                  {!hourlyData ? (
                    <Skeleton className="h-36 w-full rounded-xl mx-2" />
                  ) : hourlyChartData.every((h: any) => h.salesCount === 0) ? (
                    <div className="h-36 flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Clock className="h-6 w-6 mx-auto opacity-20 mb-2" />
                        <p className="text-xs">No sales recorded today yet</p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-36">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyChartData} margin={{ top: 6, right: 8, left: -24, bottom: 0 }} barSize={14}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip
                            formatter={(v: number) => [v, "Sales"]}
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "10px", fontSize: "11px", color: "hsl(var(--card-foreground))" }}
                          />
                          <Bar dataKey="salesCount" radius={[4, 4, 0, 0]}>
                            {hourlyChartData.map((entry: any, idx: number) => (
                              <Cell
                                key={idx}
                                fill={entry.hour === peakHour?.hour ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.25)"}
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
          </div>

          {/* Right Insights Rail (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-4 min-w-0">
            {/* Payment Method Breakdown */}
            {(bankSales > 0 || cashOnlySales > 0) && (
              <div className="reports-payment rounded-2xl border border-border/80 bg-card/95 overflow-hidden">
                <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Payment Methods</p>
                  <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="grid grid-cols-2 divide-x divide-border/70">
                  <div className="px-4 py-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Cash</p>
                    </div>
                    <p className="font-display text-lg font-bold tabular-nums text-foreground">
                      {statsLoading ? "—" : formatKES(cashOnlySales)}
                    </p>
                    {(cashOnlySales + bankSales) > 0 && (
                      <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">
                        {(((cashOnlySales) / (cashOnlySales + bankSales)) * 100).toFixed(0)}% of sales
                      </p>
                    )}
                  </div>
                  <div className="px-4 py-3.5 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">M-Pesa / Bank</p>
                    </div>
                    <p className="font-display text-lg font-bold tabular-nums text-foreground">
                      {statsLoading ? "—" : formatKES(bankSales)}
                    </p>
                    {(cashOnlySales + bankSales) > 0 && (
                      <p className="text-[11px] font-semibold text-sky-600 dark:text-sky-400 mt-0.5 tabular-nums">
                        {((bankSales / (cashOnlySales + bankSales)) * 100).toFixed(0)}% of sales
                      </p>
                    )}
                  </div>
                </div>
                {(cashOnlySales + bankSales) > 0 && (
                  <div className="px-4 pb-3.5">
                    <div className="h-2 rounded-full bg-sky-500/80 overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${(cashOnlySales / (cashOnlySales + bankSales)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Period Comparison */}
            {prevReport && (
              <Card className="reports-comparison rounded-2xl border-border/80 bg-card/95 shadow-none">
                <CardHeader className="pb-2.5 pt-4 px-4">
                  <CardTitle className="font-display text-sm font-bold flex items-center gap-2 tracking-tight">
                    <Calendar className="h-4 w-4 text-sky-500" />
                    vs {useCustom ? "Previous Period" : quickRange === "today" ? "Yesterday" : quickRange === "week" ? "Last Week" : "Last Month"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      {
                        label: "Revenue",
                        current: revenue,
                        prev: prevReport.totalRevenue ?? 0,
                        format: formatKES,
                        accent: "text-primary",
                      },
                      {
                        label: "Profit",
                        current: profit,
                        prev: prevReport.totalProfit ?? 0,
                        format: formatKES,
                        accent: "text-emerald-600 dark:text-emerald-400",
                      },
                      {
                        label: "Sales",
                        current: salesCount,
                        prev: prevReport.salesCount ?? 0,
                        format: (v: number) => String(v),
                        accent: "text-sky-600 dark:text-sky-400",
                      },
                    ].map(({ label, current, prev, format: fmt, accent }) => {
                      const diff = current - prev;
                      const pct = prev > 0 ? (diff / prev) * 100 : current > 0 ? 100 : 0;
                      const up = diff >= 0;
                      return (
                        <div key={label} className="bg-muted/35 border border-border/60 rounded-xl p-2.5 text-center">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
                          <p className={cn("text-xs sm:text-sm font-bold font-mono tabular-nums truncate", accent)}>{fmt(current)}</p>
                          <div className={cn(
                            "flex items-center justify-center gap-0.5 mt-1 text-[10px] font-bold tabular-nums",
                            up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                          )}>
                            {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                            {Math.abs(pct).toFixed(1)}%
                          </div>
                          <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{fmt(prev)} prev</p>
                        </div>
                      );
                    })}
                  </div>
                  {revenue > 0 && (prevReport.totalRevenue ?? 0) > 0 && (() => {
                    const maxRev = Math.max(revenue, prevReport.totalRevenue ?? 0);
                    const thisPct = (revenue / maxRev) * 100;
                    const prevPct = ((prevReport.totalRevenue ?? 0) / maxRev) * 100;
                    return (
                      <div className="mt-3.5 space-y-2 pt-3 border-t border-border/60">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">This period</span>
                            <span className="text-[11px] font-mono font-semibold text-foreground tabular-nums">{formatKES(revenue)}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${thisPct}%` }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">Previous period</span>
                            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{formatKES(prevReport.totalRevenue ?? 0)}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-muted-foreground/35 rounded-full" style={{ width: `${prevPct}%` }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Outstanding debts */}
            {dashboard?.pendingDebtsTotal != null && dashboard.pendingDebtsTotal > 0 && (
              <Card className="reports-debt rounded-2xl shadow-none border-destructive/35 bg-destructive/5">
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-destructive/12 border border-destructive/25 flex items-center justify-center shrink-0">
                      <TrendingDown className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-destructive">Outstanding Debt</p>
                      <p className="text-xs text-muted-foreground">Pending customer collection</p>
                    </div>
                  </div>
                  <span className="font-display font-bold text-base tabular-nums text-destructive shrink-0">
                    {formatKES(dashboard.pendingDebtsTotal)}
                  </span>
                </CardContent>
              </Card>
            )}

            {/* Inventory health */}
            <div className="reports-stock-alerts grid grid-cols-2 gap-3">
              <Card className="rounded-2xl shadow-none border-destructive/35 bg-card/95">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-destructive">Out of Stock</p>
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  {dashLoading
                    ? <Skeleton className="h-8 w-12 mt-1" />
                    : <p className="font-display text-3xl font-bold text-destructive tabular-nums">{dashboard?.outOfStockCount ?? 0}</p>}
                  <p className="text-xs text-muted-foreground mt-1">need restocking</p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl shadow-none border-amber-500/35 bg-card/95">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wider font-bold text-amber-600 dark:text-amber-400">Low Stock</p>
                    <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  {dashLoading
                    ? <Skeleton className="h-8 w-12 mt-1" />
                    : <p className="font-display text-3xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{dashboard?.lowStockCount ?? 0}</p>}
                  <p className="text-xs text-muted-foreground mt-1">below threshold</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* ── Nursery Plant Sales Spotlight & Full Records ── */}
        <NurseryAnalyticsCard
          shopName={shopName}
          currentYear={currentYear}
          nurseryScope={nurseryScope}
          onNurseryScopeChange={(scope) => { setNurseryScope(scope); setNurseryEntriesLimit(100); }}
          nurseryView={nurseryView}
          onNurseryViewChange={setNurseryView}
          nurseryDateRange={nurseryDateRange}
          nurseryBucket={nurseryBucket}
          nurserySales={nurserySales}
          nurserySalesLoading={nurserySalesLoading}
          nurserySalesError={nurserySalesError}
          onRetryNurserySales={() => void refetchNurserySales()}
          nurserySalesTotals={nurserySalesTotals}
          nurserySalesChartData={nurserySalesChartData}
          nurserySettlementMetrics={nurserySettlementMetrics}
          nurserySettlementProjection={nurserySettlementProjection}
          nurserySearch={nurserySearch}
          onNurserySearchChange={setNurserySearch}
          nurseryVarietiesLoading={nurseryVarietiesLoading}
          nurseryVarietyReport={nurseryVarietyReport}
          nurseryVarietiesError={nurseryVarietiesError}
          onRetryNurseryVarieties={() => void refetchNurseryVarieties()}
          filteredNurseryVarieties={filteredNurseryVarieties}
          nurseryEntriesLoading={nurseryEntriesLoading}
          nurseryEntriesReport={nurseryEntriesReport}
          nurseryEntriesError={nurseryEntriesError}
          onRetryNurseryEntries={() => void refetchNurseryEntries()}
          filteredNurseryEntries={filteredNurseryEntries}
          nurseryEntriesLimit={nurseryEntriesLimit}
          onLoadMoreEntries={() => setNurseryEntriesLimit(n => n + 100)}
          onOpenSettlement={(tab) => { setPlantSettleTab(tab); setPlantSettleOpen(true); }}
        />

        {/* ── Opt-In Deep Dive Bar ── */}
        <div className="reports-insight-controls" aria-label="Optional analytics details">
          <button
            type="button"
            aria-expanded={showSalesDetails}
            onClick={() => setShowSalesDetails(value => !value)}
            className={cn("reports-insight-toggle", showSalesDetails && "is-open")}
          >
            <span className="reports-insight-icon"><BarChart2 className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-bold">Sales breakdown</span>
              <span className="block text-xs text-muted-foreground">Top products and categories</span>
            </span>
            <span className="reports-insight-action">{showSalesDetails ? "Hide" : "Load"}</span>
            {showSalesDetails ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          <button
            type="button"
            aria-expanded={showInventoryDetails}
            onClick={() => setShowInventoryDetails(value => !value)}
            className={cn("reports-insight-toggle", showInventoryDetails && "is-open")}
          >
            <span className="reports-insight-icon"><Package className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-bold">Inventory details</span>
              <span className="block text-xs text-muted-foreground">Stock value and margins</span>
            </span>
            <span className="reports-insight-action">{showInventoryDetails ? "Hide" : "Load"}</span>
            {showInventoryDetails ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          <button
            type="button"
            aria-expanded={showMonthlySales}
            onClick={() => setShowMonthlySales(value => !value)}
            className={cn("reports-insight-toggle", showMonthlySales && "is-open")}
          >
            <span className="reports-insight-icon"><Calendar className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-bold">Monthly sales</span>
              <span className="block text-xs text-muted-foreground">Compare all 12 months</span>
            </span>
            <span className="reports-insight-action">{showMonthlySales ? "Hide" : "Load"}</span>
            {showMonthlySales ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>

        {/* ── Expandable: Monthly Revenue (Comparative Showcase) ── */}
        {showMonthlySales && (
          <MonthlyRevenueCard
            monthlySalesYear={monthlySalesYear}
            onYearChange={setMonthlySalesYear}
            prevMonthlySalesYear={prevMonthlySalesYear}
            comparePrevYear={comparePrevYear}
            onToggleCompare={() => setComparePrevYear(v => !v)}
            monthlyMetric={monthlyMetric}
            onMetricChange={setMonthlyMetric}
            currentYear={currentYear}
            monthlySales={monthlySales}
            prevMonthlySales={prevMonthlySales}
            monthlySalesLoading={monthlySalesLoading}
            monthlySalesError={monthlySalesError}
            onRetryMonthlySales={() => void refetchMonthlySales()}
            monthlySalesChartData={monthlySalesChartData}
          />
        )}

        {/* ── Expandable: Inventory Valuation ── */}
        {showInventoryDetails && (
          <Card className="reports-stock-value rounded-2xl border-border/80 bg-card/95 shadow-none">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                    <Database className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Stock Value at Cost</p>
                    {!productsData
                      ? <Skeleton className="h-8 w-32 mt-1" />
                      : <p className="font-display text-2xl font-bold tabular-nums">{formatKES(inventoryValue)}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{activeProductCount} active products with stock on hand</p>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Capital Tied Up</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Calculated from purchase prices</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Expandable: Sales Breakdown Bento (Top Products 5-col + Category Breakdown 7-col) ── */}
        {showSalesDetails && (
          <SalesBreakdownBento
            dateRange={dateRange}
            shopName={shopName}
            topLoading={topLoading}
            topProducts={topProducts}
            catLoading={catLoading}
            categoryData={categoryData}
            expandedCat={expandedCat}
            onToggleCat={(category) => setExpandedCat(expandedCat === category ? null : category)}
          />
        )}

        {/* ── Expandable: Low Margin Alert ── */}
        {showInventoryDetails && lowMarginProducts.length > 0 && (
          <Card className="reports-low-margin rounded-2xl border-border/80 bg-card/95 shadow-none">
            <CardHeader className="pb-2.5 pt-4 px-4 sm:px-5 border-b border-border/60">
              <CardTitle className="font-display text-sm sm:text-base font-bold tracking-normal flex items-center gap-2">
                <Flame className="h-4 w-4 text-orange-500" />
                Low Margin Alert
                <span className="text-xs font-normal text-muted-foreground ml-1">Bottom 10 by profit margin</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/60">
                {lowMarginProducts.map((p: any, i: number) => {
                  const marginColor =
                    p.margin < 5 ? "text-destructive" :
                    p.margin < 15 ? "text-orange-600 dark:text-orange-400" :
                    "text-amber-600 dark:text-amber-400";
                  const bgColor =
                    p.margin < 5 ? "bg-destructive/12" :
                    p.margin < 15 ? "bg-orange-500/12" :
                    "bg-amber-500/12";
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                      <span className={cn(
                        "w-7 h-7 rounded-lg border flex items-center justify-center text-xs font-bold shrink-0 tabular-nums",
                        p.margin < 5 ? "border-destructive/40 text-destructive" :
                        p.margin < 15 ? "border-orange-500/40 text-orange-500" :
                        "border-amber-500/40 text-amber-500"
                      )}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.canonicalName}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground font-mono tabular-nums">
                          <span>Buy {formatKES(p.purchasePrice ?? 0)}</span>
                          <span>→</span>
                          <span>Sell {formatKES(p.sellingPrice ?? 0)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={cn("text-xs font-bold font-mono px-2 py-0.5 rounded-md tabular-nums", bgColor, marginColor)}>
                          {p.margin.toFixed(1)}%
                        </span>
                        <p className="text-[10px] text-muted-foreground mt-0.5">margin</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Product Sales Lookup ── */}
        <ProductSearchSection shopId={shopId} />

        {/* ── Voided Sales (today only) ── */}
        {isToday && voidedSales && voidedSales.length > 0 && (
          <Card className="reports-void rounded-2xl shadow-none border-destructive/25 bg-card/95">
            <CardHeader className="pb-2.5 pt-4 px-4 sm:px-5 border-b border-border/60">
              <CardTitle className="font-display text-sm sm:text-base font-bold tracking-normal flex items-center gap-2">
                <Ban className="h-4 w-4 text-destructive" />
                Voided Sales Today
                <span className="text-xs font-normal text-muted-foreground ml-1">{voidedSales.length} reversal{voidedSales.length !== 1 ? "s" : ""}</span>
                <span className="ml-auto text-xs font-bold text-destructive font-mono tabular-nums">
                  -{formatKES(voidedSales.reduce((s: number, v: any) => s + (v.totalAmount ?? 0), 0))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {voidedSales.map((v: any) => {
                  const time = new Date(v.createdAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                        <Ban className="h-3.5 w-3.5 text-destructive" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-muted-foreground line-through truncate">
                          {v.saleType === "debt" ? "Debt Sale" : "Cash Sale"} · {time}
                        </p>
                        {v.deleteReason && <p className="text-[11px] text-muted-foreground/70 truncate">{v.deleteReason}</p>}
                      </div>
                      <span className="text-sm font-bold font-mono text-destructive/75 line-through shrink-0 tabular-nums">
                        {formatKES(v.totalAmount ?? 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <NurseryDebtSettlementDialog
        open={plantSettleOpen}
        onOpenChange={setPlantSettleOpen}
        shopId={shopId}
        shopName={shopName}
        initialTab={plantSettleTab}
        externalDebts={shopDebts}
        suppliers={nurserySettlementMetrics?.suppliers}
      />
    </div>
  );
}
