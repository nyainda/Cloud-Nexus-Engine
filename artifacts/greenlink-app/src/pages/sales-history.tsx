import { useState, useMemo, useEffect } from "react";
import {
  useListSales, useDeleteSale, getListSalesQueryKey,
  useListSaleReturns, useCreateSaleReturn, getListSaleReturnsQueryKey,
  getListProductsQueryKey, getListInventoryMovementsQueryKey,
  getGetSaleQueryKey,
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
  RotateCcw, Minus, Plus, CheckCircle2, Search, X, Printer,
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

// ─── Sale Detail — reads items directly from embedded sale object (no fetch) ──
// ─── Sale Receipt / Invoice ───────────────────────────────────────────────────
async function printSaleReceipt(sale: any) {
  const shopName = localStorage.getItem("greenlink_shopName") || "GreenLink";
  const shopId   = localStorage.getItem("greenlink_shopId")   || "";
  const items = (sale.items || []) as any[];
  const isDebt = sale.saleType === "debt";
  const isBank = !isDebt && sale.paymentMethod === "bank";
  const payLabel = isDebt ? "Credit / Debt" : isBank ? "M-Pesa / Bank" : "Cash";
  const payColor = isDebt ? "#d97706" : isBank ? "#2563eb" : "#059669";
  const saleDate = format(new Date(sale.createdAt), "d MMM yyyy");
  const saleTime = format(new Date(sale.createdAt), "h:mm a");
  const refNum = sale.id.slice(0, 8).toUpperCase();

  // ── Load shop logo as data-URL ──────────────────────────────────────────
  const shopIsGreenlink = !shopId.includes("sunrise") && !shopName.toLowerCase().includes("sunrise");
  const logoUrl = shopIsGreenlink ? "/logo-greenlink.jpg" : "/logo-sunrise.jpg";
  let logoDataUrl = "";
  try {
    const resp = await fetch(logoUrl);
    if (resp.ok) {
      const blob = await resp.blob();
      logoDataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch { /* logo is optional */ }

  const logoImg = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="${shopName}" class="shop-logo" />`
    : "";

  const itemRows = items.map((it: any, i: number) => `
    <tr class="${i % 2 === 1 ? "alt" : ""}">
      <td class="num idx">${i + 1}</td>
      <td class="name">${it.productName ?? "—"}</td>
      <td class="num">${it.qty}</td>
      <td class="num">KES ${Number(it.unitPrice ?? 0).toLocaleString("en-KE")}</td>
      <td class="num bold">KES ${Number(it.totalPrice ?? 0).toLocaleString("en-KE")}</td>
    </tr>`).join("");

  const discountRow = sale.discount > 0
    ? `<div class="total-row"><span class="label muted">Discount</span><span class="value red">- KES ${Number(sale.discount).toLocaleString("en-KE")}</span></div>`
    : "";

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Receipt ${refNum} — ${shopName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 600px; margin: 0 auto; padding: 0 0 48px; }

  /* Top accent bar */
  .top-bar { height: 5px; background: linear-gradient(90deg, #059669 0%, #10b981 100%); }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; padding: 24px 32px 20px; border-bottom: 1.5px solid #e2e8f0; }
  .brand-block { display: flex; align-items: center; gap: 12px; }
  .shop-logo { height: 48px; width: auto; object-fit: contain; border-radius: 6px; }
  .shop-text .shop-name { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.4px; }
  .shop-text .shop-sub { font-size: 10px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.8px; }
  .doc-meta { text-align: right; }
  .doc-type { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #059669; }
  .doc-ref { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 2px; letter-spacing: -0.5px; }
  .doc-date { font-size: 11px; color: #64748b; margin-top: 3px; }

  /* Info strip */
  .info-strip { display: flex; gap: 0; padding: 0 32px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
  .info-item { padding: 14px 0; padding-right: 28px; }
  .info-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; margin-bottom: 4px; }
  .info-value { font-size: 12px; font-weight: 600; color: #0f172a; }
  .info-item.right { margin-left: auto; padding-right: 0; text-align: right; }
  .pay-badge { display: inline-block; padding: 3px 11px; border-radius: 20px; font-size: 11px; font-weight: 700; background: ${payColor}15; color: ${payColor}; border: 1px solid ${payColor}35; }

  /* Customer block for debt */
  .customer-block { margin: 0 32px 0; background: #fffbeb; border: 1px solid #fde68a; border-top: none; padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
  .customer-block .lbl { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #d97706; }
  .customer-block .val { font-size: 13px; font-weight: 700; color: #0f172a; }

  /* Items table */
  .items-section { margin: 20px 32px 0; }
  .section-title { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.8px; color: #059669; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
  thead tr { background: #1e293b; color: #fff; }
  thead th { padding: 9px 10px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  th.name, td.name { text-align: left; }
  th.num, td.num { text-align: right; }
  th.idx, td.idx { text-align: center; width: 32px; }
  td { padding: 9px 10px; font-size: 11.5px; color: #0f172a; border-bottom: 1px solid #f1f5f9; }
  tr:last-child td { border-bottom: none; }
  tr.alt td { background: #f8fafc; }
  td.bold { font-weight: 700; color: #059669; }
  td.idx { color: #94a3b8; font-size: 10px; font-weight: 600; }

  /* Totals */
  .totals { margin: 14px 32px 0; border-top: 2px solid #e2e8f0; padding-top: 12px; }
  .total-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; }
  .total-row.grand { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-top: 8px; }
  .label { font-size: 12px; color: #64748b; }
  .value { font-size: 12px; font-weight: 600; color: #0f172a; }
  .label.muted { color: #94a3b8; font-size: 11px; }
  .value.red { color: #dc2626; }
  .grand .label { font-size: 14px; font-weight: 800; color: #0f172a; }
  .grand .value { font-size: 18px; font-weight: 800; color: #059669; font-family: "Courier New", monospace; }

  /* Footer */
  .footer { margin: 32px 32px 0; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  .footer .thanks { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .footer .sub { font-size: 11px; color: #94a3b8; }
  .footer .brand { font-size: 9px; font-weight: 700; color: #059669; margin-top: 14px; letter-spacing: 1px; text-transform: uppercase; }

  @media print {
    body { background: #fff; }
    .page { padding-bottom: 32px; }
    @page { margin: 8mm; size: A5; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="top-bar"></div>

  <div class="header">
    <div class="brand-block">
      ${logoImg}
      <div class="shop-text">
        <div class="shop-name">${shopName}</div>
        <div class="shop-sub">Official Receipt</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Receipt</div>
      <div class="doc-ref">#${refNum}</div>
      <div class="doc-date">${saleDate} &nbsp;·&nbsp; ${saleTime}</div>
    </div>
  </div>

  <div class="info-strip">
    <div class="info-item">
      <div class="info-label">Payment</div>
      <div class="info-value"><span class="pay-badge">${payLabel}</span></div>
    </div>
    ${sale.servedBy ? `<div class="info-item"><div class="info-label">Served by</div><div class="info-value">${sale.servedBy}</div></div>` : ""}
    <div class="info-item right">
      <div class="info-label">Total Amount</div>
      <div class="info-value" style="font-size:18px;color:#059669;font-weight:800;font-family:'Courier New',monospace">KES ${Number(sale.totalAmount ?? 0).toLocaleString("en-KE")}</div>
    </div>
  </div>

  ${isDebt && sale.debtCustomerName ? `<div class="customer-block"><div><div class="lbl">Credit Customer</div><div class="val">${sale.debtCustomerName}</div></div></div>` : ""}

  <div class="items-section">
    <div class="section-title">Items Purchased</div>
    <table>
      <thead><tr>
        <th class="idx">#</th>
        <th class="name">Item</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Total</th>
      </tr></thead>
      <tbody>${itemRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">No items</td></tr>'}</tbody>
    </table>
  </div>

  <div class="totals">
    ${discountRow}
    <div class="total-row grand">
      <span class="label">Total</span>
      <span class="value">KES ${Number(sale.totalAmount ?? 0).toLocaleString("en-KE")}</span>
    </div>
  </div>

  <div class="footer">
    <div class="thanks">Thank you for your business!</div>
    <div class="sub">Keep this receipt as proof of purchase.</div>
    <div class="brand">${shopName} &nbsp;·&nbsp; Powered by GreenLink OS</div>
  </div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
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
  // Fetch returns from server (fast since it's a small per-sale query)
  const { data: serverReturns } = useListSaleReturns(sale.id, { query: { enabled: !!sale.id, staleTime: 30_000 } });
  const [returnOpen, setReturnOpen] = useState(false);

  // Merge server returns with optimistic local ones (local wins on dupes by id)
  const returns = useMemo(() => {
    const base: any[] = serverReturns ?? [];
    const extra = localReturns.filter(lr => !base.find((r: any) => r.id === lr.id));
    return [...base, ...extra].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [serverReturns, localReturns]);

  const items = (sale.items || []) as any[];

  return (
    <div className="border-t border-border">
      {/* Items */}
      <div className="px-4 py-3 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No item details available</p>
        ) : items.map((item: any, i: number) => (
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
      {sale.saleType === "debt" && (
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
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => printSaleReceipt(sale)}
            className="text-xs h-8 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
          >
            <Printer className="h-3 w-3 mr-1" />Receipt
          </Button>
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
          saleId={sale.id}
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
          saleItems={items}
          existingReturns={returns}
          isDebtSale={sale.saleType === "debt"}
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

  const handleVoid = () => {
    if (!sale) return;
    const voidReason = reason.trim() || "Voided by owner";
    setReason("");

    // Optimistic: immediately remove from all sales list caches
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
        // Sync reality after server confirms
        qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
        qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      } catch {
        // Roll back: re-add the sale back to the list
        qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
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
function SaleRow({ sale, isOwner, onVoidRequest }: { sale: any; isOwner: boolean; onVoidRequest: (s: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  // Local (optimistic) returns that appeared before server refresh
  const [localReturns, setLocalReturns] = useState<any[]>([]);
  const time = format(new Date(sale.createdAt), "HH:mm");
  const isDebt = sale.saleType === "debt";
  const isBank = !isDebt && sale.paymentMethod === "bank";

  const handleReturnSuccess = (_totalRefund: number, returnRecord: any) => {
    setLocalReturns(prev => [...prev, returnRecord]);
  };

  return (
    <Card className={cn("shadow-none transition-colors", expanded ? "border-primary/40" : "border-border")}>
      <button onClick={() => setExpanded(e => !e)} className="w-full text-left">
        <CardContent className="p-3 flex items-center gap-3">
          <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
            isDebt
              ? "border-amber-300 dark:border-amber-800"
              : isBank
                ? "border-blue-300 dark:border-blue-800"
                : "border-emerald-300 dark:border-emerald-800"
          )}>
            {isDebt
              ? <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              : isBank
                ? <CreditCard className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                : <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={cn("text-[10px] h-4 px-1.5 border-0",
                isDebt
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                  : isBank
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400"
                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              )}>
                {isDebt ? "Debt" : isBank ? "M-Pesa" : "Cash"}
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
            {/* Product name preview when collapsed */}
            {!expanded && (sale.items ?? []).length > 0 && (
              <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">
                {(sale.items as any[]).slice(0, 2).map((it: any) => it.productName).join(", ")}
                {(sale.items as any[]).length > 2 ? ` +${(sale.items as any[]).length - 2}` : ""}
              </p>
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
        <SaleDetail
          sale={sale}
          isOwner={isOwner}
          onVoid={() => onVoidRequest(sale)}
          localReturns={localReturns}
          onReturnSuccess={handleReturnSuccess}
        />
      )}
    </Card>
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
        staleTime: 60_000,
        refetchInterval: 60_000,
        refetchIntervalInBackground: false,
      }
    }
  );

  // Pre-seed per-sale cache from list data so any code using useGetSale gets instant results
  useEffect(() => {
    if (!salesData) return;
    for (const sale of salesData as any[]) {
      qc.setQueryData(getGetSaleQueryKey(sale.id), sale, { updatedAt: Date.now() });
    }
  }, [salesData, qc]);

  // Prefetch both adjacent days so navigation is instant
  useEffect(() => {
    const yesterday = format(subDays(date, 1), "yyyy-MM-dd");
    const tomorrow = format(addDays(date, 1), "yyyy-MM-dd");
    qc.prefetchQuery({
      queryKey: getListSalesQueryKey({ shopId, date: yesterday, limit: 100 }),
      staleTime: 60_000,
    });
    if (!isToday(addDays(date, 1))) return; // don't prefetch future beyond tomorrow
    qc.prefetchQuery({
      queryKey: getListSalesQueryKey({ shopId, date: tomorrow, limit: 100 }),
      staleTime: 60_000,
    });
  }, [dateStr, shopId, qc]);

  const list = (salesData || []) as any[];
  const totalRevenue = list.reduce((a, s) => a + (s.totalAmount ?? 0), 0);
  const totalProfit = list.reduce((a, s) => a + (s.totalProfit ?? 0), 0);
  const cashCount = list.filter(s => s.saleType === "cash" && s.paymentMethod !== "bank").length;
  const bankCount = list.filter(s => s.saleType === "cash" && s.paymentMethod === "bank").length;
  const debtCount = list.filter(s => s.saleType === "debt").length;
  const todayFlag = isToday(date);

  const filtered = useMemo(() => {
    let result = list;
    if (typeFilter === "cash") result = result.filter(s => s.saleType === "cash" && s.paymentMethod !== "bank");
    else if (typeFilter === "bank") result = result.filter(s => s.saleType === "cash" && s.paymentMethod === "bank");
    else if (typeFilter === "debt") result = result.filter(s => s.saleType === "debt");
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(s =>
        (s.servedBy || "").toLowerCase().includes(q) ||
        String(s.totalAmount ?? "").includes(q) ||
        (s.items ?? []).some((it: any) => it.productName?.toLowerCase().includes(q))
      );
    }
    return result;
  }, [list, typeFilter, search]);

  const isFiltering = search.trim() !== "" || typeFilter !== "all";

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <VoidDialog
        sale={voidTarget}
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        onVoidSuccess={() => setVoidTarget(null)}
      />

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
              placeholder="Search by cashier, amount or product…"
              className="w-full h-9 pl-9 pr-8 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center rounded-xl border border-border overflow-hidden shrink-0">
            {(["all", "cash", "bank", "debt"] as const).map(t => (
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
                {t === "bank" ? "M-Pesa" : t}
              </button>
            ))}
          </div>
        </div>

        {/* Summary strip */}
        <div className="flex items-center gap-0 rounded-xl border border-border overflow-hidden divide-x divide-border">
          <div className="flex-1 px-3 py-2 text-center">
            <p className="text-base font-bold font-mono leading-tight">{list.length}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{cashCount}c · {bankCount}m · {debtCount}d</p>
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
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="w-16 h-16 rounded-2xl border border-border flex items-center justify-center">
              <Receipt className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="font-bold text-foreground">
                {isFiltering ? "No matching sales" : todayFlag ? "No sales today" : "No sales on this day"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {isFiltering ? "Try clearing your search or filter" : todayFlag ? "Sales will appear here as you process them" : "Navigate to another day"}
              </p>
            </div>
          </div>
        ) : (
          filtered.map(sale => (
            <SaleRow key={sale.id} sale={sale} isOwner={isOwner} onVoidRequest={setVoidTarget} />
          ))
        )}
      </div>
    </div>
  );
}
