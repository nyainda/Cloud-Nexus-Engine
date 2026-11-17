import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import { Users, TrendingUp } from "lucide-react";
import { formatBusinessDate, type CustomerInsightRow } from "./nursery-utils";

export function NurseryInsightsTab({
  isLoading,
  isError,
  rows,
  onRetry,
}: {
  isLoading: boolean;
  isError: boolean;
  rows: CustomerInsightRow[] | undefined;
  onRetry: () => void;
}) {
  return (
    <TabsContent value="insights" className="mt-4 space-y-4 focus-visible:outline-none">
      <Card className="rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" /> Customer Buying Insights</CardTitle>
          <p className="text-xs text-muted-foreground">Named customers ranked by seedling spend for the selected period.</p>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading customer insights…</p>
          ) : isError ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-destructive">Could not load customer insights.</p>
              <Button type="button" size="sm" variant="outline" className="mt-3" onClick={onRetry}>Try again</Button>
            </div>
          ) : !rows?.length ? (
            <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No named customer purchases in this date range yet. Attach a customer when recording a sale to see buying patterns.</p>
          ) : (() => {
            const grouped = new Map<string, { name: string; phone: string; quantity: number; totalCents: number; lastPurchase: string; varieties: Map<string, number> }>();
            for (const row of rows) {
              const item = grouped.get(row.customerKey) ?? { name: row.customerName, phone: row.customerPhone, quantity: 0, totalCents: 0, lastPurchase: row.lastPurchase, varieties: new Map<string, number>() };
              item.quantity += Number(row.quantity || 0);
              item.totalCents += Number(row.totalAmountCents || 0);
              if (row.lastPurchase > item.lastPurchase) item.lastPurchase = row.lastPurchase;
              item.varieties.set(row.varietyName, (item.varieties.get(row.varietyName) ?? 0) + Number(row.quantity || 0));
              grouped.set(row.customerKey, item);
            }
            const customers = [...grouped.values()].sort((a, b) => b.totalCents - a.totalCents);
            return (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-muted/30 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customers Buying</p><p className="mt-1 text-2xl font-bold font-mono">{customers.length}</p></div>
                  <div className="rounded-2xl border border-border bg-muted/30 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Named Seedlings Sold</p><p className="mt-1 text-2xl font-bold font-mono">{customers.reduce((sum, customer) => sum + customer.quantity, 0).toLocaleString()}</p></div>
                  <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Named Sales Value</p><p className="mt-1 text-2xl font-bold font-mono text-primary">{formatKES(customers.reduce((sum, customer) => sum + customer.totalCents, 0) / 100)}</p></div>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {customers.map((customer) => {
                    const favorite = [...customer.varieties.entries()].sort((a, b) => b[1] - a[1])[0];
                    return (
                      <div key={customer.name.toLowerCase()} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="h-10 w-10 rounded-xl bg-primary/12 text-primary font-bold flex items-center justify-center shrink-0">
                            {customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">{customer.phone || "No phone"} · {formatBusinessDate(customer.lastPurchase)}</p>
                            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              <TrendingUp className="h-3 w-3 text-primary" />
                              Top: {favorite?.[0] ?? "—"} ({favorite?.[1].toLocaleString() ?? "0"})
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-bold font-mono tabular-nums text-primary">{formatKES(customer.totalCents / 100)}</p>
                          <p className="text-[11px] font-mono text-muted-foreground">{customer.quantity.toLocaleString()} plants</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
