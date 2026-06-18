import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { customFetch, useListProducts, useGetShop } from "@workspace/api-client-react";
import {
  Plus, Search, Trash2, ChevronLeft, Printer, CheckCircle2,
  XCircle, Clock, FileText, User, Phone, Mail, Calendar, StickyNote,
  Edit2, Package, Loader2, X, Eye, Download, MessageCircle,
  ChevronDown, ChevronUp, ShoppingCart, Copy, MoreVertical, TrendingUp,
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

// ─── PDF generation ────────────────────────────────────────────────────────────

async function downloadPdf(quotation: Quotation, shop: any) {
  toast.loading("Generating PDF…", { id: "pdf" });
  try {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc  = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W    = doc.internal.pageSize.getWidth();
    const H    = doc.internal.pageSize.getHeight();
    const ML   = 10;
    const MR   = 10;
    const CW   = W - ML - MR;

    // ── Brand palette ────────────────────────────────────────────────────────
    type RGB = [number, number, number];
    const LIME:  RGB = [200, 255,   0];
    const DARK:  RGB = [ 10,  10,  10];
    const WHITE: RGB = [255, 255, 255];
    const LLIME: RGB = [245, 255, 213];   // very light lime — alternating rows
    const LGRAY: RGB = [245, 247, 250];   // light gray — total rows
    const MGRAY: RGB = [120, 130, 148];
    const DKTXT: RGB = [ 18,  28,  48];
    const BORD:  RGB = [210, 215, 222];

    // ── Helper: box with dark header strip + lime left accent ────────────────
    function infoBox(bx: number, by: number, bw: number, bh: number, label: string) {
      doc.setDrawColor(...BORD);
      doc.setLineWidth(0.25);
      doc.rect(bx, by, bw, bh, "S");
      const hh = 7.5;
      doc.setFillColor(...DARK);
      doc.rect(bx, by, bw, hh, "F");
      doc.setFillColor(...LIME);
      doc.rect(bx, by, 2.5, hh, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...LIME);
      doc.text(label, bx + 6, by + 5.3);
    }

    // ── Helper: label : value row inside a box ───────────────────────────────
    function fieldRow(bx: number, by: number, bw: number, label: string, value: string) {
      const valX = bx + bw * 0.44;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MGRAY);
      doc.text(label, bx + 5, by);
      doc.setTextColor(...DKTXT);
      doc.text(value || "—", valX, by);
    }

    // ── Helper: footer dark bar (drawn last on every page) ──────────────────
    function drawFooter() {
      doc.setFillColor(...DARK);
      doc.rect(0, H - 13, W, 13, "F");
      doc.setFillColor(...LIME);
      doc.rect(0, H - 13, W, 1, "F");  // lime top strip on footer
      const cols = [ML, W / 2, W - MR];
      const align: ("left"|"center"|"right")[] = ["left","center","right"];
      const heads = ["LOCATION", "CONTACT US", shop?.name ? "FOLLOW US" : ""];
      const bits: string[] = [
        shop?.address ?? "",
        [shop?.ownerWhatsapp, shop?.email].filter(Boolean).join("  /  "),
        shop?.name ?? "",
      ];
      heads.forEach((h, i) => {
        if (!h && !bits[i]) return;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.setTextColor(...LIME);
        doc.text(h, cols[i], H - 8.5, { align: align[i] });
        doc.setFont("helvetica", "normal");
        doc.setTextColor(185, 192, 200);
        doc.text(bits[i], cols[i], H - 4.5, { align: align[i] });
      });
    }

    // ── Helper: continuation page header (pages 2+) ──────────────────────────
    function drawContinuationHeader(pg: number, total: number) {
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      doc.setFillColor(...DARK);
      doc.rect(0, 0, W, 8, "F");
      doc.setFillColor(...LIME);
      doc.rect(0, 0, W, 1.5, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(185, 192, 200);
      doc.text(`${shop?.name ?? ""}  ·  ${quotation.quoteNumber}  ·  continued`, ML, 5.5);
      doc.text(`Page ${pg} of ${total}`, W - MR, 5.5, { align: "right" });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 1 — white canvas
    // ══════════════════════════════════════════════════════════════════════════
    doc.setFillColor(...WHITE);
    doc.rect(0, 0, W, H, "F");

    // ── HEADER AREA (white, 24 mm) ────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...DARK);
    doc.text(shop?.name ?? "Our Shop", ML, 13);

    // Contact / address line
    const shopBits = [shop?.address, shop?.ownerWhatsapp, shop?.email].filter(Boolean) as string[];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MGRAY);
    if (shopBits.length) doc.text(shopBits.join("  ·  "), ML, 19.5);

    // Tagline right-aligned
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...LIME);
    doc.text("QUALITY  ·  RELIABILITY  ·  GROWTH", W - MR, 19.5, { align: "right" });

    // ── LIME stripe + DARK QUOTATION BANNER ──────────────────────────────────
    const STRIPE_Y = 24;
    doc.setFillColor(...LIME);
    doc.rect(0, STRIPE_Y, W, 2, "F");

    const BANNER_Y = STRIPE_Y + 2;
    const BANNER_H = 12;
    doc.setFillColor(...DARK);
    doc.rect(0, BANNER_Y, W, BANNER_H, "F");

    // Decorative lime rules flanking "QUOTATION"
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...LIME);
    const qText  = "  QUOTATION  ";
    const qTextW = doc.getTextWidth(qText);
    const qTextX = W / 2 - qTextW / 2;
    doc.setDrawColor(...LIME);
    doc.setLineWidth(0.5);
    doc.line(ML + 4, BANNER_Y + BANNER_H / 2, qTextX, BANNER_Y + BANNER_H / 2);
    doc.line(qTextX + qTextW, BANNER_Y + BANNER_H / 2, W - MR - 4, BANNER_Y + BANNER_H / 2);
    doc.text(qText, W / 2, BANNER_Y + BANNER_H - 3.5, { align: "center" });

    let y = BANNER_Y + BANNER_H + 5;

    // ── INFO ROW — two boxes ──────────────────────────────────────────────────
    const LBW = CW * 0.56;   // left box width
    const RBW = CW - LBW - 4; // right box width
    const LBX = ML;
    const RBX = ML + LBW + 4;
    const INFO_H = 36;

    // Left: CUSTOMER DETAILS
    infoBox(LBX, y, LBW, INFO_H, "CUSTOMER DETAILS");
    let fy = y + 12;
    const GAP = 5.5;
    fieldRow(LBX, fy, LBW, "Customer Name",  quotation.customerName);         fy += GAP;
    fieldRow(LBX, fy, LBW, "Phone / Mobile", quotation.customerPhone ?? "");   fy += GAP;
    fieldRow(LBX, fy, LBW, "Email",           quotation.customerEmail ?? "");   fy += GAP;

    // Right: QUOTE DETAILS
    infoBox(RBX, y, RBW, INFO_H, "QUOTE DETAILS");
    let qy = y + 12;
    fieldRow(RBX, qy, RBW, "Quotation No.", quotation.quoteNumber);            qy += GAP;
    fieldRow(RBX, qy, RBW, "Date",          format(new Date(quotation.createdAt), "dd MMM yyyy")); qy += GAP;
    if (quotation.validUntil) {
      fieldRow(RBX, qy, RBW, "Valid Until", format(new Date(quotation.validUntil), "dd MMM yyyy")); qy += GAP;
    }
    const statusColors: Record<string, RGB> = {
      draft: [100,116,139], sent: [59,130,246], accepted: [34,197,94],
      rejected: [239,68,68], expired: [245,158,11],
    };
    const sc = statusColors[quotation.status] ?? [100,116,139];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...sc);
    doc.text(`● ${STATUS_META[quotation.status].label.toUpperCase()}`, RBX + 5, qy);

    y += INFO_H + 4;

    // ── ITEMS TABLE ───────────────────────────────────────────────────────────
    // Row height ≈ 4.9 mm  (1.5 top + 1.5 bottom + 7pt font 2.47mm ≈ 5.5mm)
    // First page usable after header: ~297-26-2-12-5-36-4 = 212mm for table+footer
    // With footer 13mm + bottom section 60mm → 139mm for table rows = ~28 rows on pg1
    // Pages 2+: 297-8-13 = 276mm → ~56 rows per continuation page

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR, bottom: 16 },
      showHead: "firstPage",
      head: [["NO.", "DESCRIPTION", "QTY", "UNIT", "UNIT PRICE", "TOTAL (KES)"]],
      body: quotation.items.map((item, i) => [
        String(i + 1),
        item.productName,
        item.qty % 1 === 0 ? String(item.qty) : item.qty.toFixed(2),
        item.unit || "—",
        item.unitPrice.toLocaleString("en-KE"),
        item.total.toLocaleString("en-KE"),
      ]),
      headStyles: {
        fillColor: DARK,
        textColor: LIME,
        fontStyle: "bold",
        fontSize: 7,
        cellPadding: { top: 2.5, bottom: 2.5, left: 3.5, right: 3.5 },
        halign: "center",
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: { top: 1.5, bottom: 1.5, left: 3.5, right: 3.5 },
        textColor: DKTXT,
        lineColor: BORD,
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: LLIME },
      columnStyles: {
        0: { cellWidth: 10,   halign: "center", fontStyle: "bold", textColor: MGRAY, fontSize: 6.5 },
        1: { cellWidth: "auto", halign: "left" },
        2: { cellWidth: 14,   halign: "center" },
        3: { cellWidth: 16,   halign: "center", textColor: MGRAY },
        4: { cellWidth: 28,   halign: "right" },
        5: { cellWidth: 28,   halign: "right", fontStyle: "bold" },
      },
      tableLineColor: BORD,
      tableLineWidth: 0.2,
      didDrawCell: (data: any) => {
        // Lime underline beneath header row
        if (data.row.index === -1 && data.column.index === data.table.columns.length - 1) {
          doc.setDrawColor(...LIME);
          doc.setLineWidth(0.8);
          doc.line(ML, data.cell.y + data.cell.height, W - MR, data.cell.y + data.cell.height);
        }
      },
      didDrawPage: (_: any) => {
        const pg: number    = (doc as any).internal.getCurrentPageInfo().pageNumber;
        const total: number = (doc as any).internal.getNumberOfPages();
        if (pg > 1) drawContinuationHeader(pg, total);
      },
    });

    let ty: number = (doc as any).lastAutoTable.finalY + 5;

    // If not enough room for the bottom section, push to a new page
    const BOT_ESTIMATE = 68;
    if (ty + BOT_ESTIMATE > H - 15) {
      doc.addPage();
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      const newPg = (doc as any).internal.getNumberOfPages();
      drawContinuationHeader(newPg, newPg);
      ty = 12;
    }

    // ── BOTTOM SECTION ────────────────────────────────────────────────────────
    const LCW = CW * 0.52;   // left column width  (terms + payment)
    const RCW = CW - LCW - 4; // right column width (totals)
    const LCX = ML;
    const RCX = ML + LCW + 4;

    // ── Left col: TERMS & CONDITIONS ─────────────────────────────────────────
    const defaultTerms = [
      "Prices are valid for 30 days from date of quotation.",
      "Prices are subject to change without prior notice.",
      "Goods remain property of the shop until full payment received.",
      "Delivery charges may apply depending on location.",
    ];
    const termLines: string[] = quotation.notes
      ? (doc.splitTextToSize(quotation.notes, LCW - 10) as string[])
      : defaultTerms;
    const TERMS_H = Math.max(24, termLines.length * 4.2 + 14);

    infoBox(LCX, ty, LCW, TERMS_H, "TERMS & CONDITIONS");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(50, 62, 80);
    termLines.forEach((line, i) => {
      doc.text(`•  ${line}`, LCX + 5, ty + 12 + i * 4.2);
    });

    // ── Left col: PAYMENT METHODS ─────────────────────────────────────────────
    const PAY_Y = ty + TERMS_H + 3;
    const PAY_H = 16;
    infoBox(LCX, PAY_Y, LCW, PAY_H, "PAYMENT METHODS");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...DKTXT);
    const payMethods = ["Cash", "M-Pesa", "Bank Transfer"];
    const payStep    = LCW / (payMethods.length + 1);
    payMethods.forEach((pm, i) => {
      const px = LCX + payStep * (i + 1);
      // Lime dot
      doc.setFillColor(...LIME);
      doc.circle(px - 3, PAY_Y + 9.5, 1.5, "F");
      doc.setTextColor(...DKTXT);
      doc.text(pm, px - 1, PAY_Y + 9.5 + 0.5);
    });

    // ── Right col: TOTALS ─────────────────────────────────────────────────────
    let ry = ty;
    const ROW_H = 8;

    function totRow(label: string, value: string, highlight = false) {
      if (highlight) {
        doc.setFillColor(...DARK);
        doc.rect(RCX, ry, RCW, ROW_H, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...LIME);
        doc.text(label, RCX + 4, ry + 5.5);
        doc.setTextColor(...WHITE);
        doc.text(value, RCX + RCW - 4, ry + 5.5, { align: "right" });
      } else {
        doc.setFillColor(...LGRAY);
        doc.rect(RCX, ry, RCW, ROW_H, "F");
        doc.setDrawColor(...BORD);
        doc.setLineWidth(0.2);
        doc.line(RCX, ry + ROW_H, RCX + RCW, ry + ROW_H);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MGRAY);
        doc.text(label, RCX + 4, ry + 5.5);
        doc.setTextColor(...DKTXT);
        doc.text(value, RCX + RCW - 4, ry + 5.5, { align: "right" });
      }
      ry += ROW_H;
    }

    if (quotation.discountAmount > 0) {
      totRow("SUBTOTAL", `KES ${quotation.subtotal.toLocaleString("en-KE")}`);
      totRow("DISCOUNT", `- KES ${quotation.discountAmount.toLocaleString("en-KE")}`);
    }
    totRow("TOTAL AMOUNT", `KES ${quotation.total.toLocaleString("en-KE")}`, true);

    // Thank you box (lime-tinted)
    const TY_BOX_Y = ry + 3;
    const TY_BOX_H = 16;
    doc.setFillColor(243, 255, 210);
    doc.rect(RCX, TY_BOX_Y, RCW, TY_BOX_H, "F");
    doc.setDrawColor(...LIME);
    doc.setLineWidth(0.4);
    doc.rect(RCX, TY_BOX_Y, RCW, TY_BOX_H, "S");
    doc.setFillColor(...LIME);
    doc.rect(RCX, TY_BOX_Y, 3, TY_BOX_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...DARK);
    doc.text("Thank you for your business!", RCX + RCW / 2 + 2, TY_BOX_Y + 7.5, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MGRAY);
    doc.text("We appreciate your trust in us.", RCX + RCW / 2 + 2, TY_BOX_Y + 12.5, { align: "center" });

    // ── SIGNATURE LINE ────────────────────────────────────────────────────────
    const sigY = Math.max(PAY_Y + PAY_H + 8, TY_BOX_Y + TY_BOX_H + 8);
    doc.setDrawColor(...BORD);
    doc.setLineWidth(0.3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MGRAY);
    // Left signature
    doc.text("Prepared By:", ML, sigY);
    doc.line(ML + 23, sigY + 0.5, ML + CW * 0.42, sigY + 0.5);
    doc.setFontSize(6.5);
    doc.text("Name:", ML, sigY + 5.5);
    doc.line(ML + 10, sigY + 6, ML + CW * 0.42, sigY + 6);
    // Right signature
    const rSigX = W - MR - CW * 0.42;
    doc.setFontSize(7);
    doc.text("Received By:", rSigX, sigY);
    doc.line(rSigX + 23, sigY + 0.5, W - MR, sigY + 0.5);
    doc.setFontSize(6.5);
    doc.text("Name:", rSigX, sigY + 5.5);
    doc.line(rSigX + 10, sigY + 6, W - MR, sigY + 6);

    // ── FOOTER on every page ──────────────────────────────────────────────────
    const numPages: number = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= numPages; p++) {
      doc.setPage(p);
      drawFooter();
    }

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
          className="mx-auto bg-white text-gray-900 shadow-2xl overflow-hidden"
          style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: "760px", borderRadius: "16px" }}
        >
          {/* ── Premium header ── */}
          <div style={{ background: "#0A0A0A", padding: "0" }}>
            {/* Lime top stripe */}
            <div style={{ height: "4px", background: "#C8FF00" }} />
            <div style={{ padding: "28px 36px 26px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "180px" }}>
                <p style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.25em", color: "#C8FF00", textTransform: "uppercase", marginBottom: "8px", margin: "0 0 8px" }}>Official Quotation</p>
                <h1 style={{ fontSize: "24px", fontWeight: 900, color: "#fff", margin: "0 0 8px", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{shop?.name ?? "Our Shop"}</h1>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {shop?.address && <span style={{ fontSize: "11px", color: "#9ca3af" }}>{shop.address}</span>}
                  {shop?.ownerWhatsapp && <span style={{ fontSize: "11px", color: "#9ca3af" }}>{shop.ownerWhatsapp}</span>}
                  {shop?.email && <span style={{ fontSize: "11px", color: "#9ca3af" }}>{shop.email}</span>}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p style={{ fontSize: "9px", fontWeight: 800, color: "#C8FF00", letterSpacing: "0.2em", textTransform: "uppercase", margin: "0 0 6px" }}>QUOTATION</p>
                <p style={{ fontSize: "26px", fontWeight: 900, color: "#ffffff", fontFamily: "monospace", margin: "0 0 10px", letterSpacing: "-0.01em" }}>{quotation.quoteNumber}</p>
                <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0" }}>Date: {format(new Date(quotation.createdAt), "dd MMM yyyy")}</p>
                {quotation.validUntil && <p style={{ fontSize: "11px", color: "#9ca3af", margin: "2px 0" }}>Valid Until: {format(new Date(quotation.validUntil), "dd MMM yyyy")}</p>}
                <span style={{
                  display: "inline-block", marginTop: "10px", fontSize: "9px", fontWeight: 800,
                  textTransform: "uppercase", letterSpacing: "0.12em", padding: "4px 12px", borderRadius: "20px",
                  background: quotation.status === "accepted" ? "rgba(34,197,94,0.15)" : quotation.status === "rejected" ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.08)",
                  color: quotation.status === "accepted" ? "#4ade80" : quotation.status === "rejected" ? "#f87171" : quotation.status === "sent" ? "#60a5fa" : "#9ca3af",
                  border: `1px solid ${quotation.status === "accepted" ? "rgba(34,197,94,0.3)" : quotation.status === "rejected" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
                }}>
                  {STATUS_META[quotation.status].label}
                </span>
              </div>
            </div>
          </div>

          {/* ── Bill To ── */}
          <div style={{ padding: "24px 36px 0" }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: "0", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", marginBottom: "24px" }}>
              <div style={{ width: "4px", background: "#C8FF00", flexShrink: 0 }} />
              <div style={{ padding: "14px 18px", flex: 1 }}>
                <p style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", color: "#94a3b8", textTransform: "uppercase", margin: "0 0 8px" }}>Bill To</p>
                <p style={{ fontSize: "17px", fontWeight: 800, color: "#0f172a", margin: "0 0 5px" }}>{quotation.customerName}</p>
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  {quotation.customerPhone && <span style={{ fontSize: "12px", color: "#64748b" }}>{quotation.customerPhone}</span>}
                  {quotation.customerEmail && <span style={{ fontSize: "12px", color: "#64748b" }}>{quotation.customerEmail}</span>}
                </div>
              </div>
            </div>

            {/* ── Items table ── */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", marginBottom: "20px" }}>
              <thead>
                <tr style={{ background: "#0A0A0A" }}>
                  <th style={{ textAlign: "center", padding: "10px 10px", fontSize: "8px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "4%" }}>#</th>
                  <th style={{ textAlign: "left", padding: "10px 10px", fontSize: "8px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00" }}>Product / Description</th>
                  <th style={{ textAlign: "center", padding: "10px 10px", fontSize: "8px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "9%" }}>Unit</th>
                  <th style={{ textAlign: "right", padding: "10px 10px", fontSize: "8px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "8%" }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "10px 10px", fontSize: "8px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "17%" }}>Unit Price</th>
                  <th style={{ textAlign: "right", padding: "10px 10px", fontSize: "8px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00", width: "18%" }}>Total (KES)</th>
                </tr>
                <tr><td colSpan={6} style={{ height: "2px", background: "#C8FF00", padding: 0 }} /></tr>
              </thead>
              <tbody>
                {quotation.items.map((item, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                    <td style={{ padding: "11px 10px", textAlign: "center", fontSize: "10px", fontWeight: 800, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>{i + 1}</td>
                    <td style={{ padding: "11px 10px", fontWeight: 600, color: "#0f172a", borderBottom: "1px solid #f1f5f9" }}>{item.productName}</td>
                    <td style={{ padding: "11px 10px", textAlign: "center", color: "#64748b", fontSize: "11px", borderBottom: "1px solid #f1f5f9" }}>{item.unit || "unit"}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: "#374151", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" }}>{item.qty}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", color: "#475569", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" }}>{KES(item.unitPrice)}</td>
                    <td style={{ padding: "11px 10px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" }}>{KES(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Totals ── */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "24px" }}>
              <div style={{ width: "260px" }}>
                {quotation.discountAmount > 0 && <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", fontSize: "13px", color: "#64748b", background: "#f8fafc", borderRadius: "6px 6px 0 0" }}>
                    <span>Subtotal</span><span style={{ fontFamily: "monospace" }}>{KES(quotation.subtotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px", fontSize: "13px", color: "#dc2626", background: "#fef2f2" }}>
                    <span>Discount</span><span style={{ fontFamily: "monospace" }}>− {KES(quotation.discountAmount)}</span>
                  </div>
                </>}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#0A0A0A", borderRadius: quotation.discountAmount > 0 ? "0 0 10px 10px" : "10px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 900, color: "#C8FF00", textTransform: "uppercase", letterSpacing: "0.1em" }}>Total Due</span>
                  <span style={{ fontSize: "18px", fontWeight: 900, color: "#fff", fontFamily: "monospace" }}>{KES(quotation.total)}</span>
                </div>
              </div>
            </div>

            {/* ── Notes ── */}
            {quotation.notes && (
              <div style={{ display: "flex", gap: "0", border: "1px solid #e2e8f0", borderRadius: "10px", overflow: "hidden", marginBottom: "20px" }}>
                <div style={{ width: "4px", background: "#C8FF00", flexShrink: 0 }} />
                <div style={{ padding: "12px 16px", flex: 1, background: "#f8fafc" }}>
                  <p style={{ fontSize: "9px", fontWeight: 900, letterSpacing: "0.2em", color: "#94a3b8", textTransform: "uppercase", margin: "0 0 7px" }}>Notes & Terms</p>
                  <p style={{ fontSize: "12px", color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.7, margin: 0 }}>{quotation.notes}</p>
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div style={{ borderTop: "2px solid #C8FF00", paddingTop: "14px", paddingBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
              <p style={{ fontSize: "10px", color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
                Valid {quotation.validUntil ? `until ${format(new Date(quotation.validUntil), "dd MMMM yyyy")}` : "for 30 days from issue"} · Prices subject to availability
              </p>
              <p style={{ fontSize: "11px", fontWeight: 800, color: "#0f172a", margin: 0 }}>{shop?.name ?? ""}</p>
            </div>
          </div>
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

function QuotationCard({ q, shop, onEdit, onPrint, onStatusChange, onDelete, onDownloadPdf, onConvertToSale }: {
  q: Quotation;
  shop: any;
  onEdit: () => void;
  onPrint: () => void;
  onStatusChange: (s: Quotation["status"]) => void;
  onDelete: () => void;
  onDownloadPdf: () => void;
  onConvertToSale: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/20 transition-all group">
      {/* Top lime accent on hover */}
      <div className="h-0.5 bg-primary/0 group-hover:bg-primary/60 transition-colors" />

      {/* Main row */}
      <div className="px-4 py-3.5">
        {/* Header row: quote# + status + amount */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-black text-primary font-mono tracking-tight">{q.quoteNumber}</span>
              <StatusBadge status={q.status} />
              {q.validUntil && new Date(q.validUntil) < new Date() && q.status !== "expired" && q.status !== "rejected" && q.status !== "accepted" && (
                <span className="text-[9px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full border border-amber-400/20">OVERDUE</span>
              )}
            </div>
            <p className="text-sm font-bold text-foreground truncate leading-tight">{q.customerName}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {q.customerPhone && <span className="text-[11px] text-muted-foreground/50 font-mono">{q.customerPhone}</span>}
              <span className="text-[11px] text-muted-foreground/35">
                {format(new Date(q.createdAt), "dd MMM yyyy")}
                {q.validUntil && ` · Valid till ${format(new Date(q.validUntil), "dd MMM")}`}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-black text-primary font-mono">{KES(q.total)}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">
              {q.items.length} item{q.items.length !== 1 ? "s" : ""}
              {q.discountAmount > 0 && ` · −${KES(q.discountAmount)}`}
            </p>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-1 pt-2 border-t border-border/30 flex-wrap">
          {/* Convert to Sale — primary action, lime pill */}
          <button
            onClick={onConvertToSale}
            title="Load items into POS cart"
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground text-[10px] font-black transition-all"
          >
            <ShoppingCart className="h-3 w-3" />
            <span>Sell</span>
          </button>

          <button
            onClick={() => setExpanded(v => !v)}
            className="h-7 px-2 flex items-center gap-1 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors text-[10px] font-semibold"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide" : "Items"}
          </button>

          <div className="flex-1" />

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
          {/* Status menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
              title="Change status"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-xl shadow-2xl z-40 overflow-hidden">
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
                </div>
              </>
            )}
          </div>
          <button
            onClick={onDelete}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Delete quotation"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div className="border-t border-border/40 bg-muted/10">
          <div className="px-4 py-1.5 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/30 border-b border-border/20">
            <span>Product</span><span className="text-right">Qty</span><span className="text-right">Unit Price</span><span className="text-right">Total</span>
          </div>
          {q.items.map((item, i) => (
            <div key={i} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center border-b border-border/15 last:border-0">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                <p className="text-[10px] text-muted-foreground/40 mt-0.5">{item.unit}</p>
              </div>
              <span className="text-xs font-mono text-muted-foreground text-right">{item.qty}</span>
              <span className="text-xs font-mono text-muted-foreground/60 text-right">{KES(item.unitPrice)}</span>
              <span className="text-xs font-black font-mono text-foreground text-right">{KES(item.total)}</span>
            </div>
          ))}
          {q.discountAmount > 0 && (
            <div className="px-4 py-2 flex justify-between text-xs border-t border-border/20 bg-muted/20">
              <span className="text-muted-foreground/50">Discount applied</span>
              <span className="font-mono font-bold text-red-400">−{KES(q.discountAmount)}</span>
            </div>
          )}
          <div className="px-4 py-2.5 flex justify-between items-center bg-primary/5 border-t border-primary/10">
            <span className="text-[10px] font-black text-primary/60 uppercase tracking-wider">Total</span>
            <span className="text-sm font-black font-mono text-primary">{KES(q.total)}</span>
          </div>
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
  const [, setLocation] = useLocation();
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

  const handleConvertToSale = (q: Quotation) => {
    sessionStorage.setItem("greenlink_pending_cart", JSON.stringify({
      items: q.items.map(item => ({
        productId: item.productId,
        productName: item.productName,
        qty: item.qty,
        unitPrice: item.unitPrice,
        unit: item.unit,
      })),
      customerName: q.customerName,
      discount: q.discountAmount,
      fromQuote: q.quoteNumber,
    }));
    toast.success(`Loading ${q.quoteNumber} into POS…`);
    setLocation("/pos");
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
  const acceptedCount = counts["accepted"] ?? 0;
  const totalValue = filtered.reduce((s, q) => s + q.total, 0);
  const acceptedValue = quoteList.filter(q => q.status === "accepted").reduce((s, q) => s + q.total, 0);

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
                Clear {draftCount} Draft{draftCount !== 1 ? "s" : ""}
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

        {/* Stats row */}
        {quoteList.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-muted/30 rounded-xl px-3 py-2 border border-border/40">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/40 mb-0.5">Total Value</p>
              <p className="text-sm font-black text-foreground font-mono">{KES(totalValue)}</p>
            </div>
            <div className="bg-emerald-500/5 rounded-xl px-3 py-2 border border-emerald-500/15">
              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-500/60 mb-0.5">Accepted</p>
              <p className="text-sm font-black text-emerald-400 font-mono">{KES(acceptedValue)}</p>
            </div>
            <div className="bg-primary/5 rounded-xl px-3 py-2 border border-primary/15">
              <p className="text-[9px] font-black uppercase tracking-wider text-primary/50 mb-0.5">Open</p>
              <p className="text-sm font-black text-primary font-mono">{(counts["draft"] ?? 0) + (counts["sent"] ?? 0)}</p>
            </div>
          </div>
        )}

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
                onDownloadPdf={() => downloadPdf(q, shop)}
                onConvertToSale={() => handleConvertToSale(q)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
