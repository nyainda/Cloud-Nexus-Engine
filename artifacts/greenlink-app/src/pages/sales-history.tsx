import { useState, useMemo } from "react";
import {
  useListSales, useGetSale, useDeleteSale, getListSalesQueryKey,
  useListSaleReturns, useCreateSaleReturn, getListSaleReturnsQueryKey,
  getListProductsQueryKey, getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
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
  TrendingUp, ShoppingBag, Banknote, Clock, User, Package,
  RotateCcw, Minus, Plus, CheckCircle2, Search, X,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, subDays, isToday } from "date-fns";
import { cn } from "@/lib/utils";

function fmt(n: number | null | undefined) {
  if (n == null) return "—";
  return "KES " + Number(n).toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Return Dialog ────────────────────────────────────────────────────────────
function ReturnDialog({
  saleId,
  open,
  onClose,
  saleItems,
  existingReturns,
  isDebtSale,
  debtCustomerName,
}: {
  saleId: string;
  open: boolean;
  onClose: () => void;
  saleItems: any[];
  existingReturns: any[];
  isDebtSale?: boolean;
  debtCustomerName?: string;
}) {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const qc = useQueryClient();
  const doReturn = useCreateSaleReturn();

  // Compute already-returned qty per item index (match by productId or productName)
  const alreadyReturnedByIdx = useMemo(() => {
    const map: Record<number, number> = {};
    for (const ret of existingReturns) {
      const ritems: any[] = (() => { try { return JSON.parse(ret.itemsJson ?? "[]"); } catch { return []; } })();
      for (const ri of ritems) {
        const idx = saleItems.findIndex(si =>
          (ri.productId && si.productId && ri.productId === si.productId) ||
          ri.productName === si.productName
        );
        if (idx >= 0) map[idx] = (map[idx] ?? 0) + (ri.qty ?? 0);
      }
    }
    return map;
  }, [existingReturns, saleItems]);

  // maxReturnable per item = sold - already returned
  const maxReturnableByIdx = useMemo(() =>
    Object.fromEntries(saleItems.map((item, i) => [i, Math.max(0, (item.qty ?? 0) - (alreadyReturnedByIdx[i] ?? 0))])),
    [saleItems, alreadyReturnedByIdx]
  );

  const allFullyReturned = saleItems.every((_, i) => maxReturnableByIdx[i] === 0);

  const [returnQtys, setReturnQtys] = useState<Record<number, number>>(() =>
    Object.fromEntries(saleItems.map((_, i) => [i, 0]))
  );
  const [reason, setReason] = useState("");

  const totalRefund = saleItems.reduce((sum, item, i) => {
    return sum + (returnQtys[i] ?? 0) * (item.unitPrice ?? 0);
  }, 0);
  const hasSelection = Object.values(returnQtys).some(q => q > 0);

  function setQty(idx: number, val: number) {
    const max = maxReturnableByIdx[idx] ?? 0;
    setReturnQtys(prev => ({ ...prev, [idx]: Math.max(0, Math.min(max, val)) }));
  }

  function handleSubmit() {
    const items = saleItems
      .map((item, i) => ({
        productId: item.productId ?? null,
        productName: item.productName,
        qty: returnQtys[i] ?? 0,
        unitPrice: item.unitPrice ?? 0,
        refundAmount: (returnQtys[i] ?? 0) * (item.unitPrice ?? 0),
      }))
      .filter(it => it.qty > 0);

    if (items.length === 0) return;

    doReturn.mutate(
      { saleId, data: { shopId, reason: reason.trim() || undefined, processedBy: role, items } },
      {
        onSuccess: () => {
          toast.success(`Return processed — ${fmt(totalRefund)} refund`);
          // Invalidate sales list so totals update immediately
          qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
          // Invalidate the returns shown inside this sale's detail panel
          qc.invalidateQueries({ queryKey: getListSaleReturnsQueryKey(saleId) });
          // Invalidate the Returns page ("returns" prefix covers all dates/shops)
          qc.invalidateQueries({ queryKey: ["returns"] });
          // Stock is restored on return — refresh products + inventory immediately
          qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
          setReturnQtys(Object.fromEntries(saleItems.map((_, i) => [i, 0])));
          setReason("");
          onClose();
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error ?? err?.message ?? "Failed to process return";
          toast.error(msg);
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <RotateCcw className="h-3.5 w-3.5 text-primary" />
            </div>
            Process Return
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Stock is automatically restored. Only unsold quantities can be returned.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {allFullyReturned ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-emerald-500">All Items Returned</p>
              <p className="text-xs text-muted-foreground">Every item from this sale has already been returned.</p>
            </div>
          ) : (
            <>
              {/* Debt sale notice */}
              {isDebtSale && (
                <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/20 rounded-xl px-3.5 py-3">
                  <CreditCard className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-blue-400">Debt Sale</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {debtCustomerName
                        ? <><span className="font-medium text-foreground">{debtCustomerName}</span>'s debt balance will automatically be reduced by the refund amount.</>
                        : "The customer's outstanding debt balance will automatically be reduced by the refund amount."
                      }
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {saleItems.map((item, i) => {
                  const maxQty = maxReturnableByIdx[i] ?? 0;
                  const alreadyRet = alreadyReturnedByIdx[i] ?? 0;
                  const qty = returnQtys[i] ?? 0;
                  const fullyReturned = maxQty === 0;

                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl border p-3.5 transition-all",
                        fullyReturned ? "opacity-50 bg-muted/10 border-border/40"
                          : qty > 0 ? "border-primary/40 bg-primary/5"
                          : "border-border bg-card"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{item.productName}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {item.qty} sold × {fmt(item.unitPrice)}
                            </span>
                            {alreadyRet > 0 && (
                              <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-md">
                                {alreadyRet} already returned
                              </span>
                            )}
                            {fullyReturned && (
                              <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-0.5">
                                <CheckCircle2 className="h-3 w-3" /> fully returned
                              </span>
                            )}
                          </div>
                        </div>

                        {!fullyReturned && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => setQty(i, qty - 1)}
                              disabled={qty === 0}
                              className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 transition-colors"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className={cn(
                              "w-8 text-center text-sm font-bold font-mono tabular-nums",
                              qty > 0 ? "text-primary" : "text-muted-foreground"
                            )}>
                              {qty}
                            </span>
                            <button
                              onClick={() => setQty(i, qty + 1)}
                              disabled={qty >= maxQty}
                              className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {qty > 0 && (
                        <div className="flex items-center justify-between bg-primary/10 rounded-lg px-2.5 py-1.5">
                          <span className="text-[10px] text-muted-foreground">{qty} × {fmt(item.unitPrice)}</span>
                          <span className="text-xs font-bold font-mono text-primary">+{fmt(qty * (item.unitPrice ?? 0))}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reason (optional)</Label>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Wrong product, defective item…"
                  className="w-full h-10 px-3 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
              </div>

              {hasSelection && (
                <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Refund</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {Object.values(returnQtys).filter(q => q > 0).length} item type{Object.values(returnQtys).filter(q => q > 0).length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <span className="text-xl font-bold font-mono text-primary">{fmt(totalRefund)}</span>
                </div>
              )}
            </>
          )}
        </div>

        {!allFullyReturned && (
          <DialogFooter className="px-5 pb-5 pt-3 border-t border-border gap-2 shrink-0">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!hasSelection || doReturn.isPending}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {doReturn.isPending
                ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin mr-1.5" />
                : <RotateCcw className="h-3.5 w-3.5 mr-1.5" />}
              {doReturn.isPending ? "Processing…" : "Confirm Return"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Sale Detail ──────────────────────────────────────────────────────────────
function SaleDetail({ saleId, isOwner, onVoid }: { saleId: string; isOwner: boolean; onVoid: () => void }) {
  const { data: sale, isLoading } = useGetSale(saleId, { query: { enabled: !!saleId } });
  const { data: existingReturns } = useListSaleReturns(saleId, { query: { enabled: !!saleId } });
  const [returnOpen, setReturnOpen] = useState(false);

  if (isLoading) return (
    <div className="px-4 py-4 space-y-2 animate-pulse">
      {[1, 2, 3].map(i => <div key={i} className="h-4 bg-muted rounded w-3/4" />)}
    </div>
  );
  if (!sale) return null;

  const items = (sale.items || []) as any[];
  const returns = (existingReturns || []) as any[];

  return (
    <div className="border-t border-border">
      {/* Items */}
      <div className="px-4 py-3 space-y-1.5">
        {items.map((item: any, i: number) => (
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

      {/* Totals */}
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

      {/* Existing returns */}
      {returns.length > 0 && (
        <>
          <Separator />
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Returns Processed
            </p>
            {returns.map((r: any) => {
              const returnedItems: any[] = (() => {
                try { return JSON.parse(r.itemsJson); } catch { return []; }
              })();
              return (
                <div key={r.id} className="rounded-lg border border-amber-400/30 bg-amber-50/5 p-2.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-500 font-semibold font-mono">
                      - {fmt(r.totalRefund)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(r.createdAt), "d MMM, HH:mm")}
                    </span>
                  </div>
                  {returnedItems.map((it: any, j: number) => (
                    <p key={j} className="text-xs text-muted-foreground">
                      {it.productName} × {it.qty}
                    </p>
                  ))}
                  {r.reason && (
                    <p className="text-xs text-muted-foreground italic">"{r.reason}"</p>
                  )}
                  {r.processedBy && (
                    <p className="text-xs text-muted-foreground">by {r.processedBy}</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Debt sale indicator */}
      {(sale as any).saleType === "debt" && (
        <>
          <Separator />
          <div className="px-4 py-2.5 flex items-center gap-2">
            <CreditCard className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs text-blue-400 font-semibold">Debt Sale</span>
            <span className="text-[10px] text-muted-foreground">· balance auto-credited on return</span>
          </div>
        </>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between px-4 pb-3 gap-3">
        <div className="text-xs text-muted-foreground space-y-0.5">
          {sale.servedBy && <p>Served by <span className="font-medium text-foreground">{sale.servedBy}</span></p>}
          <p className="font-mono text-muted-foreground/60">{sale.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-2">
          {!sale.isDeleted && items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReturnOpen(true)}
              className="text-xs h-8 border-primary/40 text-primary hover:bg-primary/10"
            >
              <RotateCcw className="h-3 w-3 mr-1" />Return
            </Button>
          )}
          {isOwner && (
            <Button variant="destructive" size="sm" onClick={onVoid} className="text-xs h-8">
              <Trash2 className="h-3 w-3 mr-1" />Void Sale
            </Button>
          )}
        </div>
      </div>

      {returnOpen && (
        <ReturnDialog
          saleId={saleId}
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
          saleItems={items}
          existingReturns={returns}
          isDebtSale={(sale as any).saleType === "debt"}
        />
      )}
    </div>
  );
}

// ─── Void Dialog ──────────────────────────────────────────────────────────────
function VoidDialog({ saleId, open, onClose }: { saleId: string | null; open: boolean; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const del = useDeleteSale();
  const role = localStorage.getItem("greenlink_role") || "owner";

  const handleVoid = () => {
    if (!saleId) return;
    const voidReason = reason.trim() || "Voided by owner";
    setReason(""); onClose();
    (async () => {
      try {
        await del.mutateAsync({ saleId, data: { reason: voidReason, performedBy: role } });
        toast.success("Sale voided");
        qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      } catch {
        toast.error("Failed to void sale — please retry");
      }
    })();
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

// ─── Sale Row ─────────────────────────────────────────────────────────────────
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SalesHistory() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";

  const [date, setDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "cash" | "debt">("all");
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: sales, isLoading } = useListSales(
    { shopId, date: dateStr, limit: 100 },
    { query: { enabled: !!shopId, refetchInterval: 20_000, refetchIntervalInBackground: true } }
  );

  const list = (sales || []) as any[];
  const totalRevenue = list.reduce((a, s) => a + (s.totalAmount ?? 0), 0);
  const totalProfit = list.reduce((a, s) => a + (s.totalProfit ?? 0), 0);
  const cashCount = list.filter(s => s.saleType === "cash").length;
  const debtCount = list.filter(s => s.saleType === "debt").length;
  const todayFlag = isToday(date);

  const filtered = useMemo(() => {
    let result = list;
    if (typeFilter !== "all") result = result.filter(s => s.saleType === typeFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(s =>
        (s.servedBy || "").toLowerCase().includes(q) ||
        String(s.totalAmount ?? "").includes(q)
      );
    }
    return result;
  }, [list, typeFilter, search]);

  const isFiltering = search.trim() !== "" || typeFilter !== "all";

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

        {/* Search + Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by cashier or amount…"
              className="w-full h-9 pl-9 pr-8 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center rounded-xl border border-border overflow-hidden shrink-0">
            {(["all", "cash", "debt"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  "px-3 h-9 text-xs font-semibold transition-colors capitalize",
                  typeFilter === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex items-center gap-0 rounded-xl border border-border overflow-hidden divide-x divide-border">
          <div className="flex-1 px-3 py-2 text-center">
            <p className="text-base font-bold font-mono leading-tight">{list.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{cashCount}c · {debtCount}d</p>
          </div>
          <div className="flex-1 px-3 py-2 text-center">
            <p className="text-base font-bold font-mono leading-tight">
              {totalRevenue > 0 ? totalRevenue.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Revenue</p>
          </div>
          {isOwner && (
            <>
              <div className="flex-1 px-3 py-2 text-center">
                <p className={cn("text-base font-bold font-mono leading-tight", totalProfit >= 0 ? "text-emerald-500" : "text-destructive")}>
                  {totalProfit !== 0 ? totalProfit.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Profit</p>
              </div>
              <div className="flex-1 px-3 py-2 text-center">
                <p className="text-base font-bold font-mono leading-tight">
                  {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) + "%" : "—"}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Margin</p>
              </div>
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Search className="h-8 w-8 opacity-20 mb-3" />
            <p className="font-bold text-sm">No matching transactions</p>
            <button onClick={() => { setSearch(""); setTypeFilter("all"); }} className="text-xs text-primary mt-2 hover:underline">
              Clear filters
            </button>
          </div>
        ) : (
          <>
            {isFiltering && (
              <p className="text-[10px] text-muted-foreground px-0.5 pb-1">
                Showing {filtered.length} of {list.length} transactions
              </p>
            )}
            {filtered.map((sale: any) => <SaleRow key={sale.id} sale={sale} isOwner={isOwner} />)}
          </>
        )}
      </div>
    </div>
  );
}
