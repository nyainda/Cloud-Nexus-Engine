import "./_group.css";
import { useState } from "react";
import { Search, Plus, Minus, ShoppingCart, Package, Scale, X, Banknote, CreditCard, TrendingUp, ChevronRight, AlertTriangle } from "lucide-react";

function formatKES(n: number) {
  return "KSh " + n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

const PRODUCTS = [
  { id: "1", name: "Roundup 1L", cat: "Herbicides", unit: "l", price: 1850, buy: 1400, stock: 24, alert: 5, weighed: true },
  { id: "2", name: "Dursban 500ml", cat: "Insecticides", unit: "ml", price: 980, buy: 720, stock: 3, alert: 5, weighed: true },
  { id: "3", name: "DAP Fertilizer 50kg", cat: "Fertilizers", unit: "kg", price: 4200, buy: 3600, stock: 0, alert: 2, weighed: true },
  { id: "4", name: "Ridomil Gold 100g", cat: "Fungicides", unit: "g", price: 650, buy: 480, stock: 18, alert: 3, weighed: true },
  { id: "5", name: "Dimethoate EC", cat: "Insecticides", unit: "ml", price: 420, buy: 310, stock: 45, alert: 10, weighed: false },
  { id: "6", name: "CAN 50kg", cat: "Fertilizers", unit: "kg", price: 3800, buy: 3200, stock: 12, alert: 5, weighed: true },
  { id: "7", name: "Maize Seeds 2kg", cat: "Seeds", unit: "kg", price: 560, buy: 420, stock: 7, alert: 4, weighed: true },
  { id: "8", name: "Milraz 100g", cat: "Fungicides", unit: "g", price: 380, buy: 280, stock: 30, alert: 8, weighed: false },
];

interface CartItem { id: string; name: string; qty: number; price: number; buy: number; unit: string; }

export function Dark() {
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([
    { id: "1", name: "Roundup 1L", qty: 2, price: 1850, buy: 1400, unit: "l" },
    { id: "4", name: "Ridomil Gold 100g", qty: 1, price: 650, buy: 480, unit: "g" },
  ]);
  const [showCart, setShowCart] = useState(false);
  const [discount, setDiscount] = useState(0);

  const filtered = PRODUCTS.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.cat.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (p: typeof PRODUCTS[0]) => {
    if (p.stock === 0) return;
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name, qty: 1, price: p.price, buy: p.buy, unit: p.unit }];
    });
  };

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const total = Math.max(0, subtotal - discount);
  const profit = cart.reduce((s, i) => s + i.qty * (i.price - i.buy), 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="pos-dark" style={{ background: "var(--bg)", color: "var(--fg)", height: "100svh", display: "flex", flexDirection: "column", fontFamily: "'DM Sans', sans-serif", overflow: "hidden" }}>

      {showCart ? (
        /* ── Cart Sheet ── */
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Cart header */}
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--card)", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShoppingCart size={18} color="var(--primary)" />
              <span style={{ fontWeight: 700, fontSize: 15 }}>Cart</span>
              <span style={{ background: "var(--primary-dim)", color: "var(--primary)", border: "1px solid var(--primary-border)", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "1px 8px" }}>{cartCount}</span>
            </div>
            <button onClick={() => setShowCart(false)} style={{ color: "var(--fg-muted)", background: "none", border: "none", cursor: "pointer", padding: 4 }}>
              <X size={18} />
            </button>
          </div>

          {/* Cart items */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {cart.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 8, color: "var(--fg-muted)" }}>
                <ShoppingCart size={36} style={{ opacity: 0.15 }} />
                <p style={{ fontSize: 13, fontWeight: 500 }}>Cart is empty</p>
              </div>
            ) : cart.map(item => (
              <div key={item.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>{item.name}</span>
                  <button onClick={() => setCart(c => c.filter(i => i.id !== item.id))} style={{ color: "var(--fg-faint)", background: "none", border: "none", cursor: "pointer" }}>
                    <X size={14} />
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", borderRadius: 10, border: "1px solid var(--border-strong)", overflow: "hidden", background: "var(--input-bg)" }}>
                    <button onClick={() => setCart(c => c.map(i => i.id === item.id ? { ...i, qty: Math.max(0, i.qty - 1) } : i).filter(i => i.qty > 0))}
                      style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)" }}>
                      <Minus size={13} />
                    </button>
                    <span style={{ width: 28, textAlign: "center", fontSize: 14, fontWeight: 700, color: "var(--fg)" }}>{item.qty}</span>
                    <button onClick={() => setCart(c => c.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i))}
                      style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "var(--primary)" }}>
                      <Plus size={13} />
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 10, color: "var(--fg-faint)", fontFamily: "'JetBrains Mono', monospace" }}>KSh</span>
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", color: "var(--fg)" }}>{item.price.toLocaleString()}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "var(--fg)" }}>{formatKES(item.qty * item.price)}</p>
                    <p style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", color: "var(--emerald)" }}>+{formatKES(item.qty * (item.price - item.buy))}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary + checkout */}
          <div style={{ flexShrink: 0, borderTop: "1px solid var(--border)", background: "var(--card)" }}>
            <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--fg-muted)" }}>
                <span>Subtotal ({cartCount} items)</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, color: "var(--fg)" }}>{formatKES(subtotal)}</span>
              </div>
              {/* Discount */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: "var(--fg-muted)" }}>Discount (KSh)</span>
                <input type="number" value={discount || ""} onChange={e => setDiscount(Number(e.target.value))} placeholder="0"
                  style={{ width: 88, height: 30, textAlign: "right", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", background: "var(--input-bg)", border: "1px solid var(--border-strong)", borderRadius: 8, padding: "0 10px", color: "var(--fg)", outline: "none" }} />
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[5, 10, 15, 20].map(pct => (
                  <button key={pct} onClick={() => setDiscount(Math.round(subtotal * pct / 100))}
                    style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 99, background: discount === Math.round(subtotal * pct / 100) ? "var(--primary)" : "var(--input-bg)", color: discount === Math.round(subtotal * pct / 100) ? "var(--primary-fg)" : "var(--fg-muted)", border: `1px solid ${discount === Math.round(subtotal * pct / 100) ? "transparent" : "var(--border)"}`, cursor: "pointer" }}>
                    {pct}%
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-muted)" }}>Total</span>
                <span style={{ fontSize: 26, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: "var(--primary)" }}>{formatKES(total)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <TrendingUp size={12} color="var(--emerald)" />
                <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>Est. profit</span>
                <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "var(--emerald)", marginLeft: "auto" }}>{formatKES(profit - discount)}</span>
              </div>
            </div>

            {/* Customer name */}
            <div style={{ padding: "0 16px 12px" }}>
              <input type="text" placeholder="Customer name (required for debt)" style={{ width: "100%", height: 36, borderRadius: 10, border: "1px solid var(--border-strong)", background: "var(--input-bg)", color: "var(--fg)", fontSize: 13, padding: "0 12px", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Checkout buttons */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "0 16px 20px" }}>
              <button style={{ height: 50, borderRadius: 14, background: "rgba(220,38,38,0.10)", border: "1.5px solid rgba(220,38,38,0.30)", color: "var(--destructive)", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <CreditCard size={16} /> Debt
              </button>
              <button style={{ height: 50, borderRadius: 14, background: "var(--primary)", border: "none", color: "var(--primary-fg)", fontWeight: 800, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 20px rgba(200,255,0,0.25)" }}>
                <Banknote size={16} /> Cash Sale
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── Products view ── */
        <>
          {/* Search header */}
          <div style={{ padding: "12px 12px 10px", background: "var(--card)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--fg-muted)", pointerEvents: "none" }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products…"
                style={{ width: "100%", height: 42, paddingLeft: 38, paddingRight: 14, borderRadius: 14, border: "1.5px solid var(--border-strong)", background: "var(--search-bg)", color: "var(--fg)", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto" }}>
              {["All", "In Stock", "Low", "Out"].map((f, i) => (
                <button key={f} style={{ flexShrink: 0, padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: "pointer", background: i === 0 ? "var(--primary)" : "var(--input-bg)", color: i === 0 ? "var(--primary-fg)" : "var(--fg-muted)", border: i === 0 ? "none" : "1px solid var(--border)" }}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {filtered.map(p => {
                const isOut = p.stock === 0;
                const isLow = p.stock > 0 && p.stock <= p.alert;
                const inCart = cart.find(i => i.id === p.id);
                return (
                  <button key={p.id} onClick={() => addToCart(p)} disabled={isOut}
                    style={{
                      textAlign: "left", borderRadius: 14, padding: 12,
                      background: inCart ? "var(--card-active)" : isOut ? "rgba(255,255,255,0.02)" : "var(--card)",
                      border: `1.5px solid ${inCart ? "var(--primary-border)" : isOut ? "rgba(255,255,255,0.05)" : "var(--border)"}`,
                      cursor: isOut ? "not-allowed" : "pointer", opacity: isOut ? 0.45 : 1,
                      transition: "all 0.12s", display: "flex", flexDirection: "column", gap: 0
                    }}>
                    {/* Top row: icon + status dot */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 9, background: p.weighed ? "var(--primary-dim)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", color: p.weighed ? "var(--primary)" : "var(--fg-faint)" }}>
                        {p.weighed ? <Scale size={14} /> : <Package size={14} />}
                      </div>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: isOut ? "var(--destructive)" : isLow ? "var(--orange)" : "var(--emerald)" }} />
                    </div>

                    {/* Name */}
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", lineHeight: 1.35, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.name}</p>

                    {/* Stock */}
                    <p style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, marginBottom: 8, color: isOut ? "var(--destructive)" : isLow ? "var(--orange)" : "var(--fg-muted)" }}>
                      {isLow && <AlertTriangle size={9} style={{ display: "inline", marginRight: 2 }} />}
                      {isOut ? "Out of stock" : `${p.stock} ${p.unit}`}
                    </p>

                    {/* Price + add */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: "var(--fg)" }}>{formatKES(p.price)}</span>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: inCart ? "var(--primary)" : "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: inCart ? "var(--primary-fg)" : "var(--fg-muted)" }}>
                        {inCart ? <span style={{ fontSize: 9, fontWeight: 800 }}>{inCart.qty}</span> : <Plus size={11} />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <p style={{ textAlign: "center", fontSize: 11, color: "var(--fg-faint)", marginTop: 16, paddingBottom: 8 }}>Showing top 20 · Search to find more</p>
          </div>

          {/* Cart FAB */}
          {cartCount > 0 && (
            <button onClick={() => setShowCart(true)}
              style={{ position: "fixed", bottom: 20, right: 16, left: 16, height: 54, borderRadius: 16, background: "var(--primary)", border: "none", color: "var(--primary-fg)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", boxShadow: "0 6px 28px rgba(200,255,0,0.30)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <ShoppingCart size={18} />
                <span style={{ fontWeight: 700, fontSize: 13 }}>{cartCount} item{cartCount !== 1 ? "s" : ""}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>{formatKES(total)}</span>
                <ChevronRight size={16} />
              </div>
            </button>
          )}
        </>
      )}
    </div>
  );
}
