import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/format";
import {
  Package, Trophy, ClipboardCheck, X, Share2, CheckCheck, Wallet, ReceiptText,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function CashUpModal({
  dashboard,
  shopName,
  onClose,
}: {
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
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-border/80 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/70 shrink-0 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 text-primary flex items-center justify-center">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold tracking-normal">End-of-Day Cash-Up</h2>
              <p className="text-[11px] text-muted-foreground">{dateLabel} · {timeLabel}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1">
          {/* Big Cash in Till */}
          <div className="bg-primary/8 border-b border-primary/20 px-5 py-5 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-bold uppercase tracking-widest text-primary">Cash in Till</p>
            </div>
            <p className="font-display text-4xl font-bold tabular-nums text-foreground">{formatKES(netCashInTill)}</p>
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
