import { useState } from "react";
import { useListSales, useGetSale, useDeleteSale, getListSalesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Receipt, ChevronDown, ChevronUp, Trash2, Calendar,
  ChevronLeft, ChevronRight, CreditCard,
  TrendingUp, ShoppingBag, Banknote, Clock, User, Package
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, subDays, isToday } from "date-fns";
import { cn } from "@/lib/utils";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "KES " + Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function SaleDetail({ saleId, isOwner, onVoid }: { saleId: string; isOwner: boolean; onVoid: () => void }) {
  const { data: sale, isLoading } = useGetSale(saleId, { query: { enabled: !!saleId } });

  if (isLoading) return (
    <div className="px-4 py-4 space-y-2 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-4 bg-muted rounded w-3/4" />)}
    </div>
  );
  if (!sale) return null;

  return (
    <div className="border-t border-border">
      <div className="px-4 py-3 space-y-1.5">
        {(sale.items || []).map((item: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-3 py-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded border border-border flex items-center justify-center shrink-0">
                <Package className="h-3 w-3 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{item.productName}</p>
                <p className="text-xs text-muted-foreground">{item.qty} × {fmt(item.unitPrice)}</p>
              </div>
            </div>
            <p className="text-sm font-bold font-mono shrink-0">{fmt(item.totalPrice)}</p>
          </div>
        ))}
      </div>

      <Separator />

      <div className="px-4 py-3 space-y-1.5">
        {sale.discount > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Discount</span>
            <span className="text-destructive font-semibold">- {fmt(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="font-bold">Total</span>
          <span className="font-bold font-mono">{fmt(sale.totalAmount)}</span>
        </div>
        {isOwner && sale.totalProfit != null && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Profit</span>
            <span className={cn("font-semibold", (sale.totalProfit ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
              {fmt(sale.totalProfit)}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 pb-3 gap-3">
        <div className="text-xs text-muted-foreground space-y-0.5">
          {sale.servedBy && <p>Served by <span className="font-medium text-foreground">{sale.servedBy}</span></p>}
          <p className="font-mono text-muted-foreground/60">{sale.id.slice(0, 8).toUpperCase()}</p>
        </div>
        {isOwner && (
          <Button variant="destructive" size="sm" onClick={onVoid} className="text-xs h-8">
            <Trash2 className="h-3 w-3 mr-1" />Void Sale
          </Button>
        )}
      </div>
    </div>
  );
}

function VoidDialog({ saleId, open, onClose }: { saleId: string | null; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const del = useDeleteSale();
  const role = localStorage.getItem("greenlink_role") || "owner";

  const handleVoid = () => {
    if (!saleId) return;
    del.mutate(
      { saleId, data: { reason: reason.trim() || "Voided by owner", performedBy: role } },
      {
        onSuccess: () => { toast.success("Sale voided"); qc.invalidateQueries({ queryKey: getListSalesQueryKey() }); setReason(""); onClose(); },
        onError: () => toast.error("Failed to void sale"),
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-destructive">Void Sale</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">This will permanently cancel the sale and restore stock. This cannot be undone.</p>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Reason (optional)</Label>
            <input
              autoFocus value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Customer returned items"
              className="flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleVoid} disabled={del.isPending}>
            {del.isPending ? "Voiding…" : "Confirm Void"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SaleRow({ sale, isOwner }: { sale: any; isOwner: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [voidTarget, setVoidTarget] = useState<string | null>(null);
  const time = format(new Date(sale.createdAt), "HH:mm");
  const isDebt = sale.saleType === "debt";

  return (
    <>
      <VoidDialog saleId={voidTarget} open={!!voidTarget} onClose={() => setVoidTarget(null)} />
      <Card className={cn("shadow-none transition-colors", expanded ? "border-primary/40" : "border-border")}>
        <button onClick={() => setExpanded(e => !e)} className="w-full text-left">
          <CardContent className="p-3 flex items-center gap-3">
            <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
              isDebt ? "border-amber-300 dark:border-amber-800" : "border-emerald-300 dark:border-emerald-800")}>
              {isDebt
                ? <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                : <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={cn("text-[10px] h-4 px-1.5 border-0",
                  isDebt ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400")}>
                  {isDebt ? "Debt" : "Cash"}
                </Badge>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />{time}
                </span>
                {sale.servedBy && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                    <User className="h-3 w-3" />{sale.servedBy}
                  </span>
                )}
              </div>
              {sale.discount > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">Discount {fmt(sale.discount)}</p>
              )}
            </div>

            <div className="text-right shrink-0">
              <p className="text-base font-bold font-mono">{fmt(sale.totalAmount)}</p>
              {isOwner && sale.totalProfit != null && (
                <p className={cn("text-xs font-semibold font-mono", (sale.totalProfit ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                  +{fmt(sale.totalProfit)}
                </p>
              )}
            </div>
            <div className="shrink-0">
              {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </CardContent>
        </button>

        {expanded && (
          <SaleDetail saleId={sale.id} isOwner={isOwner} onVoid={() => setVoidTarget(sale.id)} />
        )}
      </Card>
    </>
  );
}

export default function SalesHistory() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";

  const [date, setDate] = useState(new Date());
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: sales, isLoading } = useListSales(
    { shopId, date: dateStr, limit: 100 },
    { query: { enabled: !!shopId } }
  );

  const list = (sales || []) as any[];
  const totalRevenue = list.reduce((a, s) => a + (s.totalAmount ?? 0), 0);
  const totalProfit = list.reduce((a, s) => a + (s.totalProfit ?? 0), 0);
  const cashCount = list.filter(s => s.saleType === "cash").length;
  const debtCount = list.filter(s => s.saleType === "debt").length;
  const todayFlag = isToday(date);

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">Sales History</h1>
            <p className="text-sm text-muted-foreground">
              {todayFlag ? "Today's transactions" : format(date, "EEEE, d MMMM yyyy")}
            </p>
          </div>

          {/* Date navigation */}
          <div className="flex items-center gap-1 border border-border rounded-xl p-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDate(d => subDays(d, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1 px-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-bold min-w-[70px] text-center">
                {todayFlag ? "Today" : format(date, "d MMM")}
              </span>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (!todayFlag) setDate(d => addDays(d, 1)); }} disabled={todayFlag}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="shadow-none">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Transactions</p>
              </div>
              <p className="text-xl font-bold font-mono">{list.length}</p>
              <p className="text-xs text-muted-foreground">{cashCount} cash · {debtCount} debt</p>
            </CardContent>
          </Card>
          <Card className="shadow-none">
            <CardContent className="p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Banknote className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Revenue</p>
              </div>
              <p className="text-xl font-bold font-mono">
                {totalRevenue > 0 ? "KES " + totalRevenue.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
              </p>
            </CardContent>
          </Card>
          {isOwner && (
            <>
              <Card className="shadow-none">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Profit</p>
                  </div>
                  <p className={cn("text-xl font-bold font-mono", totalProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {totalProfit !== 0 ? "KES " + totalProfit.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
                  </p>
                </CardContent>
              </Card>
              <Card className="shadow-none">
                <CardContent className="p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Margin</p>
                  </div>
                  <p className="text-xl font-bold font-mono">
                    {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) + "%" : "—"}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Transaction list */}
      <div className="px-4 py-4 space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-16 rounded-xl border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Receipt className="h-10 w-10 opacity-20 mb-4" />
            <p className="font-bold">No sales {todayFlag ? "yet today" : "on this day"}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {todayFlag ? "Transactions will appear here as they're processed" : "Try a different date"}
            </p>
          </div>
        ) : (
          list.map((sale: any) => <SaleRow key={sale.id} sale={sale} isOwner={isOwner} />)
        )}
      </div>
    </div>
  );
}
