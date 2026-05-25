import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import {
  useListProducts,
  useCreateSale,
  getListProductsQueryKey,
  getListDebtsQueryKey,
  getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatKES } from "@/lib/format";
import {
  Search, Plus, Minus, Trash2, ShoppingCart,
  PackageX, Package, CreditCard, Banknote, X,
  ChevronRight, TrendingUp, Scale, AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

// ─── helpers ──────────────────────────────────────────────────────────────────

const WEIGHT_UNITS = new Set(["kg", "g", "gram", "grams", "litre", "liter", "l", "ml", "ton", "tonne"]);
function isWeighedUnit(unit: string) {
  return WEIGHT_UNITS.has((unit || "").trim().toLowerCase());
}

function cls(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

interface CartItem {
  product: any;
  qty: number;
  unitPrice: number;
}

// ─── QuickAdd sheet ────────────────────────────────────────────────────────────

function QuickAddSheet({
  product, open, onClose, onAdd, isOwner,
}: {
  product: any | null;
  open: boolean;
  onClose: () => void;
  onAdd: (product: any, qty: number, price: number) => void;
  isOwner: boolean;
}) {
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);

  useEffect(() => {
    if (open && product) {
      setQty(isWeighedUnit(product.unit || "") ? 0.5 : 1);
      setPrice(product.sellingPrice || 0);
    }
  }, [open, product]);

  if (!open || !product) return null;

  const weighed = isWeighedUnit(product.unit || "");
  const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
  const isOut = product.stockQty === 0;
  const margin = product.purchasePrice && price
    ? (((price - product.purchasePrice) / price) * 100).toFixed(0)
    : null;
  const profit = product.purchasePrice ? qty * (price - product.purchasePrice) : null;
  const qtyStep = weighed ? 0.25 : 1;
  const qtyMin = weighed ? 0.1 : 1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
    >
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
        }}
      />

      {/* sheet */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 420,
          borderRadius: "16px 16px 0 0",
          borderTop: "1px solid var(--border)",
          borderLeft: "1px solid var(--border)",
          borderRight: "1px solid var(--border)",
          background: "var(--card)",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: weighed ? "rgba(var(--primary-rgb, 200 255 0)/0.1)" : "var(--muted)",
              border: "1px solid var(--border)",
              color: weighed ? "var(--primary)" : "var(--muted-foreground)",
            }}>
              {weighed ? <Scale size={18} /> : <Package size={18} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3, color: "var(--foreground)" }}>
                {product.canonicalName}
              </p>
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
                {product.category && (
                  <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>{product.category}</span>
                )}
                {product.unit && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: "monospace",
                    padding: "1px 6px", borderRadius: 4,
                    border: `1px solid ${weighed ? "var(--primary)" : "var(--border)"}`,
                    color: weighed ? "var(--primary)" : "var(--muted-foreground)",
                    background: weighed ? "rgba(200,255,0,0.06)" : "transparent",
                  }}>
                    {product.unit}
                  </span>
                )}
              </div>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700,
              padding: "3px 8px", borderRadius: 999, flexShrink: 0,
              background: isOut ? "rgba(239,68,68,0.15)" : isLow ? "rgba(249,115,22,0.15)" : "rgba(34,197,94,0.15)",
              color: isOut ? "#f87171" : isLow ? "#fb923c" : "#4ade80",
            }}>
              {isOut ? "Out of Stock" : isLow ? `Low: ${product.stockQty}` : `${product.stockQty} ${product.unit || "units"}`}
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* qty */}
          <div>
            <label style={{
              display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 8,
            }}>
              Quantity{weighed ? ` (${product.unit || "kg"})` : ` (${product.unit || "units"})`}
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => setQty(q => Math.max(qtyMin, parseFloat((q - qtyStep).toFixed(2))))}
                style={{
                  width: 44, height: 44, borderRadius: 12, border: "1px solid var(--border)",
                  background: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "var(--foreground)",
                }}
              >
                <Minus size={16} />
              </button>
              <input
                type="number" min={qtyMin} step={qtyStep} max={product.stockQty}
                value={qty}
                onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= qtyMin) setQty(v); }}
                style={{
                  flex: 1, height: 44, textAlign: "center", fontSize: 22, fontWeight: 700,
                  fontFamily: "monospace", background: "var(--muted)", border: "1px solid var(--border)",
                  borderRadius: 12, outline: "none", color: "var(--foreground)",
                }}
              />
              <button
                onClick={() => setQty(q => Math.min(product.stockQty, parseFloat((q + qtyStep).toFixed(2))))}
                disabled={qty >= product.stockQty}
                style={{
                  width: 44, height: 44, borderRadius: 12, border: "none",
                  background: "var(--primary)", color: "var(--primary-foreground)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: qty >= product.stockQty ? "not-allowed" : "pointer",
                  opacity: qty >= product.stockQty ? 0.4 : 1,
                }}
              >
                <Plus size={16} />
              </button>
            </div>
            {weighed && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                {(product.unit?.toLowerCase() === "g" ? [100, 250, 500, 1000] : [0.5, 1, 2, 5, 10]).map(v => (
                  <button
                    key={v} type="button" onClick={() => setQty(v)}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                      border: `1px solid ${qty === v ? "var(--primary)" : "var(--border)"}`,
                      background: qty === v ? "rgba(200,255,0,0.15)" : "var(--muted)",
                      color: qty === v ? "var(--primary)" : "var(--muted-foreground)",
                      cursor: "pointer",
                    }}
                  >
                    {v}{product.unit}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* price */}
          <div>
            <label style={{
              display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 8,
            }}>
              Unit Price (KES)
            </label>
            <input
              type="number" value={price}
              onChange={e => setPrice(Number(e.target.value))}
              style={{
                width: "100%", height: 44, textAlign: "right", fontSize: 20, fontWeight: 700,
                fontFamily: "monospace", background: "var(--muted)", border: "1px solid var(--border)",
                borderRadius: 12, padding: "0 14px", outline: "none", color: "var(--foreground)",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* summary box */}
          <div style={{
            background: "var(--muted)", borderRadius: 12, border: "1px solid var(--border)",
            padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6,
          }}>
            {product.purchasePrice > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Buy price</span>
                <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--muted-foreground)" }}>
                  {formatKES(product.purchasePrice)}
                </span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Subtotal</span>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", color: "var(--foreground)" }}>
                {formatKES(qty * price)}
              </span>
            </div>
            {profit !== null && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingTop: 6, marginTop: 2, borderTop: "1px solid var(--border)",
              }}>
                <span style={{ fontSize: 12, color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 4 }}>
                  <TrendingUp size={12} style={{ color: "#4ade80" }} />
                  Est. Profit {margin && <span style={{ fontSize: 10, color: "#4ade80" }}>({margin}%)</span>}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700, fontFamily: "monospace",
                  color: profit >= 0 ? "#4ade80" : "var(--destructive)",
                }}>
                  {formatKES(profit)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* footer */}
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, height: 48, borderRadius: 12, border: "1px solid var(--border)",
              background: "transparent", color: "var(--foreground)", fontWeight: 700,
              fontSize: 14, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            disabled={isOut}
            onClick={() => { onAdd(product, qty, price); onClose(); }}
            style={{
              flex: 1, height: 48, borderRadius: 12, border: "none",
              background: isOut ? "var(--muted)" : "var(--primary)",
              color: isOut ? "var(--muted-foreground)" : "var(--primary-foreground)",
              fontWeight: 700, fontSize: 14,
              cursor: isOut ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            <ShoppingCart size={16} />
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cart item row ────────────────────────────────────────────────────────────

function CartItemRow({
  item, isOwner, onQtyDec, onQtyInc, onRemove, onPriceChange,
}: {
  item: CartItem;
  isOwner: boolean;
  onQtyDec: () => void;
  onQtyInc: () => void;
  onRemove: () => void;
  onPriceChange: (p: number) => void;
}) {
  const itemProfit = isOwner && item.product.purchasePrice
    ? item.qty * (item.unitPrice - item.product.purchasePrice)
    : null;

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", flex: 1, lineHeight: 1.3 }}>
          {item.product.canonicalName}
        </span>
        <button
          onClick={onRemove}
          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--muted-foreground)" }}
        >
          <X size={14} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        {/* qty stepper */}
        <div style={{
          display: "flex", alignItems: "center",
          background: "var(--muted)", borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden",
        }}>
          <button
            onClick={onQtyDec}
            style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)" }}
          >
            <Minus size={13} />
          </button>
          <span style={{ width: 28, textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>
            {item.qty}
          </span>
          <button
            onClick={onQtyInc}
            disabled={item.qty >= item.product.stockQty}
            style={{
              width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none",
              cursor: item.qty >= item.product.stockQty ? "not-allowed" : "pointer",
              color: item.qty >= item.product.stockQty ? "var(--muted-foreground)" : "var(--primary)",
              opacity: item.qty >= item.product.stockQty ? 0.4 : 1,
            }}
          >
            <Plus size={13} />
          </button>
        </div>

        {/* unit price input */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>KSh</span>
          <input
            type="number" value={item.unitPrice}
            onChange={e => onPriceChange(Number(e.target.value))}
            style={{
              width: 70, height: 30, textAlign: "right", fontSize: 13, fontWeight: 600,
              background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6,
              padding: "0 6px", outline: "none", color: "var(--foreground)",
            }}
          />
        </div>

        {/* total */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "var(--foreground)", margin: 0 }}>
            {formatKES(item.qty * item.unitPrice)}
          </p>
          {isOwner && itemProfit !== null && (
            <p style={{
              fontSize: 10, fontFamily: "monospace", margin: 0,
              color: itemProfit >= 0 ? "#4ade80" : "var(--destructive)",
            }}>
              +{formatKES(itemProfit)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Cart panel (rendered both in desktop sidebar and mobile sheet) ────────────

interface CartPanelProps {
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
  onClear: () => void;
  onClose?: () => void;
  updateQty: (id: string, delta: number) => void;
  removeFromCart: (id: string) => void;
  updatePrice: (id: string, price: number) => void;
  handleCheckout: (type: "cash" | "debt") => void;
}

const CartPanel = memo(function CartPanel({
  cart, discount, debtCustomerName, debtCustomerPhone, isOwner,
  createSalePending, subtotal, total, totalProfit, cartCount,
  setDiscount, setDebtCustomerName, setDebtCustomerPhone,
  onClear, onClose, updateQty, removeFromCart, updatePrice, handleCheckout,
}: CartPanelProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--card)" }}>

      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShoppingCart size={16} style={{ color: "var(--primary)" }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: "var(--foreground)" }}>Cart</span>
          {cartCount > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999,
              background: "rgba(200,255,0,0.15)", color: "var(--primary)",
            }}>
              {cartCount} {cartCount === 1 ? "item" : "items"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {onClose && (
            <button
              onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 4 }}
            >
              <X size={16} />
            </button>
          )}
          {cartCount > 0 && (
            <button
              onClick={onClear}
              style={{ fontSize: 11, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer" }}
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* scrollable items list */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {cart.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            height: 180, gap: 8, color: "var(--muted-foreground)",
          }}>
            <ShoppingCart size={36} style={{ opacity: 0.2 }} />
            <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Cart is empty</p>
            <p style={{ fontSize: 11, margin: 0, opacity: 0.5, textAlign: "center", padding: "0 24px" }}>
              Tap any product to add it
            </p>
          </div>
        ) : (
          cart.map(item => (
            <CartItemRow
              key={item.product.id}
              item={item}
              isOwner={isOwner}
              onQtyDec={() => updateQty(item.product.id, -1)}
              onQtyInc={() => updateQty(item.product.id, 1)}
              onRemove={() => removeFromCart(item.product.id)}
              onPriceChange={p => updatePrice(item.product.id, p)}
            />
          ))
        )}
      </div>

      {/* footer (totals + checkout) — only when cart has items */}
      {cart.length > 0 && (
        <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)" }}>

          {/* totals */}
          <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted-foreground)" }}>
              <span>Subtotal ({cartCount} items)</span>
              <span style={{ fontFamily: "monospace" }}>{formatKES(subtotal)}</span>
            </div>

            {/* discount row */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 13, color: "var(--muted-foreground)" }}>Discount (KSh)</span>
                <input
                  type="number" min={0} max={subtotal}
                  value={discount || ""}
                  onChange={e => setDiscount(Number(e.target.value))}
                  placeholder="0"
                  style={{
                    width: 80, height: 28, textAlign: "right", fontSize: 13, fontFamily: "monospace",
                    background: "var(--muted)", border: "1px solid var(--border)", borderRadius: 6,
                    padding: "0 8px", outline: "none", color: "var(--foreground)",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {[5, 10, 15, 20].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setDiscount(Math.round(subtotal * pct / 100))}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                      border: "none", cursor: "pointer",
                      background: discount === Math.round(subtotal * pct / 100)
                        ? "var(--primary)" : "var(--muted)",
                      color: discount === Math.round(subtotal * pct / 100)
                        ? "var(--primary-foreground)" : "var(--muted-foreground)",
                    }}
                  >
                    {pct}%
                  </button>
                ))}
                {discount > 0 && (
                  <button
                    onClick={() => setDiscount(0)}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                      border: "none", cursor: "pointer",
                      background: "rgba(239,68,68,0.15)", color: "#f87171",
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* grand total */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              paddingTop: 8, borderTop: "1px solid var(--border)",
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-foreground)" }}>
                Total
              </span>
              <span style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: "var(--primary)" }}>
                {formatKES(total)}
              </span>
            </div>

            {isOwner && totalProfit > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ color: "var(--muted-foreground)", display: "flex", alignItems: "center", gap: 4 }}>
                  <TrendingUp size={11} style={{ color: "#4ade80" }} /> Est. Profit
                </span>
                <span style={{ fontFamily: "monospace", color: "#4ade80", fontWeight: 600 }}>{formatKES(totalProfit)}</span>
              </div>
            )}
          </div>

          {/* customer fields */}
          <div style={{ padding: "0 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", color: "var(--muted-foreground)", display: "block", marginBottom: 2,
            }}>
              Customer name (required for debt)
            </label>
            <input
              type="text" placeholder="e.g. John Kamau"
              value={debtCustomerName}
              onChange={e => setDebtCustomerName(e.target.value)}
              style={{
                height: 36, width: "100%", boxSizing: "border-box",
                borderRadius: 8, border: "1px solid var(--border)", background: "var(--muted)",
                padding: "0 12px", fontSize: 13, outline: "none", color: "var(--foreground)",
              }}
            />
            <input
              type="tel" placeholder="Phone (optional)"
              value={debtCustomerPhone}
              onChange={e => setDebtCustomerPhone(e.target.value)}
              style={{
                height: 36, width: "100%", boxSizing: "border-box",
                borderRadius: 8, border: "1px solid var(--border)", background: "var(--muted)",
                padding: "0 12px", fontSize: 13, outline: "none", color: "var(--foreground)",
              }}
            />
          </div>

          {/* checkout buttons */}
          <div style={{ padding: "0 14px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              disabled={createSalePending}
              onClick={() => handleCheckout("debt")}
              style={{
                height: 48, borderRadius: 12, border: "1px solid rgba(239,68,68,0.4)",
                background: "transparent", color: "#f87171",
                fontWeight: 700, fontSize: 13, cursor: createSalePending ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: createSalePending ? 0.6 : 1,
              }}
            >
              <CreditCard size={15} /> Debt Sale
            </button>
            <button
              disabled={createSalePending}
              onClick={() => handleCheckout("cash")}
              style={{
                height: 48, borderRadius: 12, border: "none",
                background: "var(--primary)", color: "var(--primary-foreground)",
                fontWeight: 700, fontSize: 13, cursor: createSalePending ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                opacity: createSalePending ? 0.6 : 1,
              }}
            >
              <Banknote size={15} /> Cash Sale
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── Product card ─────────────────────────────────────────────────────────────

const ProductCard = memo(function ProductCard({
  product, inCart, onClick,
}: {
  product: any;
  inCart: CartItem | undefined;
  onClick: () => void;
}) {
  const weighed = isWeighedUnit(product.unit || "");
  const isLow = product.stockQty > 0 && product.stockQty <= product.alertQty;
  const isOut = product.stockQty === 0;

  return (
    <button
      onClick={onClick}
      disabled={isOut}
      style={{
        display: "flex", flexDirection: "column", textAlign: "left",
        borderRadius: 12, padding: "10px 10px 8px",
        border: `1px solid ${inCart ? "var(--primary)" : "var(--border)"}`,
        background: isOut
          ? "var(--muted)"
          : inCart
          ? "rgba(200,255,0,0.07)"
          : "var(--card)",
        cursor: isOut ? "not-allowed" : "pointer",
        opacity: isOut ? 0.45 : 1,
        width: "100%",
      }}
    >
      {/* top row: icon + stock dot */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: weighed ? "rgba(200,255,0,0.1)" : "var(--muted)",
          color: weighed ? "var(--primary)" : "var(--muted-foreground)",
        }}>
          {weighed ? <Scale size={13} /> : <Package size={13} />}
        </div>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: isOut ? "#ef4444" : isLow ? "#f97316" : "#22c55e",
        }} />
      </div>

      {/* name */}
      <p style={{
        fontSize: 11, fontWeight: 600, color: "var(--foreground)",
        lineHeight: 1.35, flex: 1, margin: "0 0 6px 0",
        overflow: "hidden", display: "-webkit-box",
        WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
      }}>
        {product.canonicalName}
      </p>

      {/* stock qty */}
      <p style={{
        fontSize: 10, fontFamily: "monospace", fontWeight: 700, margin: "0 0 6px 0",
        color: isOut ? "#f87171" : isLow ? "#fb923c" : "var(--muted-foreground)",
      }}>
        {isOut ? "Out of stock" : `${product.stockQty} ${product.unit || "units"}`}
      </p>

      {/* price + cart indicator */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: "var(--foreground)" }}>
          {formatKES(product.sellingPrice || 0)}
        </span>
        <div style={{
          width: 22, height: 22, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: inCart ? "var(--primary)" : "var(--muted)",
          color: inCart ? "var(--primary-foreground)" : "var(--muted-foreground)",
        }}>
          {inCart
            ? <span style={{ fontSize: 9, fontWeight: 700 }}>{inCart.qty}</span>
            : <Plus size={11} />}
        </div>
      </div>
    </button>
  );
});

