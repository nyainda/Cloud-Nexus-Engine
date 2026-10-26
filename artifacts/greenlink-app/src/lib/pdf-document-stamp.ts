import type { jsPDF } from "jspdf";

export type PdfStampTone = "green" | "blue" | "red" | "amber";

export interface PdfStampOptions {
  shopName: string;
  status: string;
  reference: string;
  tone?: PdfStampTone;
  logoDataUrl?: string;
}

/**
 * Draw a branded circular seal with the shop's real logo.
 * Visual status only; this is not a cryptographic or legally certified signature.
 */
export function drawPdfDocumentStamp(doc: jsPDF, options: PdfStampOptions): void {
  const palette: Record<PdfStampTone, [number, number, number]> = {
    green: [22, 101, 52],
    blue: [29, 78, 216],
    red: [185, 28, 28],
    amber: [180, 83, 9],
  };
  const ink = palette[options.tone ?? "blue"];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Compact 39 mm seal positioned above the footer so it remains printable.
  const diameter = 39;
  const x = pageWidth - 12 - diameter;
  const y = pageHeight - 14 - diameter - 2;
  const cx = x + diameter / 2;
  const cy = y + diameter / 2;

  doc.setLineWidth(0.65);
  doc.setDrawColor(...ink);
  doc.circle(cx, cy, diameter / 2, "S");
  doc.setLineWidth(0.22);
  doc.circle(cx, cy, diameter / 2 - 1.4, "S");
  doc.setLineWidth(0.15);
  doc.circle(cx, cy, diameter / 2 - 2.6, "S");

  // Place the actual shop logo, preserving its aspect ratio.
  if (options.logoDataUrl) {
    try {
      const logoW = 15;
      const logoH = 7;
      doc.addImage(options.logoDataUrl, "JPEG", cx - logoW / 2, y + 4.2, logoW, logoH, undefined, "FAST");
    } catch {
      // The stamp remains legible if the optional logo cannot be embedded.
    }
  }

  // Status ribbon across the middle gives the seal the strong visual hierarchy
  // of a physical ink stamp while retaining clear contrast in the PDF.
  const ribbonY = y + 13;
  doc.setFillColor(...ink);
  doc.rect(x + 3.1, ribbonY, diameter - 6.2, 6.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.status.length > 15 ? 6.5 : 8);
  doc.text(options.status.trim().toUpperCase().slice(0, 28), cx, ribbonY + 4.1, {
    align: "center",
    maxWidth: diameter - 8,
  });

  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.2);
  const shopName = options.shopName.trim().toUpperCase();
  const shopLines = doc.splitTextToSize(shopName || "SHOP", diameter - 7).slice(0, 2);
  doc.text(shopLines, cx, y + 23, { align: "center", lineHeightFactor: 1.05 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.8);
  doc.text(options.reference.trim().slice(0, 34), cx, y + 30.2, {
    align: "center",
    maxWidth: diameter - 7,
  });
  doc.setLineWidth(0.35);
  doc.line(x + 8, y + 31.6, x + diameter - 8, y + 31.6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.6);
  doc.text("OFFICIAL DIGITAL STAMP", cx, y + 34.1, { align: "center" });
}
