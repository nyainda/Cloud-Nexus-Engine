import { useState, useMemo } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  RotateCcw, ChevronLeft, ChevronRight, TrendingDown,
  Clock, User, Tag, Receipt, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, subDays } from "date-fns";
import { useLocation } from "wouter";

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function prevDay(iso: string) {
  return format(subDays(new Date(iso + "T12:00:00"), 1), "yyyy-MM-dd");
}
function nextDay(iso: string) {
  return format(subDays(new Date(iso + "T12:00:00"), -1), "yyyy-MM-dd");
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-KE", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}
function fmtTime(isoStr: string) {
  return new Date(isoStr).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
}
function formatKES(n: number | null | undefined) {
  if (n == null) return "—";
  return "KES " + Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Return History Card ───────────────────────────────────────────────────────
function ReturnHistoryCard({ ret }: { ret: any }) {
  const [expanded, setExpanded] = useState(false);

  const items: Array<{ productName: string; qty: number; unitPrice: number; refundAmount: number }> =
    useMemo(() => {
      try { return JSON.parse(ret.itemsJson ?? "[]"); } catch { return []; }
    }, [ret.itemsJson]);

  const isSaleReturn = ret.saleId && ret.saleId !== "standalone";
  const amPm = new Date(ret.createdAt).getHours() >= 12 ? "PM" : "AM";

  return (
    <button
      onClick={() => setExpanded(e => !e)}
      className="w-full text-left bg-card border border-border rounded-xl overflow-hidden hover:border-primary/20 transition-all"
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Time badge */}
          <div className="w-10 h-10 rounded-xl bg-muted/40 border border-border flex flex-col items-center justify-center shrink-0">
            <Clock className="h-3 w-3 text-muted-foreground mb-0.5" />
            <span className="text-[9px] font-bold text-foreground leading-none">
              {fmtTime(ret.createdAt).split(" ")[0]}
            </span>
            <span className="text-[7px] text-muted-foreground leading-none uppercase">{amPm}</span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="text-sm font-bold">
                {items.length === 1 ? items[0].productName : `${items.length} products returned`}
              </p>
              {isSaleReturn && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-400">
                  Linked to Sale
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1 mb-1.5">
              {items.slice(0, expanded ? items.length : 2).map((it, i) => (
                <span key={i} className="text-[10px] bg-muted/60 rounded-md px-1.5 py-0.5 text-muted-foreground font-medium">
                  {it.qty}× {it.productName.length > 22 ? it.productName.slice(0, 22) + "…" : it.productName}
                </span>
              ))}
              {!expanded && items.length > 2 && (
                <span className="text-[10px] text-primary font-bold px-1">+{items.length - 2} more</span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              {ret.reason && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Tag className="h-2.5 w-2.5" />{ret.reason}
                </span>
              )}
              {ret.processedBy && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <User className="h-2.5 w-2.5" />{ret.processedBy}
                </span>
              )}
            </div>
          </div>

          {/* Amount */}
          <div className="text-right shrink-0">
            <p className="text-sm font-bold font-mono text-primary">{formatKES(ret.totalRefund)}</p>
            <p className="text-[10px] text-muted-foreground">refund</p>
          </div>
        </div>

        {/* Expanded line items */}
        {expanded && items.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="font-medium flex-1 min-w-0 truncate pr-2">{it.productName}</span>
                <span className="text-muted-foreground mr-3 shrink-0">{it.qty} × {formatKES(it.unitPrice)}</span>
                <span className="font-bold font-mono text-primary shrink-0">{formatKES(it.refundAmount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Returns Page ──────────────────────────────────────────────────────────────
export default function ReturnsPage() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [, navigate] = useLocation();

  const [date, setDate] = useState(isoToday);
  const isToday = date === isoToday();
  const canGoNext = date < isoToday();

  const { data: returnHistory, isLoading } = useQuery<any[]>({
    queryKey: ["returns", shopId, date],
    queryFn: () =>
      customFetch<any[]>(`/api/returns?shopId=${shopId}&date=${date}`),
    enabled: !!shopId,
    refetchInterval: 30_000,
  });

  const returns: any[] = returnHistory ?? [];
  const totalRefunded = returns.reduce((s, r) => s + (r.totalRefund ?? 0), 0);
  const totalItemCount = returns.reduce((s: number, r: any) => {
    try { return s + JSON.parse(r.itemsJson ?? "[]").length; } catch { return s; }
  }, 0);

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* ── Header ── */}
      <div className="px-4 pt-4 pb-3 border-b border-border bg-card shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-display">Returns</h1>
              <p className="text-[10px] text-muted-foreground">
                {isToday ? "Today" : fmtDate(date)}
              </p>
            </div>
          </div>

          {/* Date nav */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDate(d => prevDay(d))}
              className="w-8 h-8 rounded-lg border border-border bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDate(isoToday)}
              className={cn(
                "h-8 px-3 rounded-lg border text-xs font-bold transition-colors",
                isToday
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {isToday ? "Today" : "Today"}
            </button>
            <button
              onClick={() => setDate(d => nextDay(d))}
              disabled={!canGoNext}
              className="w-8 h-8 rounded-lg border border-border bg-muted/30 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Stats */}
        {!isLoading && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-center">
              <p className="text-xl font-bold font-mono">{returns.length}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Returns</p>
            </div>
            <div className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-center">
              <p className="text-xl font-bold font-mono">{totalItemCount}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Items</p>
            </div>
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-center">
              <p className="text-sm font-bold font-mono text-primary leading-none mt-0.5">
                {totalRefunded > 0 ? formatKES(totalRefunded) : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Refunded</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-6">

        {/* Process Return CTA */}
        <button
          onClick={() => navigate("/sales-history")}
          className="w-full flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3.5 hover:bg-primary/10 transition-colors group"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Receipt className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-bold text-primary">Process a Return</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Open a sale in Sales History and tap the Return button
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-primary/60 group-hover:text-primary transition-colors shrink-0" />
        </button>

        {/* History */}
        {isLoading ? (
          <div className="space-y-2 pt-1">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[72px] rounded-xl border border-border bg-muted/20 animate-pulse" />
            ))}
          </div>
        ) : returns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <TrendingDown className="h-10 w-10 opacity-10" />
            <p className="text-sm font-semibold">No returns {isToday ? "today" : "on this day"}</p>
            <p className="text-xs opacity-60">Returns processed from Sales History appear here</p>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-0.5 pt-1">
              Return History · {isToday ? "Today" : fmtDate(date)}
            </p>
            <div className="space-y-2">
              {returns.map((r: any) => (
                <ReturnHistoryCard key={r.id} ret={r} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
