import { format } from "date-fns";
import { toast } from "sonner";
import {
  drawPdfStamp,
  drawPdfWatermark,
  getPdfShopLogoAssets,
  loadPdfStampLogo,
} from "@/lib/pdf-stamp";
import {
  type Quotation,
  KES,
  amountInWords,
  getQuotationShopName,
} from "@/lib/quotation-utils";

export async function downloadPdf(
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
      doc.text(
        `REVISED INVOICE · REVISION ${pdfData.invoiceSnapshot?.revisionNumber}`,
        W - MR,
        25,
        { align: "right" },
      );
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
      subtitle: isInvoice ? "OFFICIAL SALES INVOICE" : "OFFICIAL QUOTATION SEAL",
      dateLabel: format(
        new Date(
          isInvoice
            ? (pdfData.invoiceIssuedAt ?? pdfData.createdAt)
            : pdfData.createdAt,
        ),
        "dd MMM yyyy",
      ),
      documentRef: documentNumber,
      metaLine: KES(pdfData.total),
      amountLabel: String(pdfData.total),
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

export function buildWhatsAppText(
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

export function shareWhatsApp(
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
