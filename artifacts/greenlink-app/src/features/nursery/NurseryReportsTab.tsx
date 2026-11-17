import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import { RefreshCw } from "lucide-react";
import { cents, formatBusinessDate, type ReportData, type ReportRow } from "./nursery-utils";

export function NurseryReportsTab({
  from,
  to,
  businessDate,
  report,
  reportRows,
  reportTotal,
  reportPage,
  reportPageSize,
  reportPageCount,
  reportLoading,
  reportError,
  reportFetching,
  onRefreshReport,
  onReportPageChange,
}: {
  from: string;
  to: string;
  businessDate: string;
  report: ReportData | undefined;
  reportRows: ReportRow[];
  reportTotal: number;
  reportPage: number;
  reportPageSize: number;
  reportPageCount: number;
  reportLoading: boolean;
  reportError: boolean;
  reportFetching: boolean;
  onRefreshReport: () => void;
  onReportPageChange: (nextPage: number | ((prev: number) => number)) => void;
}) {
  return (
    <TabsContent value="reports" className="mt-4 space-y-4 focus-visible:outline-none">
      <Card className="rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-lg">Nursery Sales Report</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Compare the selected working day with the full reporting period.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="rounded-xl border border-border bg-background/70 px-3 py-1.5 text-xs font-semibold font-mono tabular-nums">
                {formatBusinessDate(from)} <span className="px-1 text-muted-foreground">to</span> {formatBusinessDate(to)}
              </span>
              <Button data-testid="button-refresh-nursery-report" type="button" size="icon" variant="outline" aria-label="Refresh report" className="rounded-xl" disabled={reportFetching} onClick={onRefreshReport}>
                <RefreshCw className={"h-4 w-4 " + (reportFetching ? "animate-spin" : "")} />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-5">
          {reportLoading && !report ? (
            <div className="space-y-3 py-3"><div className="h-24 animate-pulse rounded-2xl bg-muted/60" /><div className="h-12 animate-pulse rounded-2xl bg-muted/40" /><div className="h-40 animate-pulse rounded-2xl bg-muted/30" /></div>
          ) : reportError && !report ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-destructive">Could not load report. Check your connection and try refreshing.</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRefreshReport}>Try again</Button>
            </div>
          ) : report ? (
            <div className="space-y-5">
              <section aria-label="Selected sale date summary" className="rounded-2xl border border-primary/35 bg-gradient-to-br from-primary/15 via-primary/[0.06] to-card p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Selected Sale Date</p>
                    <p className="mt-1 text-base font-bold">{formatBusinessDate(businessDate)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                    <div>
                      <p className="text-[11px] text-muted-foreground">Seedlings Sold</p>
                      <p data-testid="text-report-daily-seedlings" className="mt-0.5 text-2xl font-bold font-mono tabular-nums">
                        {Number(report.dailySummary?.totalSeedlings ?? 0).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">Sales Value</p>
                      <p data-testid="text-report-daily-revenue" className="mt-0.5 text-2xl font-bold font-mono tabular-nums text-primary">
                        {formatKES(cents(report.dailySummary?.totalRevenueCents))}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs sm:max-w-[520px]">
                  <p><span className="block text-muted-foreground">Cash</span><span className="mt-0.5 block font-bold font-mono">{formatKES(cents(report.dailySummary?.cashCents))}</span></p>
                  <p><span className="block text-muted-foreground">M-Pesa</span><span className="mt-0.5 block font-bold font-mono">{formatKES(cents(report.dailySummary?.mpesaCents))}</span></p>
                  <p><span className="block text-muted-foreground">Credit</span><span className="mt-0.5 block font-bold font-mono">{formatKES(cents(report.dailySummary?.creditCents))}</span></p>
                </div>
              </section>

              <section aria-label="Reporting period summary" className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-muted/25 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Selected Period · Seedlings Sold</p>
                  <p data-testid="text-report-range-seedlings" className="mt-1 text-2xl font-bold font-mono tabular-nums">{Number(report.summary?.totalSeedlings ?? 0).toLocaleString()}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatBusinessDate(from)} to {formatBusinessDate(to)}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/25 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Selected Period · Sales Value</p>
                  <p data-testid="text-report-range-revenue" className="mt-1 text-2xl font-bold font-mono tabular-nums text-primary">{formatKES(cents(report.summary?.totalRevenueCents))}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
                    <span>Cash {formatKES(cents(report.summary?.cashCents))}</span>
                    <span>M-Pesa {formatKES(cents(report.summary?.mpesaCents))}</span>
                    <span>Credit {formatKES(cents(report.summary?.creditCents))}</span>
                  </div>
                </div>
              </section>

              {reportFetching && <p role="status" className="text-xs text-muted-foreground">Updating report…</p>}
              {reportRows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No seedling sales found for this date range.</p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto rounded-2xl border border-border/70 md:block">
                    <table className="w-full min-w-[680px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          <th className="px-4 py-3">Variety</th>
                          <th className="px-4 py-3 text-right">Plants Sold</th>
                          <th className="px-4 py-3 text-right">Sales Value</th>
                          <th className="px-4 py-3">Payment Mix</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map((row, index) => (
                          <tr key={row.varietyKey ?? `${row.varietyId ?? row.varietyName.trim().toLowerCase()}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/25">
                            <td className="px-4 py-3 font-bold">{row.varietyName}</td>
                            <td className="px-4 py-3 text-right font-bold font-mono tabular-nums">{Number(row.quantity).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right font-bold font-mono tabular-nums text-primary">{formatKES(cents(Number(row.totalAmountCents)))}</td>
                            <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                              <div className="flex flex-wrap gap-x-3 gap-y-1">
                                <span>Cash {formatKES(cents(Number(row.cashCents)))}</span>
                                <span>M-Pesa {formatKES(cents(Number(row.mpesaCents)))}</span>
                                <span>Credit {formatKES(cents(Number(row.creditCents)))}</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2.5 md:hidden">
                    {reportRows.map((row, index) => (
                      <article key={row.varietyKey ?? `${row.varietyId ?? row.varietyName.trim().toLowerCase()}-${index}`} data-testid={`card-report-variety-${index}`} className="rounded-2xl border border-border bg-card p-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-bold">{row.varietyName}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground">{Number(row.quantity).toLocaleString()} seedlings sold</p>
                          </div>
                          <p className="shrink-0 text-sm font-bold font-mono text-primary">{formatKES(cents(Number(row.totalAmountCents)))}</p>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-xs font-mono">
                          <p className="text-muted-foreground">Cash<span className="mt-0.5 block font-bold text-foreground">{formatKES(cents(Number(row.cashCents)))}</span></p>
                          <p className="text-muted-foreground">M-Pesa<span className="mt-0.5 block font-bold text-foreground">{formatKES(cents(Number(row.mpesaCents)))}</span></p>
                          <p className="text-muted-foreground">Credit<span className="mt-0.5 block font-bold text-foreground">{formatKES(cents(Number(row.creditCents)))}</span></p>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : null}

          {reportTotal > 0 && (
            <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Showing {((reportPage - 1) * reportPageSize + 1).toLocaleString()}–{Math.min(reportPage * reportPageSize, reportTotal).toLocaleString()} of {reportTotal.toLocaleString()} · Page {reportPage} of {reportPageCount}</p>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={reportPage <= 1 || reportFetching} onClick={() => onReportPageChange(page => Math.max(1, page - 1))}>Previous</Button>
                <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={reportPage >= reportPageCount || reportFetching} onClick={() => onReportPageChange(page => Math.min(reportPageCount, page + 1))}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
