import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import { Banknote, Leaf, RefreshCw, Pencil, BarChart3, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import { cents, type MonthlyCategory, type MonthlySummaryData } from "./nursery-utils";

export function NurseryOverviewTab({
  selectedMonth,
  onSelectedMonthChange,
  monthSummary,
  monthCategories,
  monthPaymentTotals,
  topMonthCategory,
  monthlySummaryData,
  monthlySummaryLoading,
  monthlySummaryError,
  monthlySummaryFetching,
  onRefreshMonthSummary,
  onManageCategories,
  onAssignUncategorized,
}: {
  selectedMonth: string;
  onSelectedMonthChange: (value: string) => void;
  monthSummary: { seedlingsSold: number; totalRevenueCents: number };
  monthCategories: MonthlyCategory[];
  monthPaymentTotals: { cash: number; mpesa: number; credit: number };
  topMonthCategory: MonthlyCategory | undefined;
  monthlySummaryData: MonthlySummaryData | undefined;
  monthlySummaryLoading: boolean;
  monthlySummaryError: boolean;
  monthlySummaryFetching: boolean;
  onRefreshMonthSummary: () => void;
  onManageCategories: () => void;
  onAssignUncategorized: () => void;
}) {
  return (
    <TabsContent value="overview" className="mt-4 space-y-5 focus-visible:outline-none">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1fr_auto]">
        <Card className="rounded-2xl border-primary/25 bg-primary/[0.06] overflow-hidden">
          <CardContent className="flex h-full min-h-[112px] flex-col justify-center gap-2 p-4">
            <Label htmlFor="nursery-month" className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              Active Month
            </Label>
            <Input
              data-testid="input-nursery-month"
              id="nursery-month"
              type="month"
              value={selectedMonth}
              onChange={event => onSelectedMonthChange(event.target.value)}
              className="h-10 rounded-xl bg-card text-sm font-bold"
            />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex h-full min-h-[112px] items-center gap-3.5 p-4">
            <div className="rounded-2xl bg-primary/12 border border-primary/25 p-3 text-primary">
              <Leaf className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Seedlings Sold</p>
              <p data-testid="text-month-seedlings" className="mt-1 text-2xl font-bold font-mono tabular-nums">
                {Number(monthSummary.seedlingsSold).toLocaleString()}
              </p>
              <p className="text-[11px] text-muted-foreground">selected month</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex h-full min-h-[112px] items-center gap-3.5 p-4">
            <div className="rounded-2xl bg-emerald-500/12 border border-emerald-500/25 p-3 text-emerald-400">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Sales Revenue</p>
              <p data-testid="text-month-revenue" className="mt-1 text-2xl font-bold font-mono tabular-nums text-primary">
                {formatKES(cents(Number(monthSummary.totalRevenueCents)))}
              </p>
              <p className="text-[11px] text-muted-foreground">recorded value</p>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="flex h-full min-h-[112px] items-center gap-3.5 p-4">
            <div className="rounded-2xl bg-sky-500/12 border border-sky-500/25 p-3 text-sky-400">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Categories</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{monthCategories.length}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {topMonthCategory ? `Top · ${topMonthCategory.category}` : "No sales yet"}
              </p>
            </div>
          </CardContent>
        </Card>

        <Button
          data-testid="button-refresh-month-summary"
          type="button"
          variant="outline"
          className="h-auto min-h-14 rounded-2xl gap-2 self-stretch sm:col-span-2 xl:col-span-1 cursor-pointer"
          onClick={onRefreshMonthSummary}
          disabled={monthlySummaryFetching}
        >
          <RefreshCw className={`h-4 w-4 ${monthlySummaryFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Payment Mix Visual Card */}
      <Card className="rounded-3xl overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Payment Breakdown</p>
            <CardTitle className="mt-1 text-lg">Where sales landed</CardTitle>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Cash <b className="font-mono">{formatKES(cents(monthPaymentTotals.cash))}</b></span>
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-sky-400" />M-Pesa <b className="font-mono">{formatKES(cents(monthPaymentTotals.mpesa))}</b></span>
            <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-violet-400" />Credit <b className="font-mono">{formatKES(cents(monthPaymentTotals.credit))}</b></span>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5 space-y-4">
          {(() => {
            const revenue = Number(monthSummary.totalRevenueCents) || 0;
            const cashPct = revenue > 0 ? (monthPaymentTotals.cash / revenue) * 100 : 0;
            const mpesaPct = revenue > 0 ? (monthPaymentTotals.mpesa / revenue) * 100 : 0;
            const creditPct = revenue > 0 ? (monthPaymentTotals.credit / revenue) * 100 : 0;
            return (
              <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
                {cashPct > 0 && <div className="bg-amber-400 h-full transition-all" style={{ width: `${cashPct}%` }} />}
                {mpesaPct > 0 && <div className="bg-sky-400 h-full transition-all" style={{ width: `${mpesaPct}%` }} />}
                {creditPct > 0 && <div className="bg-violet-400 h-full transition-all" style={{ width: `${creditPct}%` }} />}
              </div>
            );
          })()}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Cash", amount: monthPaymentTotals.cash, tone: "bg-amber-400", text: "text-amber-400" },
              { label: "M-Pesa", amount: monthPaymentTotals.mpesa, tone: "bg-sky-400", text: "text-sky-400" },
              { label: "Credit", amount: monthPaymentTotals.credit, tone: "bg-violet-400", text: "text-violet-400" },
            ].map(item => {
              const revenue = Number(monthSummary.totalRevenueCents) || 0;
              const share = revenue > 0 ? Math.min(100, Math.round((item.amount / revenue) * 100)) : 0;
              return (
                <div key={item.label} className="rounded-2xl border border-border/70 bg-muted/25 p-3.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-foreground">{item.label}</span>
                    <span className={cn("font-mono font-bold", item.text)}>{share}%</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${item.tone} transition-[width] duration-300`} style={{ width: `${share}%` }} />
                  </div>
                  <p className="mt-2.5 text-base font-bold font-mono tabular-nums">{formatKES(cents(item.amount))}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Monthly Categories Table */}
      <Card className="rounded-3xl overflow-hidden">
        <CardHeader className="flex flex-col gap-3 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              Monthly sales by category
            </CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Totals reflect each variety&apos;s current category.</p>
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2 rounded-xl cursor-pointer" onClick={onManageCategories}>
            <Boxes className="h-4 w-4" />
            Manage categories
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {monthlySummaryLoading ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Loading this month&apos;s nursery totals…</p>
          ) : monthlySummaryError ? (
            <div className="p-8 text-center">
              <p className="font-medium text-destructive">Could not load monthly totals</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRefreshMonthSummary}>Try again</Button>
            </div>
          ) : !(monthlySummaryData?.categories.length) ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No nursery sales have been recorded for this month.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="px-5 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Varieties</th>
                    <th className="px-4 py-3 text-right">Plants Sold</th>
                    <th className="px-4 py-3 text-right">Sales Value</th>
                    <th className="px-5 py-3">Payment Mix</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlySummaryData.categories.map(category => (
                    <tr key={category.category} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold">{category.category}</span>
                          {category.category.trim().toLowerCase() === "uncategorized" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1.5 px-2 text-[11px] rounded-lg"
                              onClick={onAssignUncategorized}
                            >
                              <Pencil className="h-3 w-3" /> Assign categories
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">{Number(category.varietyCount).toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-right font-bold font-mono tabular-nums">{Number(category.seedlingsSold).toLocaleString()}</td>
                      <td className="px-4 py-3.5 text-right font-bold font-mono tabular-nums text-primary">{formatKES(cents(Number(category.totalRevenueCents)))}</td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono">
                        Cash {formatKES(cents(Number(category.cashCents)))} · M-Pesa {formatKES(cents(Number(category.mpesaCents)))} · Credit {formatKES(cents(Number(category.creditCents)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
