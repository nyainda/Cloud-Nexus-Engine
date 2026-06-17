import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { customFetch, useListProducts, useGetShop } from "@workspace/api-client-react";
import {
  Plus, Search, Trash2, ChevronLeft, Printer, CheckCircle2,
  XCircle, Clock, FileText, User, Phone, Mail, Calendar, StickyNote,
  Edit2, Package, AlertTriangle, Loader2, ChevronDown, X,
  Eye, Download, MessageCircle, Share2,
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

// ─── PDF & Share utilities ─────────────────────────────────────────────────────

async function downloadPdf(quotation: Quotation) {
  const el = document.getElementById("quote-doc");
  if (!el) { toast.error("Could not find document to export"); return; }

  toast.info("Preparing PDF…", { id: "pdf-gen" });
  try {
    const html2canvas = (await import("html2canvas")).default;
    const { jsPDF } = await import("jspdf");

    const canvas = await html2canvas(el, {
      scale: 2.5,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: 760,
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.97);
    const pdfW = 210;
    const pdfH = (canvas.height * pdfW) / canvas.width;
    const pageH = 297;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    let heightLeft = pdfH;
    let position = 0;

    pdf.addImage(imgData, "JPEG", 0, position, pdfW, pdfH);
    heightLeft -= pageH;

    while (heightLeft > 0) {
      position -= pageH;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, pdfW, pdfH);
      heightLeft -= pageH;
    }

    pdf.save(`${quotation.quoteNumber}.pdf`);
    toast.success("PDF downloaded!", { id: "pdf-gen" });
  } catch (err) {
    console.error(err);
    toast.error("PDF generation failed", { id: "pdf-gen" });
  }
}

function buildWhatsAppText(q: Quotation, shop: any): string {
  const lines: string[] = [
    `*QUOTATION — ${q.quoteNumber}*`,
    `_${shop?.name ?? "Our Shop"}_`,
    "",
    `👤 *Customer:* ${q.customerName}`,
    ...(q.customerPhone ? [`📞 *Phone:* ${q.customerPhone}`] : []),
    `📅 *Date:* ${format(new Date(q.createdAt), "dd MMM yyyy")}`,
    ...(q.validUntil ? [`⏳ *Valid Until:* ${format(new Date(q.validUntil), "dd MMM yyyy")}`] : []),
    "",
    "*─── ITEMS ───*",
    ...q.items.map((item, i) =>
      `${i + 1}. ${item.productName}\n   ${item.qty} ${item.unit} × ${KES(item.unitPrice)} = *${KES(item.total)}*`
    ),
    "",
    ...(q.discountAmount > 0 ? [
      `Subtotal: ${KES(q.subtotal)}`,
      `Discount: -${KES(q.discountAmount)}`,
    ] : []),
    `*TOTAL: ${KES(q.total)}*`,
    ...(q.notes ? ["", `📝 _${q.notes}_`] : []),
    "",
    "─────────────────",
    ...(shop?.ownerWhatsapp ? [`📞 ${shop.ownerWhatsapp}`] : []),
    ...(shop?.address ? [`📍 ${shop.address}`] : []),
    ...(shop?.email ? [`✉️ ${shop.email}`] : []),
    "",
    "_Thank you for your business!_",
  ];
  return lines.join("\n");
}

function shareWhatsApp(q: Quotation, shop: any) {
  const text = buildWhatsAppText(q, shop);
  const phone = q.customerPhone?.replace(/\D/g, "") ?? "";
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

// ─── Print / Preview view ─────────────────────────────────────────────────────

function PrintView({
  quotation,
  shop,
  onClose,
}: {
  quotation: Quotation;
  shop: any;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadPdf(quotation);
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col overflow-hidden print:p-0 print:bg-white print:block">
      {/* Action bar */}
      <div className="flex items-center gap-2 px-4 py-3 print:hidden shrink-0 border-b border-white/10 bg-black/60 backdrop-blur-sm flex-wrap">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/80 text-xs font-semibold hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>

        <div className="flex-1" />

        {/* WhatsApp */}
        <button
          onClick={() => shareWhatsApp(quotation, shop)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 text-xs font-bold hover:bg-[#25D366]/30 transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>

        {/* Download PDF */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {downloading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <Download className="h-3.5 w-3.5" />}
          <span>{downloading ? "Generating…" : "Download PDF"}</span>
        </button>

        {/* Print */}
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/80 text-xs font-semibold hover:bg-white/20 transition-colors"
        >
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Print</span>
        </button>
      </div>

      {/* Scrollable document area */}
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 print:p-0 print:overflow-visible">
        {/* The actual document */}
        <div
          id="quote-doc"
          className="mx-auto bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden print:rounded-none print:shadow-none print:max-w-none"
          style={{
            fontFamily: "'DM Sans', -apple-system, sans-serif",
            maxWidth: "720px",
            minWidth: "280px",
          }}
        >
          {/* ── TOP ACCENT STRIPE ── */}
          <div style={{ height: "5px", background: "linear-gradient(90deg, #C8FF00 0%, #0A0A0A 60%, #C8FF00 100%)" }} />

          {/* ── HEADER BAND ── */}
          <div style={{ background: "#0A0A0A", color: "#fff", padding: "28px 32px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
              {/* Shop info */}
              <div style={{ flex: 1, minWidth: "200px" }}>
                <p style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.2em", color: "#C8FF00", textTransform: "uppercase", marginBottom: "6px" }}>
                  Official Quotation
                </p>
                <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#ffffff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>
                  {shop?.name ?? "Our Shop"}
                </h1>
                {shop?.address && (
                  <p style={{ fontSize: "12px", color: "#9ca3af", margin: "2px 0" }}>📍 {shop.address}</p>
                )}
                <div style={{ display: "flex", gap: "16px", marginTop: "6px", flexWrap: "wrap" }}>
                  {shop?.ownerWhatsapp && (
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>📞 {shop.ownerWhatsapp}</span>
                  )}
                  {shop?.email && (
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>✉️ {shop.email}</span>
                  )}
                </div>
              </div>

              {/* Quote meta */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: "24px", fontWeight: 900, color: "#C8FF00", fontFamily: "monospace", margin: "0 0 6px", letterSpacing: "-0.02em" }}>
                  {quotation.quoteNumber}
                </p>
                <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0" }}>
                  📅 Date: {format(new Date(quotation.createdAt), "dd MMM yyyy")}
                </p>
                {quotation.validUntil && (
                  <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0" }}>
                    ⏳ Valid Until: {format(new Date(quotation.validUntil), "dd MMM yyyy")}
                  </p>
                )}
                <div style={{ marginTop: "8px" }}>
                  <span style={{
                    display: "inline-block",
                    fontSize: "10px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    background: quotation.status === "accepted" ? "rgba(52,211,153,0.2)" :
                      quotation.status === "sent" ? "rgba(96,165,250,0.2)" : "rgba(255,255,255,0.1)",
                    color: quotation.status === "accepted" ? "#34d399" :
                      quotation.status === "sent" ? "#60a5fa" : "#d1d5db",
                  }}>
                    {STATUS_META[quotation.status].label}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── BODY ── */}
          <div style={{ padding: "24px 32px", background: "#fff" }}>

            {/* Bill To */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", marginBottom: "24px" }}>
              <p style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", color: "#94a3b8", textTransform: "uppercase", marginBottom: "8px" }}>
                Bill To
              </p>
              <p style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>
                {quotation.customerName}
              </p>
              {quotation.customerPhone && (
                <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0" }}>📞 {quotation.customerPhone}</p>
              )}
              {quotation.customerEmail && (
                <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0" }}>✉️ {quotation.customerEmail}</p>
              )}
            </div>

            {/* Items Table */}
            <div style={{ marginBottom: "24px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #0A0A0A" }}>
                    <th style={{ textAlign: "left", padding: "8px 4px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748b", width: "40%" }}>#  Product</th>
                    <th style={{ textAlign: "center", padding: "8px 4px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748b", width: "8%" }}>Unit</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748b", width: "12%" }}>Qty</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748b", width: "20%" }}>Unit Price</th>
                    <th style={{ textAlign: "right", padding: "8px 4px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#64748b", width: "20%" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <td style={{ padding: "10px 4px", fontWeight: 600, color: "#0f172a" }}>
                        <span style={{ fontSize: "10px", fontWeight: 800, color: "#C8FF00", background: "#0A0A0A", borderRadius: "4px", padding: "1px 5px", marginRight: "8px" }}>
                          {i + 1}
                        </span>
                        {item.productName}
                      </td>
                      <td style={{ padding: "10px 4px", textAlign: "center", color: "#64748b", fontSize: "11px" }}>{item.unit || "unit"}</td>
                      <td style={{ padding: "10px 4px", textAlign: "right", color: "#374151", fontFamily: "monospace" }}>{item.qty}</td>
                      <td style={{ padding: "10px 4px", textAlign: "right", color: "#374151", fontFamily: "monospace" }}>{KES(item.unitPrice)}</td>
                      <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontFamily: "monospace" }}>{KES(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Totals */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                <div style={{ width: "220px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "13px", color: "#64748b" }}>
                    <span>Subtotal</span>
                    <span style={{ fontFamily: "monospace" }}>{KES(quotation.subtotal)}</span>
                  </div>
                  {quotation.discountAmount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "13px", color: "#ef4444" }}>
                      <span>Discount</span>
                      <span style={{ fontFamily: "monospace" }}>-{KES(quotation.discountAmount)}</span>
                    </div>
                  )}
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "10px 12px", marginTop: "8px",
                    background: "#0A0A0A", borderRadius: "8px",
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: 900, color: "#C8FF00", textTransform: "uppercase", letterSpacing: "0.05em" }}>Total</span>
                    <span style={{ fontSize: "15px", fontWeight: 900, color: "#ffffff", fontFamily: "monospace" }}>{KES(quotation.total)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {quotation.notes && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px" }}>
                <p style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px" }}>Notes & Terms</p>
                <p style={{ fontSize: "12px", color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{quotation.notes}</p>
              </div>
            )}

            {/* Footer */}
            <div style={{ borderTop: "2px solid #f1f5f9", paddingTop: "16px", textAlign: "center" }}>
              <p style={{ fontSize: "10px", color: "#94a3b8", lineHeight: 1.6 }}>
                This quotation is valid {quotation.validUntil
                  ? `until ${format(new Date(quotation.validUntil), "dd MMMM yyyy")}`
                  : "for 30 days from the date of issue"}.
                Prices are subject to availability. Thank you for your business.
              </p>
            </div>
          </div>

          {/* ── BOTTOM ACCENT STRIPE ── */}
          <div style={{ height: "5px", background: "linear-gradient(90deg, #C8FF00 0%, #0A0A0A 60%, #C8FF00 100%)" }} />
        </div>

        {/* Extra bottom space for mobile */}
        <div className="h-8 print:hidden" />
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          {/* ── Products ── */}
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

              {searchFocused && productMatches.length > 0 && (
                <div className="mt-1.5 bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                  {productMatches.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={e => { e.preventDefault(); addProduct(p); }}
                      className="w-full text-left px-3 py-2.5 hover:bg-muted/60 flex items-center gap-3 border-b border-border/40 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{p.canonicalName}</p>
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
                    <div className="flex items-center gap-2 flex-wrap">
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
                      <div className="relative flex-1 min-w-[100px]">
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
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 block mb-1.5">Valid Until</label>
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
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 block mb-1.5">Notes / Terms</label>
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

// ─── Quote card ───────────────────────────────────────────────────────────────

type StatusFilter = "all" | "draft" | "sent" | "accepted" | "rejected" | "expired";

function QuotationCard({
  q,
  onEdit,
  onPrint,
  onStatusChange,
  onDelete,
  shop,
}: {
  q: Quotation;
  onEdit: () => void;
  onPrint: () => void;
  onStatusChange: (status: Quotation["status"]) => void;
  onDelete: () => void;
  shop: any;
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
            {/* WhatsApp quick share */}
            <button
              onClick={() => shareWhatsApp(q, shop)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
              title="Share via WhatsApp"
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
            {/* Preview */}
            <button
              onClick={onPrint}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Preview & Download"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            {/* Edit */}
            <button
              onClick={onEdit}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Edit"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            {/* More menu */}
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
  const [clearingDrafts, setClearingDrafts] = useState(false);

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

  const handleClearDrafts = async () => {
    const drafts = quotations.filter(q => q.status === "draft");
    if (drafts.length === 0) { toast.info("No drafts to clear"); return; }
    if (!confirm(`Delete all ${drafts.length} draft quotation${drafts.length !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setClearingDrafts(true);
    let deleted = 0;
    for (const q of drafts) {
      try {
        await customFetch(`/api/quotations/${q.id}`, { method: "DELETE" });
        deleted++;
      } catch {}
    }
    setQuotations(prev => prev.filter(q => q.status !== "draft"));
    toast.success(`Cleared ${deleted} draft${deleted !== 1 ? "s" : ""}`);
    setClearingDrafts(false);
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
    { id: "sent", label: "Sent" },
    { id: "accepted", label: "Accepted" },
    { id: "draft", label: "Drafts" },
    { id: "rejected", label: "Rejected" },
  ];

  const draftCount = counts["draft"] ?? 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h1 className="text-lg font-black text-foreground font-display tracking-tight">Quotations</h1>
            <p className="text-[11px] text-muted-foreground/60">
              {quotations.length} quote{quotations.length !== 1 ? "s" : ""}
              {shop?.name ? ` · ${shop.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {draftCount > 0 && (
              <button
                onClick={handleClearDrafts}
                disabled={clearingDrafts}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-xs font-bold hover:bg-destructive/20 disabled:opacity-50 transition-colors"
              >
                {clearingDrafts
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Trash2 className="h-3 w-3" />}
                Clear {draftCount} Draft{draftCount !== 1 ? "s" : ""}
              </button>
            )}
            <button
              onClick={() => { setEditTarget(null); setView("builder"); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New Quote
            </button>
          </div>
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
                shop={shop}
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
