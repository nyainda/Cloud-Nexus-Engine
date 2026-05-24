import { useState, useMemo, useRef, useCallback } from "react";
import { useListProducts } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { formatKES } from "@/lib/format";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, Search, X, Printer, Trash2, FileText, Receipt,
  ChevronLeft, CheckCircle2, Clock, Send, XCircle,
  Edit3, Package, Phone, MapPin, User, Calendar,
  StickyNote, Tag, ChevronDown, Loader2, MoreVertical
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";

const shopId = () => localStorage.getItem("greenlink_shopId") || "";
const shopName = () => localStorage.getItem("greenlink_shopName") || "Shop";

// ── Types ──────────────────────────────────────────────────────────────────────
interface QuoteItem {
  id?: string;
  productId?: string;
  productName: string;
  unit: string;
  unitPrice: number;
  qty: number;
  total: number;
}

interface Quotation {
  id: string;
  shop_id: string;
  quote_number: string;
  type: "quotation" | "invoice";
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  status: string;
  valid_until: string | null;
  notes: string | null;
  subtotal: number;
  discount: number;
  total: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  items?: QuoteItem[];
}

// ── API helpers ────────────────────────────────────────────────────────────────
const fetchQuotations = async (type?: string): Promise<Quotation[]> => {
  const params = new URLSearchParams({ shopId: shopId() });
  if (type) params.set("type", type);
  const res = await customFetch(`/api/quotations?${params}`);
  return res.json();
};

const fetchQuotation = async (id: string): Promise<Quotation> => {
  const res = await customFetch(`/api/quotations/${id}`);
  return res.json();
};

const createQuotation = async (data: any): Promise<Quotation> => {
  const res = await customFetch("/api/quotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, shopId: shopId() }),
  });
  return res.json();
};

const updateQuotation = async (id: string, data: any): Promise<Quotation> => {
  const res = await customFetch(`/api/quotations/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
};

const deleteQuotation = async (id: string): Promise<void> => {
  await customFetch(`/api/quotations/${id}`, { method: "DELETE" });
};

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    draft:    { label: "Draft",    className: "bg-muted/60 text-muted-foreground border-border", icon: Edit3 },
    sent:     { label: "Sent",     className: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Send },
    accepted: { label: "Accepted", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
    declined: { label: "Declined", className: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
    expired:  { label: "Expired",  className: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: Clock },
    paid:     { label: "Paid",     className: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  };
  const c = cfg[status] ?? cfg.draft;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", c.className)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

// ── Print view ─────────────────────────────────────────────────────────────────
function printQuotation(q: Quotation) {
  const shop = shopName();
  const docType = q.type === "invoice" ? "INVOICE" : "QUOTATION";
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${docType} ${q.quote_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px; max-width: 700px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #C8FF00; padding-bottom: 20px; }
  .shop-name { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  .doc-type { font-size: 28px; font-weight: 900; color: #888; letter-spacing: 0.05em; text-align: right; }
  .doc-num { font-size: 14px; color: #555; font-weight: 600; text-align: right; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .meta-block h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 6px; }
  .meta-block p { font-size: 13px; font-weight: 600; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #0A0A0A; color: #C8FF00; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
  thead th:last-child, thead th:nth-last-child(2), thead th:nth-last-child(3) { text-align: right; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: middle; }
  tbody td:last-child, tbody td:nth-last-child(2), tbody td:nth-last-child(3) { text-align: right; font-family: monospace; }
  tbody tr:hover { background: #f9f9f9; }
  .totals { margin-left: auto; width: 260px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .total-row.grand { border-top: 2px solid #0A0A0A; margin-top: 8px; padding-top: 12px; font-size: 16px; font-weight: 800; }
  .notes { margin-top: 28px; padding: 14px 16px; background: #f5f5f5; border-radius: 6px; font-size: 12px; line-height: 1.6; color: #444; }
  .notes strong { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 4px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #999; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="shop-name">${shop}</div>
    <div style="color:#666;font-size:12px;margin-top:4px;">Retail Operations</div>
  </div>
  <div>
    <div class="doc-type">${docType}</div>
    <div class="doc-num">${q.quote_number}</div>
  </div>
</div>
<div class="meta">
  <div class="meta-block">
    <h3>Bill To</h3>
    <p>${q.customer_name}</p>
    ${q.customer_phone ? `<p style="color:#555">${q.customer_phone}</p>` : ""}
    ${q.customer_address ? `<p style="color:#555">${q.customer_address}</p>` : ""}
  </div>
  <div class="meta-block" style="text-align:right">
    <h3>Details</h3>
    <p>Date: ${format(new Date(q.created_at), "d MMM yyyy")}</p>
    ${q.valid_until ? `<p>Valid until: ${format(new Date(q.valid_until), "d MMM yyyy")}</p>` : ""}
    <p style="margin-top:8px"><span style="background:#0A0A0A;color:#C8FF00;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700">${(q.status || "draft").toUpperCase()}</span></p>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th style="width:40px">#</th>
      <th>Description</th>
      <th>Unit</th>
      <th>Qty</th>
      <th>Unit Price</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>
    ${(q.items || []).map((item, i) => `
    <tr>
      <td style="color:#888">${i + 1}</td>
      <td>${item.productName}</td>
      <td style="color:#888">${item.unit}</td>
      <td style="text-align:right">${item.qty}</td>
      <td>${formatKES(item.unitPrice)}</td>
      <td><strong>${formatKES(item.total)}</strong></td>
    </tr>`).join("")}
  </tbody>
</table>
<div class="totals">
  <div class="total-row"><span>Subtotal</span><span>${formatKES(q.subtotal)}</span></div>
  ${q.discount > 0 ? `<div class="total-row" style="color:#e55"><span>Discount</span><span>- ${formatKES(q.discount)}</span></div>` : ""}
  <div class="total-row grand"><span>TOTAL</span><span>${formatKES(q.total)}</span></div>
</div>
${q.notes ? `<div class="notes"><strong>Notes</strong>${q.notes}</div>` : ""}
<div class="footer">Generated by GreenLink OS · ${format(new Date(), "d MMM yyyy, h:mm a")}</div>
</body>
</html>`;
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }
}

