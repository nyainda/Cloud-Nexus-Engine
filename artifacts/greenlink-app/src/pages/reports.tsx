import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboard, useGetReportRange, useGetTopProducts,
  useGetCategoryBreakdown, useGetHourlySales,
  useListProducts, customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/format";
import {
  TrendingUp, ShoppingBag, CreditCard, AlertTriangle,
  Package, TrendingDown, Percent, BarChart2, Trophy, Flame,
  Layers, Clock, ArrowUp, ArrowDown, Minus, Database,
  ClipboardCheck, X, Share2, CheckCheck, Wallet, ReceiptText, Ban,
  Download, Calendar,
} from "lucide-react";
import { format, startOfWeek, startOfMonth, subDays } from "date-fns";
import {
  ComposedChart, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { cn } from "@/lib/utils";

// ─── PDF print helper ─────────────────────────────────────────────────────────
function printCategoryPdf(categories: any[], period: string, shopName: string) {
  const totalRev = categories.reduce((s, c) => s + c.totalRevenue, 0);
  const totalProfit = categories.reduce((s, c) => s + c.totalProfit, 0);
  const totalItems = categories.reduce((s, c) => s + c.salesCount, 0);
  const totalMargin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;

  const fmt = (n: number) => n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const rows = categories.map(c => {
    const share = totalRev > 0 ? (c.totalRevenue / totalRev * 100).toFixed(1) : "0.0";
    const margin = c.totalRevenue > 0 ? (c.totalProfit / c.totalRevenue * 100).toFixed(1) : "0.0";
    return `<tr>
      <td>${c.category}</td>
      <td class="num">KES ${fmt(c.totalRevenue)}</td>
      <td class="num">KES ${fmt(c.totalProfit)}</td>
      <td class="num">${c.salesCount}</td>
      <td class="num">${margin}%</td>
      <td class="num">${share}%</td>
    </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${shopName} — Category Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 36px; color: #111; background: #fff; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; border-bottom: 3px solid #C8FF00; padding-bottom: 16px; }
    .shop-badge { display: flex; align-items: center; gap: 10px; }
    .shop-icon { width: 42px; height: 42px; background: #C8FF00; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    h1 { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -0.5px; }
    .report-type { font-size: 12px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    .meta { text-align: right; font-size: 11px; color: #888; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
    thead th { background: #111; color: #fff; padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
    thead th.num { text-align: right; }
    tbody td { padding: 9px 12px; border-bottom: 1px solid #e8e8e8; color: #222; }
    tbody tr:nth-child(even) { background: #f8f8f8; }
    .num { text-align: right; font-family: "SF Mono", "Fira Code", monospace; font-size: 12px; }
    .tfoot td { padding: 10px 12px; font-weight: 800; background: #f0f0f0; font-size: 13px; border-top: 2px solid #ccc; }
    .profit { color: #16a34a; }
    .footer { margin-top: 28px; font-size: 10px; color: #aaa; text-align: center; }
    @media print { body { padding: 20px; } @page { margin: 15mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="shop-badge">
      <div class="shop-icon">🌿</div>
      <div>
        <h1>${shopName}</h1>
        <div class="report-type">Category Sales Report</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>Period:</strong> ${period}</div>
      <div><strong>Generated:</strong> ${new Date().toLocaleString("en-KE")}</div>
      <div>${categories.length} categories</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th class="num">Revenue (KES)</th>
        <th class="num">Profit (KES)</th>
        <th class="num">Items Sold</th>
        <th class="num">Margin</th>
        <th class="num">Share</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL</td>
        <td class="num">KES ${fmt(totalRev)}</td>
        <td class="num profit">KES ${fmt(totalProfit)}</td>
        <td class="num">${totalItems}</td>
        <td class="num">${totalMargin.toFixed(1)}%</td>
        <td class="num">100.0%</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">GreenLink OS &nbsp;·&nbsp; Confidential — ${shopName}</div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 400); }<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("afterprint", () => { URL.revokeObjectURL(url); });
  }
}

// ─── CSV download helper ───────────────────────────────────────────────────────
function downloadCategoryCsv(categories: any[], period: string, shopName: string) {
  const totalRev = categories.reduce((s, c) => s + c.totalRevenue, 0);
  const headers = ["Category", "Revenue (KES)", "Profit (KES)", "Items Sold", "Margin %", "Share %"];
  const rows = categories.map(c => {
    const share = totalRev > 0 ? (c.totalRevenue / totalRev * 100).toFixed(1) : "0.0";
    const margin = c.totalRevenue > 0 ? (c.totalProfit / c.totalRevenue * 100).toFixed(1) : "0.0";
    return [
      `"${c.category}"`,
      c.totalRevenue.toFixed(0),
      c.totalProfit.toFixed(0),
      c.salesCount,
      margin,
      share,
    ].join(",");
  });
  const totalRow = [
    '"TOTAL"',
    totalRev.toFixed(0),
    categories.reduce((s, c) => s + c.totalProfit, 0).toFixed(0),
    categories.reduce((s, c) => s + c.salesCount, 0),
    totalRev > 0 ? (categories.reduce((s, c) => s + c.totalProfit, 0) / totalRev * 100).toFixed(1) : "0.0",
    "100.0",
  ].join(",");
  const csv = [
    `"${shopName} — Category Sales Report"`,
    `"Period: ${period}"`,
    `"Generated: ${new Date().toLocaleString("en-KE")}"`,
    "",
    headers.join(","),
    ...rows,
    totalRow,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `category-sales-${period.replace(/\s/g, "-").toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Cash-Up Modal ────────────────────────────────────────────────────────────
function CashUpModal({ dashboard, shopName, onClose }: {
  dashboard: any;
  shopName: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const now = new Date();
  const dateLabel = format(now, "EEEE, d MMMM yyyy");
  const timeLabel = format(now, "h:mm a");

  const cashSales: number = dashboard?.cashSales ?? 0;
  const cashCollected: number = dashboard?.cashCollectedToday ?? 0;
  const debtSales: number = dashboard?.debtSales ?? 0;
  const totalRevenue: number = dashboard?.totalRevenue ?? 0;
  const totalProfit: number = dashboard?.totalProfit ?? 0;
  const salesCount: number = dashboard?.salesCount ?? 0;
  const pendingDebts: number = dashboard?.pendingDebtsTotal ?? 0;
  const lowStock: number = dashboard?.lowStockCount ?? 0;
  const outOfStock: number = dashboard?.outOfStockCount ?? 0;
  const topProducts: any[] = dashboard?.topProducts ?? [];

  const netCashInTill = cashSales + cashCollected;
  const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const buildTextReport = () => {
    const lines = [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `  END-OF-DAY CASH-UP REPORT`,
      `  ${shopName}`,
      `  ${dateLabel} • ${timeLabel}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ``,
      `  CASH IN TILL`,
      `  ${formatKES(netCashInTill)}`,
      ``,
      `  Cash Sales:        ${formatKES(cashSales)}`,
      `  Debt Collected:    ${formatKES(cashCollected)}`,
      `  ───────────────────────────`,
      `  Credit Issued:     ${formatKES(debtSales)}`,
      `  Total Revenue:     ${formatKES(totalRevenue)}`,
      `  Gross Profit:      ${formatKES(totalProfit)} (${marginPct.toFixed(1)}%)`,
      `  Transactions:      ${salesCount}`,
      ``,
      topProducts.length > 0 ? `  TOP PRODUCTS` : "",
      ...topProducts.slice(0, 5).map((p, i) => `  ${i + 1}. ${p.productName} — ${formatKES(p.totalRevenue)}`),
      ``,
      pendingDebts > 0 ? `  Outstanding Debts: ${formatKES(pendingDebts)}` : "",
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ].filter(l => l !== undefined);
    return lines.join("\n");
  };

  const handleShare = async () => {
    const text = buildTextReport();
    if (navigator.share) {
      try { await navigator.share({ title: "Cash-Up Report", text }); return; } catch {}
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const Row = ({ label, value, sub, accent, bold }: { label: string; value: string; sub?: string; accent?: string; bold?: boolean }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
      <span className={cn("text-sm", bold ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
      <div className="text-right">
        <span className={cn("font-mono font-bold text-sm", accent ?? "text-foreground")}>{value}</span>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-card w-full max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            <div>
              <h2 className="text-sm font-bold">End-of-Day Cash-Up</h2>
              <p className="text-[10px] text-muted-foreground">{dateLabel} • {timeLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          {/* Big Cash in Till */}
          <div className="bg-primary/5 border-b border-primary/20 px-5 py-5 text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-xs font-bold uppercase tracking-widest text-primary">Cash in Till</p>
            </div>
            <p className="text-4xl font-bold font-mono text-foreground">{formatKES(netCashInTill)}</p>
            <p className="text-xs text-muted-foreground mt-1">Cash sales + debt payments received today</p>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Cash breakdown */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Cash Breakdown</p>
              <div className="bg-muted/30 rounded-xl px-3">
                <Row label="Cash Sales" value={formatKES(cashSales)} bold />
                <Row label="Debt Payments Collected" value={formatKES(cashCollected)} bold />
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-bold text-primary">Total Cash in Till</span>
                  <span className="font-mono font-bold text-base text-primary">{formatKES(netCashInTill)}</span>
                </div>
              </div>
            </div>

            {/* Sales summary */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Sales Summary</p>
              <div className="bg-muted/30 rounded-xl px-3">
                <Row label="Total Revenue" value={formatKES(totalRevenue)} bold />
                <Row label="Credit Issued Today" value={formatKES(debtSales)} accent="text-orange-500" />
                <Row
                  label="Gross Profit"
                  value={formatKES(totalProfit)}
                  sub={`${marginPct.toFixed(1)}% margin`}
                  accent="text-emerald-500"
                  bold
                />
                <Row label="Transactions" value={salesCount.toString()} />
              </div>
            </div>

            {/* Top products */}
            {topProducts.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                  <Trophy className="h-3 w-3 text-amber-500" /> Top Products Today
                </p>
                <div className="bg-muted/30 rounded-xl overflow-hidden">
                  {topProducts.slice(0, 5).map((p, i) => (
                    <div key={p.productId} className="flex items-center gap-3 px-3 py-2.5 border-b border-border/30 last:border-0">
                      <span className={cn(
                        "w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0",
                        i === 0 ? "bg-amber-500/15 text-amber-500" :
                        i === 1 ? "bg-slate-500/15 text-slate-400" :
                        i === 2 ? "bg-orange-500/15 text-orange-500" :
                        "bg-muted text-muted-foreground"
                      )}>{i + 1}</span>
                      <p className="text-sm flex-1 truncate font-medium">{p.productName}</p>
                      <span className="font-mono text-xs font-bold shrink-0">{formatKES(p.totalRevenue)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alerts */}
            {(pendingDebts > 0 || outOfStock > 0 || lowStock > 0) && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Alerts</p>
                <div className="space-y-2">
                  {pendingDebts > 0 && (
                    <div className="flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <ReceiptText className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <span className="text-sm font-medium">Outstanding Debts</span>
                      </div>
                      <span className="font-mono font-bold text-sm text-destructive">{formatKES(pendingDebts)}</span>
                    </div>
                  )}
                  {(outOfStock > 0 || lowStock > 0) && (
                    <div className="flex items-center justify-between bg-orange-500/5 border border-orange-500/20 rounded-xl px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                        <span className="text-sm font-medium">Stock Alerts</span>
                      </div>
                      <span className="text-sm font-bold text-orange-500">{outOfStock} out · {lowStock} low</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border/60 shrink-0">
          <Button className="w-full h-12 font-bold gap-2" onClick={handleShare}>
            {copied
              ? <><CheckCheck className="h-4 w-4" /> Copied to clipboard!</>
              : <><Share2 className="h-4 w-4" /> Share Report</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

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

  const [quickRange, setQuickRange] = useState<QuickRange>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [showCashUp, setShowCashUp] = useState(false);
  const shopName = localStorage.getItem("greenlink_shopName") ?? "Shop";

  const today = format(new Date(), "yyyy-MM-dd");
  const dateRange = useCustom && customFrom && customTo
    ? { from: customFrom, to: customTo }
    : getDateRange(quickRange);

  const isToday = dateRange.from === today && dateRange.to === today;

  const { data: voidedSales } = useQuery({
    queryKey: ["voided-sales", shopId, dateRange.from],
    queryFn: async () => {
      const res = await customFetch(`/api/sales?shopId=${encodeURIComponent(shopId)}&date=${dateRange.from}&includeVoided=true&limit=100`);
      if (!res.ok) return [];
      const all = await res.json() as any[];
      return all.filter((s: any) => s.isDeleted);
    },
    enabled: !!shopId && isToday,
    staleTime: 30_000,
  });

  const prevRange = useMemo(() => getPrevDateRange(dateRange.from, dateRange.to), [dateRange.from, dateRange.to]);

  const { data: dashboard, isLoading: dashLoading } = useGetDashboard(
    { shopId, date: today },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC, refetchInterval: 30_000, refetchIntervalInBackground: false } }
  );

  const { data: reportRange, isLoading: rangeLoading } = useGetReportRange(
    { shopId, from: dateRange.from, to: dateRange.to },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC, refetchInterval: 30_000, refetchIntervalInBackground: false } }
  );

  const { data: prevReport } = useGetReportRange(
    { shopId, from: prevRange.from, to: prevRange.to },
    { query: { enabled: !!shopId, staleTime: STALE * 10, gcTime: GC } }
  );

  const { data: topProducts, isLoading: topLoading } = useGetTopProducts(
    { shopId, from: dateRange.from, to: dateRange.to, limit: 10 },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC, refetchInterval: 30_000, refetchIntervalInBackground: false } }
  );

  const { data: categoryData, isLoading: catLoading } = useGetCategoryBreakdown(
    { shopId, from: dateRange.from, to: dateRange.to },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC, refetchInterval: 30_000, refetchIntervalInBackground: false } }
  );

  const { data: hourlyData } = useGetHourlySales(
    { shopId, date: today },
    { query: { enabled: !!shopId && isToday, staleTime: STALE, gcTime: GC, refetchInterval: 30_000, refetchIntervalInBackground: false } }
  );

  const { data: productsData } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId, staleTime: STALE, gcTime: GC, refetchInterval: 30_000, refetchIntervalInBackground: false } }
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
      {/* Cash-Up Modal */}
      {showCashUp && (
        <CashUpModal
          dashboard={dashboard}
          shopName={shopName}
          onClose={() => setShowCashUp(false)}
        />
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Analytics</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCashUp(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <ClipboardCheck className="h-3.5 w-3.5" />
              Cash Up
            </button>
            <Badge variant="outline" className="text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 text-[10px]">
              Live
            </Badge>
          </div>
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

        {/* Month-over-Month Comparison */}
        {prevReport && (
          <Card className="shadow-none">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-500" />
                vs {useCustom ? "Previous Period" : quickRange === "today" ? "Yesterday" : quickRange === "week" ? "Last Week" : "Last Month"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
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
                    accent: "text-emerald-500",
                  },
                  {
                    label: "Sales",
                    current: salesCount,
                    prev: prevReport.salesCount ?? 0,
                    format: (v: number) => String(v),
                    accent: "text-blue-400",
                  },
                ].map(({ label, current, prev, format: fmt, accent }) => {
                  const diff = current - prev;
                  const pct = prev > 0 ? (diff / prev) * 100 : current > 0 ? 100 : 0;
                  const up = diff >= 0;
                  return (
                    <div key={label} className="bg-muted/40 rounded-xl p-3 text-center">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
                      <p className={cn("text-sm font-bold font-mono", accent)}>{fmt(current)}</p>
                      <div className={cn(
                        "flex items-center justify-center gap-0.5 mt-1.5 text-[10px] font-bold",
                        up ? "text-emerald-500" : "text-destructive"
                      )}>
                        {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                        {Math.abs(pct).toFixed(1)}%
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{fmt(prev)} prev</p>
                    </div>
                  );
                })}
              </div>
              {/* Progress bars comparing current vs prev */}
              {revenue > 0 && (prevReport.totalRevenue ?? 0) > 0 && (() => {
                const maxRev = Math.max(revenue, prevReport.totalRevenue ?? 0);
                const thisPct = (revenue / maxRev) * 100;
                const prevPct = ((prevReport.totalRevenue ?? 0) / maxRev) * 100;
                return (
                  <div className="mt-3 space-y-2">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide">This period</span>
                        <span className="text-[9px] font-mono text-foreground">{formatKES(revenue)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${thisPct}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide">Previous period</span>
                        <span className="text-[9px] font-mono text-muted-foreground">{formatKES(prevReport.totalRevenue ?? 0)}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-muted-foreground/30 rounded-full" style={{ width: `${prevPct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        )}

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

        {/* Revenue + Profit + Transaction Count Chart */}
        <Card className="shadow-none">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-bold">Monthly Sales Profile</CardTitle>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary inline-block" />Revenue</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Profit</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-400/60 inline-block" />Transactions</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            {rangeLoading ? (
              <div className="h-56 flex items-center justify-center">
                <Skeleton className="h-44 w-full rounded-xl" />
              </div>
            ) : !reportRange?.dailyBreakdown || reportRange.dailyBreakdown.length === 0 ? (
              <div className="h-56 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart2 className="h-8 w-8 mx-auto opacity-20 mb-2" />
                  <p className="text-xs">No sales data for this period</p>
                  <p className="text-xs opacity-60">Try a wider date range</p>
                </div>
              </div>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={reportRange.dailyBreakdown} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C8FF00" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#C8FF00" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={v => { try { return format(new Date(v + "T00:00:00"), "d"); } catch { return v; } }}
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false}
                      interval={reportRange.dailyBreakdown.length > 20 ? 2 : 0}
                    />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false} tickLine={false}
                      allowDecimals={false}
                      width={22}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) =>
                        name === "salesCount" ? [v, "Transactions"] :
                        name === "revenue" ? [formatKES(v), "Revenue"] :
                        [formatKES(v), "Profit"]
                      }
                      labelFormatter={l => { try { return format(new Date(l + "T00:00:00"), "EEEE, MMM d yyyy"); } catch { return l; } }}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "11px", color: "hsl(var(--card-foreground))" }}
                    />
                    <Bar yAxisId="right" dataKey="salesCount" fill="hsl(var(--muted))" radius={[2, 2, 0, 0]} barSize={6} opacity={0.7} />
                    <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#C8FF00" strokeWidth={2} fill="url(#revGrad)" activeDot={{ r: 4, fill: "#C8FF00", strokeWidth: 0 }} isAnimationActive={false} />
                    <Area yAxisId="left" type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={1.5} fill="url(#profGrad)" activeDot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            {/* Best day callout */}
            {reportRange?.dailyBreakdown && reportRange.dailyBreakdown.length > 0 && (() => {
              const best = (reportRange.dailyBreakdown as any[]).reduce((b, d) => d.revenue > b.revenue ? d : b);
              const total = (reportRange.dailyBreakdown as any[]).reduce((s, d) => s + d.salesCount, 0);
              const activeDays = (reportRange.dailyBreakdown as any[]).filter(d => d.salesCount > 0).length;
              return (
                <div className="flex items-center gap-3 px-3 mt-3 flex-wrap">
                  <div className="bg-primary/10 rounded-lg px-2.5 py-1.5">
                    <p className="text-[9px] text-primary/70 font-bold uppercase tracking-wide">Best Day</p>
                    <p className="text-xs font-bold text-primary">{(() => { try { return format(new Date(best.date + "T00:00:00"), "MMM d"); } catch { return best.date; } })()}</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg px-2.5 py-1.5">
                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide">Total Sales</p>
                    <p className="text-xs font-bold">{total} transactions</p>
                  </div>
                  {activeDays > 0 && (
                    <div className="bg-muted/50 rounded-lg px-2.5 py-1.5">
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide">Avg / Day</p>
                      <p className="text-xs font-bold font-mono">{formatKES(Math.round(revenue / activeDays))}</p>
                    </div>
                  )}
                </div>
              );
            })()}
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
            <div className="flex items-center justify-between w-full gap-2">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-violet-500" />
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
                      className="flex items-center gap-1 text-[10px] font-bold text-rose-500 hover:text-rose-400 transition-colors bg-rose-500/10 hover:bg-rose-500/20 rounded-lg px-2.5 py-1.5"
                      title="Open print dialog — choose 'Save as PDF'"
                    >
                      <Download className="h-3 w-3" />
                      PDF
                    </button>
                    <button
                      onClick={() => downloadCategoryCsv(cats, period, shopName)}
                      className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors bg-muted/50 hover:bg-muted rounded-lg px-2.5 py-1.5"
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
                  const marginPct = cat.totalRevenue > 0 ? (cat.totalProfit / cat.totalRevenue * 100) : 0;
                  return (
                    <div key={cat.category} className="px-4 py-3">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0 mt-0.5" style={{ background: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold truncate">{cat.category}</p>
                            <span className="text-xs font-bold text-muted-foreground ml-2 shrink-0">{share.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm font-mono">{formatKES(cat.totalRevenue)}</p>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2 ml-5">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="flex items-center gap-2 ml-5">
                        <span className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 font-mono">
                          {cat.salesCount} item{cat.salesCount !== 1 ? "s" : ""} sold
                        </span>
                        {cat.totalProfit > 0 && (
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5">
                            +{formatKES(cat.totalProfit)} profit
                          </span>
                        )}
                        {marginPct > 0 && (
                          <span className="text-[10px] text-muted-foreground">{marginPct.toFixed(0)}% margin</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Totals footer */}
            {categoryData && (categoryData as any[]).length > 0 && (() => {
              const cats = categoryData as any[];
              const totalRev = cats.reduce((s, c) => s + c.totalRevenue, 0);
              const totalProfit = cats.reduce((s, c) => s + c.totalProfit, 0);
              const totalItems = cats.reduce((s, c) => s + c.salesCount, 0);
              const totalMargin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;
              return (
                <div className="border-t border-border/60 bg-muted/20 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-foreground">Total</span>
                    <span className="text-[10px] text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5 font-mono">
                      {totalItems} items sold
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded px-1.5 py-0.5 font-mono">
                      +{formatKES(totalProfit)} profit
                    </span>
                    <span className="text-[10px] text-muted-foreground">{totalMargin.toFixed(0)}% avg margin</span>
                  </div>
                  <span className="font-bold text-sm font-mono">{formatKES(totalRev)}</span>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Voided Sales (today only) */}
        {isToday && voidedSales && voidedSales.length > 0 && (
          <Card className="shadow-none border-destructive/20">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                <Ban className="h-4 w-4 text-destructive" />
                Voided Sales Today
                <span className="text-xs font-normal text-muted-foreground ml-1">{voidedSales.length} reversal{voidedSales.length !== 1 ? "s" : ""}</span>
                <span className="ml-auto text-xs font-bold text-destructive font-mono">
                  -{formatKES(voidedSales.reduce((s: number, v: any) => s + (v.totalAmount ?? 0), 0))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
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
                        {v.deleteReason && <p className="text-[11px] text-muted-foreground/50 truncate">{v.deleteReason}</p>}
                      </div>
                      <span className="text-sm font-bold font-mono text-destructive/70 line-through shrink-0">
                        {formatKES(v.totalAmount ?? 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

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
