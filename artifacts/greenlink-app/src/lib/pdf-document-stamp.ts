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

function drawArcText(
  doc: jsPDF,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
  color: RGB,
  fontSize: number,
  bold = true,
): void {
  const chars = [...text.toUpperCase()];
  if (!chars.length) return;

  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...color);

  // Use jsPDF's own font metrics so longer shop names still fit their arc.
  const widths = chars.map((char) => doc.getTextWidth(char || " "));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const arcLength = (Math.abs(endDeg - startDeg) * Math.PI / 180) * radius;
  const scale = totalWidth > arcLength ? arcLength / totalWidth : 1;
  const scaledWidths = widths.map((width) => width * scale);
  const totalScaledWidth = scaledWidths.reduce((sum, width) => sum + width, 0);
  const totalAngle = (totalScaledWidth / radius) * (180 / Math.PI);
  const direction = endDeg >= startDeg ? 1 : -1;
  let angle = (startDeg + endDeg) / 2 - direction * totalAngle / 2;

  chars.forEach((char, index) => {
    const advance = scaledWidths[index] / radius * (180 / Math.PI);
    const charAngle = angle + direction * advance / 2;
    const rad = charAngle * Math.PI / 180;
    const x = cx + Math.cos(rad) * radius;
    const y = cy + Math.sin(rad) * radius;
    const tangent = charAngle + (direction > 0 ? 90 : -90);
    doc.text(char, x, y, { align: "center", angle: tangent });
    angle += direction * advance;
  });
}

/**
 * A clean circular business seal inspired by traditional ink stamps.
 * No rectangular logo card: the original shop logo sits directly on the white
 * centre, contained by the inner ring. This is a visual status mark, not a
 * cryptographic or legally certified signature.
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

  const diameter = 56;
  const x = pageWidth - 12 - diameter;
  const y = pageHeight - 16 - diameter;
  const cx = x + diameter / 2;
  const cy = y + diameter / 2;
  const r = diameter / 2;

  // Solid white seal interior prevents page text showing through the stamp.
  doc.setFillColor(...white);
  doc.circle(cx, cy, r - 0.15, "F");

  // Outer double-weight rings and the finer inner rings.
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.9);
  doc.circle(cx, cy, r, "S");
  doc.setLineWidth(0.25);
  doc.circle(cx, cy, r - 1.1, "S");
  doc.setLineWidth(0.65);
  doc.circle(cx, cy, r - 2.0, "S");
  doc.setLineWidth(0.22);
  doc.circle(cx, cy, r - 4.0, "S");

  // Fine ticks around the inside perimeter.
  for (let i = 0; i < 48; i++) {
    const a = (i * 360 / 48 - 90) * Math.PI / 180;
    const major = i % 4 === 0;
    const r1 = r - (major ? 5.0 : 4.5);
    const r2 = r - 3.7;
    doc.setLineWidth(major ? 0.28 : 0.14);
    doc.line(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
  }

  // Registered shop name follows the upper circular path; no logo card.
  const shopName = options.shopName.trim() || "BUSINESS";
  drawArcText(doc, shopName, cx, cy, r - 3.0, -164, -16, ink, 5.0, true);

  // Original logo is placed directly on the white interior. Keep a generous
  // safety margin inside the inner circle and preserve the image's proportions.
  if (options.logoDataUrl) {
    try {
      const maxLogoW = 25;
      const maxLogoH = 12;
      const aspect = options.logoAspectRatio && options.logoAspectRatio > 0 ? options.logoAspectRatio : 2.2;
      let logoW = Math.min(maxLogoW, maxLogoH * aspect);
      let logoH = logoW / aspect;
      if (logoH > maxLogoH) {
        logoH = maxLogoH;
        logoW = logoH * aspect;
      }
      const logoY = y + 12.0;
      doc.addImage(options.logoDataUrl, "JPEG", cx - logoW / 2, logoY, logoW, logoH, undefined, "FAST");
    } catch {
      // The text and seal remain usable if an optional logo cannot be embedded.
    }
  }

  // Solid status band, inset so its ends stay inside the inner circle.
  const bandY = y + 27.0;
  const bandH = 7.0;
  const bandW = 43.0;
  doc.setFillColor(...ink);
  doc.rect(cx - bandW / 2, bandY, bandW, bandH, "F");
  doc.setTextColor(...white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.status.length > 15 ? 7 : options.status.length > 10 ? 8 : 9);
  doc.text(options.status.trim().toUpperCase().slice(0, 26), cx, bandY + 4.7, {
    align: "center",
    maxWidth: bandW - 3,
  });

  // Document type, date and reference in a clean centred stack.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.2);
  doc.text((options.documentType || "BUSINESS DOCUMENT").trim().toUpperCase().slice(0, 24), cx, y + 37.0, {
    align: "center",
    maxWidth: 39,
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.8);
  if (options.dateLabel) {
    doc.text(options.dateLabel.trim().slice(0, 24), cx, y + 40.0, { align: "center", maxWidth: 39 });
  }
  doc.text(options.reference.trim().slice(0, 30), cx, y + 42.8, { align: "center", maxWidth: 39 });

  // Lower curved motto matches the approved circular reference.
  drawArcText(doc, "OFFICIAL BUSINESS RECORD", cx, cy, r - 3.2, 155, 25, ink, 4.4, true);

  // Side stars balance the composition.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("★", x + 7.1, cy + 3.0, { align: "center" });
  doc.text("★", x + diameter - 7.1, cy + 3.0, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
}
