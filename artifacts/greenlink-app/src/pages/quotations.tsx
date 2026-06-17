import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { customFetch, useListProducts, useGetShop } from "@workspace/api-client-react";
import {
  Plus, Search, Trash2, ChevronLeft, Printer, CheckCircle2,
  XCircle, Clock, FileText, User, Phone, Mail, Calendar, StickyNote,
  Edit2, Package, Loader2, X, Eye, Download, MessageCircle,
  ChevronDown, ChevronUp, ShoppingCart, Copy, MoreVertical,
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
  draft:    { label: "Draft",    color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20" },
  sent:     { label: "Sent",     color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  accepted: { label: "Accepted", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  rejected: { label: "Rejected", color: "text-red-400 bg-red-400/10 border-red-400/20" },
  expired:  { label: "Expired",  color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
} as const;

function StatusBadge({ status }: { status: Quotation["status"] }) {
  const m = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border", m.color)}>
      {m.label}
    </span>
  );
}

// ─── PDF generation (jsPDF + autotable) ───────────────────────────────────────

async function downloadPdf(quotation: Quotation, shop: any) {
  toast.loading("Generating PDF…", { id: "pdf" });
  try {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();

    // ── Header band ──
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, W, 42, "F");

    // Lime accent stripe
    doc.setFillColor(200, 255, 0);
    doc.rect(0, 0, W, 3, "F");

    // Shop name
    doc.setTextColor(200, 255, 0);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("OFFICIAL QUOTATION", 14, 11);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text(shop?.name ?? "Our Shop", 14, 20);

    if (shop?.address) {
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(shop.address, 14, 27);
    }

    const contactParts: string[] = [];
    if (shop?.ownerWhatsapp) contactParts.push(shop.ownerWhatsapp);
    if (shop?.email) contactParts.push(shop.email);
    if (contactParts.length) {
      doc.setFontSize(7.5);
      doc.setTextColor(156, 163, 175);
      doc.text(contactParts.join("   "), 14, 33);
    }

    // Quote number (right side)
    doc.setTextColor(200, 255, 0);
    doc.setFontSize(18);
    doc.setFont("courier", "bold");
    doc.text(quotation.quoteNumber, W - 14, 18, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(`Date: ${format(new Date(quotation.createdAt), "dd MMM yyyy")}`, W - 14, 26, { align: "right" });
    if (quotation.validUntil) {
      doc.text(`Valid Until: ${format(new Date(quotation.validUntil), "dd MMM yyyy")}`, W - 14, 32, { align: "right" });
    }
    doc.setTextColor(200, 200, 200);
    doc.text(STATUS_META[quotation.status].label.toUpperCase(), W - 14, 39, { align: "right" });

    // ── Bill To ──
    let y = 50;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, y, W - 28, 24, 3, 3, "F");
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(14, y, W - 28, 24, 3, 3, "S");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text("BILL TO", 20, y + 7);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(quotation.customerName, 20, y + 15);

    const billParts: string[] = [];
    if (quotation.customerPhone) billParts.push(quotation.customerPhone);
    if (quotation.customerEmail) billParts.push(quotation.customerEmail);
    if (billParts.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(billParts.join("   "), 20, y + 21);
    }

    y += 32;

    // ── Items table ──
    autoTable(doc, {
      startY: y,
      head: [["#", "Product", "Unit", "Qty", "Unit Price", "Total"]],
      body: quotation.items.map((item, i) => [
        String(i + 1),
        item.productName,
        item.unit || "unit",
        item.qty % 1 === 0 ? String(item.qty) : item.qty.toFixed(2),
        KES(item.unitPrice),
        KES(item.total),
      ]),
      headStyles: {
        fillColor: [10, 10, 10],
        textColor: [200, 255, 0],
        fontStyle: "bold",
        fontSize: 8,
        cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
      },
      bodyStyles: {
        fontSize: 9,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
        textColor: [30, 41, 59],
      },
      alternateRowStyles: { fillColor: [250, 250, 252] },
      columnStyles: {
        0: { cellWidth: 8, halign: "center", fontStyle: "bold" },
        1: { cellWidth: "auto" },
        2: { cellWidth: 16, halign: "center", textColor: [100, 116, 139] },
        3: { cellWidth: 14, halign: "right" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
      },
      margin: { left: 14, right: 14 },
      tableLineColor: [241, 245, 249],
      tableLineWidth: 0.3,
    });

    const finalY = (doc as any).lastAutoTable.finalY + 6;

    // ── Totals ──
    const totalsX = W - 14 - 60;
    let ty = finalY;

    if (quotation.discountAmount > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text("Subtotal", totalsX, ty);
      doc.text(KES(quotation.subtotal), W - 14, ty, { align: "right" });
      ty += 7;

      doc.setTextColor(239, 68, 68);
      doc.text("Discount", totalsX, ty);
      doc.text(`- ${KES(quotation.discountAmount)}`, W - 14, ty, { align: "right" });
      ty += 4;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(totalsX, ty, W - 14, ty);
      ty += 6;
    }

    doc.setFillColor(10, 10, 10);
    doc.roundedRect(totalsX - 6, ty - 5, W - 14 - totalsX + 20, 14, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(200, 255, 0);
    doc.text("TOTAL", totalsX, ty + 4);
    doc.setTextColor(255, 255, 255);
    doc.text(KES(quotation.total), W - 14, ty + 4, { align: "right" });
    ty += 18;

    // ── Notes ──
    if (quotation.notes) {
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(14, ty, W - 28, 20, 2, 2, "F");
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(14, ty, W - 28, 20, 2, 2, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text("NOTES & TERMS", 20, ty + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      const noteLines = doc.splitTextToSize(quotation.notes, W - 48);
      doc.text(noteLines.slice(0, 2), 20, ty + 14);
      ty += 26;
    }

    // ── Footer ──
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const validText = quotation.validUntil
      ? `This quotation is valid until ${format(new Date(quotation.validUntil), "dd MMMM yyyy")}.`
      : "This quotation is valid for 30 days from the date of issue.";
    doc.text(validText + " Prices are subject to availability.", 14, ty + 6, { maxWidth: W - 28 });

    // Bottom lime stripe
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(200, 255, 0);
    doc.rect(0, pageH - 3, W, 3, "F");

    doc.save(`${quotation.quoteNumber}.pdf`);
    toast.success("PDF downloaded!", { id: "pdf" });
  } catch (err) {
    console.error(err);
    toast.error("PDF generation failed. Try printing instead.", { id: "pdf" });
  }
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

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

// ─── Print preview ────────────────────────────────────────────────────────────

function PrintView({ quotation, shop, onClose }: { quotation: Quotation; shop: any; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadPdf(quotation, shop);
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#0A0A0A] shrink-0 flex-wrap">
        <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/70 text-xs font-semibold hover:bg-white/20 transition-colors">
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="text-xs font-black text-[#C8FF00] font-mono">{quotation.quoteNumber}</span>
        <div className="flex-1" />
        <button
          onClick={() => shareWhatsApp(quotation, shop)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 text-xs font-bold hover:bg-[#25D366]/30 transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C8FF00] text-[#0A0A0A] text-xs font-black hover:bg-[#C8FF00]/90 disabled:opacity-60 transition-colors"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          {downloading ? "Generating…" : "Download PDF"}
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/70 text-xs font-semibold hover:bg-white/20 transition-colors">
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Print</span>
        </button>
      </div>

      {/* Document */}
      <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-6">
        <div
          id="quote-doc"
          className="mx-auto bg-white text-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: "720px" }}
        >
          <div style={{ height: "5px", background: "linear-gradient(90deg, #C8FF00 0%, #0A0A0A 60%, #C8FF00 100%)" }} />
          <div style={{ background: "#0A0A0A", color: "#fff", padding: "28px 32px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <p style={{ fontSize: "10px", fontWeight: 800, letterSpacing: "0.2em", color: "#C8FF00", textTransform: "uppercase", marginBottom: "6px" }}>Official Quotation</p>
                <h1 style={{ fontSize: "22px", fontWeight: 900, color: "#fff", margin: "0 0 4px", letterSpacing: "-0.02em" }}>{shop?.name ?? "Our Shop"}</h1>
                {shop?.address && <p style={{ fontSize: "12px", color: "#9ca3af", margin: "2px 0" }}>📍 {shop.address}</p>}
                <div style={{ display: "flex", gap: "16px", marginTop: "6px", flexWrap: "wrap" }}>
                  {shop?.ownerWhatsapp && <span style={{ fontSize: "11px", color: "#9ca3af" }}>📞 {shop.ownerWhatsapp}</span>}
                  {shop?.email && <span style={{ fontSize: "11px", color: "#9ca3af" }}>✉️ {shop.email}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: "24px", fontWeight: 900, color: "#C8FF00", fontFamily: "monospace", margin: "0 0 6px" }}>{quotation.quoteNumber}</p>
                <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0" }}>📅 {format(new Date(quotation.createdAt), "dd MMM yyyy")}</p>
                {quotation.validUntil && <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0" }}>⏳ Valid: {format(new Date(quotation.validUntil), "dd MMM yyyy")}</p>}
                <span style={{ display: "inline-block", marginTop: "8px", fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.1em", padding: "3px 10px", borderRadius: "20px", background: "rgba(255,255,255,0.1)", color: "#d1d5db" }}>
                  {STATUS_META[quotation.status].label}
                </span>
              </div>
            </div>
          </div>

          <div style={{ padding: "24px 32px", background: "#fff" }}>
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "14px 18px", marginBottom: "24px" }}>
              <p style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", color: "#94a3b8", textTransform: "uppercase", marginBottom: "8px" }}>Bill To</p>
              <p style={{ fontSize: "16px", fontWeight: 800, color: "#0f172a", margin: "0 0 4px" }}>{quotation.customerName}</p>
              {quotation.customerPhone && <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0" }}>📞 {quotation.customerPhone}</p>}
              {quotation.customerEmail && <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0" }}>✉️ {quotation.customerEmail}</p>}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "24px" }}>
              <thead>
                <tr style={{ background: "#0A0A0A" }}>
                  <th style={{ textAlign: "left", padding: "9px 8px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "4%" }}>#</th>
                  <th style={{ textAlign: "left", padding: "9px 8px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00" }}>Product</th>
                  <th style={{ textAlign: "center", padding: "9px 8px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "8%" }}>Unit</th>
                  <th style={{ textAlign: "right", padding: "9px 8px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "8%" }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "9px 8px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "18%" }}>Unit Price</th>
                  <th style={{ textAlign: "right", padding: "9px 8px", fontSize: "9px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "18%" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 8px", textAlign: "center", fontSize: "10px", fontWeight: 800, color: "#94a3b8" }}>{i + 1}</td>
                    <td style={{ padding: "10px 8px", fontWeight: 600, color: "#0f172a" }}>{item.productName}</td>
                    <td style={{ padding: "10px 8px", textAlign: "center", color: "#64748b", fontSize: "11px" }}>{item.unit || "unit"}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: "#374151", fontFamily: "monospace" }}>{item.qty}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", color: "#374151", fontFamily: "monospace" }}>{KES(item.unitPrice)}</td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontFamily: "monospace" }}>{KES(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "24px" }}>
              <div style={{ width: "240px" }}>
                {quotation.discountAmount > 0 && <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "13px", color: "#64748b" }}>
                    <span>Subtotal</span><span style={{ fontFamily: "monospace" }}>{KES(quotation.subtotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: "13px", color: "#ef4444" }}>
                    <span>Discount</span><span style={{ fontFamily: "monospace" }}>-{KES(quotation.discountAmount)}</span>
                  </div>
                </>}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", marginTop: "8px", background: "#0A0A0A", borderRadius: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 900, color: "#C8FF00", textTransform: "uppercase" }}>Total</span>
                  <span style={{ fontSize: "15px", fontWeight: 900, color: "#fff", fontFamily: "monospace" }}>{KES(quotation.total)}</span>
                </div>
              </div>
            </div>

            {quotation.notes && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px" }}>
                <p style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", color: "#94a3b8", textTransform: "uppercase", marginBottom: "6px" }}>Notes & Terms</p>
                <p style={{ fontSize: "12px", color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{quotation.notes}</p>
              </div>
            )}

            <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "14px", textAlign: "center" }}>
              <p style={{ fontSize: "10px", color: "#94a3b8", lineHeight: 1.6 }}>
                This quotation is valid {quotation.validUntil ? `until ${format(new Date(quotation.validUntil), "dd MMMM yyyy")}` : "for 30 days from the date of issue"}.
                Prices are subject to availability. Thank you for your business.
              </p>
            </div>
          </div>

          <div style={{ height: "5px", background: "linear-gradient(90deg, #C8FF00 0%, #0A0A0A 60%, #C8FF00 100%)" }} />
        </div>
        <div className="h-8" />
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

// ─── Customer autocomplete ─────────────────────────────────────────────────────

function CustomerAutocomplete({ value, onChange, shopId, placeholder }: {
  value: string; onChange: (v: string, phone?: string) => void; shopId: string; placeholder?: string;
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
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
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
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
        <input
          value={value}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Search or type customer name"}
          className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {matches.map((c, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => { onChange(c.customer_name, c.customer_phone); setOpen(false); }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-center gap-2 border-b border-border/30 last:border-0"
            >
              <User className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span className="font-semibold text-foreground">{c.customer_name}</span>
              {c.customer_phone && <span className="text-xs text-muted-foreground/50 ml-auto font-mono">{c.customer_phone}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quotation Builder ─────────────────────────────────────────────────────────

function QuotationBuilder({ shopId, editQuotation, onSave, onCancel }: {
  shopId: string; editQuotation: Quotation | null; onSave: (q: Quotation) => void; onCancel: () => void;
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
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const { data: productsData } = useListProducts({ shopId, limit: 3000 }, { query: { enabled: !!shopId } });
  const allProducts = useMemo(() => (productsData as any)?.products ?? [], [productsData]);

  const addedProductIds = useMemo(() => new Set(items.map(i => i.productId).filter(Boolean)), [items]);

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return allProducts
      .filter((p: any) => p.isActive !== false && (
        p.canonicalName?.toLowerCase().includes(q) ||
        p.normalizedName?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
      ))
      .slice(0, 10);
  }, [allProducts, productSearch]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const addProduct = useCallback((p: any) => {
    setItems(prev => {
      const existing = prev.findIndex(i => i.productId === p.id);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing ? { ...item, qty: item.qty + 1, total: (item.qty + 1) * item.unitPrice } : item
        );
      }
      return [...prev, {
        productId: p.id,
        productName: p.canonicalName,
        unit: p.unit ?? "unit",
        qty: 1,
        unitPrice: p.sellingPrice ?? 0,
        total: p.sellingPrice ?? 0,
      }];
    });
    setProductSearch("");
    // Keep search open & re-focus for adding more products
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  }, []);

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
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60 shrink-0 bg-card/50">
        <button onClick={onCancel} className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-black text-foreground font-display">
            {editQuotation ? `Edit ${editQuotation.quoteNumber}` : "New Quotation"}
          </h2>
          <p className="text-[10px] text-muted-foreground/50">
            {editQuotation ? "Update the quote details" : "Build from stock · auto-numbered"}
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          {saving ? "Saving…" : "Save Quote"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-3 max-w-2xl mx-auto">

          {/* ── Customer ── */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
              <User className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-black text-foreground tracking-wide">CUSTOMER</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">Name *</label>
                <CustomerAutocomplete
                  value={customerName}
                  onChange={(name, phone) => {
                    setCustomerName(name);
                    if (phone) setCustomerPhone(phone);
                  }}
                  shopId={shopId}
                  placeholder="Search existing or type new name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">Phone</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30 pointer-events-none" />
                    <input
                      value={customerPhone}
                      onChange={e => setCustomerPhone(e.target.value)}
                      placeholder="+254 700 000 000"
                      className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">Email <span className="normal-case font-normal opacity-60">(optional)</span></label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30 pointer-events-none" />
                    <input
                      value={customerEmail}
                      onChange={e => setCustomerEmail(e.target.value)}
                      placeholder="customer@email.com"
                      type="email"
                      className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Products ── */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
              <Package className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-black text-foreground tracking-wide">PRODUCTS</p>
              {items.length > 0 && (
                <span className="ml-auto text-[10px] font-black bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                  {items.length} item{items.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Search */}
            <div className="p-3 border-b border-border/30" ref={searchContainerRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  value={productSearch}
                  onChange={e => { setProductSearch(e.target.value); setSearchOpen(true); }}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Search products by name, category, or SKU…"
                  className="w-full h-9 pl-9 pr-8 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/35 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                />
                {productSearch && (
                  <button
                    onMouseDown={e => { e.preventDefault(); setProductSearch(""); searchInputRef.current?.focus(); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded-full bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30 transition-colors"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>

              {searchOpen && productMatches.length > 0 && (
                <div className="mt-1.5 bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                  {productMatches.map((p: any) => {
                    const isAdded = addedProductIds.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={e => { e.preventDefault(); addProduct(p); }}
                        className={cn(
                          "w-full text-left px-3 py-2.5 flex items-center gap-3 border-b border-border/30 last:border-0 transition-colors",
                          isAdded ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/50"
                        )}
                      >
                        {isAdded ? (
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="h-3 w-3 text-primary" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-border/60 flex items-center justify-center shrink-0">
                            <Plus className="h-3 w-3 text-muted-foreground/40" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-semibold truncate", isAdded ? "text-primary" : "text-foreground")}>{p.canonicalName}</p>
                          <p className="text-[10px] text-muted-foreground/50">{p.category} · {p.stockQty} {p.unit} in stock</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-black text-primary font-mono">{KES(p.sellingPrice ?? 0)}</p>
                          {isAdded && <p className="text-[9px] text-primary/60">tap to +1</p>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {searchOpen && productSearch.trim() && productMatches.length === 0 && (
                <div className="mt-1.5 rounded-xl px-3 py-3 text-center bg-muted/20 border border-border">
                  <p className="text-xs text-muted-foreground/60">No products found for "<span className="text-foreground">{productSearch}</span>"</p>
                </div>
              )}
            </div>

            {/* Items list */}
            <div>
              {items.length === 0 ? (
                <div className="py-10 text-center">
                  <Package className="h-7 w-7 text-muted-foreground/15 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground/40">Search above and tap products to add them</p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {items.map((item, idx) => (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-black text-muted-foreground/30 w-4 shrink-0">{idx + 1}</span>
                        <p className="flex-1 text-sm font-semibold text-foreground truncate">{item.productName}</p>
                        <p className="text-sm font-black text-primary font-mono shrink-0">{KES(item.total)}</p>
                        <button
                          onClick={() => removeItem(idx)}
                          className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 pl-6 flex-wrap">
                        {/* Qty stepper */}
                        <div className="flex items-center bg-muted/40 border border-border rounded-lg overflow-hidden h-8">
                          <button
                            onClick={() => updateItem(idx, "qty", Math.max(0.25, item.qty - (item.unit === "kg" || item.unit === "litre" ? 0.25 : 1)))}
                            className="w-8 h-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 text-base transition-colors"
                          >−</button>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={e => updateItem(idx, "qty", Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-12 text-center text-xs font-bold bg-transparent text-foreground focus:outline-none border-x border-border"
                            min={0}
                          />
                          <button
                            onClick={() => updateItem(idx, "qty", item.qty + (item.unit === "kg" || item.unit === "litre" ? 0.25 : 1))}
                            className="w-8 h-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 text-base transition-colors"
                          >+</button>
                        </div>
                        <span className="text-xs text-muted-foreground/50">{item.unit}</span>
                        <span className="text-muted-foreground/25 text-sm">×</span>
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
                  ))}
                </div>
              )}

              {/* Totals */}
              {items.length > 0 && (
                <div className="border-t border-border/40 px-4 py-3 space-y-2.5 bg-muted/10">
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
                  <div className="flex items-center justify-between border-t border-border/40 pt-2">
                    <span className="text-sm font-black text-foreground">TOTAL</span>
                    <span className="text-lg font-black text-primary font-mono">{KES(total)}</span>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Quote details ── */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-black text-foreground tracking-wide">QUOTE DETAILS</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">Valid Until <span className="normal-case font-normal opacity-60">(optional)</span></label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30 pointer-events-none" />
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 block mb-1.5">Notes / Terms <span className="normal-case font-normal opacity-60">(optional)</span></label>
                <div className="relative">
                  <StickyNote className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground/30 pointer-events-none" />
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Payment terms, delivery conditions, special instructions…"
                    rows={3}
                    className="w-full pl-9 pr-3 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Bottom save */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-primary-foreground font-black text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Saving…" : editQuotation ? "Update Quotation" : "Create Quotation"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Quotation Card ────────────────────────────────────────────────────────────

function QuotationCard({ q, shop, onEdit, onPrint, onStatusChange, onDelete, onDownloadPdf }: {
  q: Quotation;
  shop: any;
  onEdit: () => void;
  onPrint: () => void;
  onStatusChange: (s: Quotation["status"]) => void;
  onDelete: () => void;
  onDownloadPdf: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden hover:border-border/80 transition-all">
      {/* Main row */}
      <div className="px-4 py-3.5">
        <div className="flex items-start gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black text-primary font-mono">{q.quoteNumber}</span>
              <StatusBadge status={q.status} />
              {q.validUntil && new Date(q.validUntil) < new Date() && q.status === "draft" && (
                <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full border border-amber-400/20">EXPIRED</span>
              )}
            </div>
            <p className="text-sm font-bold text-foreground mt-1 truncate">{q.customerName}</p>
            {q.customerPhone && <p className="text-xs text-muted-foreground/50 font-mono mt-0.5">{q.customerPhone}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-black text-primary font-mono">{KES(q.total)}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">
              {q.items.length} item{q.items.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <p className="text-[10px] text-muted-foreground/40 flex-1">
            {format(new Date(q.createdAt), "dd MMM yyyy")}
            {q.validUntil && ` · Valid ${format(new Date(q.validUntil), "dd MMM")}`}
          </p>

          {/* Action buttons */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="h-7 px-2 flex items-center gap-1 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors text-[10px] font-semibold"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide" : "Items"}
          </button>
          <button
            onClick={() => shareWhatsApp(q, shop)}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
            title="Share via WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onDownloadPdf}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onPrint}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors"
            title="Preview"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onEdit}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
            title="Edit"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          {/* More menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-xl shadow-2xl z-40 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border/40">
                    <p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-wider">Change Status</p>
                  </div>
                  {(["draft", "sent", "accepted", "rejected", "expired"] as const).filter(s => s !== q.status).map(s => (
                    <button
                      key={s}
                      onClick={() => { onStatusChange(s); setMenuOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-muted/60 flex items-center gap-2.5 border-b border-border/20 last:border-0"
                    >
                      <span className={cn("w-2 h-2 rounded-full shrink-0",
                        s === "accepted" ? "bg-emerald-400" :
                        s === "sent" ? "bg-blue-400" :
                        s === "rejected" ? "bg-red-400" :
                        s === "expired" ? "bg-amber-400" : "bg-zinc-400"
                      )} />
                      Mark as {STATUS_META[s].label}
                    </button>
                  ))}
                  <div className="border-t border-border/40" />
                  <button
                    onClick={() => { onDelete(); setMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/10 flex items-center gap-2.5"
                  >
                    <Trash2 className="h-3 w-3" /> Delete Quotation
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div className="border-t border-border/40 bg-muted/10">
          <div className="px-4 py-1.5 grid grid-cols-[1fr_auto_auto] gap-x-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground/30 border-b border-border/20">
            <span>Product</span><span className="text-right">Qty</span><span className="text-right">Total</span>
          </div>
          {q.items.map((item, i) => (
            <div key={i} className="px-4 py-2 grid grid-cols-[1fr_auto_auto] gap-x-3 items-center border-b border-border/15 last:border-0">
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{item.productName}</p>
                <p className="text-[10px] text-muted-foreground/40">{KES(item.unitPrice)} / {item.unit}</p>
              </div>
              <span className="text-xs font-mono text-muted-foreground text-right">{item.qty} {item.unit}</span>
              <span className="text-xs font-black font-mono text-foreground text-right">{KES(item.total)}</span>
            </div>
          ))}
          {q.discountAmount > 0 && (
            <div className="px-4 py-2 flex justify-between text-xs border-t border-border/20">
              <span className="text-muted-foreground/50">Discount</span>
              <span className="font-mono text-red-400">-{KES(q.discountAmount)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "draft" | "sent" | "accepted" | "rejected" | "expired";
type PageView = "list" | "builder" | "print";

export default function Quotations() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [view, setView] = useState<PageView>("list");
  const [quoteList, setQuoteList] = useState<Quotation[]>([]);
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
      setQuoteList(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => { loadQuotations(); }, [loadQuotations]);

  const filtered = useMemo(() => {
    let list = quoteList;
    if (filter !== "all") list = list.filter(q => q.status === filter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(x => x.customerName.toLowerCase().includes(q) || x.quoteNumber.toLowerCase().includes(q));
    return list;
  }, [quoteList, filter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quoteList.length };
    quoteList.forEach(q => { c[q.status] = (c[q.status] ?? 0) + 1; });
    return c;
  }, [quoteList]);

  const handleSave = (q: Quotation) => {
    setQuoteList(prev => {
      const idx = prev.findIndex(x => x.id === q.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = q; return next; }
      return [q, ...prev];
    });
    toast.success(editTarget ? "Quotation updated" : `${q.quoteNumber} created!`);
    setView("list");
    setEditTarget(null);
  };

  const handleStatusChange = async (q: Quotation, status: Quotation["status"]) => {
    try {
      const updated = await customFetch(`/api/quotations/${q.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }) as Quotation;
      setQuoteList(prev => prev.map(x => x.id === updated.id ? updated : x));
      toast.success(`Marked as ${STATUS_META[status].label}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (q: Quotation) => {
    if (!confirm(`Delete ${q.quoteNumber}? This cannot be undone.`)) return;
    try {
      await customFetch(`/api/quotations/${q.id}`, { method: "DELETE" });
      setQuoteList(prev => prev.filter(x => x.id !== q.id));
      toast.success("Quotation deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleClearDrafts = async () => {
    const drafts = quoteList.filter(q => q.status === "draft");
    if (drafts.length === 0) { toast.info("No drafts to clear"); return; }
    if (!confirm(`Delete all ${drafts.length} draft quotation${drafts.length !== 1 ? "s" : ""}?`)) return;
    setClearingDrafts(true);
    let deleted = 0;
    for (const q of drafts) {
      try { await customFetch(`/api/quotations/${q.id}`, { method: "DELETE" }); deleted++; } catch {}
    }
    setQuoteList(prev => prev.filter(q => q.status !== "draft"));
    toast.success(`Cleared ${deleted} draft${deleted !== 1 ? "s" : ""}`);
    setClearingDrafts(false);
  };

  // Print view
  if (view === "print" && printTarget) {
    return <PrintView quotation={printTarget} shop={shop} onClose={() => { setView("list"); setPrintTarget(null); }} />;
  }

  // Builder view
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

  // List view
  const TABS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "draft", label: "Drafts" },
    { id: "sent", label: "Sent" },
    { id: "accepted", label: "Accepted" },
    { id: "rejected", label: "Rejected" },
  ];

  const draftCount = counts["draft"] ?? 0;
  const totalValue = filtered.reduce((s, q) => s + q.total, 0);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h1 className="text-lg font-black text-foreground font-display tracking-tight">Quotations</h1>
            <p className="text-[11px] text-muted-foreground/50">
              {quoteList.length} quote{quoteList.length !== 1 ? "s" : ""}
              {filtered.length !== quoteList.length ? ` · ${filtered.length} shown` : ""}
              {filtered.length > 0 && ` · ${KES(totalValue)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {draftCount > 0 && (
              <button
                onClick={handleClearDrafts}
                disabled={clearingDrafts}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-xs font-bold hover:bg-destructive/20 disabled:opacity-50 transition-colors"
              >
                {clearingDrafts ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                {draftCount} Draft{draftCount !== 1 ? "s" : ""}
              </button>
            )}
            <button
              onClick={() => { setEditTarget(null); setView("builder"); }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> New Quote
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by customer name or quote number…"
            className="w-full h-9 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/35 focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30">
              <X className="h-2.5 w-2.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap transition-all shrink-0",
                filter === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
              )}
            >
              {tab.label}
              {(counts[tab.id] ?? 0) > 0 && (
                <span className={cn(
                  "text-[9px] font-black px-1 py-0.5 rounded-full min-w-[16px] text-center",
                  filter === tab.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground/60"
                )}>{counts[tab.id]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Loader2 className="h-6 w-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground/50">Loading quotations…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted/20 flex items-center justify-center">
              <FileText className="h-7 w-7 text-muted-foreground/20" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">
                {search || filter !== "all" ? "No matching quotations" : "No quotations yet"}
              </p>
              <p className="text-xs text-muted-foreground/40 mt-1">
                {search || filter !== "all"
                  ? "Try a different filter or clear search"
                  : "Create your first quote to get started"}
              </p>
            </div>
            {!search && filter === "all" && (
              <button
                onClick={() => { setEditTarget(null); setView("builder"); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-colors"
              >
                <Plus className="h-4 w-4" /> Create First Quote
              </button>
            )}
          </div>
        ) : (
          <div className="p-4 space-y-2.5">
            {filtered.map(q => (
              <QuotationCard
                key={q.id}
                q={q}
                shop={shop}
                onEdit={() => { setEditTarget(q); setView("builder"); }}
                onPrint={() => { setPrintTarget(q); setView("print"); }}
                onStatusChange={(s) => handleStatusChange(q, s)}
                onDelete={() => handleDelete(q)}
                onDownloadPdf={() => downloadPdf(q, shop)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
