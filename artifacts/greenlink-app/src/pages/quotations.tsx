import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  customFetch,
  useListProducts,
  useGetShop,
  getListProductsQueryKey,
  getGetShopQueryKey,
} from "@workspace/api-client-react";
import {
  Plus,
  Search,
  Trash2,
  ChevronLeft,
  Printer,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  User,
  Phone,
  Mail,
  Calendar,
  StickyNote,
  Edit2,
  Package,
  Loader2,
  X,
  Eye,
  Download,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Copy,
  MoreVertical,
  TrendingUp,
  FileSpreadsheet,
  Upload,
  ClipboardList,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  drawPdfStamp,
  drawPdfWatermark,
  getPdfShopLogoAssets,
  loadPdfStampLogo,
} from "@/lib/pdf-stamp";

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
  invoiceNumber: string | null;
  invoiceIssuedAt: string | null;
  invoiceSnapshot?: {
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    notes: string | null;
    validUntil: string | null;
    subtotal: number;
    discountAmount: number;
    total: number;
    items: QuotationItem[];
    createdAt: string;
    revisionNumber?: number;
    revisedAt?: string | null;
  } | null;
  createdBy: string | null;
  createdAt: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const KES = (n: number) =>
  "KES " +
  n.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

function amountInWords(amount: number): string {
  const small = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
    "thirteen",
    "fourteen",
    "fifteen",
    "sixteen",
    "seventeen",
    "eighteen",
    "nineteen",
  ];
  const tens = [
    "",
    "",
    "twenty",
    "thirty",
    "forty",
    "fifty",
    "sixty",
    "seventy",
    "eighty",
    "ninety",
  ];
  const wholeWords = (value: number): string => {
    if (value < 20) return small[value];
    if (value < 100)
      return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${small[value % 10]}` : ""}`;
    if (value < 1_000)
      return `${small[Math.floor(value / 100)]} hundred${value % 100 ? ` ${wholeWords(value % 100)}` : ""}`;
    if (value < 1_000_000)
      return `${wholeWords(Math.floor(value / 1_000))} thousand${value % 1_000 ? ` ${wholeWords(value % 1_000)}` : ""}`;
    if (value < 1_000_000_000)
      return `${wholeWords(Math.floor(value / 1_000_000))} million${value % 1_000_000 ? ` ${wholeWords(value % 1_000_000)}` : ""}`;
    if (value < 1_000_000_000_000)
      return `${wholeWords(Math.floor(value / 1_000_000_000))} billion${value % 1_000_000_000 ? ` ${wholeWords(value % 1_000_000_000)}` : ""}`;
    return value.toLocaleString("en-KE");
  };
  const centsTotal = Math.round(Math.max(0, Number(amount) || 0) * 100);
  const shillings = Math.floor(centsTotal / 100);
  const cents = centsTotal % 100;
  return `${wholeWords(shillings)} Kenya shillings${cents ? ` and ${wholeWords(cents)} cents` : ""} only`;
}

function getQuotationShopName(shop: any): string {
  const shopId = shop?.id ?? localStorage.getItem("greenlink_shopId");
  if (shopId === "shop-sunrise") {
    return getPdfShopLogoAssets(shopId).sealName;
  }
  return shop?.name ?? "Our Shop";
}

const STATUS_META = {
  draft: {
    label: "Draft",
    color: "text-muted-foreground bg-muted/70 border-border/80",
    dot: "bg-muted-foreground",
  },
  sent: {
    label: "Sent",
    color: "text-sky-700 dark:text-sky-300 bg-sky-500/12 border-sky-500/25",
    dot: "bg-sky-500",
  },
  accepted: {
    label: "Accepted",
    color: "text-emerald-700 dark:text-emerald-400 bg-emerald-500/12 border-emerald-500/25",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Rejected",
    color: "text-rose-700 dark:text-rose-400 bg-rose-500/12 border-rose-500/25",
    dot: "bg-rose-500",
  },
  expired: {
    label: "Expired",
    color: "text-amber-700 dark:text-amber-400 bg-amber-500/12 border-amber-500/25",
    dot: "bg-amber-500",
  },
} as const;

function StatusBadge({ status }: { status: Quotation["status"] }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide px-2.5 py-0.5 rounded-full border",
        m.color,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", m.dot)} />
      {m.label}
    </span>
  );
}

// ─── PDF generation ────────────────────────────────────────────────────────────

