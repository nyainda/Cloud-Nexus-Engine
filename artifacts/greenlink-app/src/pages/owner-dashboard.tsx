import { useGetDashboard, useListShops } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKES } from "@/lib/format";
import {
  TrendingUp, CreditCard, Package, AlertTriangle, Store,
  TrendingDown, ArrowUpRight, Percent
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";

const SHOP_A_COLOR = "hsl(75 100% 50%)";
const SHOP_B_COLOR = "hsl(200 80% 55%)";

function StatCard({
  label, value, sub, icon: Icon, color, bg
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <Card className="bg-card border-border shadow-none">
      <CardContent className="p-4">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", bg)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
        <p className={cn("text-xl font-bold font-mono", color)}>{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function ShopBreakdown({
  shopName, color, data, isLoading
}: {
  shopName: string; color: string;
  data: any; isLoading: boolean;
}) {
  const profitPct = data && data.totalRevenue > 0
    ? (data.totalProfit / data.totalRevenue * 100) : 0;

  return (
    <Card className="bg-card border-border shadow-none">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
          {shopName}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center gap-2 py-4 text-muted-foreground">
            <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Revenue</p>
              <p className="text-base font-bold font-mono" style={{ color }}>{formatKES(data.totalRevenue)}</p>
              <p className="text-[10px] text-muted-foreground">{data.salesCount} sales</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Profit</p>
              <p className="text-base font-bold font-mono text-emerald-400">{formatKES(data.totalProfit)}</p>
              <p className="text-[10px] text-muted-foreground">{profitPct.toFixed(1)}% margin</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Outstanding Debt</p>
              <p className="text-base font-bold font-mono text-destructive">{formatKES(data.pendingDebtsTotal)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Stock Alerts</p>
              <p className="text-base font-bold font-mono text-orange-400">{data.lowStockCount + data.outOfStockCount}</p>
              <p className="text-[10px] text-muted-foreground">{data.outOfStockCount} out, {data.lowStockCount} low</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-4">No data available</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function OwnerDashboard() {
  const today = format(new Date(), "yyyy-MM-dd");

  const { data: shops } = useListShops();
  const shopA = shops?.[0];
  const shopB = shops?.[1];
  const SHOP_A_ID = shopA?.id ?? "";
  const SHOP_B_ID = shopB?.id ?? "";
  const SHOP_A_NAME = shopA?.name ?? "Shop A";
  const SHOP_B_NAME = shopB?.name ?? "Shop B";

  const { data: dataA, isLoading: loadingA } = useGetDashboard(
    { shopId: SHOP_A_ID, date: today },
    { query: { enabled: !!SHOP_A_ID } }
  );
  const { data: dataB, isLoading: loadingB } = useGetDashboard(
    { shopId: SHOP_B_ID, date: today },
    { query: { enabled: !!SHOP_B_ID } }
  );

  const allLoaded = !loadingA && !loadingB;

  const combined = allLoaded && (dataA || dataB) ? {
    totalRevenue: (dataA?.totalRevenue ?? 0) + (dataB?.totalRevenue ?? 0),
    totalProfit: (dataA?.totalProfit ?? 0) + (dataB?.totalProfit ?? 0),
    pendingDebtsTotal: (dataA?.pendingDebtsTotal ?? 0) + (dataB?.pendingDebtsTotal ?? 0),
    salesCount: (dataA?.salesCount ?? 0) + (dataB?.salesCount ?? 0),
    outOfStockCount: (dataA?.outOfStockCount ?? 0) + (dataB?.outOfStockCount ?? 0),
    lowStockCount: (dataA?.lowStockCount ?? 0) + (dataB?.lowStockCount ?? 0),
    debtSales: (dataA?.debtSales ?? 0) + (dataB?.debtSales ?? 0),
  } : null;

  const combinedProfitPct = combined && combined.totalRevenue > 0
    ? (combined.totalProfit / combined.totalRevenue * 100) : 0;

  const chartData = [
    {
      name: (SHOP_A_NAME ?? "Shop A").split(" ")[0],
      Revenue: dataA?.totalRevenue ?? 0,
      Profit: dataA?.totalProfit ?? 0,
      Debt: dataA?.pendingDebtsTotal ?? 0,
    },
    {
      name: (SHOP_B_NAME ?? "Shop B").split(" ")[0],
      Revenue: dataB?.totalRevenue ?? 0,
      Profit: dataB?.totalProfit ?? 0,
      Debt: dataB?.pendingDebtsTotal ?? 0,
    },
  ];

  const revA = dataA?.totalRevenue ?? 0;
  const revB = dataB?.totalRevenue ?? 0;
  const totalRev = revA + revB;
  const pctA = totalRev > 0 ? (revA / totalRev * 100) : 0;
  const pctB = totalRev > 0 ? (revB / totalRev * 100) : 0;

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold font-display">Owner Dashboard</h1>
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, d MMMM yyyy")} · All Shops</p>
          </div>
          <div className={cn(
            "text-[10px] font-bold px-2 py-1 rounded-full border",
            "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          )}>
            Combined
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-6">
        {/* Combined KPIs */}
        {!allLoaded ? (
          <div className="flex flex-col items-center justify-center h-32 gap-3 text-muted-foreground">
            <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-sm">Loading all shops…</p>
          </div>
        ) : combined ? (
          <>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
                Combined Today
              </p>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Total Revenue"
                  value={formatKES(combined.totalRevenue)}
                  sub={`${combined.salesCount} transactions`}
                  icon={TrendingUp}
                  color="text-primary"
                  bg="bg-primary/10"
                />
                <StatCard
                  label="Gross Profit"
                  value={formatKES(combined.totalProfit)}
                  sub={`${combinedProfitPct.toFixed(1)}% margin`}
                  icon={ArrowUpRight}
                  color="text-emerald-400"
                  bg="bg-emerald-500/10"
                />
                <StatCard
                  label="Outstanding Debt"
                  value={formatKES(combined.pendingDebtsTotal)}
                  sub="across all shops"
                  icon={CreditCard}
                  color="text-destructive"
                  bg="bg-destructive/10"
                />
                <StatCard
                  label="Stock Alerts"
                  value={String(combined.lowStockCount + combined.outOfStockCount)}
                  sub={`${combined.outOfStockCount} out, ${combined.lowStockCount} low`}
                  icon={Package}
                  color="text-orange-400"
                  bg="bg-orange-500/10"
                />
              </div>
            </div>

            {/* Debt issued today */}
            {combined.debtSales > 0 && (
              <div className="flex items-center justify-between bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-xs font-bold text-destructive">Debt Issued Today</p>
                    <p className="text-[10px] text-muted-foreground">Combined across shops</p>
                  </div>
                </div>
                <span className="font-bold font-mono text-destructive text-sm">
                  {formatKES(combined.debtSales)}
                </span>
              </div>
            )}

            {/* Bar chart comparison */}
            <Card className="bg-card border-border shadow-none">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Store className="h-4 w-4 text-primary" />
                  Shop Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false} tickLine={false}
                      />
                      <YAxis
                        tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false} tickLine={false}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) => [formatKES(v), name]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", color: "hsl(var(--card-foreground))" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      <Bar dataKey="Revenue" fill="hsl(75 100% 50%)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="Profit" fill="hsl(150 60% 45%)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      <Bar dataKey="Debt" fill="hsl(0 70% 55%)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Per-shop breakdown */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
                Per Shop
              </p>
              <div className="space-y-3">
                <ShopBreakdown
                  shopName={SHOP_A_NAME}
                  color={SHOP_A_COLOR}
                  data={dataA}
                  isLoading={loadingA}
                />
                <ShopBreakdown
                  shopName={SHOP_B_NAME}
                  color={SHOP_B_COLOR}
                  data={dataB}
                  isLoading={loadingB}
                />
              </div>
            </div>

            {/* Revenue split */}
            <Card className="bg-card border-border shadow-none">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <Percent className="h-4 w-4 text-primary" />
                  Revenue Split
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
                {[
                  { name: SHOP_A_NAME, color: SHOP_A_COLOR, pct: pctA },
                  { name: SHOP_B_NAME, color: SHOP_B_COLOR, pct: pctB },
                ].map(shop => (
                  <div key={shop.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: shop.color }} />
                        {shop.name}
                      </span>
                      <span className="font-mono text-muted-foreground">{shop.pct.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${shop.pct}%`, background: shop.color }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
            <AlertTriangle className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No data available</p>
          </div>
        )}
      </div>
    </div>
  );
}
