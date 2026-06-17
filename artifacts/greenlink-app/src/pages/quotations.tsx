import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { customFetch, useListProducts, useGetShop } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus, Search, Trash2, ChevronLeft, Printer, Send, CheckCircle2,
  XCircle, Clock, FileText, User, Phone, Mail, Calendar, StickyNote,
  Edit2, Package, AlertTriangle, Loader2, ChevronDown, X,
  Building2, MapPin, Eye, Copy,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

interface QuotationItem {
  productId?: string;
  productName: string;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface Quotation {
  id: string;
  shopId: string;
  quoteNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  notes: string | null;
  validUntil: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  items: QuotationItem[];
  createdBy: string | null;
  createdAt: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const KES = (n: number) =>
  "KES " + n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const STATUS_META = {
  draft:    { label: "Draft",    color: "text-muted-foreground bg-muted/60 border-border" },
  sent:     { label: "Sent",     color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  accepted: { label: "Accepted", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  rejected: { label: "Rejected", color: "text-red-400 bg-red-400/10 border-red-400/20" },
  expired:  { label: "Expired",  color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
} as const;

function StatusBadge({ status }: { status: Quotation["status"] }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border", m.color)}>
      {m.label}
    </span>
  );
}

// ─── Print view ───────────────────────────────────────────────────────────────

function PrintView({
  quotation,
  shop,
  onClose,
}: {
  quotation: Quotation;
  shop: any;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4 print:p-0 print:bg-white print:block">
      {/* Controls — hidden when printing */}
      <div className="flex items-center gap-2 mb-4 print:hidden sticky top-0 z-10">
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/70 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      {/* Document */}
      <div
        id="quote-doc"
        className="w-full max-w-[720px] bg-white text-gray-900 rounded-2xl shadow-2xl print:rounded-none print:shadow-none print:max-w-none print:w-full"
        style={{ fontFamily: "'DM Sans', sans-serif" }}
      >
        {/* Header band */}
        <div className="bg-[#0A0A0A] text-white px-8 py-6 rounded-t-2xl print:rounded-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#C8FF00]/70 mb-1">Quotation</p>
              <h1 className="text-2xl font-black tracking-tight text-white" style={{ fontFamily: "'Clash Display', sans-serif" }}>
                {shop?.name ?? "—"}
              </h1>
              {shop?.address && <p className="text-xs text-gray-400 mt-0.5">{shop.address}</p>}
              <div className="flex flex-wrap gap-3 mt-1.5">
                {shop?.ownerWhatsapp && (
                  <span className="text-xs text-gray-400">📞 {shop.ownerWhatsapp}</span>
                )}
                {shop?.email && (
                  <span className="text-xs text-gray-400">✉ {shop.email}</span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[#C8FF00] font-black text-xl tracking-tight font-mono">{quotation.quoteNumber}</p>
              <p className="text-[10px] text-gray-400 mt-1">Date: {format(new Date(quotation.createdAt), "dd MMM yyyy")}</p>
              {quotation.validUntil && (
                <p className="text-[10px] text-gray-400">Valid until: {format(new Date(quotation.validUntil), "dd MMM yyyy")}</p>
              )}
              <div className="mt-1.5">
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full",
                  quotation.status === "accepted" ? "bg-emerald-400/20 text-emerald-300" :
                  quotation.status === "sent" ? "bg-blue-400/20 text-blue-300" :
                  "bg-gray-600/40 text-gray-300"
                )}>
                  {STATUS_META[quotation.status].label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-6">
          {/* Bill to */}
          <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 mb-2">Bill To</p>
            <p className="font-bold text-gray-900 text-base">{quotation.customerName}</p>
            {quotation.customerPhone && <p className="text-sm text-gray-600 mt-0.5">📞 {quotation.customerPhone}</p>}
            {quotation.customerEmail && <p className="text-sm text-gray-600">✉ {quotation.customerEmail}</p>}
          </div>

          {/* Items table */}
          <div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 w-[40%]">Product</th>
                  <th className="text-center py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 w-[10%]">Unit</th>
                  <th className="text-right py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 w-[15%]">Qty</th>
                  <th className="text-right py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 w-[17%]">Unit Price</th>
                  <th className="text-right py-2 text-[10px] font-black uppercase tracking-wider text-gray-500 w-[18%]">Total</th>
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2.5 font-medium text-gray-900">{item.productName}</td>
                    <td className="py-2.5 text-center text-gray-500 text-xs">{item.unit || "unit"}</td>
                    <td className="py-2.5 text-right text-gray-700 font-mono">{item.qty}</td>
                    <td className="py-2.5 text-right text-gray-700 font-mono">{KES(item.unitPrice)}</td>
                    <td className="py-2.5 text-right font-bold text-gray-900 font-mono">{KES(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="mt-4 flex justify-end">
              <div className="w-56 space-y-1">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Subtotal</span>
                  <span className="font-mono">{KES(quotation.subtotal)}</span>
                </div>
                {quotation.discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Discount</span>
                    <span className="font-mono text-red-500">-{KES(quotation.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black text-gray-900 border-t-2 border-gray-900 pt-1.5 mt-1.5">
                  <span>TOTAL</span>
                  <span className="font-mono">{KES(quotation.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {quotation.notes && (
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-gray-400 mb-1.5">Notes</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{quotation.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-200 pt-4 text-center">
            <p className="text-[10px] text-gray-400">
              This quotation is valid {quotation.validUntil ? `until ${format(new Date(quotation.validUntil), "dd MMM yyyy")}` : "for 30 days"}.
              Prices are subject to change. Thank you for your business.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          body > * { display: none !important; }
          #quote-doc { display: block !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}

// ─── Customer autocomplete ────────────────────────────────────────────────────

function CustomerAutocomplete({
  value,
  onChange,
  shopId,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  shopId: string;
  placeholder?: string;
}) {
  const [customers, setCustomers] = useState<Array<{ customer_name: string; customer_phone: string }>>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    customFetch(`/api/quotation-customers?shopId=${shopId}`)
      .then((d: any) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [shopId]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers.filter(c => c.customer_name.toLowerCase().includes(q)).slice(0, 8);
  }, [customers, value]);

  return (
    <div ref={ref} className="relative">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder ?? "Customer name"}
        className="w-full h-10 bg-muted/40 border border-border rounded-xl px-3 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
      />
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {matches.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => { onChange(c.customer_name); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-center gap-2 border-b border-border/40 last:border-0"
            >
              <User className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              <span className="font-medium text-foreground">{c.customer_name}</span>
              {c.customer_phone && <span className="text-xs text-muted-foreground/60 ml-auto">{c.customer_phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Builder ──────────────────────────────────────────────────────────────────

function QuotationBuilder({
  shopId,
  editQuotation,
  onSave,
  onCancel,
}: {
  shopId: string;
  editQuotation: Quotation | null;
  onSave: (q: Quotation) => void;
  onCancel: () => void;
}) {
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const userName = localStorage.getItem("greenlink_userName") || "";

  const [customerName, setCustomerName] = useState(editQuotation?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(editQuotation?.customerPhone ?? "");
  const [customerEmail, setCustomerEmail] = useState(editQuotation?.customerEmail ?? "");
  const [validUntil, setValidUntil] = useState(editQuotation?.validUntil?.split("T")[0] ?? "");
  const [notes, setNotes] = useState(editQuotation?.notes ?? "");
  const [items, setItems] = useState<QuotationItem[]>(editQuotation?.items ?? []);
  const [discount, setDiscount] = useState(String(editQuotation?.discountAmount ?? 0));
  const [saving, setSaving] = useState(false);

  // Product search
  const [productSearch, setProductSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);

  const { data: productsData } = useListProducts({ shopId, limit: 3000 }, { query: { enabled: !!shopId } });
  const products = useMemo(() => (productsData as any)?.products ?? [], [productsData]);

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p: any) => p.isActive !== false && (
        p.canonicalName?.toLowerCase().includes(q) ||
        p.normalizedName?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      ))
      .slice(0, 8);
  }, [products, productSearch]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const addProduct = useCallback((p: any) => {
    const existing = items.findIndex(i => i.productId === p.id);
    if (existing >= 0) {
      setItems(prev => prev.map((item, idx) =>
        idx === existing ? { ...item, qty: item.qty + 1, total: (item.qty + 1) * item.unitPrice } : item
      ));
    } else {
      setItems(prev => [...prev, {
        productId: p.id,
        productName: p.canonicalName,
        unit: p.unit ?? "unit",
        qty: 1,
        unitPrice: p.sellingPrice ?? 0,
        total: p.sellingPrice ?? 0,
      }]);
    }
    setProductSearch("");
    setSearchFocused(false);
  }, [items]);

  const updateItem = (idx: number, field: keyof QuotationItem, val: number | string) => {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: val };
      if (field === "qty" || field === "unitPrice") {
        updated.total = Number(updated.qty) * Number(updated.unitPrice);
      }
      return updated;
    }));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discountAmount = Math.max(0, parseFloat(discount) || 0);
  const total = Math.max(0, subtotal - discountAmount);

  const handleSave = async () => {
    if (!customerName.trim()) { toast.error("Customer name is required"); return; }
    if (items.length === 0) { toast.error("Add at least one product"); return; }

    setSaving(true);
    try {
      const body = {
        shopId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        notes: notes.trim() || undefined,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        discountAmount,
        items,
        createdBy: userName || role,
      };

      let result: Quotation;
      if (editQuotation) {
        result = await customFetch(`/api/quotations/${editQuotation.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }) as Quotation;
      } else {
        result = await customFetch(`/api/quotations`, {
          method: "POST",
          body: JSON.stringify(body),
        }) as Quotation;
      }
      onSave(result);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save quotation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border shrink-0">
        <button onClick={onCancel} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-foreground font-display">
            {editQuotation ? `Edit ${editQuotation.quoteNumber}` : "New Quotation"}
          </h2>
          <p className="text-[10px] text-muted-foreground/60">
            {editQuotation ? "Update the details below" : "Build your quote from stock"}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save Quote"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 max-w-2xl mx-auto">

          {/* ── Customer section ── */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
              <User className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-xs font-bold text-foreground">Customer Details</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 block mb-1.5">
                  Customer Name *
                </label>
                <CustomerAutocomplete
                  value={customerName}
                  onChange={setCustomerName}
                  shopId={shopId}
                  placeholder="Search or type new customer name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 block mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
                    <input
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="+254 700 000000"
                      className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 block mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
                    <input
                      value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      placeholder="optional"
                      type="email"
                      className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Product search + items ── */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
              <Package className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-xs font-bold text-foreground">Products</p>
              <span className="ml-auto text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {items.length} item{items.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-border/40" ref={productSearchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
                <input
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Search products to add…"
                  className="w-full h-9 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                />
              </div>

              {/* Product dropdown */}
              {searchFocused && productMatches.length > 0 && (
                <div className="mt-1.5 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                  {productMatches.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{p.canonicalName}</p>
                        <p className="text-[10px] text-muted-foreground/50">{p.category} · Stock: {p.stockQty} {p.unit}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-primary font-mono">{KES(p.sellingPrice ?? 0)}</p>
                        {(p.stockQty ?? 0) <= 0 && (
                          <p className="text-[9px] text-red-400 font-semibold">Out of stock</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchFocused && productSearch.trim() && productMatches.length === 0 && (
                <div className="mt-1.5 bg-muted/30 border border-border rounded-xl px-3 py-3 text-center">
                  <p className="text-xs text-muted-foreground/60">No products found for "<span className="text-foreground">{productSearch}</span>"</p>
                </div>
              )}
            </div>

            {/* Items list */}
            <div className="divide-y divide-border/40">
              {items.length === 0 ? (
                <div className="py-10 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground/40">Search and add products above</p>
                </div>
              ) : (
                items.map((item, idx) => (
                  <div key={idx} className="px-4 py-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{item.productName}</p>
                      </div>
                      <p className="text-xs font-black text-primary font-mono shrink-0">{KES(item.total)}</p>
                      <button
                        onClick={() => removeItem(idx)}
                        className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-muted/40 border border-border rounded-lg px-2 py-1">
                        <button
                          onClick={() => updateItem(idx, "qty", Math.max(0.25, item.qty - (item.unit === "kg" || item.unit === "litre" ? 0.25 : 1)))}
                          className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
                        >—</button>
                        <input
                          type="number"
                          value={item.qty}
                          onChange={e => updateItem(idx, "qty", Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-12 text-center text-xs font-bold bg-transparent text-foreground focus:outline-none"
                          min={0}
                        />
                        <button
                          onClick={() => updateItem(idx, "qty", item.qty + (item.unit === "kg" || item.unit === "litre" ? 0.25 : 1))}
                          className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
                        >+</button>
                      </div>
                      <span className="text-xs text-muted-foreground/60">{item.unit}</span>
                      <span className="text-muted-foreground/30 text-xs">×</span>
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/40 pointer-events-none">KES</span>
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={e => updateItem(idx, "unitPrice", Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full h-8 pl-9 pr-2 bg-muted/40 border border-border rounded-lg text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                          min={0}
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals */}
            {items.length > 0 && (
              <div className="border-t border-border/60 px-4 py-3 space-y-2 bg-muted/10">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono font-semibold text-foreground">{KES(subtotal)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground shrink-0">Discount (KES)</span>
                  <input
                    type="number"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    min={0}
                    className="flex-1 h-7 px-2 bg-muted/40 border border-border rounded-lg text-xs font-mono text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border/60 pt-2">
                  <span className="text-sm font-black text-foreground">Total</span>
                  <span className="text-base font-black text-primary font-mono">{KES(total)}</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Quote details ── */}
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/60">
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              <p className="text-xs font-bold text-foreground">Quote Details</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 block mb-1.5">
                  Valid Until
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 block mb-1.5">
                  Notes / Terms
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Payment terms, delivery conditions, special instructions…"
                  rows={3}
                  className="w-full px-3 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                />
              </div>
            </div>
          </div>

          {/* Save button (bottom) */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Saving…" : editQuotation ? "Update Quotation" : "Create Quotation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "draft" | "sent" | "accepted" | "rejected" | "expired";

function QuotationCard({
  q,
  onEdit,
  onPrint,
  onStatusChange,
  onDelete,
}: {
  q: Quotation;
  onEdit: () => void;
  onPrint: () => void;
  onStatusChange: (status: Quotation["status"]) => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden hover:border-border/80 transition-colors">
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-black text-primary font-mono shrink-0">{q.quoteNumber}</span>
            <StatusBadge status={q.status} />
          </div>
          <div className="flex items-center gap-1 shrink-0 relative">
            <button
              onClick={onPrint}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Preview & Print"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onEdit}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Edit"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-xl shadow-2xl z-40 overflow-hidden">
                    {(["draft", "sent", "accepted", "rejected", "expired"] as const).filter(s => s !== q.status).map(s => (
                      <button
                        key={s}
                        onClick={() => { onStatusChange(s); setMenuOpen(false); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-muted/60 flex items-center gap-2"
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0",
                          s === "accepted" ? "bg-emerald-400" :
                          s === "sent" ? "bg-blue-400" :
                          s === "rejected" ? "bg-red-400" :
                          s === "expired" ? "bg-amber-400" : "bg-muted-foreground"
                        )} />
                        Mark as {STATUS_META[s].label}
                      </button>
                    ))}
                    <div className="border-t border-border/40" />
                    <button
                      onClick={() => { onDelete(); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 flex items-center gap-2"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{q.customerName}</p>
            {q.customerPhone && (
              <p className="text-xs text-muted-foreground/60 mt-0.5">{q.customerPhone}</p>
            )}
            <p className="text-[10px] text-muted-foreground/40 mt-1">
              {q.items.length} item{q.items.length !== 1 ? "s" : ""} ·{" "}
              {format(new Date(q.createdAt), "dd MMM yyyy")}
              {q.validUntil && ` · Valid until ${format(new Date(q.validUntil), "dd MMM")}`}
            </p>
          </div>
          <p className="text-base font-black text-primary font-mono shrink-0">{KES(q.total)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type PageView = "list" | "builder" | "print";

export default function Quotations() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  const [view, setView] = useState<PageView>("list");
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<Quotation | null>(null);
  const [printTarget, setPrintTarget] = useState<Quotation | null>(null);

  const { data: shopData } = useGetShop(shopId, { query: { enabled: !!shopId } });
  const shop = shopData as any;

  const loadQuotations = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const data = await customFetch(`/api/quotations?shopId=${shopId}&limit=200`) as Quotation[];
      setQuotations(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { loadQuotations(); }, [loadQuotations]);

  const filtered = useMemo(() => {
    let list = quotations;
    if (filter !== "all") list = list.filter(q => q.status === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(x =>
        x.customerName.toLowerCase().includes(q) ||
        x.quoteNumber.toLowerCase().includes(q)
      );
    }
    return list;
  }, [quotations, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quotations.length };
    quotations.forEach(q => { c[q.status] = (c[q.status] ?? 0) + 1; });
    return c;
  }, [quotations]);

  const handleSave = (q: Quotation) => {
    setQuotations(prev => {
      const idx = prev.findIndex(x => x.id === q.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = q;
        return next;
      }
      return [q, ...prev];
    });
    toast.success(editTarget ? "Quotation updated" : `${q.quoteNumber} created`);
    setView("list");
    setEditTarget(null);
  };

  const handleStatusChange = async (q: Quotation, status: Quotation["status"]) => {
    try {
      const updated = await customFetch(`/api/quotations/${q.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }) as Quotation;
      setQuotations(prev => prev.map(x => x.id === updated.id ? updated : x));
      toast.success(`Marked as ${STATUS_META[status].label}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (q: Quotation) => {
    if (!confirm(`Delete ${q.quoteNumber}? This cannot be undone.`)) return;
    try {
      await customFetch(`/api/quotations/${q.id}`, { method: "DELETE" });
      setQuotations(prev => prev.filter(x => x.id !== q.id));
      toast.success("Quotation deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ── Print view ──
  if (view === "print" && printTarget) {
    return (
      <PrintView
        quotation={printTarget}
        shop={shop}
        onClose={() => { setView("list"); setPrintTarget(null); }}
      />
    );
  }

  // ── Builder view ──
  if (view === "builder") {
    return (
      <div className="flex flex-col h-full bg-background">
        <QuotationBuilder
          shopId={shopId}
          editQuotation={editTarget}
          onSave={handleSave}
          onCancel={() => { setView("list"); setEditTarget(null); }}
        />
      </div>
    );
  }

  // ── List view ──
  const TABS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "draft", label: "Draft" },
    { id: "sent", label: "Sent" },
    { id: "accepted", label: "Accepted" },
    { id: "rejected", label: "Rejected" },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-black text-foreground font-display tracking-tight">Quotations</h1>
            <p className="text-[11px] text-muted-foreground/60">
              {quotations.length} quote{quotations.length !== 1 ? "s" : ""}
              {shop?.name ? ` · ${shop.name}` : ""}
            </p>
          </div>
          <button
            onClick={() => { setEditTarget(null); setView("builder"); }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Quote
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by customer or quote number…"
            className="w-full h-9 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all shrink-0",
                filter === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
              )}
            >
              {tab.label}
              {counts[tab.id] ? (
                <span className={cn(
                  "text-[9px] font-black px-1 py-0.5 rounded-full min-w-[16px] text-center",
                  filter === tab.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted/60 text-muted-foreground/60"
                )}>{counts[tab.id]}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground/60">Loading quotations…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted/30 flex items-center justify-center">
              <FileText className="h-7 w-7 text-muted-foreground/30" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {search || filter !== "all" ? "No matching quotations" : "No quotations yet"}
              </p>
              <p className="text-xs text-muted-foreground/50 mt-1">
                {search || filter !== "all"
                  ? "Try a different filter or search term"
                  : "Create your first quote by tapping New Quote"}
              </p>
            </div>
            {!search && filter === "all" && (
              <button
                onClick={() => { setEditTarget(null); setView("builder"); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> Create First Quote
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filtered.map(q => (
              <QuotationCard
                key={q.id}
                q={q}
                onEdit={() => { setEditTarget(q); setView("builder"); }}
                onPrint={() => { setPrintTarget(q); setView("print"); }}
                onStatusChange={(s) => handleStatusChange(q, s)}
                onDelete={() => handleDelete(q)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
