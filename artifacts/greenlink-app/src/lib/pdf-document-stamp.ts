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

/**
 * Draws a detailed branded seal using the existing shop logo.
 * It is a visual status indicator, not a cryptographic or legally certified signature.
 */
export function drawPdfDocumentStamp(doc: jsPDF, options: PdfStampOptions): void {
  const palette: Record<PdfStampTone, [number, number, number]> = {
    green: [18, 104, 67],
    blue: [30, 83, 170],
    red: [185, 35, 45],
    amber: [171, 93, 20],
  };
  const ink = palette[options.tone ?? "blue"];
  const paper: [number, number, number] = [255, 255, 255];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // A larger, detailed 44 mm seal; leave a print-safe margin at the page edge.
  const diameter = 44;
  const x = pageWidth - 12 - diameter;
  const y = pageHeight - 15 - diameter;
  const cx = x + diameter / 2;
  const cy = y + diameter / 2;
  const outerR = diameter / 2;

  // White knockout prevents underlying document text showing through the seal.
  doc.setFillColor(...paper);
  doc.circle(cx, cy, outerR - 0.1, "F");

  // Triple rings and fine inner keyline create the formal ink-seal look.
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.75);
  doc.circle(cx, cy, outerR, "S");
  doc.setLineWidth(0.25);
  doc.circle(cx, cy, outerR - 1.2, "S");
  doc.setLineWidth(0.45);
  doc.circle(cx, cy, outerR - 2.2, "S");
  doc.setLineWidth(0.18);
  doc.circle(cx, cy, outerR - 3.1, "S");

  // Fine radial markers around the ring add detail while keeping the text clean.
  doc.setLineWidth(0.22);
  for (let i = 0; i < 32; i++) {
    const angle = (Math.PI * 2 * i) / 32;
    const r1 = i % 4 === 0 ? outerR - 4.5 : outerR - 4.0;
    const r2 = outerR - 3.4;
    doc.line(
      cx + Math.cos(angle) * r1,
      cy + Math.sin(angle) * r1,
      cx + Math.cos(angle) * r2,
      cy + Math.sin(angle) * r2,
    );
  }

  // Real shop logo, preserving its aspect ratio within a white logo panel.
  if (options.logoDataUrl) {
    try {
      const logoW = 17;
      const logoH = 7.2;
      doc.addImage(options.logoDataUrl, "JPEG", cx - logoW / 2, y + 4.1, logoW, logoH, undefined, "FAST");
    } catch {
      // Keep the status seal usable if an optional logo cannot be embedded.
    }
  }

  // Shop identity, split to fit the seal instead of clipping long registered names.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.0);
  const shopLines = doc
    .splitTextToSize(options.shopName.trim().toUpperCase() || "SHOP", diameter - 10)
    .slice(0, 2);
  doc.text(shopLines, cx, y + 12.1, { align: "center", lineHeightFactor: 1.0 });

  // Status ribbon is the main focal point of the stamp.
  const ribbonY = y + 17;
  const ribbonH = 6.1;
  doc.setFillColor(...ink);
  doc.rect(x + 3.5, ribbonY, diameter - 7, ribbonH, "F");
  doc.setTextColor(...paper);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.status.length > 17 ? 6 : options.status.length > 12 ? 7 : 8);
  doc.text(options.status.trim().toUpperCase().slice(0, 30), cx, ribbonY + 4.05, {
    align: "center",
    maxWidth: diameter - 9,
  });

  // Document type and issue date make the seal more informative and traceable.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.7);
  const type = (options.documentType || "BUSINESS DOCUMENT").trim().toUpperCase().slice(0, 28);
  doc.text(type, cx, y + 26.1, { align: "center", maxWidth: diameter - 8 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.6);
  if (options.dateLabel) {
    doc.text(options.dateLabel.trim().slice(0, 24), cx, y + 29.1, {
      align: "center",
      maxWidth: diameter - 8,
    });
  }
  doc.text(options.reference.trim().slice(0, 34), cx, y + 32.0, {
    align: "center",
    maxWidth: diameter - 8,
  });

  // Decorative separators and a restrained footer label finish the seal.
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.25);
  doc.line(x + 9, y + 33.1, x + diameter - 9, y + 33.1);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.2);
  doc.text("DIGITAL DOCUMENT STAMP", cx, y + 35.8, { align: "center" });

  // Restore neutral text/drawing state for any subsequent PDF operations.
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
}