// ── Product picker ─────────────────────────────────────────────────────────────
function ProductPicker({ onAdd }: { onAdd: (item: QuoteItem) => void }) {
  const [q, setQ] = useState("");
  const { data } = useListProducts(
    { shopId: shopId(), limit: 3000 },
    { query: { staleTime: 5 * 60_000 } }
  );
  const products = data?.products ?? [];

  const filtered = useMemo(() => {
    if (!q.trim()) return products.slice(0, 30);
    const lower = q.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(lower) ||
      (p as any).category?.toLowerCase().includes(lower) ||
      (p as any).sku?.toLowerCase().includes(lower)
    ).slice(0, 50);
  }, [products, q]);

  return (
    <div className="flex flex-col h-full">
      <div className="relative shrink-0 mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search products…"
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/40 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
          autoFocus
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 -mx-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-1 text-muted-foreground">
            <Package className="h-5 w-5 opacity-30" />
            <p className="text-xs">No products found</p>
          </div>
        ) : (
          <div className="space-y-1 px-1">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => onAdd({
                  productId: p.id,
                  productName: p.name,
                  unit: (p as any).unit ?? "unit",
                  unitPrice: p.sellingPrice ?? 0,
                  qty: 1,
                  total: p.sellingPrice ?? 0,
                })}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card hover:bg-muted/60 border border-border/40 hover:border-primary/30 transition-all text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Package className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(p as any).category ?? "General"}</p>
                </div>
                <span className="text-xs font-bold font-mono text-primary shrink-0">{formatKES(p.sellingPrice ?? 0)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Builder form ───────────────────────────────────────────────────────────────
interface BuilderProps {
  docType: "quotation" | "invoice";
  initial?: Quotation | null;
  onSaved: (q: Quotation) => void;
  onCancel: () => void;
}

function QuoteBuilder({ docType, initial, onSaved, onCancel }: BuilderProps) {
  const qc = useQueryClient();
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customer_phone ?? "");
  const [customerAddress, setCustomerAddress] = useState(initial?.customer_address ?? "");
  const [validUntil, setValidUntil] = useState(
    initial?.valid_until ?? format(addDays(new Date(), 14), "yyyy-MM-dd")
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [discount, setDiscount] = useState(initial?.discount ?? 0);
  const [items, setItems] = useState<QuoteItem[]>(initial?.items ?? []);
  const [showProducts, setShowProducts] = useState(!initial && items.length === 0);

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const total = Math.max(0, subtotal - discount);

  const addItem = useCallback((item: QuoteItem) => {
    setItems(prev => {
      const existing = prev.findIndex(i => i.productId === item.productId && item.productId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = {
          ...updated[existing],
          qty: updated[existing].qty + 1,
          total: (updated[existing].qty + 1) * updated[existing].unitPrice,
        };
        return updated;
      }
      return [...prev, item];
    });
  }, []);

  const updateItem = (idx: number, field: "qty" | "unitPrice", val: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const qty = field === "qty" ? val : it.qty;
      const unitPrice = field === "unitPrice" ? val : it.unitPrice;
      return { ...it, qty, unitPrice, total: qty * unitPrice };
    }));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        type: docType,
        customerName,
        customerPhone,
        customerAddress,
        validUntil,
        notes,
        discount,
        items: items.map(it => ({
          productId: it.productId,
          productName: it.productName,
          unit: it.unit,
          unitPrice: it.unitPrice,
          qty: it.qty,
        })),
      };
      if (initial) return updateQuotation(initial.id, payload);
      return createQuotation(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success(`${docType === "invoice" ? "Invoice" : "Quotation"} saved!`);
      onSaved(saved);
    },
    onError: () => toast.error("Failed to save — please try again"),
  });

  const isValid = customerName.trim() && items.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={onCancel} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold font-display">
            {initial ? "Edit" : "New"} {docType === "invoice" ? "Invoice" : "Quotation"}
          </h2>
          {initial && <p className="text-[10px] text-muted-foreground">{initial.quote_number}</p>}
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!isValid || saveMutation.isPending}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all",
            isValid && !saveMutation.isPending
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-col lg:flex-row h-full">
          {/* Left: Product picker */}
          <div className={cn(
            "border-b lg:border-b-0 lg:border-r border-border shrink-0",
            showProducts ? "flex flex-col" : "hidden lg:flex lg:flex-col",
            "lg:w-80 p-4"
          )}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Products</p>
              <button onClick={() => setShowProducts(false)} className="lg:hidden text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0" style={{ height: showProducts ? "40dvh" : "auto" }}>
              <ProductPicker onAdd={item => { addItem(item); }} />
            </div>
          </div>

          {/* Right: Quote details */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto min-h-0">
            {/* Customer */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer Details</p>
              <div className="space-y-2">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Customer name *"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    type="tel"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={customerAddress}
                    onChange={e => setCustomerAddress(e.target.value)}
                    placeholder="Address (optional)"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Items ({items.length})
                </p>
                <button
                  onClick={() => setShowProducts(true)}
                  className="lg:hidden flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add product
                </button>
              </div>

              {items.length === 0 ? (
                <button
                  onClick={() => setShowProducts(true)}
                  className="w-full flex flex-col items-center gap-2 py-8 border border-dashed border-border rounded-xl text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                >
                  <Plus className="h-5 w-5" />
                  <p className="text-xs font-medium">Click to add products</p>
                </button>
              ) : (
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="bg-card border border-border rounded-xl p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.unit}</p>
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Unit Price</p>
                          <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
                            <span className="text-[10px] text-muted-foreground">KES</span>
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={e => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="flex-1 min-w-0 bg-transparent text-xs font-mono font-bold focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="w-24">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Qty</p>
                          <div className="flex items-center bg-muted/40 rounded-lg">
                            <button
                              onClick={() => updateItem(idx, "qty", Math.max(0.5, item.qty - (item.qty % 1 === 0 ? 1 : 0.5)))}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
                            >−</button>
                            <input
                              type="number"
                              value={item.qty}
                              onChange={e => updateItem(idx, "qty", parseFloat(e.target.value) || 0)}
                              className="flex-1 min-w-0 bg-transparent text-xs font-mono font-bold text-center focus:outline-none"
                            />
                            <button
                              onClick={() => updateItem(idx, "qty", item.qty + 1)}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
                            >+</button>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Total</p>
                          <p className="text-xs font-bold font-mono text-primary">{formatKES(item.total)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setShowProducts(true)}
                    className="lg:hidden w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add more products
                  </button>
                </div>
              )}
            </div>

            {/* Discount + Valid until + Notes */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Discount (KES)
                  </p>
                  <input
                    type="number"
                    value={discount}
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Valid Until
                  </p>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="relative">
                <StickyNote className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Notes / terms (optional)"
                  rows={2}
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none"
                />
              </div>
            </div>

            {/* Totals summary */}
            {items.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatKES(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-xs text-destructive">
                    <span>Discount</span>
                    <span className="font-mono">− {formatKES(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-border pt-2 mt-1">
                  <span>TOTAL</span>
                  <span className="font-mono text-primary text-base">{formatKES(total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail view ────────────────────────────────────────────────────────────────
function QuoteDetail({ id, onBack, onEdit }: { id: string; onBack: () => void; onEdit: (q: Quotation) => void }) {
  const qc = useQueryClient();
  const { data: q, isLoading } = useQuery({
    queryKey: ["quotations", id],
    queryFn: () => fetchQuotation(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateQuotation(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success("Status updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuotation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success("Deleted");
      onBack();
    },
  });

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
  if (!q) return null;

  const statusOptions = q.type === "invoice"
    ? ["draft", "sent", "paid"]
    : ["draft", "sent", "accepted", "declined", "expired"];

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={onBack} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold font-display">{q.quote_number}</h2>
            <StatusBadge status={q.status} />
          </div>
          <p className="text-[10px] text-muted-foreground">{q.customer_name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => printQuotation(q)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Printer className="h-4 w-4" />
          </button>
          <button
            onClick={() => onEdit(q)}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Edit3 className="h-4 w-4" />
          </button>
          <button
            onClick={() => { if (confirm("Delete this document?")) deleteMutation.mutate(); }}
            className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
        {/* Customer */}
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-3">Customer</p>
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold">{q.customer_name}</span>
          </div>
          {q.customer_phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <a href={`tel:${q.customer_phone}`} className="text-sm text-primary">{q.customer_phone}</a>
            </div>
          )}
          {q.customer_address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">{q.customer_address}</span>
            </div>
          )}
          {q.valid_until && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">Valid until {format(new Date(q.valid_until), "d MMM yyyy")}</span>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Items</p>
          {(q.items ?? []).map((item, i) => (
            <div key={i} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{item.productName}</p>
                <p className="text-[10px] text-muted-foreground">{item.qty} {item.unit} × {formatKES(item.unitPrice)}</p>
              </div>
              <span className="text-sm font-bold font-mono text-primary shrink-0">{formatKES(item.total)}</span>
            </div>
          ))}

          <div className="bg-card border border-border rounded-xl px-4 py-4 space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Subtotal</span><span className="font-mono">{formatKES(q.subtotal)}</span>
            </div>
            {q.discount > 0 && (
              <div className="flex justify-between text-xs text-destructive">
                <span>Discount</span><span className="font-mono">− {formatKES(q.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold border-t border-border pt-2">
              <span>TOTAL</span>
              <span className="font-mono text-primary text-base">{formatKES(q.total)}</span>
            </div>
          </div>
        </div>

        {q.notes && (
          <div className="bg-muted/30 border border-border rounded-xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
            <p className="text-xs text-foreground/80 leading-relaxed">{q.notes}</p>
          </div>
        )}

        {/* Status change */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Change Status</p>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map(s => (
              <button
                key={s}
                disabled={q.status === s || statusMutation.isPending}
                onClick={() => statusMutation.mutate(s)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                  q.status === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Print / convert */}
        <div className="flex gap-2">
          <button
            onClick={() => printQuotation(q)}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted/60 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print / PDF
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
type View =
  | { kind: "list" }
  | { kind: "build"; docType: "quotation" | "invoice"; editing: Quotation | null }
  | { kind: "detail"; id: string };

export default function QuotationsPage() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [activeTab, setActiveTab] = useState<"quotation" | "invoice">("quotation");

  const { data: quotes = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["quotations", activeTab],
    queryFn: () => fetchQuotations(activeTab),
    staleTime: 30_000,
  });

  if (view.kind === "build") {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <QuoteBuilder
          docType={view.docType}
          initial={view.editing}
          onSaved={saved => setView({ kind: "detail", id: saved.id })}
          onCancel={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  if (view.kind === "detail") {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <QuoteDetail
          id={view.id}
          onBack={() => setView({ kind: "list" })}
          onEdit={q => setView({ kind: "build", docType: q.type, editing: q })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold font-display flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Quotes & Invoices
            </h1>
            <p className="text-xs text-muted-foreground">{quotes.length} document{quotes.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView({ kind: "build", docType: "quotation", editing: null })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold hover:bg-muted/60 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Quote
            </button>
            <button
              onClick={() => setView({ kind: "build", docType: "invoice", editing: null })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Receipt className="h-3.5 w-3.5" />
              Invoice
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-muted/40 rounded-xl p-1">
          {(["quotation", "invoice"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "quotation" ? <FileText className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}
              {tab === "quotation" ? "Quotations" : "Invoices"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            {activeTab === "quotation"
              ? <FileText className="h-12 w-12 opacity-10" />
              : <Receipt className="h-12 w-12 opacity-10" />}
            <div className="text-center">
              <p className="text-sm font-semibold">No {activeTab === "quotation" ? "quotations" : "invoices"} yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create your first one above</p>
            </div>
            <button
              onClick={() => setView({ kind: "build", docType: activeTab, editing: null })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New {activeTab === "quotation" ? "Quotation" : "Invoice"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {quotes.map(q => (
              <button
                key={q.id}
                onClick={() => setView({ kind: "detail", id: q.id })}
                className="w-full bg-card border border-border rounded-xl p-4 text-left hover:border-primary/30 hover:bg-muted/20 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                    {q.type === "invoice"
                      ? <Receipt className="h-4 w-4 text-primary" />
                      : <FileText className="h-4 w-4 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs font-bold text-muted-foreground font-mono">{q.quote_number}</p>
                      <StatusBadge status={q.status} />
                    </div>
                    <p className="text-sm font-bold truncate">{q.customer_name}</p>
                    {q.customer_phone && (
                      <p className="text-[10px] text-muted-foreground">{q.customer_phone}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold font-mono text-primary">{formatKES(q.total)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {format(new Date(q.created_at), "d MMM yyyy")}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
