import type { jsPDF } from "jspdf";

export type PdfStampTone = "green" | "blue" | "red" | "amber";

export interface PdfStampOptions {
  shopName: string;
  status: string;
  reference: string;
  tone?: PdfStampTone;
  logoDataUrl?: string;
  documentType?: string;
  dateLabel?: string;
}

/** Draws a detailed branded business seal. Visual status only, not a legal/cryptographic signature. */
export function drawPdfDocumentStamp(doc: jsPDF, options: PdfStampOptions): void {
  const palette: Record<PdfStampTone, [number, number, number]> = {
    green: [18, 104, 67],
    blue: [30, 83, 170],
    red: [185, 35, 45],
    amber: [171, 93, 20],
  };
  const ink = palette[options.tone ?? "blue"];
  const white: [number, number, number] = [255, 255, 255];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 46 mm detailed seal, anchored inside the print-safe lower-right margin.
  const diameter = 46;
  const x = pageWidth - 12 - diameter;
  const y = pageHeight - 15 - diameter;
  const cx = x + diameter / 2;
  const cy = y + diameter / 2;
  const outerR = diameter / 2;

  // White knockout keeps text and table lines behind the stamp from showing through.
  doc.setFillColor(...white);
  doc.circle(cx, cy, outerR - 0.1, "F");

  // Triple-ring engraving with small radial ticks.
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.8);
  doc.circle(cx, cy, outerR, "S");
  doc.setLineWidth(0.25);
  doc.circle(cx, cy, outerR - 1.2, "S");
  doc.setLineWidth(0.45);
  doc.circle(cx, cy, outerR - 2.2, "S");
  doc.setLineWidth(0.18);
  doc.circle(cx, cy, outerR - 3.2, "S");

  for (let i = 0; i < 40; i++) {
    const angle = (Math.PI * 2 * i) / 40;
    const major = i % 5 === 0;
    const r1 = outerR - (major ? 4.8 : 4.2);
    const r2 = outerR - 3.5;
    doc.setLineWidth(major ? 0.3 : 0.16);
    doc.line(
      cx + Math.cos(angle) * r1,
      cy + Math.sin(angle) * r1,
      cx + Math.cos(angle) * r2,
      cy + Math.sin(angle) * r2,
    );
  }

  // Large, clear logo panel: white capsule makes the actual supplied shop logo readable.
  const logoPanelX = x + 7.5;
  const logoPanelY = y + 3.8;
  const logoPanelW = diameter - 15;
  const logoPanelH = 9.4;
  doc.setFillColor(...white);
  doc.roundedRect(logoPanelX, logoPanelY, logoPanelW, logoPanelH, 1.8, 1.8, "F");
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.2);
  doc.roundedRect(logoPanelX, logoPanelY, logoPanelW, logoPanelH, 1.8, 1.8, "S");

  if (options.logoDataUrl) {
    try {
      // Keep aspect ratio, use the largest dimensions that fit the white logo panel.
      const logoW = 27;
      const logoH = 8.1;
      doc.addImage(options.logoDataUrl, "JPEG", cx - logoW / 2, logoPanelY + 0.55, logoW, logoH, undefined, "FAST");
    } catch {
      // Retain all text and borders if image embedding fails.
    }
  }

  // Shop identity directly beneath the logo; fit long registered names on two lines.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.8);
  const shopLines = doc
    .splitTextToSize(options.shopName.trim().toUpperCase() || "SHOP", diameter - 9)
    .slice(0, 2);
  doc.text(shopLines, cx, y + 15.1, { align: "center", lineHeightFactor: 1.0 });

  // High-contrast status band is the strongest element in the seal.
  const ribbonY = y + 19.2;
  const ribbonH = 6.5;
  doc.setFillColor(...ink);
  doc.roundedRect(x + 3.7, ribbonY, diameter - 7.4, ribbonH, 1.1, 1.1, "F");
  doc.setTextColor(...white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.status.length > 17 ? 5.8 : options.status.length > 12 ? 6.8 : 8);
  doc.text(options.status.trim().toUpperCase().slice(0, 30), cx, ribbonY + 4.35, {
    align: "center",
    maxWidth: diameter - 9.5,
  });

  // Replace generic "DIGITAL DOCUMENT STAMP" with a useful, professional phrase.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.8);
  const documentType = (options.documentType || "BUSINESS DOCUMENT").trim().toUpperCase().slice(0, 28);
  doc.text(documentType, cx, y + 29.0, { align: "center", maxWidth: diameter - 8 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.6);
  if (options.dateLabel) {
    doc.text(options.dateLabel.trim().slice(0, 24), cx, y + 32.0, {
      align: "center",
      maxWidth: diameter - 8,
    });
  }
  doc.text(options.reference.trim().slice(0, 34), cx, y + 34.7, {
    align: "center",
    maxWidth: diameter - 8,
  });

  // A short, meaningful closing line; avoid the generic technical phrase.
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.25);
  doc.line(x + 9, y + 35.7, x + diameter - 9, y + 35.7);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.1);
  doc.text("ISSUED BY SHOP MANAGEMENT", cx, y + 38.5, { align: "center" });

  // Restore neutral state for downstream drawing.
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
}