async function downloadPdf(
  quotation: Quotation,
  shop: any,
  documentType: "quotation" | "invoice" = "quotation",
) {
  const isInvoice = documentType === "invoice";
  if (isInvoice && !quotation.invoiceNumber) {
    toast.error("Issue an invoice first");
    return;
  }
  const documentNumber = isInvoice
    ? quotation.invoiceNumber!
    : quotation.quoteNumber;
  const pdfData =
    isInvoice && quotation.invoiceSnapshot
      ? { ...quotation, ...quotation.invoiceSnapshot }
      : quotation;
  toast.loading(`Generating ${isInvoice ? "invoice" : "quotation"} PDF…`, {
    id: "pdf",
  });
  try {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const ML = 12;
    const MR = 12;
    const CW = W - ML - MR;

    // ── Brand palette ─────────────────────────────────────────────────────────
    type RGB = [number, number, number];
    const EMERALD: RGB = isInvoice ? [18, 112, 68] : [25, 83, 163];
    const DKEMER: RGB = isInvoice ? [9, 83, 49] : [16, 58, 123];
    const DARK: RGB = DKEMER;
    const BRANDPALE: RGB = isInvoice ? [237, 247, 240] : [237, 243, 252];
    const WHITE: RGB = [255, 255, 255];
    const LGRAY: RGB = [248, 250, 252]; // very light gray — alternating rows
    const MGRAY: RGB = [91, 105, 119];
    const DKTXT: RGB = [28, 39, 34];
    const BORD: RGB = [216, 225, 219];

    // ── Load shop logo ─────────────────────────────────────────────────────────
    const currentShopId =
      shop?.id ?? localStorage.getItem("greenlink_shopId") ?? undefined;
    const shopLogoAssets = getPdfShopLogoAssets(currentShopId);
    const shopDisplayName = getQuotationShopName(shop);
    const logoUrl = shopLogoAssets.printHeader ?? shopLogoAssets.header;
    let logoBase64 = "";
    let logoNatW = 0;
    let logoNatH = 0;
    try {
      const resp = await fetch(logoUrl);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          logoNatW = img.naturalWidth;
          logoNatH = img.naturalHeight;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = blobUrl;
      });
      URL.revokeObjectURL(blobUrl);
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      /* logo optional */
    }
    const stampLogoBase64 = await loadPdfStampLogo(shopLogoAssets.seal);
    const pdfLocation = "Nanyuki, Kenya";

    // ── Helper: softly tinted info box with a precise brand accent ────────────
    function infoBox(
      bx: number,
      by: number,
      bw: number,
      bh: number,
      label: string,
    ) {
      doc.setDrawColor(...BORD);
      doc.setLineWidth(0.25);
      doc.setFillColor(...WHITE);
      doc.roundedRect(bx, by, bw, bh, 1.4, 1.4, "FD");
      const hh = 8;
      doc.setFillColor(...BRANDPALE);
      doc.roundedRect(bx, by, bw, hh, 1.4, 1.4, "F");
      doc.setFillColor(...WHITE);
      doc.rect(bx, by + hh - 1.5, bw, 1.5, "F");
      doc.setFillColor(...EMERALD);
      doc.rect(bx, by, 1.2, hh, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(...DKEMER);
      doc.text(label, bx + 5, by + 5.5);
    }

    // ── Helper: label : value row inside a box ────────────────────────────────
    function fieldRow(
      bx: number,
      by: number,
      bw: number,
      label: string,
      value: string,
    ) {
      const valX = bx + bw * 0.4;
      const maxValueWidth = Math.max(8, bx + bw - valX - 5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.6);
      doc.setTextColor(...MGRAY);
      doc.text(label, bx + 5, by);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DKTXT);
      const fitted = fitOneLine(value || "—", maxValueWidth, 7);
      doc.setFontSize(fitted.fontSize);
      doc.text(fitted.text, valX, by);
    }

    function fitOneLine(text: string, maxWidth: number, baseFontSize: number) {
      let fontSize = baseFontSize;
      doc.setFontSize(fontSize);
      while (doc.getTextWidth(text) > maxWidth && fontSize > 5.2) {
        fontSize = Math.max(5.2, fontSize - 0.2);
        doc.setFontSize(fontSize);
      }
      let fittedText = text;
      if (doc.getTextWidth(fittedText) > maxWidth) {
        while (
          fittedText.length > 1 &&
          doc.getTextWidth(`${fittedText}...`) > maxWidth
        ) {
          fittedText = fittedText.slice(0, -1);
        }
        fittedText = `${fittedText.trimEnd()}...`;
      }
      return { text: fittedText, fontSize };
    }

    // ── Helper: footer ─────────────────────────────────────────────────────────
    function drawFooter(page: number, totalPages: number) {
      const footerTop = H - 14;
      doc.setFillColor(...DARK);
      doc.rect(0, footerTop, W, 14, "F");
      doc.setFillColor(...EMERALD);
      doc.rect(0, footerTop, W, 1.4, "F");

      const dividerColor: RGB = [74, 101, 91];
      doc.setDrawColor(...dividerColor);
      doc.setLineWidth(0.2);
      doc.line(62, footerTop + 3.2, 62, H - 2.8);
      doc.line(143, footerTop + 3.2, 143, H - 2.8);

      const labelColor: RGB = isInvoice ? [168, 220, 188] : [177, 202, 242];
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(...labelColor);
      doc.text("LOCATION", ML + 6, H - 9.4);
      doc.text("CONTACT", 68, H - 9.4);
      doc.text(`PAGE ${page} OF ${totalPages}`, W - MR, H - 9.4, {
        align: "right",
      });

      doc.setDrawColor(230, 241, 235);
      doc.setLineWidth(0.35);
      doc.circle(ML + 1.8, H - 5.9, 1.2, "S");
      doc.setFillColor(...labelColor);
      doc.circle(ML + 1.8, H - 5.9, 0.35, "F");

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.1);
      doc.setTextColor(...WHITE);
      const location = fitOneLine(pdfLocation, 40, 6.1);
      doc.setFontSize(location.fontSize);
      doc.text(location.text, ML + 6, H - 4.4);

      const contactValues = [shop?.ownerWhatsapp, shop?.email].filter(
        Boolean,
      ) as string[];
      contactValues.slice(0, 2).forEach((value, index) => {
        const fitted = fitOneLine(value, 70, 5.8);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fitted.fontSize);
        doc.setTextColor(...WHITE);
        doc.text(fitted.text, 68, H - (index === 0 ? 7.1 : 3.7));
      });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.1);
      doc.setTextColor(...WHITE);
      const business = fitOneLine(
        shopDisplayName || shopLogoAssets.sealName,
        53,
        6.1,
      );
      doc.setFontSize(business.fontSize);
      doc.text(business.text, W - MR, H - 4.4, { align: "right" });
    }

    // ── Helper: continuation header (pages 2+) ────────────────────────────────
    function drawContinuationHeader(pg: number, total: number) {
      // Do NOT fill the entire page white here — pages are already white in
      // jsPDF, and doing so in didDrawPage leaves fill state dirty (set to DARK/
      // EMERALD at the end) which makes autotable body rows render black on page 2+.
      doc.setFillColor(...DARK);
      doc.rect(0, 0, W, 9, "F");
      doc.setFillColor(...EMERALD);
      doc.rect(0, 0, W, 1.8, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(180, 188, 200);
      doc.text(
        `${shopDisplayName}  ·  ${documentNumber}  ·  continued`,
        ML,
        6.5,
      );
      doc.text(`Page ${pg} of ${total}`, W - MR, 6.5, { align: "right" });
      // Reset graphics state so autotable inherits clean defaults after this hook
      doc.setFillColor(...WHITE);
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PAGE 1
    // ══════════════════════════════════════════════════════════════════════════
    doc.setFillColor(...WHITE);
    doc.rect(0, 0, W, H, "F");

    // ── HEADER — original shop logo and saved contact details ─────────────────
    const HDR_H = 34;
    doc.setFillColor(...WHITE);
    doc.rect(0, 0, W, HDR_H, "F");
    doc.setFillColor(...EMERALD);
    doc.rect(0, 0, W, 2, "F");

    const LOGO_BOX_W = 56,
      LOGO_BOX_H = 25;
    if (logoBase64 && logoNatW > 0 && logoNatH > 0) {
      const scale = Math.min(LOGO_BOX_W / logoNatW, LOGO_BOX_H / logoNatH);
      const dW = logoNatW * scale;
      const dH = logoNatH * scale;
      const lx = ML + (LOGO_BOX_W - dW) / 2;
      const ly = 4 + (LOGO_BOX_H - dH) / 2;
      doc.addImage(logoBase64, "JPEG", lx, ly, dW, dH);
    }
    const contactX = ML + LOGO_BOX_W + 7;
    doc.setDrawColor(...BORD);
    doc.setLineWidth(0.35);
    doc.line(contactX - 3.5, 7, contactX - 3.5, 29);
    const headerContacts = [
      ["LOCATION", pdfLocation],
      ["PHONE", shop?.ownerWhatsapp],
      ["EMAIL", shop?.email],
    ].filter(([, value]) => Boolean(value)) as [string, string][];
    headerContacts.forEach(([label, value], index) => {
      const rowY = 10 + index * 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.3);
      doc.setTextColor(...EMERALD);
      doc.text(label, contactX, rowY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...DKTXT);
      const valueX = contactX + 18;
      const fitted = fitOneLine(value, W - MR - valueX, 7);
      doc.setFontSize(fitted.fontSize);
      doc.text(fitted.text, valueX, rowY);
    });
    doc.setDrawColor(...BORD);
    doc.setLineWidth(0.25);
    doc.line(ML, HDR_H, W - MR, HDR_H);

    // ── DOCUMENT TITLE AND REFERENCE ──────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...DKEMER);
    doc.text(isInvoice ? "INVOICE" : "QUOTATION", ML, 54);

    const refBoxW = 58;
    const refBoxX = W - MR - refBoxW;
    doc.setFillColor(...BRANDPALE);
    doc.setDrawColor(...BORD);
    doc.roundedRect(refBoxX, 40, refBoxW, 17, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(...EMERALD);
    doc.text(
      isInvoice ? "INVOICE NUMBER" : "QUOTATION NUMBER",
      refBoxX + 4,
      46,
    );
    doc.setFontSize(8.5);
    doc.setTextColor(...DKEMER);
    doc.text(documentNumber, refBoxX + 4, 52.2, { maxWidth: refBoxW - 8 });
    if (isInvoice && Number(pdfData.invoiceSnapshot?.revisionNumber ?? 1) > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(180, 70, 35);
      doc.text(`REVISED INVOICE · REVISION ${pdfData.invoiceSnapshot?.revisionNumber}`, W - MR, 25, { align: "right" });
    }

    doc.setDrawColor(...EMERALD);
    doc.setLineWidth(1);
    doc.line(ML, 60, W - MR, 60);

    let y = 66;

    // ── INFO BOXES ────────────────────────────────────────────────────────────
    const LBW = (CW - 5) / 2;
    const RBW = LBW;
    const LBX = ML;
    const RBX = ML + LBW + 5;
    const INFO_H = 35;

    infoBox(
      LBX,
      y,
      LBW,
      INFO_H,
      isInvoice ? "INVOICE DETAILS" : "QUOTATION DETAILS",
    );
    let fy = y + 14;
    const GAP = 6.5;
    if (isInvoice) {
      fieldRow(LBX, fy, LBW, "Invoice No.", documentNumber);
      fy += GAP;
      fieldRow(
        LBX,
        fy,
        LBW,
        "Date",
        format(
          new Date(pdfData.invoiceIssuedAt ?? pdfData.createdAt),
          "dd MMM yyyy",
        ),
      );
      fy += GAP;
      fieldRow(LBX, fy, LBW, "Quote Ref.", pdfData.quoteNumber);
    } else {
      fieldRow(LBX, fy, LBW, "Quote No.", pdfData.quoteNumber);
      fy += GAP;
      fieldRow(
        LBX,
        fy,
        LBW,
        "Date",
        format(new Date(pdfData.createdAt), "dd MMM yyyy"),
      );
      fy += GAP;
      fieldRow(
        LBX,
        fy,
        LBW,
        "Valid Until",
        pdfData.validUntil
          ? format(new Date(pdfData.validUntil), "dd MMM yyyy")
          : "—",
      );
    }

    infoBox(RBX, y, RBW, INFO_H, "CUSTOMER DETAILS");
    let qy = y + 14;
    fieldRow(RBX, qy, RBW, "Bill To", pdfData.customerName);
    qy += GAP;
    fieldRow(RBX, qy, RBW, "Phone", pdfData.customerPhone ?? "");
    qy += GAP;
    fieldRow(RBX, qy, RBW, "Email", pdfData.customerEmail ?? "");
    y += INFO_H + 5;

    // ── ITEMS TABLE ───────────────────────────────────────────────────────────
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR, top: 13, bottom: 18 },
      showHead: "everyPage",
      head: [
        [
          "#",
          "PRODUCT / DESCRIPTION",
          "QTY",
          "UNIT",
          "UNIT PRICE (KES)",
          "TOTAL (KES)",
        ],
      ],
      body: pdfData.items.map((item, i) => [
        String(i + 1),
        item.productName,
        item.qty % 1 === 0 ? String(item.qty) : item.qty.toFixed(2),
        item.unit || "—",
        item.unitPrice.toLocaleString("en-KE"),
        item.total.toLocaleString("en-KE"),
      ]),
      headStyles: {
        fillColor: DARK,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7,
        cellPadding: { top: 3.4, bottom: 3.4, left: 3.2, right: 3.2 },
        halign: "center",
      },
      bodyStyles: {
        fillColor: false,
        fontSize: 7.5,
        cellPadding: { top: 2, bottom: 2, left: 3.5, right: 3.5 },
        textColor: DKTXT,
        lineColor: BORD,
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: false },
      columnStyles: {
        0: {
          // Keep two-digit item numbers (10, 11, …) on a single line in the PDF.
          cellWidth: 12,
          cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
          halign: "center",
          fontStyle: "bold",
          textColor: MGRAY,
          fontSize: 6.5,
        },
        1: { cellWidth: "auto", halign: "left" },
        2: { cellWidth: 14, halign: "center" },
        3: { cellWidth: 17, halign: "center", textColor: MGRAY },
        4: { cellWidth: 31, halign: "right" },
        5: { cellWidth: 32, halign: "right", fontStyle: "bold" },
      },
      tableLineColor: BORD,
      tableLineWidth: 0.2,
      didDrawCell: (data: any) => {
        if (
          data.row.index === -1 &&
          data.column.index === data.table.columns.length - 1
        ) {
          doc.setDrawColor(...EMERALD);
          doc.setLineWidth(0.8);
          doc.line(
            ML,
            data.cell.y + data.cell.height,
            W - MR,
            data.cell.y + data.cell.height,
          );
        }
      },
      didDrawPage: (_: any) => {
        const pg: number = (doc as any).internal.getCurrentPageInfo()
          .pageNumber;
        const total: number = (doc as any).internal.getNumberOfPages();
        if (pg > 1) drawContinuationHeader(pg, total);
      },
    });

    let ty: number = (doc as any).lastAutoTable.finalY + 6;

    const LCW = CW * 0.54;
    const RCW = CW - LCW - 5;
    const LCX = ML;
    const RCX = ML + LCW + 5;

    const defaultTerms = isInvoice
      ? [
          "Payment is due upon receipt of this invoice.",
          "Please use the invoice number as your payment reference.",
          "Contact the shop if you need help with this invoice.",
        ]
      : [
          "Prices are valid until the date shown above.",
          "Availability is subject to stock at the time of order.",
          "Delivery charges may apply depending on location.",
        ];
    const termLines: string[] = pdfData.notes
      ? (doc.splitTextToSize(pdfData.notes, LCW - 12) as string[])
      : defaultTerms;
    const TERMS_H = Math.max(25, termLines.length * 4.2 + 12);

    const stampSize = 42;
    const stampX = W - MR - stampSize;
    const stampY = H - 59;
    const PAY_H = 35;
    const totalRowsHeight = pdfData.discountAmount > 0 ? 26.5 : 9.5;
    const rightColumnHeight = totalRowsHeight + 4 + 16;
    const getBottomSectionPositions = (sectionY: number) => {
      const amountWordsY = sectionY + Math.max(PAY_H, rightColumnHeight) + 8;
      const termsY = amountWordsY + 8;
      const signatureY = termsY + TERMS_H + 7;
      return { amountWordsY, termsY, signatureY };
    };
    let bottomPositions = getBottomSectionPositions(ty);
    const estimatedRightBottom = ty + rightColumnHeight;
    if (
      estimatedRightBottom > stampY - 5 ||
      bottomPositions.signatureY + 8 > H - 17
    ) {
      doc.addPage();
      doc.setFillColor(...WHITE);
      doc.rect(0, 0, W, H, "F");
      const newPg = (doc as any).internal.getNumberOfPages();
      drawContinuationHeader(newPg, newPg);
      ty = 16;
      bottomPositions = getBottomSectionPositions(ty);
    }

    // ── BOTTOM SECTION ────────────────────────────────────────────────────────
    const PAY_Y = ty;
    infoBox(LCX, PAY_Y, LCW, PAY_H, "PAYMENT OPTIONS");
    const PAY_CONTENT_Y = PAY_Y + 8;
    const payMethods = [
      { label: "Cash", sub: "On delivery" },
      { label: "M-Pesa", sub: "Paybill / Till" },
      { label: "Bank Transfer", sub: "Request details" },
    ];
    const slotW = LCW / payMethods.length;
    payMethods.forEach((pm, i) => {
      const cx = LCX + slotW * i + slotW / 2;
      const iconY = PAY_CONTENT_Y;

      if (i === 0) {
        const bx = cx - 7,
          by = iconY,
          bw = 14,
          bh = 8;
        doc.setFillColor(...DKEMER);
        doc.roundedRect(bx, by, bw, bh, 1.5, 1.5, "F");
        doc.setFillColor(...EMERALD);
        doc.roundedRect(bx + 2, by + 2, bw - 4, bh - 4, 0.8, 0.8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.5);
        doc.setTextColor(...WHITE);
        doc.text("KES", cx, by + bh / 2 + 1.8, { align: "center" });
      } else if (i === 1) {
        const ph = 10,
          pw = 6.5;
        const px2 = cx - pw / 2,
          py2 = iconY;
        doc.setFillColor(...DKEMER);
        doc.roundedRect(px2, py2, pw, ph, 1.2, 1.2, "F");
        doc.setFillColor(...WHITE);
        doc.roundedRect(cx - 1.5, py2 + 1.2, 3, 0.9, 0.3, 0.3, "F");
        doc.setFillColor(...EMERALD);
        doc.roundedRect(
          px2 + 0.8,
          py2 + 2.8,
          pw - 1.6,
          ph - 5.2,
          0.5,
          0.5,
          "F",
        );
        doc.setFillColor(...WHITE);
        doc.circle(cx, py2 + ph - 1.5, 0.9, "F");
      } else {
        const bw2 = 13,
          bx2 = cx - bw2 / 2,
          by2 = iconY;
        doc.setDrawColor(...DKEMER);
        doc.setLineWidth(0.8);
        doc.line(cx, by2, bx2, by2 + 3.5);
        doc.line(cx, by2, bx2 + bw2, by2 + 3.5);
        doc.line(bx2, by2 + 3.5, bx2 + bw2, by2 + 3.5);
        doc.setFillColor(...DKEMER);
        const colW = 1.8,
          colH = 4.5,
          colY = by2 + 3.5;
        const colGap = (bw2 - colW * 4) / 5;
        for (let c = 0; c < 4; c++) {
          doc.rect(bx2 + colGap * (c + 1) + colW * c, colY, colW, colH, "F");
        }
        doc.rect(bx2 - 0.5, by2 + 3.5 + colH, bw2 + 1, 1.5, "F");
      }

      const labelY = PAY_CONTENT_Y + 15;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...DKTXT);
      doc.text(pm.label, cx, labelY, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.5);
      doc.setTextColor(...MGRAY);
      doc.text(pm.sub, cx, labelY + 4, { align: "center" });
      if (i < payMethods.length - 1) {
        doc.setDrawColor(...BORD);
        doc.setLineWidth(0.2);
        doc.line(
          LCX + slotW * (i + 1),
          PAY_CONTENT_Y + 2,
          LCX + slotW * (i + 1),
          PAY_Y + PAY_H - 3,
        );
      }
    });

    // Totals (right column)
    let ry = ty;
    const ROW_H = 8.5;

    function totRow(label: string, value: string, highlight = false) {
      if (highlight) {
        doc.setFillColor(...DARK);
        doc.roundedRect(RCX, ry, RCW, ROW_H + 1, 1.2, 1.2, "F");
        doc.setFillColor(...EMERALD);
        doc.rect(RCX, ry, 2.2, ROW_H + 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.6);
        doc.setTextColor(...WHITE);
        doc.text(label, RCX + 6, ry + 6.2);
        doc.setTextColor(...WHITE);
        doc.text(value, RCX + RCW - 4, ry + 6.2, { align: "right" });
      } else {
        doc.setFillColor(...BRANDPALE);
        doc.rect(RCX, ry, RCW, ROW_H, "F");
        doc.setDrawColor(...BORD);
        doc.setLineWidth(0.2);
        doc.line(RCX, ry + ROW_H, RCX + RCW, ry + ROW_H);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MGRAY);
        doc.text(label, RCX + 4, ry + 5.8);
        doc.setTextColor(...DKTXT);
        doc.text(value, RCX + RCW - 4, ry + 5.8, { align: "right" });
      }
      ry += highlight ? ROW_H + 1 : ROW_H;
    }

    if (pdfData.discountAmount > 0) {
      totRow("SUBTOTAL", KES(pdfData.subtotal));
      totRow("DISCOUNT", `− ${KES(pdfData.discountAmount)}`);
    }
    totRow(
      isInvoice ? "AMOUNT DUE" : "TOTAL AMOUNT",
      KES(pdfData.total),
      true,
    );

    // Thank you box
    const TY_BOX_Y = ry + 4;
    const TY_BOX_H = 16;
    doc.setFillColor(...BRANDPALE);
    doc.roundedRect(RCX, TY_BOX_Y, RCW, TY_BOX_H, 1.2, 1.2, "F");
    doc.setDrawColor(...EMERALD);
    doc.setLineWidth(0.4);
    doc.roundedRect(RCX, TY_BOX_Y, RCW, TY_BOX_H, 1.2, 1.2, "S");
    doc.setFillColor(...EMERALD);
    doc.rect(RCX, TY_BOX_Y, 2.2, TY_BOX_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...DKEMER);
    doc.text("Thank you for your business", RCX + RCW / 2 + 1, TY_BOX_Y + 7, {
      align: "center",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.1);
    doc.setTextColor(...MGRAY);
    doc.text(
      "We appreciate your trust in us.",
      RCX + RCW / 2 + 1,
      TY_BOX_Y + 12,
      { align: "center" },
    );

    // Amount in words, covering the quote total or invoice amount due.
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(...DKEMER);
    doc.text("AMOUNT IN WORDS", ML, bottomPositions.amountWordsY + 4.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DKTXT);
    doc.text(
      amountInWords(pdfData.total),
      ML + 31,
      bottomPositions.amountWordsY + 4.5,
      {
        maxWidth: CW - 31,
      },
    );

    // Notes and conditions occupy the left column, leaving the seal clear.
    infoBox(
      LCX,
      bottomPositions.termsY,
      LCW,
      TERMS_H,
      pdfData.notes ? "NOTES & CONDITIONS" : "TERMS & CONDITIONS",
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(...DKTXT);
    termLines.forEach((line, i) => {
      doc.text(`•  ${line}`, LCX + 5, bottomPositions.termsY + 13 + i * 4.2, {
        maxWidth: LCW - 10,
      });
    });

    // Authorized-by line on the left; the lower-right seal stays unobstructed.
    const sigY = bottomPositions.signatureY;
    doc.setDrawColor(...BORD);
    doc.setLineWidth(0.3);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MGRAY);
    doc.text("Authorized By:", ML, sigY);
    doc.line(ML + 25, sigY + 0.5, ML + LCW - 4, sigY + 0.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.3);
    doc.setTextColor(...DKEMER);
    doc.text(shop?.name ?? shopLogoAssets.sealName, ML, sigY + 6);

    // Footer on every page
    const numPages: number = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= numPages; p++) {
      doc.setPage(p);
      if (p > 1) drawContinuationHeader(p, numPages);
      drawFooter(p, numPages);
    }
    const stampOptions = {
      shopName: shopLogoAssets.sealName,
      logoData: stampLogoBase64,
      status: isInvoice ? "ISSUED" : pdfData.status,
      dateLabel: format(
        new Date(
          isInvoice
            ? (pdfData.invoiceIssuedAt ?? pdfData.createdAt)
            : pdfData.createdAt,
        ),
        "dd MMM yyyy",
      ),
      documentRef: documentNumber,
    };
    drawPdfWatermark(doc, stampOptions);
    doc.setPage(numPages);
    drawPdfStamp(doc, {
      x: stampX,
      y: stampY,
      size: stampSize,
      ...stampOptions,
    });

    const custSlug = (pdfData.customerName?.trim() || "")
      .replace(/[^a-z0-9]/gi, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    doc.save(
      custSlug ? `${custSlug}_${documentNumber}.pdf` : `${documentNumber}.pdf`,
    );
    toast.success("PDF downloaded!", { id: "pdf" });
  } catch (err) {
    console.error(err);
    toast.error("PDF generation failed. Try printing instead.", { id: "pdf" });
  }
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

