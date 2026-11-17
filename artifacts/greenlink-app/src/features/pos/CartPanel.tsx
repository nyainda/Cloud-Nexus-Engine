import { useState, memo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { formatKES, formatQty } from "@/lib/format";
import {
  Plus, Minus, ShoppingCart, CreditCard, Banknote, X,
  User2, Phone, Landmark, Printer, Percent, Trash2, Calculator, PanelRightClose,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CustomerAutocomplete, type SelectedCustomer } from "@/components/customer-autocomplete";
import { isWeighedUnit } from "@/lib/product-utils";
import type { CartItem, PaymentMode } from "./pos-types";
import { QtyTextInput } from "./QtyTextInput";

export interface CartPanelProps {
  cart: CartItem[];
  discount: number;
  debtCustomerName: string;
  debtCustomerPhone: string;
  isOwner: boolean;
  createSalePending: boolean;
  subtotal: number;
  total: number;
  totalProfit: number;
  cartCount: number;
  setDiscount: (v: number) => void;
  setDebtCustomerName: (v: string) => void;
  setDebtCustomerPhone: (v: string) => void;
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  setShowCartMobile: (v: boolean) => void;
  onRetractDesktop: () => void;
  updateQty: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  updatePrice: (id: string, price: number) => void;
  handleCheckout: (type: "cash" | "debt", method?: "cash" | "bank") => void;
  setQtyDirect: (id: string, qty: number) => void;
  paymentMethod: "cash" | "bank";
  setPaymentMethod: (v: "cash" | "bank") => void;
  selectedCustomerBalance: number | null;
  setSelectedCustomerBalance: (v: number | null) => void;
  selectedCustomerCredit: number | null;
  setSelectedCustomerCredit: (v: number | null) => void;
  autoPrint: boolean;
  onAutoPrintChange: (v: boolean) => void;
}

export const CartPanel = memo(function CartPanel({
  cart,
  discount,
  debtCustomerName,
  debtCustomerPhone,
  isOwner,
  createSalePending,
  subtotal,
  total,
  totalProfit,
  cartCount,
  setDiscount,
  setDebtCustomerName,
  setDebtCustomerPhone,
  setCart,
  setShowCartMobile,
  onRetractDesktop,
  updateQty,
  removeFromCart,
  updatePrice,
  handleCheckout,
  setQtyDirect,
  paymentMethod,
  setPaymentMethod,
  selectedCustomerBalance,
  setSelectedCustomerBalance,
  selectedCustomerCredit,
  setSelectedCustomerCredit,
  autoPrint,
  onAutoPrintChange,
}: CartPanelProps) {
  const [payMode, setPayMode] = useState<PaymentMode>(paymentMethod);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [cashTendered, setCashTendered] = useState<string>("");

  useEffect(() => {
    if (payMode !== "debt") setPayMode(paymentMethod);
  }, [paymentMethod, payMode]);

  useEffect(() => {
    if (cart.length === 0) {
      setCashTendered("");
      setCalcOpen(false);
      setDiscountOpen(false);
    }
  }, [cart.length]);

  const selectPaymentMode = (mode: PaymentMode) => {
    setPayMode(mode);
    if (mode === "cash" || mode === "bank") {
      setPaymentMethod(mode);
    } else {
      setCustomerOpen(true);
    }
  };

  const tenderedNum = parseFloat(cashTendered) || 0;
  const changeDue = tenderedNum > 0 ? tenderedNum - total : 0;
  const marginPct = total > 0 ? (totalProfit / total) * 100 : 0;
  const showCustomerFields = customerOpen || payMode === "debt" || !!debtCustomerName;
  const showDiscountBar = discountOpen || discount > 0;

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0 bg-muted/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm shrink-0">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-sm">Current Ticket</span>
              <span className="rounded-full bg-primary/15 border border-primary/25 text-primary px-2 py-0.5 text-[10px] font-bold font-mono">
                {cart.length} {cart.length === 1 ? "item" : "items"} · {formatQty(cartCount)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            onClick={() => {
              setCart([]);
              setDiscount(0);
              setCashTendered("");
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </button>
          <button
            type="button"
            onClick={onRetractDesktop}
            title="Retract ticket panel to browse full width"
            className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-xl border border-border/80 bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="lg:hidden w-8 h-8 rounded-xl bg-muted/60 text-muted-foreground flex items-center justify-center"
            onClick={() => setShowCartMobile(false)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Compact 1-Line Customer Bar */}
      <div className="px-4 py-2 border-b border-border/70 bg-muted/10 shrink-0">
        {!showCustomerFields ? (
          <button
            type="button"
            onClick={() => setCustomerOpen(true)}
            className="w-full flex items-center justify-between gap-2 rounded-xl border border-dashed border-border/80 hover:border-primary/45 bg-muted/25 hover:bg-muted/45 px-3 py-1.5 text-left transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <User2 className="h-3.5 w-3.5 text-primary" />
              Walk-in Customer
            </span>
            <span className="text-[11px] font-semibold text-primary">+ Attach customer</span>
          </button>
        ) : (
          <div className="space-y-2 py-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                <User2 className="h-3 w-3 text-primary" />
                {payMode === "debt" ? "Customer (Required for Debt)" : "Customer"}
              </span>
              {payMode !== "debt" && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerOpen(false);
                    setDebtCustomerName("");
                    setDebtCustomerPhone("");
                    setSelectedCustomerBalance(null);
                    setSelectedCustomerCredit(null);
                  }}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Walk-in
                </button>
              )}
            </div>

            <CustomerAutocomplete
              shopId={localStorage.getItem("greenlink_shopId") || ""}
              value={debtCustomerName}
              onChange={(v) => {
                setDebtCustomerName(v);
                setSelectedCustomerBalance(null);
                setSelectedCustomerCredit(null);
              }}
              onSelect={(c: SelectedCustomer) => {
                setDebtCustomerName(c.name);
                if (c.phone) setDebtCustomerPhone(c.phone);
                setSelectedCustomerBalance(c.totalBalance);
                setSelectedCustomerCredit(c.totalCredit);
              }}
              showBalanceWarning
              selectedBalance={selectedCustomerBalance ?? undefined}
            />

            {selectedCustomerCredit != null && selectedCustomerCredit > 0 && (
              <p className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] text-emerald-400">
                Available credit: <strong>{formatKES(selectedCustomerCredit)}</strong>
                {payMode === "debt" && ` — up to ${formatKES(Math.min(selectedCustomerCredit, total))} auto-applied`}
              </p>
            )}

            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="tel"
                placeholder="Phone (optional)"
                value={debtCustomerPhone}
                onChange={e => setDebtCustomerPhone(e.target.value)}
                className="flex h-8 w-full rounded-xl border border-border/70 bg-muted/30 pl-9 pr-3 py-1 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
            </div>
          </div>
        )}
      </div>

      {/* Hero Chosen Items Area — Spacious & Ultra-Legible */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-background/35">
        {cart.map((item, idx) => {
          const isMeasured = item.product.productType === "measured" || isWeighedUnit(item.product.unit || "");
          const cartStep = isMeasured ? 0.25 : 1;
          const cartMin = isMeasured ? 0.01 : 1;
          const itemProfit = isOwner && item.product.purchasePrice
            ? item.qty * (item.unitPrice - item.product.purchasePrice)
            : null;
          const itemMarginPct = item.product.purchasePrice && item.unitPrice
            ? ((item.unitPrice - item.product.purchasePrice) / item.unitPrice) * 100
            : null;
          const isLoss = itemProfit !== null && itemProfit < 0;
          const isLowMargin = !isLoss && itemMarginPct !== null && itemMarginPct < 10;
          const lineTotal = item.qty * item.unitPrice;

          return (
            <div
              key={item.product.id}
              className={cn(
                "rounded-2xl border p-3 transition-colors shadow-sm",
                isLoss
                  ? "bg-destructive/8 border-destructive/40"
                  : isLowMargin
                  ? "bg-amber-500/8 border-amber-500/35"
                  : "bg-card border-border/90 hover:border-primary/35"
              )}
            >
              {/* Item Title Row */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <span className="mt-0.5 inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-md bg-muted text-[10px] font-bold font-mono text-muted-foreground shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-foreground leading-snug break-words">
                      {item.product.canonicalName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {formatQty(item.qty)} {item.product.unit || "unit"} × {formatKES(item.unitPrice)}
                      </span>
                      {isMeasured && (
                        <span className="text-[9px] font-bold text-primary bg-primary/12 px-1.5 py-0.5 rounded-full">
                          Weighed
                        </span>
                      )}
                      {isOwner && isLoss && (
                        <span className="text-[9px] font-bold bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">
                          LOSS
                        </span>
                      )}
                      {isOwner && isLowMargin && (
                        <span className="text-[9px] font-bold bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">
                          LOW MARGIN
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Line Total + Delete */}
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm font-mono text-primary">
                      {formatKES(lineTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-muted-foreground/50 hover:text-destructive p-1 rounded-lg hover:bg-destructive/10 transition-colors cursor-pointer"
                      aria-label={`Remove ${item.product.canonicalName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {isOwner && itemProfit !== null && (
                    <span className={cn("text-[10px] font-mono font-semibold pr-1", itemProfit >= 0 ? "text-emerald-400" : "text-destructive")}>
                      {itemProfit >= 0 ? "+" : "-"}{formatKES(Math.abs(itemProfit))}
                    </span>
                  )}
                </div>
              </div>

              {/* Item Quick Controls Row */}
              <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-2">
                <div className="flex items-center bg-muted/65 rounded-xl border border-border overflow-hidden">
                  <button
                    type="button"
                    className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => updateQty(item.product.id, -cartStep)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <QtyTextInput
                    value={item.qty}
                    min={cartMin}
                    max={item.product.stockQty}
                    isDecimal={isMeasured}
                    onChange={next => setQtyDirect(item.product.id, next)}
                    className="w-16 h-8 text-center text-xs font-bold font-mono tabular-nums bg-transparent border-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    className="h-8 w-8 flex items-center justify-center text-primary hover:bg-primary/10 transition-colors disabled:opacity-35 cursor-pointer"
                    onClick={() => updateQty(item.product.id, cartStep)}
                    disabled={item.qty >= item.product.stockQty}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-muted/35 px-2.5 h-8">
                  <span className="text-[10px] font-semibold text-muted-foreground">Unit KES</span>
                  <input
                    type="number"
                    value={item.unitPrice}
                    onChange={e => updatePrice(item.product.id, Number(e.target.value))}
                    className="w-16 text-right text-xs font-bold font-mono bg-transparent focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compact, Progressive Checkout Footer */}
      <div className="shrink-0 border-t border-border bg-card px-4 pt-3 pb-3.5 space-y-2.5">
        {/* Compact Subtotal + Discount Trigger */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Subtotal</span>
            <span className="font-mono font-semibold text-foreground">{formatKES(subtotal)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            {payMode === "cash" && (
              <button
                type="button"
                onClick={() => setCalcOpen(v => !v)}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer",
                  calcOpen || tenderedNum > 0
                    ? "bg-primary/12 border-primary/30 text-primary"
                    : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <Calculator className="h-3 w-3" />
                Change
              </button>
            )}
            <button
              type="button"
              onClick={() => setDiscountOpen(v => !v)}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer",
                showDiscountBar
                  ? "bg-primary/12 border-primary/30 text-primary"
                  : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Percent className="h-3 w-3" />
              {discount > 0 ? `-${formatKES(discount)}` : "Discount"}
            </button>
          </div>
        </div>

        {/* Expandable Discount Bar */}
        {showDiscountBar && (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1 flex-wrap">
                {[5, 10, 15, 20].map(pct => {
                  const amt = Math.round((subtotal * pct) / 100);
                  const active = discount === amt && amt > 0;
                  return (
                    <button
                      type="button"
                      key={pct}
                      onClick={() => setDiscount(amt)}
                      className={cn(
                        "text-[10px] font-bold font-mono px-2 py-1 rounded-lg border transition-colors cursor-pointer",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background/70 border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {pct}%
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={subtotal}
                  value={discount || ""}
                  onChange={e => setDiscount(Number(e.target.value))}
                  placeholder="KES 0"
                  className="w-20 h-7 text-right text-xs font-bold font-mono bg-background border border-border rounded-lg px-2 focus:outline-none focus:border-primary"
                />
                {discount > 0 && (
                  <button
                    type="button"
                    onClick={() => { setDiscount(0); setDiscountOpen(false); }}
                    className="h-7 px-2 rounded-lg text-[10px] font-bold bg-destructive/12 text-destructive cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Expandable Cash Change Helper */}
        {payMode === "cash" && (calcOpen || tenderedNum > 0) && (
          <div className="rounded-xl border border-border/80 bg-muted/30 p-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setCashTendered(String(total))}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-background/70 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Exact
                </button>
                {[500, 1000, 2000, 5000].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCashTendered(String(n))}
                    className="text-[10px] font-bold font-mono px-1.5 py-1 rounded-lg bg-background/70 border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {n.toLocaleString()}
                  </button>
                ))}
              </div>
              <input
                type="number"
                placeholder={String(Math.ceil(total))}
                value={cashTendered}
                onChange={e => setCashTendered(e.target.value)}
                className="w-20 h-7 text-right text-xs font-bold font-mono bg-background border border-border rounded-lg px-2 focus:outline-none focus:border-primary"
              />
            </div>
            {tenderedNum > 0 && (
              <p className={cn("text-[11px] font-bold font-mono text-right", changeDue >= 0 ? "text-emerald-400" : "text-destructive")}>
                {changeDue >= 0 ? `Change due: ${formatKES(changeDue)}` : `Short by ${formatKES(Math.abs(changeDue))}`}
              </p>
            )}
          </div>
        )}

        {/* Below-cost warning */}
        {isOwner && cart.some(i => i.product.purchasePrice && i.unitPrice < i.product.purchasePrice) && (
          <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/25 rounded-xl px-2.5 py-1.5">
            <span className="text-destructive font-bold text-xs shrink-0">⚠</span>
            <p className="text-[11px] text-destructive font-semibold">
              {cart.filter(i => i.product.purchasePrice && i.unitPrice < i.product.purchasePrice).length} item(s) priced below cost
            </p>
          </div>
        )}

        {/* Payment Mode Selector */}
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/60 p-1 border border-border/70">
          <button
            type="button"
            onClick={() => selectPaymentMode("cash")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer",
              payMode === "cash"
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Banknote className="h-3.5 w-3.5 text-emerald-400" />
            Cash
          </button>
          <button
            type="button"
            onClick={() => selectPaymentMode("bank")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer",
              payMode === "bank"
                ? "bg-card text-foreground shadow-sm border border-border/80"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Landmark className="h-3.5 w-3.5 text-sky-400" />
            M-Pesa
          </button>
          <button
            type="button"
            onClick={() => selectPaymentMode("debt")}
            className={cn(
              "flex items-center justify-center gap-1.5 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer",
              payMode === "debt"
                ? "bg-destructive/15 text-destructive border border-destructive/30 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Debt
          </button>
        </div>

        {/* Hero Total + Auto-print + Primary CTA */}
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-primary/25 bg-primary/[0.06] px-3 py-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Total Due
            </p>
            {isOwner && (
              <p className={cn("text-[10px] font-mono font-semibold", totalProfit < 0 ? "text-destructive" : "text-emerald-400")}>
                {totalProfit < 0 ? "-" : "+"}{formatKES(Math.abs(totalProfit))} ({marginPct.toFixed(0)}%)
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => onAutoPrintChange(!autoPrint)}
              title={autoPrint ? "Auto-print ON" : "Auto-print OFF"}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors cursor-pointer",
                autoPrint
                  ? "bg-primary/15 border-primary/35 text-primary"
                  : "bg-background/60 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Printer className="h-3 w-3" />
              {autoPrint ? "Auto" : "Print"}
            </button>
            <span className="text-xl font-bold font-mono text-primary">
              {formatKES(total)}
            </span>
          </div>
        </div>

        {payMode === "debt" ? (
          <Button
            variant="destructive"
            className="w-full h-11 rounded-2xl font-bold text-sm shadow-lg shadow-destructive/20 cursor-pointer"
            disabled={createSalePending}
            onClick={() => handleCheckout("debt")}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Record Debt Sale · {formatKES(total)}
          </Button>
        ) : (
          <Button
            className="w-full h-11 rounded-2xl font-bold text-sm bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-105 cursor-pointer"
            disabled={createSalePending}
            onClick={() => handleCheckout("cash", payMode)}
          >
            {payMode === "bank" ? (
              <Landmark className="h-4 w-4 mr-2" />
            ) : (
              <Banknote className="h-4 w-4 mr-2" />
            )}
            {payMode === "bank" ? "Complete M-Pesa Sale" : "Complete Cash Sale"} · {formatKES(total)}
          </Button>
        )}
      </div>
    </div>
  );
});
