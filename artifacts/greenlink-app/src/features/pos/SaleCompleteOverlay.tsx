import { useState, useEffect } from "react";
import { formatKES, formatQty } from "@/lib/format";
import { CreditCard, Printer, CheckCircle2 } from "lucide-react";
import { printSaleReceipt } from "@/lib/print-receipt";

export function SaleCompleteOverlay({ sale, onDismiss }: { sale: any; onDismiss: () => void }) {
  const [countdown, setCountdown] = useState(8);
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); onDismiss(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onDismiss]);

  const isDebt = sale.saleType === "debt";
  const payLabel = isDebt
    ? "Credit / Debt"
    : sale.paymentMethod === "bank"
    ? "M-Pesa / Bank"
    : "Cash";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onDismiss} />
      <div className="relative bg-card rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-primary to-emerald-400" />
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold leading-tight">Sale Complete</h2>
              <p className="text-xs font-semibold text-muted-foreground mt-0.5 uppercase tracking-wider">
                {payLabel}
              </p>
            </div>
          </div>

          <div className="bg-muted/40 border border-border/70 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-1">
              Total Settled
            </p>
            <p className="text-3xl font-bold font-mono text-primary">{formatKES(sale.totalAmount)}</p>
            {isDebt && sale.debtCustomerName && (
              <p className="text-sm text-amber-400 font-semibold mt-2 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                {sale.debtCustomerName}
              </p>
            )}
            {sale.discount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Includes {formatKES(sale.discount)} discount
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/60 mt-2 font-mono">
              REF #{(sale.id || "").slice(0, 8).toUpperCase() || "LOCAL"}
            </p>
          </div>

          {sale.items?.length > 0 && (
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1.5 max-h-28 overflow-y-auto">
              {sale.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between gap-2">
                  <span className="truncate text-foreground/85">{it.productName} × {formatQty(Number(it.qty ?? 0))}</span>
                  <span className="font-mono font-semibold shrink-0">{formatKES(it.totalPrice)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => printSaleReceipt(sale)}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-2xl border border-border bg-muted/50 hover:bg-muted text-sm font-semibold transition-colors cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="flex-1 h-11 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:brightness-105 transition-all cursor-pointer"
            >
              New Sale ({countdown}s)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
