import type { jsPDF } from "jspdf";

export type PdfStampTone = "green" | "blue" | "red" | "amber";

export interface PdfStampOptions {
  shopName: string;
  status: string;
  reference: string;
  tone?: PdfStampTone;
  logoDataUrl?: string;
  logoAspectRatio?: number;
  documentType?: string;
  dateLabel?: string;
}

type RGB = [number, number, number];

/**
 * Legible circular business seal. Uses the existing shop logo without a card.
 * This is a visual document-status mark, not a legal or cryptographic signature.
 */
export function drawPdfDocumentStamp(doc: jsPDF, options: PdfStampOptions): void {
  const palette: Record<PdfStampTone, RGB> = {
    green: [0, 112, 72],
    blue: [25, 79, 170],
    red: [220, 35, 42],
    amber: [180, 91, 17],
  };
  const ink = palette[options.tone ?? "blue"];
  const white: RGB = [255, 255, 255];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // A larger 62 mm seal gives every text line room to print clearly.
  const diameter = 62;
  const x = pageWidth - 12 - diameter;
  const y = pageHeight - 18 - diameter;
  const cx = x + diameter / 2;
  const cy = y + diameter / 2;
  const r = diameter / 2;

  // Solid white centre ensures document content underneath does not show through.
  doc.setFillColor(...white);
  doc.circle(cx, cy, r - 0.15, "F");

  // Strong outer rings and restrained inner rings.
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.95);
  doc.circle(cx, cy, r, "S");
  doc.setLineWidth(0.3);
  doc.circle(cx, cy, r - 1.2, "S");
  doc.setLineWidth(0.55);
  doc.circle(cx, cy, r - 2.4, "S");
  doc.setLineWidth(0.22);
  doc.circle(cx, cy, r - 4.1, "S");

  // Clean radial ticks with enough space around all text.
  for (let i = 0; i < 48; i++) {
    const a = (i * 360 / 48 - 90) * Math.PI / 180;
    const major = i % 4 === 0;
    const r1 = r - (major ? 5.3 : 4.7);
    const r2 = r - 4.0;
    doc.setLineWidth(major ? 0.28 : 0.14);
    doc.line(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
  }

  // Shop name is set horizontally in two clear lines rather than tiny curved letters.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.shopName.length > 35 ? 5.6 : 6.3);
  const shopLines = doc.splitTextToSize(options.shopName.trim().toUpperCase() || "BUSINESS", 48).slice(0, 2);
  doc.text(shopLines, cx, y + 8.3, { align: "center", lineHeightFactor: 1.0 });

  // Original shop logo directly on the seal's white centre. No rectangular card.
  if (options.logoDataUrl) {
    try {
      const maxLogoW = 25;
      const maxLogoH = 8;
      const aspect = options.logoAspectRatio && options.logoAspectRatio > 0 ? options.logoAspectRatio : 2.2;
      let logoW = Math.min(maxLogoW, maxLogoH * aspect);
      let logoH = logoW / aspect;
      if (logoH > maxLogoH) {
        logoH = maxLogoH;
        logoW = logoH * aspect;
      }
      doc.addImage(options.logoDataUrl, "JPEG", cx - logoW / 2, y + 15.0 + (maxLogoH - logoH) / 2, logoW, logoH, undefined, "FAST");
    } catch {
      // Retain the complete stamp if optional logo embedding fails.
    }
  }

  // High-contrast status band.
  const bandY = y + 25.2;
  const bandW = 46;
  const bandH = 8;
  doc.setFillColor(...ink);
  doc.rect(cx - bandW / 2, bandY, bandW, bandH, "F");
  doc.setTextColor(...white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.status.length > 16 ? 7.2 : options.status.length > 11 ? 8.4 : 10);
  doc.text(options.status.trim().toUpperCase().slice(0, 26), cx, bandY + 5.25, {
    align: "center",
    maxWidth: bandW - 3,
  });

  // Readable metadata stack. These labels are intentionally horizontal.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.text((options.documentType || "BUSINESS DOCUMENT").trim().toUpperCase().slice(0, 24), cx, y + 38.5, {
    align: "center",
    maxWidth: 48,
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.8);
  if (options.dateLabel) {
    doc.text(options.dateLabel.trim().slice(0, 24), cx, y + 42.8, { align: "center", maxWidth: 48 });
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.8);
  doc.text(options.reference.trim().slice(0, 30), cx, y + 47.0, { align: "center", maxWidth: 48 });

  // Clear footer label, not curved into tiny, hard-to-read text.
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.3);
  doc.line(x + 12, y + 49.2, x + diameter - 12, y + 49.2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.3);
  doc.text("OFFICIAL BUSINESS RECORD", cx, y + 53.0, { align: "center", maxWidth: 48 });

  // Side stars are drawn as vectors for reliable PDF output.
  const drawStar = (starCx: number, starCy: number, outer: number, inner: number) => {
    const points: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) {
      const a = (-90 + i * 36) * Math.PI / 180;
      const radius = i % 2 === 0 ? outer : inner;
      points.push([starCx + Math.cos(a) * radius, starCy + Math.sin(a) * radius]);
    }
    doc.setDrawColor(...ink);
    doc.setFillColor(...ink);
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      doc.line(x1, y1, x2, y2);
    }
  };
  drawStar(x + 5.5, cy + 4.0, 1.8, 0.8);
  drawStar(x + diameter - 5.5, cy + 4.0, 1.8, 0.8);

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
}