// ─── Main POS ─────────────────────────────────────────────────────────────────

type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";

const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in_stock", label: "In Stock" },
  { value: "low_stock", label: "Low" },
  { value: "out_of_stock", label: "Out" },
];

export default function POS() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 100);
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: productsData, isLoading } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId } }
  );

  const filteredProducts = useMemo(() => {
    let all = productsData?.products || [];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      all = all.filter(p =>
        p.canonicalName.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    if (stockFilter === "in_stock") return all.filter(p => p.stockQty > p.alertQty);
    if (stockFilter === "low_stock") return all.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty);
    if (stockFilter === "out_of_stock") return all.filter(p => p.stockQty === 0);
    return all;
  }, [productsData, debouncedSearch, stockFilter]);

  const filterCounts = useMemo(() => {
    const all = productsData?.products || [];
    return {
      all: all.length,
      in_stock: all.filter(p => p.stockQty > p.alertQty).length,
      low_stock: all.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty).length,
      out_of_stock: all.filter(p => p.stockQty === 0).length,
    };
  }, [productsData]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [showCartMobile, setShowCartMobile] = useState(false);
  const [debtCustomerName, setDebtCustomerName] = useState("");
  const [debtCustomerPhone, setDebtCustomerPhone] = useState("");
  const createSale = useCreateSale();

  const [quickAddProduct, setQuickAddProduct] = useState<any | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const openQuickAdd = (product: any) => {
    if (product.stockQty === 0) { toast.error("Out of stock"); return; }
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  const handleQuickAdd = (product: any, qty: number, price: number) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, qty: Math.min(i.qty + qty, product.stockQty), unitPrice: price }
            : i
        );
      }
      return [...prev, { product, qty, unitPrice: price }];
    });
    toast.success(`${product.canonicalName} added`);
  };

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(i => i.product.id === productId ? { ...i, qty: Math.max(0, i.qty + delta) } : i)
        .filter(i => i.qty > 0)
    );
  }, []);

  const removeFromCart = useCallback(
    (productId: string) => setCart(prev => prev.filter(i => i.product.id !== productId)),
    []
  );

  const updatePrice = useCallback(
    (productId: string, price: number) =>
      setCart(prev => prev.map(i => i.product.id === productId ? { ...i, unitPrice: price } : i)),
    []
  );

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.qty * i.unitPrice, 0), [cart]);
  const total = Math.max(0, subtotal - discount);
  const totalProfit = useMemo(() =>
    cart.reduce((s, i) => s + i.qty * (i.unitPrice - (i.product.purchasePrice || 0)), 0), [cart]);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const handleCheckout = useCallback(async (saleType: "cash" | "debt") => {
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    if (saleType === "debt" && !debtCustomerName.trim()) {
      toast.error("Enter customer name for debt sale"); return;
    }
    const cartSnapshot = [...cart];
    const discountSnapshot = discount;
    const debtName = debtCustomerName;
    const debtPhone = debtCustomerPhone;
    const productsSnapshot = qc.getQueryData(getListProductsQueryKey());

    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return {
        ...old,
        products: old.products.map((p: any) => {
          const ci = cartSnapshot.find(i => i.product.id === p.id);
          return ci ? { ...p, stockQty: Math.max(0, p.stockQty - ci.qty) } : p;
        }),
      };
    });

    setCart([]);
    setDiscount(0);
    setDebtCustomerName("");
    setDebtCustomerPhone("");
    setShowCartMobile(false);

    createSale.mutate(
      {
        data: {
          shopId, saleType,
          discount: discountSnapshot,
          items: cartSnapshot.map(i => ({ productId: i.product.id, qty: i.qty, unitPrice: i.unitPrice })),
          servedBy: userName,
          debtCustomerName: saleType === "debt" ? debtName : undefined,
          debtCustomerPhone: saleType === "debt" ? debtPhone : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success(saleType === "cash" ? "✓ Cash sale complete!" : "✓ Debt recorded!");
          if (saleType === "debt") qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
          qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
        },
        onError: (err: any) => {
          qc.setQueryData(getListProductsQueryKey(), productsSnapshot);
          setCart(cartSnapshot);
          setDiscount(discountSnapshot);
          toast.error(err?.message || "Sale failed");
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, discount, debtCustomerName, debtCustomerPhone, shopId, userName]);

  const cartPanelProps: CartPanelProps = {
    cart, discount, debtCustomerName, debtCustomerPhone, isOwner,
    createSalePending: createSale.isPending,
    subtotal, total, totalProfit, cartCount,
    setDiscount, setDebtCustomerName, setDebtCustomerPhone,
    onClear: () => { setCart([]); setDiscount(0); },
    updateQty, removeFromCart, updatePrice, handleCheckout,
  };

  const visibleProducts = debouncedSearch || stockFilter !== "all"
    ? filteredProducts
    : filteredProducts.slice(0, 200);

  return (
    <>
      {/*
        ═══════════════════════════════════════════════════════════
        ROOT: absolute inset-0, flex row (desktop) / col (mobile)
        NO transforms, NO overflow:hidden on parents
        ═══════════════════════════════════════════════════════════
      */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "row",
        background: "var(--background)",
      }}>

        {/* ── LEFT: Products panel ── */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid var(--border)",
        }}>

          {/* Search + filter bar — fixed height, never scrolls */}
          <div style={{
            flexShrink: 0,
            padding: "10px 12px 8px",
            borderBottom: "1px solid var(--border)",
            background: "var(--card)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            {/* search input */}
            <div style={{ position: "relative" }}>
              <Search
                size={15}
                style={{
                  position: "absolute", left: 12,
                  top: "50%", marginTop: -7.5,
                  color: "var(--muted-foreground)", pointerEvents: "none",
                }}
              />
              <input
                ref={searchRef}
                type="search"
                placeholder="Search products…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  height: 40, paddingLeft: 36, paddingRight: search ? 36 : 12,
                  fontSize: 14, borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--muted)",
                  outline: "none", color: "var(--foreground)",
                }}
              />
              {search && (
                <button
                  onClick={() => { setSearch(""); searchRef.current?.focus(); }}
                  style={{
                    position: "absolute", right: 10, top: "50%", marginTop: -10,
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted-foreground)", padding: 2,
                  }}
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* filter pills */}
            <div style={{
              display: "flex", gap: 6,
              overflowX: "auto", paddingBottom: 2,
            }}>
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  onClick={() => setStockFilter(f.value)}
                  style={{
                    flexShrink: 0,
                    display: "flex", alignItems: "center", gap: 4,
                    padding: "5px 12px", borderRadius: 999,
                    border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                    background: stockFilter === f.value ? "var(--primary)" : "var(--muted)",
                    color: stockFilter === f.value ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {f.label}
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    opacity: stockFilter === f.value ? 0.7 : 0.5,
                  }}>
                    {filterCounts[f.value]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Product grid — this is the only thing that scrolls */}
          <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
            {isLoading ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                gap: 8,
              }}>
                {Array.from({ length: 18 }).map((_, i) => (
                  <div key={i} style={{
                    borderRadius: 12, border: "1px solid var(--border)",
                    background: "var(--card)", padding: "10px 10px 8px",
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--muted)" }} />
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--muted)" }} />
                    </div>
                    <div style={{ height: 10, background: "var(--muted)", borderRadius: 4, width: "80%" }} />
                    <div style={{ height: 9, background: "var(--muted)", borderRadius: 4, width: "60%" }} />
                    <div style={{ height: 11, background: "var(--muted)", borderRadius: 4, width: "45%" }} />
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: 200, gap: 8, color: "var(--muted-foreground)",
              }}>
                <PackageX size={40} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>No products found</p>
                {search && <p style={{ fontSize: 11, margin: 0, opacity: 0.5 }}>Try a different search term</p>}
              </div>
            ) : (
              <>
                {!debouncedSearch && stockFilter === "all" && filteredProducts.length > 200 && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    marginBottom: 10, padding: "8px 12px",
                    borderRadius: 10, background: "var(--muted)",
                    border: "1px solid var(--border)",
                  }}>
                    <Search size={13} style={{ opacity: 0.4, flexShrink: 0 }} />
                    <p style={{ fontSize: 11, margin: 0, color: "var(--muted-foreground)" }}>
                      Showing first <strong>200</strong> of{" "}
                      <strong>{filteredProducts.length.toLocaleString()}</strong> products — search to find any product instantly
                    </p>
                  </div>
                )}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: 8,
                }}>
                  {visibleProducts.map(product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      inCart={cart.find(i => i.product.id === product.id)}
                      onClick={() => openQuickAdd(product)}
                    />
                  ))}
                </div>
                <p style={{
                  textAlign: "center", fontSize: 11, color: "var(--muted-foreground)",
                  opacity: 0.4, marginTop: 16, paddingBottom: 8,
                }}>
                  {debouncedSearch
                    ? `${filteredProducts.length.toLocaleString()} results`
                    : stockFilter !== "all"
                    ? `${filteredProducts.length.toLocaleString()} products`
                    : filteredProducts.length > 200
                    ? `Showing 200 of ${filteredProducts.length.toLocaleString()} — search to see all`
                    : `${filteredProducts.length.toLocaleString()} products`}
                </p>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT: Desktop-only Cart sidebar ── */}
        <div style={{
          width: 340,
          flexShrink: 0,
          display: "none",
          flexDirection: "column",
          background: "var(--card)",
        }}
          className="pos-desktop-cart"
        >
          <CartPanel {...cartPanelProps} />
        </div>
      </div>

      {/* ── Mobile: Cart FAB ── */}
      {cartCount > 0 && !showCartMobile && (
        <button
          onClick={() => setShowCartMobile(true)}
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom) + 56px + 12px)",
            right: 16,
            zIndex: 40,
            background: "var(--primary)",
            color: "var(--primary-foreground)",
            border: "none",
            borderRadius: 16,
            height: 52,
            padding: "0 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(0,0,0,0.35)",
          }}
          className="pos-cart-fab"
        >
          <ShoppingCart size={18} />
          <div style={{ textAlign: "left" }}>
            <p style={{ fontSize: 10, fontWeight: 700, margin: 0, opacity: 0.8 }}>{cartCount} items</p>
            <p style={{ fontSize: 14, fontWeight: 700, fontFamily: "monospace", margin: 0, lineHeight: 1.2 }}>
              {formatKES(total)}
            </p>
          </div>
          <ChevronRight size={14} style={{ opacity: 0.6 }} />
        </button>
      )}

      {/* ── Mobile: Cart bottom sheet ── */}
      {showCartMobile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
          className="pos-cart-sheet"
        >
          {/* backdrop */}
          <div
            onClick={() => setShowCartMobile(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }}
          />
          {/* sheet */}
          <div style={{
            position: "relative",
            height: "92svh",
            borderRadius: "18px 18px 0 0",
            border: "1px solid var(--border)",
            borderBottom: "none",
            background: "var(--card)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            <CartPanel {...cartPanelProps} onClose={() => setShowCartMobile(false)} />
          </div>
        </div>
      )}

      {/* ── QuickAdd sheet ── */}
      <QuickAddSheet
        product={quickAddProduct}
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onAdd={handleQuickAdd}
        isOwner={isOwner}
      />

      {/* ── Inline styles for desktop cart and mobile FAB visibility ── */}
      <style>{`
        @media (min-width: 1024px) {
          .pos-desktop-cart { display: flex !important; }
          .pos-cart-fab { display: none !important; }
          .pos-cart-sheet { display: none !important; }
        }
      `}</style>
    </>
  );
}