function buildWhatsAppText(
  q: Quotation,
  shop: any,
  documentType: "quotation" | "invoice" = "quotation",
): string {
  const isInvoice = documentType === "invoice" && !!q.invoiceNumber;
  const documentNumber = isInvoice ? q.invoiceNumber! : q.quoteNumber;
  const lines: string[] = [
    `*${isInvoice ? "INVOICE" : "QUOTATION"} — ${documentNumber}*`,
    `_${getQuotationShopName(shop)}_`,
    "",
    `👤 *Customer:* ${q.customerName}`,
    ...(q.customerPhone ? [`📞 *Phone:* ${q.customerPhone}`] : []),
    ...(isInvoice
      ? [
          `📄 *Quotation Ref:* ${q.quoteNumber}`,
          `📅 *Invoice Date:* ${format(new Date(q.invoiceIssuedAt ?? q.createdAt), "dd MMM yyyy")}`,
        ]
      : [
          `📅 *Date:* ${format(new Date(q.createdAt), "dd MMM yyyy")}`,
          ...(q.validUntil
            ? [
                `⏳ *Valid Until:* ${format(new Date(q.validUntil), "dd MMM yyyy")}`,
              ]
            : []),
        ]),
    "",
    "*─── ITEMS ───*",
    ...q.items.map(
      (item, i) =>
        `${i + 1}. ${item.productName}\n   ${item.qty} ${item.unit} × ${KES(item.unitPrice)} = *${KES(item.total)}*`,
    ),
    "",
    ...(q.discountAmount > 0
      ? [`Subtotal: ${KES(q.subtotal)}`, `Discount: -${KES(q.discountAmount)}`]
      : []),
    `*${isInvoice ? "AMOUNT DUE" : "TOTAL"}: ${KES(q.total)}*`,
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

function shareWhatsApp(
  q: Quotation,
  shop: any,
  documentType: "quotation" | "invoice" = "quotation",
) {
  const text = buildWhatsAppText(q, shop, documentType);
  const phone = q.customerPhone?.replace(/\D/g, "") ?? "";
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank");
}

// ─── Print preview ────────────────────────────────────────────────────────────

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
  const shopDisplayName = getQuotationShopName(shop);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadPdf(quotation, shop);
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#0A0A0A] shrink-0 flex-wrap">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/80 text-xs font-semibold hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-black text-[#C8FF00] font-mono">
            {quotation.quoteNumber}
          </span>
          <span className="hidden sm:inline text-xs text-white/60 truncate">
            · {quotation.customerName}
          </span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => shareWhatsApp(quotation, shop, quotation.invoiceNumber ? "invoice" : "quotation")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 text-xs font-bold hover:bg-[#25D366]/30 transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>
        {quotation.invoiceNumber && (
          <button
            onClick={() => downloadPdf(quotation, shop, "invoice")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Invoice PDF</span>
          </button>
        )}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C8FF00] text-[#0A0A0A] text-xs font-black hover:bg-[#C8FF00]/90 disabled:opacity-60 transition-colors"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {downloading ? "Generating…" : "Download PDF"}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/80 text-xs font-semibold hover:bg-white/20 transition-colors"
        >
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Print</span>
        </button>
      </div>

      {/* Document */}
      <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-6">
        <div
          id="quote-doc"
          className="mx-auto bg-white text-gray-900 shadow-2xl overflow-hidden"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: "760px",
            borderRadius: "16px",
          }}
        >
          {/* ── Premium header ── */}
          <div style={{ background: "#0A0A0A", padding: "0" }}>
            {/* Lime top stripe */}
            <div style={{ height: "4px", background: "#C8FF00" }} />
            <div
              style={{
                padding: "28px 36px 26px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "20px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: "180px" }}>
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 900,
                    letterSpacing: "0.25em",
                    color: "#C8FF00",
                    textTransform: "uppercase",
                    marginBottom: "8px",
                    margin: "0 0 8px",
                  }}
                >
                  Official Quotation
                </p>
                <h1
                  style={{
                    fontSize: "24px",
                    fontWeight: 900,
                    color: "#fff",
                    margin: "0 0 8px",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                  }}
                >
                  {shopDisplayName}
                </h1>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {shop?.address && (
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                      {shop.address}
                    </span>
                  )}
                  {shop?.ownerWhatsapp && (
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                      {shop.ownerWhatsapp}
                    </span>
                  )}
                  {shop?.email && (
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                      {shop.email}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#C8FF00",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    margin: "0 0 6px",
                  }}
                >
                  QUOTATION
                </p>
                <p
                  style={{
                    fontSize: "26px",
                    fontWeight: 900,
                    color: "#ffffff",
                    fontFamily: "monospace",
                    margin: "0 0 10px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {quotation.quoteNumber}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    margin: "2px 0",
                  }}
                >
                  Date: {format(new Date(quotation.createdAt), "dd MMM yyyy")}
                </p>
                {quotation.validUntil && (
                  <p
                    style={{
                      fontSize: "11px",
                      color: "#9ca3af",
                      margin: "2px 0",
                    }}
                  >
                    Valid Until:{" "}
                    {format(new Date(quotation.validUntil), "dd MMM yyyy")}
                  </p>
                )}
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "10px",
                    fontSize: "9px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    padding: "4px 12px",
                    borderRadius: "20px",
                    background:
                      quotation.status === "accepted"
                        ? "rgba(34,197,94,0.15)"
                        : quotation.status === "rejected"
                          ? "rgba(239,68,68,0.15)"
                          : "rgba(255,255,255,0.08)",
                    color:
                      quotation.status === "accepted"
                        ? "#4ade80"
                        : quotation.status === "rejected"
                          ? "#f87171"
                          : quotation.status === "sent"
                            ? "#60a5fa"
                            : "#9ca3af",
                    border: `1px solid ${quotation.status === "accepted" ? "rgba(34,197,94,0.3)" : quotation.status === "rejected" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  {STATUS_META[quotation.status].label}
                </span>
              </div>
            </div>
          </div>

          {/* ── Bill To ── */}
          <div style={{ padding: "24px 36px 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: "0",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                overflow: "hidden",
                marginBottom: "24px",
              }}
            >
              <div
                style={{ width: "4px", background: "#C8FF00", flexShrink: 0 }}
              />
              <div style={{ padding: "14px 18px", flex: 1 }}>
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 900,
                    letterSpacing: "0.2em",
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    margin: "0 0 8px",
                  }}
                >
                  Bill To
                </p>
                <p
                  style={{
                    fontSize: "17px",
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: "0 0 5px",
                  }}
                >
                  {quotation.customerName}
                </p>
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  {quotation.customerPhone && (
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {quotation.customerPhone}
                    </span>
                  )}
                  {quotation.customerEmail && (
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {quotation.customerEmail}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Items table ── */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
                marginBottom: "20px",
              }}
            >
              <thead>
                <tr style={{ background: "#0A0A0A" }}>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "4%",
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                    }}
                  >
                    Product / Description
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "9%",
                    }}
                  >
                    Unit
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "8%",
                    }}
                  >
                    Qty
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "17%",
                    }}
                  >
                    Unit Price
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "18%",
                    }}
                  >
                    Total (KES)
                  </th>
                </tr>
                <tr>
                  <td
                    colSpan={6}
                    style={{ height: "2px", background: "#C8FF00", padding: 0 }}
                  />
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((item, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}
                  >
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "center",
                        fontSize: "10px",
                        fontWeight: 800,
                        color: "#94a3b8",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        fontWeight: 600,
                        color: "#0f172a",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {item.productName}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "center",
                        color: "#64748b",
                        fontSize: "11px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {item.unit || "unit"}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "right",
                        color: "#374151",
                        fontFamily: "monospace",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {item.qty}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "right",
                        color: "#475569",
                        fontFamily: "monospace",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {KES(item.unitPrice)}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "right",
                        fontWeight: 800,
                        color: "#0f172a",
                        fontFamily: "monospace",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {KES(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Totals ── */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "24px",
              }}
            >
              <div style={{ width: "260px" }}>
                {quotation.discountAmount > 0 && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 12px",
                        fontSize: "13px",
                        color: "#64748b",
                        background: "#f8fafc",
                        borderRadius: "6px 6px 0 0",
                      }}
                    >
                      <span>Subtotal</span>
                      <span style={{ fontFamily: "monospace" }}>
                        {KES(quotation.subtotal)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 12px",
                        fontSize: "13px",
                        color: "#dc2626",
                        background: "#fef2f2",
                      }}
                    >
                      <span>Discount</span>
                      <span style={{ fontFamily: "monospace" }}>
                        − {KES(quotation.discountAmount)}
                      </span>
                    </div>
                  </>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "#0A0A0A",
                    borderRadius:
                      quotation.discountAmount > 0 ? "0 0 10px 10px" : "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 900,
                      color: "#C8FF00",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Total Due
                  </span>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 900,
                      color: "#fff",
                      fontFamily: "monospace",
                    }}
                  >
                    {KES(quotation.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Notes ── */}
            {quotation.notes && (
              <div
                style={{
                  display: "flex",
                  gap: "0",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  overflow: "hidden",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{ width: "4px", background: "#C8FF00", flexShrink: 0 }}
                />
                <div
                  style={{
                    padding: "12px 16px",
                    flex: 1,
                    background: "#f8fafc",
                  }}
                >
                  <p
                    style={{
                      fontSize: "9px",
                      fontWeight: 900,
                      letterSpacing: "0.2em",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      margin: "0 0 7px",
                    }}
                  >
                    Notes & Terms
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#475569",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.7,
                      margin: 0,
                    }}
                  >
                    {quotation.notes}
                  </p>
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div
              style={{
                borderTop: "2px solid #C8FF00",
                paddingTop: "14px",
                paddingBottom: "24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  color: "#94a3b8",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Valid{" "}
                {quotation.validUntil
                  ? `until ${format(new Date(quotation.validUntil), "dd MMMM yyyy")}`
                  : "for 30 days from issue"}{" "}
                · Prices subject to availability
              </p>
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {shopDisplayName}
              </p>
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

function CustomerAutocomplete({
  value,
  onChange,
  shopId,
  placeholder,
}: {
  value: string;
  onChange: (v: string, phone?: string) => void;
  shopId: string;
  placeholder?: string;
}) {
  const [customers, setCustomers] = useState<
    Array<{ customer_name: string; customer_phone: string }>
  >([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    customFetch(`/api/quotation-customers?shopId=${shopId}`)
      .then((d: any) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [shopId]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => c.customer_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers, value]);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
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
              onMouseDown={() => {
                onChange(c.customer_name, c.customer_phone);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-center gap-2 border-b border-border/30 last:border-0"
            >
              <User className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span className="font-semibold text-foreground">
                {c.customer_name}
              </span>
              {c.customer_phone && (
                <span className="text-xs text-muted-foreground/50 ml-auto font-mono">
                  {c.customer_phone}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quotation Builder ─────────────────────────────────────────────────────────

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

  const [customerName, setCustomerName] = useState(
    editQuotation?.customerName ?? "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    editQuotation?.customerPhone ?? "",
  );
  const [customerEmail, setCustomerEmail] = useState(
    editQuotation?.customerEmail ?? "",
  );
  const [validUntil, setValidUntil] = useState(
    editQuotation?.validUntil?.split("T")[0] ?? "",
  );
  const [notes, setNotes] = useState(editQuotation?.notes ?? "");
  const [items, setItems] = useState<QuotationItem[]>(
    editQuotation?.items ?? [],
  );
  const [discount, setDiscount] = useState(
    String(editQuotation?.discountAmount ?? 0),
  );
  const [saving, setSaving] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [manualItemOpen, setManualItemOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualUnit, setManualUnit] = useState("unit");
  const [manualQty, setManualQty] = useState("1");
  const [manualPrice, setManualPrice] = useState("");
  const [importPreview, setImportPreview] = useState<QuotationItem[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const productParams = { shopId, limit: 3000 };
  const { data: productsData } = useListProducts(productParams, {
    // Every other page that loads the full catalog (POS, Stock, Reports,
    // Alerts) sets staleTime/refetchInterval so they all share one cached
    // fetch instead of re-requesting on every mount. This call was missing
    // that, so opening Quotations always forced a fresh full-catalog read
    // (up to ~3,000 rows) even seconds after POS had just fetched the same
    // data — a large, avoidable chunk of D1 read-row volume.
    query: {
      enabled: !!shopId,
      queryKey: getListProductsQueryKey(productParams),
      staleTime: 15_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    },
  });
  const allProducts = useMemo(
    () => (productsData as any)?.products ?? [],
    [productsData],
  );

  const addedProductIds = useMemo(
    () => new Set(items.map((i) => i.productId).filter(Boolean)),
    [items],
  );

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return allProducts
      .filter(
        (p: any) =>
          p.isActive !== false &&
          (p.canonicalName?.toLowerCase().includes(q) ||
            p.normalizedName?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.category?.toLowerCase().includes(q)),
      )
      .slice(0, 10);
  }, [allProducts, productSearch]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const addProduct = useCallback((p: any) => {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === p.id);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing
            ? {
                ...item,
                qty: item.qty + 1,
                total: (item.qty + 1) * item.unitPrice,
              }
            : item,
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.canonicalName,
          unit: p.unit ?? "unit",
          qty: 1,
          unitPrice: p.sellingPrice ?? 0,
          total: p.sellingPrice ?? 0,
        },
      ];
    });
    setProductSearch("");
    // Keep search open & re-focus for adding more products
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  }, []);

  const addManualItem = () => {
    const name = manualName.trim();
    const qty = Number(manualQty);
    const unitPrice = Number(manualPrice);
    if (!name) {
      toast.error("Enter an item description");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error("Enter a valid unit price");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        productName: name,
        unit: manualUnit.trim() || "unit",
        qty,
        unitPrice,
        total: qty * unitPrice,
      },
    ]);
    setManualName("");
    setManualUnit("unit");
    setManualQty("1");
    setManualPrice("");
    setManualItemOpen(false);
    toast.success("Manual item added to quotation");
  };

  const handleExcelImport = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("The selected file has no worksheet");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];
      const clean = (value: unknown) => String(value ?? "").trim();
      const key = (value: unknown) => clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
      const descriptionKeys = new Set(["description", "item", "itemname", "product", "productname", "name", "details"]);
      const qtyKeys = new Set(["qty", "quantity", "count"]);
      const priceKeys = new Set(["unitprice", "price", "rate", "unitcost", "sellingprice"]);
      const unitKeys = new Set(["unit", "uom", "measure", "unitofmeasure"]);
      const nonEmptyRows = rows.filter((row) => row.some((cell) => clean(cell) !== ""));
      if (nonEmptyRows.length === 0) throw new Error("The selected file is empty");

      const headerIndex = nonEmptyRows.findIndex((row) => {
        const keys = row.map(key);
        return keys.some((v) => descriptionKeys.has(v)) &&
          keys.some((v) => qtyKeys.has(v)) &&
          keys.some((v) => priceKeys.has(v));
      });
      let descriptionCol = 0, qtyCol = 1, priceCol = 2, unitCol = 3;
      let dataRows = nonEmptyRows;
      if (headerIndex >= 0) {
        const headers = nonEmptyRows[headerIndex].map(key);
        descriptionCol = headers.findIndex((v) => descriptionKeys.has(v));
        qtyCol = headers.findIndex((v) => qtyKeys.has(v));
        priceCol = headers.findIndex((v) => priceKeys.has(v));
        const foundUnit = headers.findIndex((v) => unitKeys.has(v));
        if (foundUnit >= 0) unitCol = foundUnit;
        dataRows = nonEmptyRows.slice(headerIndex + 1);
      }

      const parsed: QuotationItem[] = [];
      let skipped = 0;
      for (const row of dataRows) {
        const productName = clean(row[descriptionCol]);
        if (!productName) {
          skipped++;
          continue;
        }
        const qtyText = clean(row[qtyCol]).replace(/,/g, "");
        const priceText = clean(row[priceCol]).replace(/,/g, "").replace(/^KES\s*/i, "");
        const qty = Number(qtyText);
        const unitPrice = Number(priceText);
        if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
          skipped++;
          continue;
        }
        parsed.push({
          productName,
          unit: clean(row[unitCol]) || "unit",
          qty,
          unitPrice,
          total: qty * unitPrice,
        });
      }
      if (parsed.length === 0) {
        throw new Error("No valid rows found. Use columns for Description, Quantity and Unit Price.");
      }
      setImportPreview(parsed);
      setImportFileName(file.name);
      toast.success(`Prepared ${parsed.length} item(s) for review${skipped ? `; skipped ${skipped} invalid row(s)` : ""}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read this spreadsheet");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const confirmImport = () => {
    if (importPreview.length === 0) return;
    setItems((prev) => [...prev, ...importPreview]);
    const count = importPreview.length;
    setImportPreview([]);
    setImportFileName("");
    toast.success(`Added ${count} item(s) to the quotation`);
  };

  const updateItem = (
    idx: number,
    field: keyof QuotationItem,
    val: number | string,
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: val };
        if (field === "qty" || field === "unitPrice") {
          updated.total = Number(updated.qty) * Number(updated.unitPrice);
        }
        return updated;
      }),
    );
  };

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discountAmount = Math.max(0, parseFloat(discount) || 0);
  const total = Math.max(0, subtotal - discountAmount);

  const handleSave = async () => {
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one product");
      return;
    }
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
        result = (await customFetch(`/api/quotations/${editQuotation.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })) as Quotation;
      } else {
        result = (await customFetch(`/api/quotations`, {
          method: "POST",
          body: JSON.stringify(body),
        })) as Quotation;
      }
      onSave(result);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save quotation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky Builder Header */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur-md shrink-0">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 sm:px-6 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-border/80 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title="Back to quotations"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-foreground font-display truncate">
              {editQuotation ? `Edit ${editQuotation.quoteNumber}` : "New Quotation"}
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              {items.length} line{items.length === 1 ? "" : "s"} · Live total{" "}
              <span className="font-mono font-semibold text-foreground">{KES(total)}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="hidden sm:inline-flex h-9 items-center px-3.5 rounded-xl border border-border bg-muted/30 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {saving ? "Saving…" : editQuotation ? "Update Quote" : "Save Quote"}
            </button>
          </div>
        </div>
      </div>

      {/* Responsive 2-Column Workspace */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left / Main: Catalog Search & Line Items */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            <section className="bg-card border border-border/80 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 bg-muted/25">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Products &amp; Line Items
                  </h3>
                </div>
                {items.length > 0 && (
                  <span className="text-[11px] font-bold font-mono bg-primary/12 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full tabular-nums">
                    {items.length} item{items.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Search + Manual + Excel Import */}
              <div className="p-4 space-y-3 border-b border-border/60">
                <div ref={searchContainerRef}>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setSearchOpen(true);
                      }}
                      onFocus={() => setSearchOpen(true)}
                      placeholder="Search stock products by name, category, or SKU…"
                      className="w-full h-10 pl-10 pr-9 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                    {productSearch && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setProductSearch("");
                          searchInputRef.current?.focus();
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {searchOpen && productMatches.length > 0 && (
                    <div className="mt-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-border/40">
                      {productMatches.map((p: any) => {
                        const isAdded = addedProductIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              addProduct(p);
                            }}
                            className={cn(
                              "w-full text-left px-3.5 py-2.5 flex items-center gap-3 transition-colors",
                              isAdded ? "bg-primary/8 hover:bg-primary/12" : "hover:bg-muted/50",
                            )}
                          >
                            {isAdded ? (
                              <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-lg border border-border flex items-center justify-center shrink-0">
                                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p
                                className={cn(
                                  "text-xs sm:text-sm font-semibold truncate",
                                  isAdded ? "text-primary" : "text-foreground",
                                )}
                              >
                                {p.canonicalName}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {p.category} · {p.stockQty} {p.unit} in stock
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-primary font-mono tabular-nums">
                                {KES(p.sellingPrice ?? 0)}
                              </p>
                              {isAdded && (
                                <p className="text-[10px] text-muted-foreground">tap to +1</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {searchOpen &&
                    productSearch.trim() &&
                    productMatches.length === 0 && (
                      <div className="mt-2 rounded-xl px-3.5 py-3 text-center bg-muted/25 border border-border">
                        <p className="text-xs text-muted-foreground">
                          No catalog items match &ldquo;<span className="font-semibold text-foreground">{productSearch}</span>&rdquo; — add a manual line below.
                        </p>
                      </div>
                    )}
                </div>

                {/* Secondary Actions: Manual / Excel Import */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setManualItemOpen((open) => !open)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                      manualItemOpen
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-primary/30 bg-primary/8 text-primary hover:bg-primary/15",
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add manual item
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    disabled={importing}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    )}
                    {importing ? "Reading file…" : "Import Excel / CSV"}
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(event) => void handleExcelImport(event.target.files?.[0])}
                  />
                  <span className="text-[11px] text-muted-foreground ml-auto hidden sm:inline">
                    Manual &amp; imported lines don&apos;t alter stock
                  </span>
                </div>
              </div>

              {/* Manual Item Drawer */}
              {manualItemOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-4 border-b border-border/60 bg-primary/[0.04]">
                  <label className="sm:col-span-5 text-[11px] font-semibold text-muted-foreground space-y-1">
                    <span>Description *</span>
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="e.g. HDPE PIPE 32MM"
                      className="w-full h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </label>
                  <label className="sm:col-span-2 text-[11px] font-semibold text-muted-foreground space-y-1">
                    <span>Unit</span>
                    <input
                      value={manualUnit}
                      onChange={(e) => setManualUnit(e.target.value)}
                      placeholder="pcs, m, kg"
                      className="w-full h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </label>
                  <label className="sm:col-span-2 text-[11px] font-semibold text-muted-foreground space-y-1">
                    <span>Qty</span>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={manualQty}
                      onChange={(e) => setManualQty(e.target.value)}
                      className="w-full h-9 rounded-xl border border-border bg-card px-3 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </label>
                  <label className="sm:col-span-3 text-[11px] font-semibold text-muted-foreground space-y-1">
                    <span>Unit price (KES)</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder="0"
                      className="w-full h-9 rounded-xl border border-border bg-card px-3 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </label>
                  <div className="sm:col-span-12 flex items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                      Line amount:{" "}
                      <strong className="font-mono text-foreground">
                        {KES((Number(manualQty) || 0) * (Number(manualPrice) || 0))}
                      </strong>
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setManualItemOpen(false)}
                        className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={addManualItem}
                        className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add item
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Excel Import Review */}
              {importPreview.length > 0 && (
                <div className="p-4 border-b border-border/60 bg-muted/15 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-foreground">Review spreadsheet import</p>
                      <p className="text-xs text-muted-foreground">
                        {importFileName} · {importPreview.length} valid line(s)
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setImportPreview([]);
                          setImportFileName("");
                        }}
                        className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                      >
                        Cancel import
                      </button>
                      <button
                        type="button"
                        onClick={confirmImport}
                        className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Add {importPreview.length} lines
                      </button>
                    </div>
                  </div>
                  <div className="max-h-56 overflow-auto rounded-xl border border-border bg-card">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted text-muted-foreground">
                        <tr>
                          <th className="p-2.5 text-left">Description</th>
                          <th className="p-2.5 text-right">Qty</th>
                          <th className="p-2.5 text-right">Unit price</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((item, index) => (
                          <tr key={index} className="border-t border-border/50">
                            <td className="p-2.5 text-foreground">
                              {item.productName}{" "}
                              <span className="text-muted-foreground">({item.unit})</span>
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums">{item.qty}</td>
                            <td className="p-2.5 text-right font-mono tabular-nums">
                              {KES(item.unitPrice)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-semibold tabular-nums">
                              {KES(item.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Line Items List */}
              {items.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-2">
                  <Package className="h-9 w-9 text-muted-foreground/25 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">No items in this quote yet</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Search products from your catalog above, add custom items manually, or import from an Excel/CSV file.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {items.map((item, idx) => (
                    <div key={idx} className="p-4 space-y-2.5 hover:bg-muted/15 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-md bg-muted text-[10px] font-bold text-muted-foreground flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-snug break-words">
                            {item.productName}
                          </p>
                          <p className="text-[11px] text-muted-foreground">Unit: {item.unit}</p>
                        </div>
                        <p className="text-sm font-bold text-primary font-mono tabular-nums shrink-0">
                          {KES(item.total)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                          title="Remove line"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5 pl-7 flex-wrap">
                        {/* Overflow-safe grid stepper */}
                        <div className="grid grid-cols-[34px_56px_34px] items-center bg-muted/40 border border-border rounded-xl overflow-hidden h-9 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(
                                idx,
                                "qty",
                                Math.max(
                                  0.25,
                                  item.qty - (item.unit === "kg" || item.unit === "litre" ? 0.25 : 1),
                                ),
                              )
                            }
                            className="h-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-base font-bold transition-colors"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) =>
                              updateItem(idx, "qty", Math.max(0, parseFloat(e.target.value) || 0))
                            }
                            className="w-full min-w-0 h-full text-center text-xs font-bold font-mono bg-transparent text-foreground focus:outline-none border-x border-border tabular-nums"
                            min={0}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(
                                idx,
                                "qty",
                                item.qty + (item.unit === "kg" || item.unit === "litre" ? 0.25 : 1),
                              )
                            }
                            className="h-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-base font-bold transition-colors"
                          >
                            +
                          </button>
                        </div>

                        <span className="text-xs text-muted-foreground font-medium">
                          {item.unit} ×
                        </span>

                        <div className="relative flex-1 min-w-[120px] max-w-[190px]">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">
                            KES
                          </span>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "unitPrice",
                                Math.max(0, parseFloat(e.target.value) || 0),
                              )
                            }
                            className="w-full h-9 pl-10 pr-2.5 bg-muted/40 border border-border rounded-xl text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35 tabular-nums"
                            min={0}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Sticky Column: Customer, Quote Summary & Terms */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4 lg:sticky lg:top-20">
            {/* Customer Card */}
            <section className="bg-card border border-border/80 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/25">
                <User className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Customer Details
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Customer Name *
                  </label>
                  <CustomerAutocomplete
                    value={customerName}
                    onChange={(name, phone) => {
                      setCustomerName(name);
                      if (phone) setCustomerPhone(phone);
                    }}
                    shopId={shopId}
                    placeholder="Search existing or type name"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="+254 700 000 000"
                        className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/35"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Email <span className="normal-case font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="customer@email.com"
                        type="email"
                        className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/35"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Totals & Primary Save Card */}
            <section className="bg-card border border-border/80 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/25">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Quote Summary
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Subtotal ({items.length} items)</span>
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {KES(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground shrink-0">Discount (KES)</span>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    min={0}
                    className="w-32 h-8 px-2.5 bg-muted/40 border border-border rounded-xl text-xs font-mono text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/35 tabular-nums"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border/70 pt-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Quote Total
                  </span>
                  <span className="text-xl font-bold font-mono text-primary tabular-nums">
                    {KES(total)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {saving
                    ? "Saving…"
                    : editQuotation
                      ? "Update Quotation"
                      : "Create Quotation"}
                </button>
              </div>
            </section>

            {/* Validity & Notes Card */}
            <section className="bg-card border border-border/80 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/25">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Terms &amp; Validity
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Valid Until <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Notes / Terms <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <StickyNote className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Payment terms, delivery conditions, special instructions…"
                      rows={3}
                      className="w-full pl-9 pr-3 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Quotation Card ────────────────────────────────────────────────────────────

function QuotationCard({
  q,
  shop,
  onEdit,
  onPrint,
  onStatusChange,
  onDelete,
  onDownloadPdf,
  onConvertToSale,
  onInvoice,
  invoiceBusy,
}: {
  q: Quotation;
  shop: any;
  onEdit: () => void;
  onPrint: () => void;
  onStatusChange: (s: Quotation["status"]) => void;
  onDelete: () => void;
  onDownloadPdf: () => void;
  onConvertToSale: () => void;
  onInvoice: () => void;
  invoiceBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isOverdue =
    Boolean(q.validUntil) &&
    new Date(q.validUntil!) < new Date() &&
    q.status !== "expired" &&
    q.status !== "rejected" &&
    q.status !== "accepted";

  const stripeColor = q.invoiceNumber
    ? "border-l-emerald-500"
    : q.status === "accepted"
      ? "border-l-emerald-500"
      : q.status === "sent"
        ? "border-l-sky-500"
        : q.status === "rejected"
          ? "border-l-rose-500"
          : q.status === "expired"
            ? "border-l-amber-500"
            : "border-l-border";

  return (
    <article
      className={cn(
        "quotation-card group overflow-hidden rounded-2xl border border-border/80 border-l-4 bg-card transition-colors duration-150 hover:border-primary/40",
        stripeColor,
      )}
    >
      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(145px,.85fr)_auto] gap-x-5 gap-y-3 px-4 sm:px-5 py-4 max-xl:grid-cols-[minmax(0,1fr)_auto] max-xl:gap-x-3">
        {/* Identity & Metadata */}
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-lg bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-[11px] font-bold tracking-tight text-primary">
              {q.quoteNumber}
            </span>
            <StatusBadge status={q.status} />
            {q.invoiceNumber && (
              <span
                data-testid={`text-invoice-number-${q.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/12 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-400"
              >
                <FileText className="h-2.5 w-2.5" />
                {q.invoiceNumber}
              </span>
            )}
            {isOverdue && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                <Clock className="h-2.5 w-2.5" />
                Past due
              </span>
            )}
          </div>

          <p className="truncate text-sm sm:text-[15px] font-bold tracking-tight text-foreground">
            {q.customerName}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {q.customerPhone && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Phone className="h-3 w-3 opacity-70" />
                {q.customerPhone}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3 opacity-70" />
              {format(new Date(q.createdAt), "dd MMM yyyy")}
            </span>
            {q.validUntil && (
              <span className={cn(isOverdue && "text-amber-700 dark:text-amber-400 font-semibold")}>
                Valid till {format(new Date(q.validUntil), "dd MMM yyyy")}
              </span>
            )}
          </div>

          {q.notes && (
            <p className="mt-1.5 truncate text-[11px] italic text-muted-foreground/90 max-w-xl">
              &ldquo;{q.notes}&rdquo;
            </p>
          )}
        </div>

        {/* Financial Total */}
        <div className="flex flex-col justify-center border-l border-border/70 pl-5 max-xl:col-start-2 max-xl:row-start-1 max-xl:border-0 max-xl:pl-0 max-xl:text-right">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Quote Total
          </span>
          <span className="mt-1 font-mono text-base sm:text-lg font-bold tracking-tight text-foreground tabular-nums">
            {KES(q.total)}
          </span>
          <span className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {q.items.length} item{q.items.length !== 1 ? "s" : ""}
            {q.discountAmount > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-medium">
                {" "}· −{KES(q.discountAmount)}
              </span>
            )}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 border-l border-border/70 pl-4 max-xl:col-span-2 max-xl:justify-between max-xl:border-0 max-xl:border-t max-xl:border-border/60 max-xl:pt-3 max-xl:pl-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onConvertToSale}
              title="Load items into POS cart"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Sell
            </button>
            <button
              type="button"
              data-testid={`button-invoice-${q.id}`}
              onClick={onInvoice}
              disabled={invoiceBusy}
              title={
                q.invoiceNumber
                  ? "Download issued invoice"
                  : q.status === "accepted"
                    ? "Issue an invoice from this accepted quotation"
                    : "Accept this quotation and issue its invoice"
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {invoiceBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {invoiceBusy
                ? "Issuing…"
                : q.invoiceNumber
                  ? "Invoice PDF"
                  : q.status === "accepted"
                    ? "Make invoice"
                    : "Accept & invoice"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-border/70 bg-muted/40 px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {expanded ? "Hide" : `Items (${q.items.length})`}
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/25 p-0.5">
            <button
              type="button"
              onClick={() =>
                shareWhatsApp(q, shop, q.invoiceNumber ? "invoice" : "quotation")
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 dark:text-[#25D366] transition-colors hover:bg-emerald-500/12"
              title={
                q.invoiceNumber
                  ? "Share invoice via WhatsApp"
                  : "Share quotation via WhatsApp"
              }
              aria-label={
                q.invoiceNumber
                  ? "Share invoice via WhatsApp"
                  : "Share quotation via WhatsApp"
              }
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDownloadPdf}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
              title="Download Quote PDF"
              aria-label="Download PDF"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onPrint}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Print / Full Preview"
              aria-label="Preview quotation"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/12 hover:text-primary"
              title={q.invoiceNumber ? "Edit quotation (issued invoice stays archived)" : "Edit quotation"}
              aria-label="Edit quotation"
              data-testid={`button-edit-quotation-${q.id}`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            {!q.invoiceNumber && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((value) => !value)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                      menuOpen
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    title="Change status"
                    aria-label="Change quotation status"
                    aria-expanded={menuOpen}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-2xl border border-border bg-card py-1.5 shadow-2xl">
                        <p className="border-b border-border/60 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Update status
                        </p>
                        {(
                          [
                            "draft",
                            "sent",
                            "accepted",
                            "rejected",
                            "expired",
                          ] as const
                        )
                          .filter((status) => status !== q.status)
                          .map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => {
                                onStatusChange(status);
                                setMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              <span
                                className={cn("h-2 w-2 rounded-full", STATUS_META[status].dot)}
                              />
                              Mark as {STATUS_META[status].label}
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/12 hover:text-rose-600 dark:hover:text-rose-400"
                  title="Delete quotation"
                  aria-label="Delete quotation"
                  data-testid={`button-delete-quotation-${q.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/70 bg-muted/20">
          <div className="grid grid-cols-[minmax(0,1fr)_58px_112px_112px] gap-3 border-b border-border/60 px-4 sm:px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground max-sm:grid-cols-[minmax(0,1fr)_48px_90px]">
            <span>Product</span>
            <span className="text-right">Qty</span>
            <span className="text-right max-sm:hidden">Unit Price</span>
            <span className="text-right">Line Total</span>
          </div>
          {q.items.map((item, index) => (
            <div
              key={`${q.id}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_58px_112px_112px] items-center gap-3 border-b border-border/45 px-4 sm:px-5 py-2.5 last:border-0 max-sm:grid-cols-[minmax(0,1fr)_48px_90px]"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  {item.productName}
                </p>
                <p className="text-[10px] text-muted-foreground">{item.unit}</p>
              </div>
              <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                {item.qty}
              </span>
              <span className="text-right font-mono text-xs text-muted-foreground max-sm:hidden tabular-nums">
                {KES(item.unitPrice)}
              </span>
              <span className="text-right font-mono text-xs font-semibold text-foreground tabular-nums">
                {KES(item.total)}
              </span>
            </div>
          ))}
          {q.discountAmount > 0 && (
            <div className="flex justify-between border-t border-border/50 px-4 sm:px-5 py-2 text-xs">
              <span className="text-muted-foreground">Discount applied</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                −{KES(q.discountAmount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-primary/20 bg-primary/8 px-4 sm:px-5 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Quote Total
            </span>
            <span className="font-mono text-sm font-bold text-primary tabular-nums">
              {KES(q.total)}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type StatusFilter =
  | "all"
  | "draft"
  | "sent"
  | "accepted"
  | "invoiced"
  | "rejected"
  | "expired";
type QuoteSortMode = "newest" | "value" | "customer" | "validUntil";
type PageView = "list" | "builder" | "print";

const QUOTES_INITIAL_VISIBLE = 15;
const QUOTES_PAGE_STEP = 20;

export default function Quotations() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const shopName = localStorage.getItem("greenlink_shopName") || "Active Shop";
  const [, setLocation] = useLocation();
  const [view, setView] = useState<PageView>("list");
  const [quoteList, setQuoteList] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<QuoteSortMode>("newest");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(QUOTES_INITIAL_VISIBLE);
  const [editTarget, setEditTarget] = useState<Quotation | null>(null);
  const [printTarget, setPrintTarget] = useState<Quotation | null>(null);
  const [clearingDrafts, setClearingDrafts] = useState(false);
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);

  const { data: shopData } = useGetShop(shopId, {
    query: { enabled: !!shopId, queryKey: getGetShopQueryKey(shopId) },
  });
  const shop = shopData as any;

  const loadQuotations = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const data = (await customFetch(
        `/api/quotations?shopId=${shopId}&limit=200`,
      )) as Quotation[];
      setQuoteList(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  useEffect(() => {
    setVisibleCount(QUOTES_INITIAL_VISIBLE);
  }, [filter, search, sortBy]);

  const filtered = useMemo(() => {
    let list = quoteList;
    if (filter === "invoiced") {
      list = list.filter((q) => Boolean(q.invoiceNumber));
    } else if (filter !== "all") {
      list = list.filter((q) => q.status === filter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (x) =>
          x.customerName.toLowerCase().includes(q) ||
          x.quoteNumber.toLowerCase().includes(q) ||
          (x.invoiceNumber || "").toLowerCase().includes(q) ||
          (x.customerPhone || "").toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "value") return b.total - a.total;
      if (sortBy === "customer") return a.customerName.localeCompare(b.customerName);
      if (sortBy === "validUntil") {
        const va = a.validUntil ? new Date(a.validUntil).getTime() : Number.MAX_SAFE_INTEGER;
        const vb = b.validUntil ? new Date(b.validUntil).getTime() : Number.MAX_SAFE_INTEGER;
        return va - vb;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [quoteList, filter, search, sortBy]);

  const visibleQuotes = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quoteList.length, invoiced: 0 };
    quoteList.forEach((q) => {
      c[q.status] = (c[q.status] ?? 0) + 1;
      if (q.invoiceNumber) c.invoiced += 1;
    });
    return c;
  }, [quoteList]);

  const handleSave = (q: Quotation) => {
    setQuoteList((prev) => {
      const idx = prev.findIndex((x) => x.id === q.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = q;
        return next;
      }
      return [q, ...prev];
    });
    toast.success(
      editTarget ? "Quotation updated" : `${q.quoteNumber} created!`,
    );
    setView("list");
    setEditTarget(null);
  };

  const handleStatusChange = async (
    q: Quotation,
    status: Quotation["status"],
  ) => {
    try {
      const updated = (await customFetch(`/api/quotations/${q.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })) as Quotation;
      setQuoteList((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
      toast.success(`Marked as ${STATUS_META[status].label}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (q: Quotation) => {
    if (!confirm(`Delete ${q.quoteNumber}? This cannot be undone.`)) return;
    try {
      await customFetch(`/api/quotations/${q.id}`, { method: "DELETE" });
      setQuoteList((prev) => prev.filter((x) => x.id !== q.id));
      toast.success("Quotation deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleClearDrafts = async () => {
    const drafts = quoteList.filter((q) => q.status === "draft");
    if (drafts.length === 0) {
      toast.info("No drafts to clear");
      return;
    }
    if (
      !confirm(
        `Delete all ${drafts.length} draft quotation${drafts.length !== 1 ? "s" : ""}?`,
      )
    )
      return;
    setClearingDrafts(true);
    let deleted = 0;
    for (const q of drafts) {
      try {
        await customFetch(`/api/quotations/${q.id}`, { method: "DELETE" });
        deleted++;
      } catch {}
    }
    setQuoteList((prev) => prev.filter((q) => q.status !== "draft"));
    toast.success(`Cleared ${deleted} draft${deleted !== 1 ? "s" : ""}`);
    setClearingDrafts(false);
  };

  const handleConvertToSale = (q: Quotation) => {
    sessionStorage.setItem(
      "greenlink_pending_cart",
      JSON.stringify({
        items: q.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          qty: item.qty,
          unitPrice: item.unitPrice,
          unit: item.unit,
        })),
        customerName: q.customerName,
        discount: q.discountAmount,
        fromQuote: q.quoteNumber,
      }),
    );
    toast.success(`Loading ${q.quoteNumber} into POS…`);
    setLocation("/pos");
  };

  const handleInvoice = async (q: Quotation) => {
    if (invoiceBusyId) return;
    if (q.invoiceNumber) {
      await downloadPdf(q, shop, "invoice");
      return;
    }
    setInvoiceBusyId(q.id);
    try {
      if (q.status !== "accepted") {
        const accepted = (await customFetch(`/api/quotations/${q.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "accepted" }),
        })) as Quotation;
        setQuoteList((prev) =>
          prev.map((item) => (item.id === accepted.id ? accepted : item)),
        );
      }
      const issued = (await customFetch(`/api/quotations/${q.id}/invoice`, {
        method: "POST",
      })) as Quotation;
      setQuoteList((prev) =>
        prev.map((item) => (item.id === issued.id ? issued : item)),
      );
      toast.success(`${issued.invoiceNumber} issued`);
      await downloadPdf(issued, shop, "invoice");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not issue invoice");
    } finally {
      setInvoiceBusyId(null);
    }
  };

  if (view === "print" && printTarget) {
    return (
      <PrintView
        quotation={printTarget}
        shop={shop}
        onClose={() => {
          setView("list");
          setPrintTarget(null);
        }}
      />
    );
  }

  if (view === "builder") {
    return (
      <div className="flex flex-col h-full bg-background">
        <QuotationBuilder
          shopId={shopId}
          editQuotation={editTarget}
          onSave={handleSave}
          onCancel={() => {
            setView("list");
            setEditTarget(null);
          }}
        />
      </div>
    );
  }

  const TABS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All quotes" },
    { id: "draft", label: "Draft" },
    { id: "sent", label: "Sent" },
    { id: "accepted", label: "Accepted" },
    { id: "invoiced", label: "Invoiced" },
    { id: "rejected", label: "Rejected" },
    { id: "expired", label: "Expired" },
  ];

  const draftCount = counts["draft"] ?? 0;
  const totalValue = filtered.reduce((s, q) => s + q.total, 0);
  const acceptedValue = quoteList
    .filter((q) => q.status === "accepted")
    .reduce((s, q) => s + q.total, 0);
  const openQuotes = quoteList.filter((q) => q.status === "draft" || q.status === "sent");
  const openCount = openQuotes.length;
  const openValue = openQuotes.reduce((s, q) => s + q.total, 0);
  const invoicedQuotes = quoteList.filter((q) => Boolean(q.invoiceNumber));
  const invoicedCount = invoicedQuotes.length;
  const invoicedValue = invoicedQuotes.reduce((s, q) => s + q.total, 0);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky Executive Header */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur-md shrink-0">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-lg sm:text-xl font-bold leading-tight tracking-tight text-foreground truncate">
                  Quotations &amp; Proforma
                </h1>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {shopName} · {quoteList.length} quote{quoteList.length !== 1 ? "s" : ""} on file
                  {filtered.length !== quoteList.length && ` · ${filtered.length} matching`}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {draftCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearDrafts}
                  disabled={clearingDrafts}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 text-xs font-semibold text-rose-700 dark:text-rose-400 transition-colors hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {clearingDrafts ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Clear {draftCount} draft{draftCount !== 1 ? "s" : ""}</span>
                  <span className="sm:hidden">Clear drafts</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditTarget(null);
                  setView("builder");
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> New Quote
              </button>
            </div>
          </div>

          {/* Search + Sort Row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Search quotations</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, phone, quote # or invoice #…"
                className="h-9 w-full rounded-xl border border-border/70 bg-muted/40 pl-9 pr-9 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/75"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>

            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as QuoteSortMode)}
                aria-label="Sort quotations"
                className="h-9 rounded-xl border border-border/70 bg-muted/40 px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35 w-full sm:w-auto"
              >
                <option value="newest">Sort: Newest First</option>
                <option value="value">Sort: Highest Value</option>
                <option value="customer">Sort: Customer (A–Z)</option>
                <option value="validUntil">Sort: Expiring Soonest</option>
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar"
            role="group"
            aria-label="Filter quotations by status"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={filter === tab.id}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                  filter === tab.id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.2 rounded-full",
                    filter === tab.id
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background/70 text-muted-foreground",
                  )}
                >
                  {counts[tab.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 pb-20 md:pb-8 space-y-4">
          {/* Interactive 4-Card KPI Strip */}
          {!loading && quoteList.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 sm:p-4 transition-colors",
                  filter === "all"
                    ? "bg-card border-primary/50 ring-1 ring-primary/25"
                    : "bg-card/80 border-border/80 hover:border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/12 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                    {filtered.length} shown
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-2.5">
                  Pipeline in View
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-foreground leading-snug break-words mt-0.5">
                  {KES(totalValue)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "accepted" ? "all" : "accepted")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 sm:p-4 transition-colors",
                  filter === "accepted"
                    ? "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/25"
                    : "bg-card/80 border-border/80 hover:border-emerald-500/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/12 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {counts["accepted"] ?? 0} won
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-2.5">
                  Accepted Value
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 leading-snug break-words mt-0.5">
                  {KES(acceptedValue)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "sent" ? "all" : "sent")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 sm:p-4 transition-colors",
                  filter === "sent"
                    ? "bg-sky-500/10 border-sky-500/50 ring-1 ring-sky-500/25"
                    : "bg-card/80 border-border/80 hover:border-sky-500/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/12 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/12 text-sky-700 dark:text-sky-400 tabular-nums">
                    {openCount} open
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-2.5">
                  Awaiting Follow-Up
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-foreground leading-snug break-words mt-0.5">
                  {KES(openValue)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "invoiced" ? "all" : "invoiced")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 sm:p-4 transition-colors",
                  filter === "invoiced"
                    ? "bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/25"
                    : "bg-card/80 border-border/80 hover:border-amber-500/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/12 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-400 tabular-nums">
                    {invoicedCount} issued
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-2.5">
                  Invoiced Total
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-foreground leading-snug break-words mt-0.5">
                  {KES(invoicedValue)}
                </p>
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-muted/40 border border-border/50 animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {search || filter !== "all"
                  ? "No matching quotations"
                  : "No quotations yet"}
              </p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                {search || filter !== "all"
                  ? "Try another customer name, phone number, quote number, or status filter."
                  : "Create your first professional quotation to send on WhatsApp, download as PDF, or convert to a POS sale."}
              </p>
              {search || filter !== "all" ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  Clear search &amp; filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditTarget(null);
                    setView("builder");
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Create first quote
                </button>
              )}
            </div>
          ) : (
            <section aria-label="Quotation list" className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {filter === "all"
                    ? "Recent quotations"
                    : filter === "invoiced"
                      ? "Invoiced quotations"
                      : `${STATUS_META[filter].label} quotations`}
                  <span className="ml-2 font-mono font-semibold text-foreground tabular-nums">
                    {filtered.length}
                  </span>
                </p>
                {search && (
                  <p className="max-w-[55%] truncate text-xs text-muted-foreground">
                    Matching &ldquo;{search}&rdquo;
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                {visibleQuotes.map((q) => (
                  <QuotationCard
                    key={q.id}
                    q={q}
                    shop={shop}
                    onEdit={() => {
                      setEditTarget(q);
                      setView("builder");
                    }}
                    onPrint={() => {
                      setPrintTarget(q);
                      setView("print");
                    }}
                    onStatusChange={(s) => handleStatusChange(q, s)}
                    onDelete={() => handleDelete(q)}
                    onDownloadPdf={() => downloadPdf(q, shop)}
                    onConvertToSale={() => handleConvertToSale(q)}
                    onInvoice={() => {
                      void handleInvoice(q);
                    }}
                    invoiceBusy={invoiceBusyId === q.id}
                  />
                ))}
              </div>

              {/* Pagination Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-border/70 bg-card/60 px-4 py-3 text-xs">
                <span className="text-muted-foreground tabular-nums">
                  Showing{" "}
                  <span className="font-semibold text-foreground">1–{visibleQuotes.length}</span> of{" "}
                  <span className="font-semibold text-foreground">{filtered.length}</span> quotation
                  {filtered.length === 1 ? "" : "s"}
                </span>
                {filtered.length > visibleCount && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + QUOTES_PAGE_STEP)}
                      className="inline-flex h-8 items-center rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                      Show {Math.min(QUOTES_PAGE_STEP, filtered.length - visibleCount)} more
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleCount(filtered.length)}
                      className="inline-flex h-8 items-center rounded-xl px-3 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      Show all ({filtered.length})
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
