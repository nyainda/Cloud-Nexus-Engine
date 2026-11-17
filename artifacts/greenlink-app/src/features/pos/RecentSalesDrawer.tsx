import { useState, useMemo } from "react";
import {
  getListProductsQueryKey,
  getListDebtsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { formatKES, formatQty } from "@/lib/format";
import { X, ChevronDown, ReceiptText, RotateCcw, ChevronUp, Ban, Printer } from "lucide-react";
import { printSaleReceipt } from "@/lib/print-receipt";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function RecentSalesDrawer({ shopId, userName, onClose }: { shopId: string; userName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [localVoided, setLocalVoided] = useState<Set<string>>(new Set());

  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ["recent-sales", shopId, today],
    queryFn: () => customFetch<any[]>(`/api/sales?shopId=${encodeURIComponent(shopId)}&date=${today}&includeVoided=true&limit=50`),
    enabled: !!shopId,
    staleTime: 0,
  });

  const { data: expandedItems } = useQuery({
    queryKey: ["sale-detail", expandedId],
    queryFn: async () => {
      const data = await customFetch<any>(`/api/sales/${expandedId}`);
      return (data.items ?? []) as any[];
    },
    enabled: !!expandedId,
  });

  const handleVoid = async (saleId: string) => {
    setVoidingId(saleId);
    try {
      await customFetch(`/api/sales/${saleId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: voidReason || "Voided at POS", performedBy: userName }),
      });
      setLocalVoided(prev => new Set([...prev, saleId]));
      setConfirmId(null);
      setVoidReason("");
      toast.success("Sale voided — stock restored");
      refetch();
      qc.invalidateQueries({ queryKey: ["recent-sales"] });
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
    } catch (err: any) {
      toast.error(err?.message || "Could not void sale");
    } finally {
      setVoidingId(null);
    }
  };

  const salesList = salesData ?? [];
  const summary = useMemo(() => {
    let totalRevenue = 0;
    let cashTotal = 0;
    let bankTotal = 0;
    let debtTotal = 0;
    let activeCount = 0;
    for (const s of salesList) {
      if (s.isDeleted || localVoided.has(s.id)) continue;
      activeCount++;
      const amt = Number(s.totalAmount || 0);
      totalRevenue += amt;
      if (s.saleType === "debt") debtTotal += amt;
      else if (s.paymentMethod === "bank") bankTotal += amt;
      else cashTotal += amt;
    }
    return { totalRevenue, cashTotal, bankTotal, debtTotal, activeCount };
  }, [salesList, localVoided]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg h-full flex flex-col bg-background border-l border-border shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-card shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-base font-bold text-foreground">Today&apos;s Sales</h2>
            <p className="text-[11px] text-muted-foreground">
              {summary.activeCount} active · {salesList.length} total transactions
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="w-9 h-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-primary cursor-pointer"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-border bg-card/50 grid grid-cols-3 gap-2 shrink-0">
          <div className="rounded-xl border border-border/80 bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-xs font-bold font-mono text-primary mt-0.5">{formatKES(summary.totalRevenue)}</p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Cash / Bank</p>
            <p className="text-xs font-bold font-mono text-emerald-400 mt-0.5">
              {formatKES(summary.cashTotal + summary.bankTotal)}
            </p>
          </div>
          <div className="rounded-xl border border-border/80 bg-muted/30 px-2.5 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Debt</p>
            <p className="text-xs font-bold font-mono text-destructive mt-0.5">{formatKES(summary.debtTotal)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-2 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded w-1/3" />
                    <div className="h-2.5 bg-muted rounded w-1/2" />
                  </div>
                  <div className="h-5 bg-muted rounded w-16" />
                </div>
              </div>
            ))
          ) : salesList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-muted-foreground gap-3">
              <ReceiptText className="w-10 h-10 text-muted-foreground/25" />
              <p className="text-sm font-semibold">No sales yet today</p>
              <p className="text-xs text-muted-foreground/70">Completed transactions appear here automatically</p>
            </div>
          ) : (
            salesList.map((sale, idx) => {
              const isVoided = sale.isDeleted || localVoided.has(sale.id);
              const isExpanded = expandedId === sale.id;
              const isDebt = sale.saleType === "debt";
              const time = new Date(sale.createdAt).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
              const num = salesList.length - idx;

              return (
                <div
                  key={sale.id}
                  className={cn(
                    "rounded-2xl border overflow-hidden transition-all",
                    isVoided ? "bg-muted/20 border-border/40 opacity-60" : "bg-card border-border"
                  )}
                >
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : sale.id)}
                  >
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-xs font-bold font-mono",
                        isVoided
                          ? "bg-muted text-muted-foreground"
                          : isDebt
                          ? "bg-destructive/12 text-destructive"
                          : "bg-primary/12 text-primary"
                      )}
                    >
                      {isVoided ? <Ban className="h-4 w-4" /> : `#${num}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold font-mono text-foreground">
                          {formatKES(sale.totalAmount)}
                        </span>
                        {isVoided && (
                          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            VOIDED
                          </span>
                        )}
                        {isDebt && !isVoided && (
                          <span className="text-[10px] font-bold text-destructive bg-destructive/12 px-1.5 py-0.5 rounded-full">
                            DEBT
                          </span>
                        )}
                        {!isDebt && !isVoided && sale.paymentMethod === "bank" && (
                          <span className="text-[10px] font-bold text-sky-400 bg-sky-500/12 px-1.5 py-0.5 rounded-full">
                            M-PESA / BANK
                          </span>
                        )}
                        {!isDebt && !isVoided && (!sale.paymentMethod || sale.paymentMethod === "cash") && (
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/12 px-1.5 py-0.5 rounded-full">
                            CASH
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {time} · {sale.servedBy ?? "staff"}
                        {sale.deleteReason && ` · ${sale.deleteReason}`}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/20">
                      {expandedItems ? (
                        <div className="divide-y divide-border/40">
                          {expandedItems.map((item: any) => (
                            <div key={item.id ?? item.productId} className="flex items-center justify-between px-4 py-2.5 text-xs">
                              <span className="text-foreground font-medium flex-1 min-w-0 truncate">
                                {item.productName}
                              </span>
                              <span className="text-muted-foreground font-mono shrink-0 ml-3">
                                ×{formatQty(Number(item.qty ?? 0))} @ {formatKES(item.unitPrice)}
                              </span>
                              <span className="font-bold font-mono text-foreground ml-3 shrink-0">
                                {formatKES(item.totalPrice)}
                              </span>
                            </div>
                          ))}
                          {sale.discount > 0 && (
                            <div className="flex items-center justify-between px-4 py-2 text-xs text-muted-foreground">
                              <span>Discount</span>
                              <span className="font-mono text-destructive">-{formatKES(sale.discount)}</span>
                            </div>
                          )}
                          <div className="px-4 py-3 flex flex-col gap-2">
                            {!isVoided && (
                              <button
                                type="button"
                                onClick={() => printSaleReceipt({ ...sale, items: expandedItems })}
                                className="w-full h-9 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Printer className="h-3.5 w-3.5" />
                                Reprint Receipt
                              </button>
                            )}
                            {!isVoided && (
                              confirmId === sale.id ? (
                                <div className="space-y-2 pt-1">
                                  <p className="text-xs font-semibold text-foreground">Void this sale?</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    Stock will be restored.{isDebt ? " Linked debt will be cancelled." : ""}
                                  </p>
                                  <input
                                    type="text"
                                    value={voidReason}
                                    onChange={e => setVoidReason(e.target.value)}
                                    placeholder="Reason (optional)…"
                                    className="w-full h-8 rounded-xl border border-border bg-background px-3 text-xs focus:outline-none focus:border-primary"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => { setConfirmId(null); setVoidReason(""); }}
                                      className="flex-1 h-8 rounded-xl bg-muted text-muted-foreground text-xs font-semibold cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleVoid(sale.id)}
                                      disabled={voidingId === sale.id}
                                      className="flex-1 h-8 rounded-xl bg-destructive text-destructive-foreground text-xs font-bold disabled:opacity-50 cursor-pointer"
                                    >
                                      {voidingId === sale.id ? "Voiding…" : "Confirm Void"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmId(sale.id)}
                                  className="w-full h-8 rounded-xl border border-destructive/35 text-destructive text-xs font-bold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                  Void This Sale
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                          <RotateCcw className="h-3 w-3 animate-spin" />
                          Loading items…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
