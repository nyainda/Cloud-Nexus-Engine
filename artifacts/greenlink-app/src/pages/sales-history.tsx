import { useState, useMemo, useEffect } from "react";
import {
  useListSales, useDeleteSale, getListSalesQueryKey,
  useListSaleReturns, useCreateSaleReturn, getListSaleReturnsQueryKey,
  getListProductsQueryKey, getListInventoryMovementsQueryKey,
  getGetSaleQueryKey, getListDebtsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Receipt, ChevronDown, ChevronUp, Trash2, Calendar, FileDown,
  ChevronLeft, ChevronRight, CreditCard,
  TrendingUp, Banknote, Clock, User, Package,
  RotateCcw, Minus, Plus, CheckCircle2, Search, X, Printer, Landmark,
} from "lucide-react";
import { toast } from "sonner";
import { format, addDays, subDays, isToday } from "date-fns";
import { printSaleReceipt } from "@/lib/print-receipt";
import { downloadSalePdf, downloadSalesHistoryPdf } from "@/lib/sales-pdf";
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
  onReturnSuccess,
}: {
  saleId: string;
  open: boolean;
  onClose: () => void;
  saleItems: any[];
  existingReturns: any[];
  isDebtSale?: boolean;
  debtCustomerName?: string;
  onReturnSuccess?: (totalRefund: number, returnRecord: Record<string, unknown>) => void;
}) {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const qc = useQueryClient();
  const doReturn = useCreateSaleReturn();

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

    const now = new Date().toISOString();
    const optimisticReturn = {
      id: `opt-${Date.now()}`,
      saleId,
      shopId,
      itemsJson: JSON.stringify(items),
      totalRefund,
      reason: reason.trim() || null,
      processedBy: role,
      createdAt: now,
    };

    doReturn.mutate(
      { saleId, data: { shopId, reason: reason.trim() || undefined, processedBy: role, items } },
      {
        onSuccess: (returnRecord: any) => {
          toast.success(`Return processed — ${fmt(totalRefund)} refund`);
          onReturnSuccess?.(totalRefund, returnRecord ?? optimisticReturn);
          qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
          qc.invalidateQueries({ queryKey: getListSaleReturnsQueryKey(saleId) });
          qc.invalidateQueries({ queryKey: ["returns"] });
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
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border bg-muted/20 shrink-0">
          <DialogTitle className="flex items-center gap-2.5 text-base font-bold">
            <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-primary" />
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
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <p className="text-sm font-bold text-emerald-400">All Items Returned</p>
              <p className="text-xs text-muted-foreground">Every item from this sale has already been returned.</p>
            </div>
          ) : (
            <>
              {isDebtSale && (
                <div className="flex items-start gap-2.5 bg-sky-500/10 border border-sky-500/25 rounded-2xl px-3.5 py-3">
                  <CreditCard className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-sky-400">Debt Sale</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {debtCustomerName
                        ? <><span className="font-medium text-foreground">{debtCustomerName}</span>&apos;s debt balance will automatically be reduced by the refund amount.</>
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
                        "rounded-2xl border p-3.5 transition-all",
                        fullyReturned ? "opacity-45 bg-muted/15 border-border/40"
                          : qty > 0 ? "border-primary/45 bg-primary/[0.06]"
                          : "border-border bg-card"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate">{item.productName}</p>
                          <div className="flex items-center gap-2 flex-wrap mt-0.5">
                            <span className="text-[11px] text-muted-foreground font-mono">
                              {item.qty} sold × {fmt(item.unitPrice)}
                            </span>
                            {alreadyRet > 0 && (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-500/12 px-1.5 py-0.5 rounded-full">
                                {alreadyRet} returned
                              </span>
                            )}
                            {fullyReturned && (
                              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-0.5">
                                <CheckCircle2 className="h-3 w-3" /> fully returned
                              </span>
                            )}
                          </div>
                        </div>

                        {!fullyReturned && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setQty(i, qty - 1)}
                              disabled={qty === 0}
                              className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className={cn(
                              "w-8 text-center text-sm font-bold font-mono tabular-nums",
                              qty > 0 ? "text-primary" : "text-muted-foreground"
                            )}>
                              {qty}
                            </span>
                            <button
                              type="button"
                              onClick={() => setQty(i, qty + 1)}
                              disabled={qty >= maxQty}
                              className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 transition-colors cursor-pointer"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {qty > 0 && (
                        <div className="flex items-center justify-between bg-primary/12 rounded-xl px-3 py-1.5">
                          <span className="text-[11px] text-muted-foreground font-mono">{qty} × {fmt(item.unitPrice)}</span>
                          <span className="text-xs font-bold font-mono text-primary">+{fmt(qty * (item.unitPrice ?? 0))}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Reason (optional)</Label>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. Wrong product, defective item…"
                  className="w-full h-10 px-3 text-sm bg-muted/35 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                />
              </div>

              {hasSelection && (
                <div className="flex items-center justify-between bg-primary/10 border border-primary/25 rounded-2xl px-4 py-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Refund</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
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
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">Cancel</Button>
            <Button
              onClick={handleSubmit}
              disabled={!hasSelection || doReturn.isPending}
              className="flex-1 rounded-xl bg-primary text-primary-foreground hover:brightness-105"
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

function SaleDetail({
  sale,
  isOwner,
  onVoid,
  localReturns,
  onReturnSuccess,
}: {
  sale: any;
  isOwner: boolean;
  onVoid: () => void;
  localReturns: any[];
  onReturnSuccess: (totalRefund: number, returnRecord: any) => void;
}) {
  const { data: serverReturns } = useListSaleReturns(sale.id, { query: { enabled: !!sale.id, staleTime: 30_000 } as any });
  const [returnOpen, setReturnOpen] = useState(false);

  const returns = useMemo(() => {
    const base: any[] = serverReturns ?? [];
    const extra = localReturns.filter(lr => !base.find((r: any) => r.id === lr.id));
    return [...base, ...extra].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [serverReturns, localReturns]);

  const items = (sale.items || []) as any[];

  return (
    <div className="border-t border-border/80 bg-muted/15">
      {/* Items */}
      <div className="px-4 py-3.5 space-y-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No item details available</p>
        ) : items.map((item: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/70 px-3 py-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-muted/70 border border-border/60 flex items-center justify-center shrink-0">
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{item.productName}</p>
                <p className="text-[11px] font-mono text-muted-foreground">{item.qty} × {fmt(item.unitPrice)}</p>
              </div>
            </div>
            <p className="text-sm font-bold font-mono text-primary shrink-0">{fmt(item.totalPrice)}</p>
          </div>
        ))}
      </div>

      <Separator />

      {/* Totals */}
      <div className="px-4 py-3 space-y-1.5">
        {sale.discount > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Discount</span>
            <span className="text-destructive font-mono font-semibold">- {fmt(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Total</span>
          <span className="text-base font-bold font-mono">{fmt(sale.totalAmount)}</span>
        </div>
        {isOwner && sale.totalProfit != null && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Profit</span>
            <span className={cn("font-mono font-bold", (sale.totalProfit ?? 0) >= 0 ? "text-emerald-400" : "text-destructive")}>
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
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
              <RotateCcw className="h-3 w-3" /> Returns Processed
            </p>
            {returns.map((r: any) => {
              const returnedItems: any[] = (() => {
                try { return JSON.parse(r.itemsJson); } catch { return []; }
              })();
              return (
                <div key={r.id} className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-amber-400 font-bold font-mono">- {fmt(r.totalRefund)}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {format(new Date(r.createdAt), "d MMM, HH:mm")}
                    </span>
                  </div>
                  {returnedItems.map((it: any, j: number) => (
                    <p key={j} className="text-xs text-muted-foreground">{it.productName} × {it.qty}</p>
                  ))}
                  {r.reason && <p className="text-xs text-muted-foreground italic">&ldquo;{r.reason}&rdquo;</p>}
                  {r.processedBy && <p className="text-[11px] text-muted-foreground">by {r.processedBy}</p>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Debt indicator */}
      {sale.saleType === "debt" && (
        <>
          <Separator />
          <div className="px-4 py-2.5 flex items-center gap-2 bg-sky-500/[0.04]">
            <CreditCard className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-xs text-sky-400 font-semibold">
              Debt Sale{sale.debtCustomerName ? ` · ${sale.debtCustomerName}` : ""}
            </span>
            <span className="text-[10px] text-muted-foreground">· balance auto-credited on return</span>
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 border-t border-border/60 gap-3">
        <div className="text-xs text-muted-foreground space-y-0.5">
          {sale.servedBy && <p>Served by <span className="font-semibold text-foreground">{sale.servedBy}</span></p>}
          <p className="font-mono text-[11px] text-muted-foreground/70">REF #{sale.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => printSaleReceipt(sale)}
            className="text-xs h-8 rounded-xl border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
          >
            <Printer className="h-3 w-3 mr-1.5" />Receipt
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await downloadSalePdf(sale, returns);
              } catch (error) {
                const message = error instanceof Error ? error.message : "Could not generate the sale PDF.";
                toast.error(message);
              }
            }}
            className="text-xs h-8 rounded-xl cursor-pointer"
          >
            <FileDown className="h-3 w-3 mr-1.5" />PDF
          </Button>
          {!sale.isDeleted && items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReturnOpen(true)}
              className="text-xs h-8 rounded-xl border-primary/35 text-primary hover:bg-primary/10 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3 mr-1.5" />Return
            </Button>
          )}
          {isOwner && (
            <Button variant="destructive" size="sm" onClick={onVoid} className="text-xs h-8 rounded-xl cursor-pointer">
              <Trash2 className="h-3 w-3 mr-1.5" />Void
            </Button>
          )}
        </div>
      </div>

      {returnOpen && (
        <ReturnDialog
          saleId={sale.id}
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
          saleItems={items}
          existingReturns={returns}
          isDebtSale={sale.saleType === "debt"}
          debtCustomerName={sale.debtCustomerName}
          onReturnSuccess={onReturnSuccess}
        />
      )}
    </div>
  );
}

// ─── Void Dialog ──────────────────────────────────────────────────────────────
function VoidDialog({
  sale,
  open,
  onClose,
  onVoidSuccess,
}: {
  sale: any | null;
  open: boolean;
  onClose: () => void;
  onVoidSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const del = useDeleteSale();
  const role = localStorage.getItem("greenlink_role") || "owner";
  const [completedSaleId, setCompletedSaleId] = useState<string | null>(null);

  const handleVoid = () => {
    if (!sale || del.isPending || completedSaleId === sale.id) return;
    const voidReason = reason.trim() || "Voided by owner";
    setReason("");
    setCompletedSaleId(sale.id);

    qc.setQueriesData(
      { queryKey: getListSalesQueryKey() },
      (old: any) => Array.isArray(old) ? old.filter((s: any) => s.id !== sale.id) : old
    );
    onVoidSuccess();
    onClose();

    toast.success("Sale voided");

    (async () => {
      try {
        await del.mutateAsync({ saleId: sale.id, data: { reason: voidReason, performedBy: role } });
        qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
        qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
        qc.invalidateQueries({ queryKey: ["/api/crm"] });
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      } catch {
        qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
        qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
        qc.invalidateQueries({ queryKey: ["/api/crm"] });
        setCompletedSaleId(null);
        toast.error("Failed to void sale — please retry");
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-destructive font-bold">Void Sale</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">This will permanently cancel the sale and restore stock. This cannot be undone.</p>
          <div className="space-y-2">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Reason (optional)</Label>
            <input
              autoFocus
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Customer returned items"
              className="flex h-10 w-full rounded-xl border border-border bg-muted/35 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button variant="destructive" onClick={handleVoid} disabled={del.isPending || completedSaleId === sale?.id} className="rounded-xl">
            {del.isPending ? "Voiding…" : "Confirm Void"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Sale Row ─────────────────────────────────────────────────────────────────
function SaleRow({ sale, isOwner, onVoidRequest }: { sale: any; isOwner: boolean; onVoidRequest: (s: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [localReturns, setLocalReturns] = useState<any[]>([]);
  const time = format(new Date(sale.createdAt), "HH:mm");
  const isDebt = sale.saleType === "debt";
  const isBank = !isDebt && sale.paymentMethod === "bank";

  const handleReturnSuccess = (_totalRefund: number, returnRecord: any) => {
    setLocalReturns(prev => [...prev, returnRecord]);
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card transition-all",
        expanded ? "border-primary/50 shadow-md" : "border-border hover:border-primary/35"
      )}
    >
      {/* Left accent bar */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1",
          isDebt ? "bg-amber-400" : isBank ? "bg-sky-400" : "bg-emerald-400"
        )}
      />

      <button type="button" onClick={() => setExpanded(e => !e)} className="w-full text-left cursor-pointer">
        <div className="pl-4 pr-3.5 py-3.5 flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
              isDebt
                ? "border-amber-500/25 bg-amber-500/12 text-amber-400"
                : isBank
                ? "border-sky-500/25 bg-sky-500/12 text-sky-400"
                : "border-emerald-500/25 bg-emerald-500/12 text-emerald-400"
            )}
          >
            {isDebt ? <CreditCard className="h-4 w-4" /> : isBank ? <Landmark className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                className={cn(
                  "text-[10px] h-5 px-2 rounded-full border-0 font-bold",
                  isDebt
                    ? "bg-amber-500/15 text-amber-400"
                    : isBank
                    ? "bg-sky-500/15 text-sky-400"
                    : "bg-emerald-500/15 text-emerald-400"
                )}
              >
                {isDebt ? "Debt" : isBank ? "M-Pesa" : "Cash"}
              </Badge>
              <span className="text-xs font-mono text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />{time}
              </span>
              {sale.servedBy && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                  <User className="h-3 w-3" />{sale.servedBy}
                </span>
              )}
              {sale.discount > 0 && (
                <span className="text-[10px] font-mono text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
                  -{fmt(sale.discount)}
                </span>
              )}
            </div>

            {isDebt && sale.debtCustomerName && (
              <p className="text-xs text-sky-400 font-semibold mt-1 truncate">
                Customer: {sale.debtCustomerName}
              </p>
            )}

            {!expanded && (sale.items ?? []).length > 0 && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {(sale.items as any[]).slice(0, 3).map((it: any) => `${it.productName} ×${it.qty}`).join(" · ")}
                {(sale.items as any[]).length > 3 ? ` +${(sale.items as any[]).length - 3} more` : ""}
              </p>
            )}
          </div>

          <div className="text-right shrink-0">
            <p className="text-base font-bold font-mono text-foreground">{fmt(sale.totalAmount)}</p>
            {isOwner && sale.totalProfit != null && (
              <p className={cn("text-xs font-semibold font-mono", (sale.totalProfit ?? 0) >= 0 ? "text-emerald-400" : "text-destructive")}>
                {(sale.totalProfit ?? 0) >= 0 ? "+" : ""}{fmt(sale.totalProfit)}
              </p>
            )}
          </div>

          <div className="shrink-0 w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </button>

      {expanded && (
        <SaleDetail
          sale={sale}
          isOwner={isOwner}
          onVoid={() => onVoidRequest(sale)}
          localReturns={localReturns}
          onReturnSuccess={handleReturnSuccess}
        />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SalesHistory() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";
  const qc = useQueryClient();

  const [date, setDate] = useState(new Date());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "cash" | "bank" | "debt">("all");
  const [voidTarget, setVoidTarget] = useState<any | null>(null);
  const dateStr = format(date, "yyyy-MM-dd");

  const { data: salesData, isLoading } = useListSales(
    { shopId, date: dateStr, limit: 100 },
    {
      query: {
        enabled: !!shopId,
        staleTime: 15_000,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
      } as any,
    }
  );

  useEffect(() => {
    if (!salesData) return;
    for (const sale of salesData as any[]) {
      qc.setQueryData(getGetSaleQueryKey(sale.id), sale, { updatedAt: Date.now() });
    }
  }, [salesData, qc]);

  useEffect(() => {
    const yesterday = format(subDays(date, 1), "yyyy-MM-dd");
    const tomorrow = format(addDays(date, 1), "yyyy-MM-dd");
    qc.prefetchQuery({
      queryKey: getListSalesQueryKey({ shopId, date: yesterday, limit: 100 }),
      staleTime: 60_000,
    });
    if (!isToday(addDays(date, 1))) return;
    qc.prefetchQuery({
      queryKey: getListSalesQueryKey({ shopId, date: tomorrow, limit: 100 }),
      staleTime: 60_000,
    });
  }, [dateStr, shopId, qc, date]);

  const list = (salesData || []) as any[];
  const totalRevenue = list.reduce((a, s) => a + (s.totalAmount ?? 0), 0);
  const totalProfit = list.reduce((a, s) => a + (s.totalProfit ?? 0), 0);
  const cashCount = list.filter(s => s.saleType === "cash" && s.paymentMethod !== "bank").length;
  const bankCount = list.filter(s => s.saleType === "cash" && s.paymentMethod === "bank").length;
  const debtCount = list.filter(s => s.saleType === "debt").length;
  const todayFlag = isToday(date);
  const marginPct = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  const filtered = useMemo(() => {
    let result = list;
    if (typeFilter === "cash") result = result.filter(s => s.saleType === "cash" && s.paymentMethod !== "bank");
    else if (typeFilter === "bank") result = result.filter(s => s.saleType === "cash" && s.paymentMethod === "bank");
    else if (typeFilter === "debt") result = result.filter(s => s.saleType === "debt");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(s =>
        (s.servedBy || "").toLowerCase().includes(q) ||
        (s.debtCustomerName || "").toLowerCase().includes(q) ||
        String(s.totalAmount ?? "").includes(q) ||
        (s.items ?? []).some((it: any) => it.productName?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [list, typeFilter, search]);

  const isFiltering = search.trim() !== "" || typeFilter !== "all";
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  async function handleDownloadPdf() {
    if (filtered.length === 0 || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const filterLabel = [typeFilter === "all" ? "" : typeFilter === "bank" ? "M-Pesa" : typeFilter, search.trim() ? "Search: " + search.trim() : ""].filter(Boolean).join(" · ");
      await downloadSalesHistoryPdf(filtered, { dateLabel: format(date, "dd MMMM yyyy"), filterLabel, includeProfit: isOwner });
      toast.success("Sales history PDF downloaded");
    } catch (error: any) {
      toast.error(error?.message || "Could not generate the sales history PDF");
    } finally { setIsExportingPdf(false); }
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      <VoidDialog
        sale={voidTarget}
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        onVoidSuccess={() => setVoidTarget(null)}
      />

      <div className="mx-auto w-full max-w-[1280px] p-3.5 sm:p-5 lg:p-6 space-y-4">
        {/* ── Header & Date Controls ── */}
        <section className="rounded-3xl border border-border bg-card p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold tracking-normal">Sales History</h1>
                <p className="text-xs text-muted-foreground">
                  {todayFlag ? "Today's live transaction ledger" : format(date, "EEEE, d MMMM yyyy")}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Date Stepper */}
              <div className="flex items-center gap-1 rounded-2xl border border-border bg-muted/40 p-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl cursor-pointer" onClick={() => setDate(d => subDays(d, 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1.5 px-2.5">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold min-w-[68px] text-center">
                    {todayFlag ? "Today" : format(date, "d MMM yyyy")}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl cursor-pointer" onClick={() => { if (!todayFlag) setDate(d => addDays(d, 1)); }} disabled={todayFlag}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isLoading || filtered.length === 0 || isExportingPdf}
                className="h-10 rounded-2xl px-4 font-semibold cursor-pointer"
              >
                <FileDown className="h-4 w-4 mr-1.5 text-primary" />
                {isExportingPdf ? "Preparing…" : "Export PDF"}
              </Button>
            </div>
          </div>

          {/* KPI Strip */}
          <div className={cn("grid gap-2.5", isOwner ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2")}>
            <div className="rounded-2xl border border-border/80 bg-muted/25 p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Transactions</p>
              <p className="mt-1 text-2xl font-bold font-mono">{list.length}</p>
              <p className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                {cashCount} cash · {bankCount} M-Pesa · {debtCount} debt
              </p>
            </div>

            <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-3.5">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Total Revenue</p>
              <p className="mt-1 text-2xl font-bold font-mono text-primary">
                {totalRevenue > 0 ? fmt(totalRevenue) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {filtered.length !== list.length ? `${filtered.length} shown in filter` : "Gross settled"}
              </p>
            </div>

            {isOwner && (
              <>
                <div className="rounded-2xl border border-border/80 bg-muted/25 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Est. Profit</p>
                  <p className={cn("mt-1 text-2xl font-bold font-mono", totalProfit >= 0 ? "text-emerald-400" : "text-destructive")}>
                    {totalProfit !== 0 ? fmt(totalProfit) : "—"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Net margin earned</p>
                </div>

                <div className="rounded-2xl border border-border/80 bg-muted/25 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Avg Margin</p>
                  <p className="mt-1 text-2xl font-bold font-mono flex items-center gap-1.5">
                    {totalRevenue > 0 ? `${marginPct.toFixed(1)}%` : "—"}
                    {totalRevenue > 0 && <TrendingUp className="h-4 w-4 text-emerald-400" />}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Across day&apos;s sales</p>
                </div>
              </>
            )}
          </div>

          {/* Search & Type Switcher */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by cashier, customer, amount, or product…"
                className="w-full h-10 pl-10 pr-9 text-sm bg-muted/40 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-primary/35 focus:border-primary transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center rounded-2xl border border-border bg-muted/40 p-1 shrink-0">
              {(["all", "cash", "bank", "debt"] as const).map(t => (
                <button
                  type="button"
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={cn(
                    "px-3.5 h-8 rounded-xl text-xs font-bold transition-all capitalize cursor-pointer",
                    typeFilter === t
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "bank" ? "M-Pesa" : t}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Transaction List ── */}
        <div className="space-y-2.5 pb-8">
          {isLoading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-20 rounded-2xl border border-border bg-card animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/40 flex flex-col items-center gap-3 py-16 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-muted/50 border border-border flex items-center justify-center">
                <Receipt className="h-7 w-7 text-muted-foreground/50" />
              </div>
              <div>
                <p className="font-display text-base font-bold text-foreground">
                  {isFiltering ? "No matching sales" : todayFlag ? "No sales recorded today" : "No sales on this day"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {isFiltering ? "Try clearing your search or payment filter" : todayFlag ? "Sales completed on POS appear here immediately" : "Use the date switcher above to inspect another day"}
                </p>
              </div>
              {isFiltering && (
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => { setSearch(""); setTypeFilter("all"); }}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            filtered.map(sale => (
              <SaleRow key={sale.id} sale={sale} isOwner={isOwner} onVoidRequest={setVoidTarget} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
