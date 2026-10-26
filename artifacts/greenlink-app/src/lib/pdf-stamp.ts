import type { jsPDF } from "jspdf";

type StampColor = [number, number, number];

export interface PdfStampOptions {
  x: number;
  y: number;
  size: number;
  shopName: string;
  status: string;
  dateLabel: string;
}

function getStatusColor(status: string): StampColor {
  const normalized = status.toLowerCase();
  if (normalized.includes("partial")) return [180, 103, 21];
  if (normalized.includes("outstanding") || normalized.includes("unpaid") ||
      normalized.includes("rejected") || normalized.includes("expired")) {
    return [181, 43, 54];
  }
  if (normalized.includes("draft") || normalized.includes("sent") || normalized.includes("issued")) {
    return [39, 87, 160];
  }
  return [25, 112, 68];
}

/** Draw a compact, print-sharp status seal using native PDF vector shapes. */
export function drawPdfStamp(doc: jsPDF, options: PdfStampOptions): void {
  const { x, y, size, shopName, status, dateLabel } = options;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const color = getStatusColor(status);
  const shopLabel = shopName.trim().length > 24
    ? `${shopName.trim().slice(0, 23)}…`
    : shopName.trim();
  const statusSize = status.length > 16 ? 4.2 : status.length > 12 ? 4.8 : status.length > 8 ? 5.6 : 6.6;

  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setTextColor(...color);
  doc.setLineWidth(0.65);
  doc.circle(centerX, centerY, size / 2 - 0.6, "S");
  doc.setLineWidth(0.25);
  doc.circle(centerX, centerY, size / 2 - 1.8, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(3.7);
  doc.text("DOCUMENT STATUS SEAL", centerX, y + 4.8, { align: "center", maxWidth: size - 6 });
  doc.setFontSize(3.8);
  doc.text(shopLabel || "GreenLink", centerX, y + 8.1, { align: "center", maxWidth: size - 6 });

  // A small sprout mark keeps the seal agricultural and recognizable at print size.
  doc.setLineWidth(0.45);
  doc.line(centerX, y + 9.7, centerX, y + 12.6);
  doc.ellipse(centerX - 1.25, y + 10.4, 1.1, 0.55, "FD");
  doc.ellipse(centerX + 1.25, y + 10.4, 1.1, 0.55, "FD");

  doc.setFontSize(statusSize);
  doc.text(status.toUpperCase(), centerX, y + 17.2, { align: "center", maxWidth: size - 6 });
  doc.setFontSize(3.8);
  doc.text(dateLabel.toUpperCase(), centerX, y + 20.9, { align: "center", maxWidth: size - 6 });
  doc.setFontSize(3.4);
  doc.text("FARM SUPPLIES  ·  DIGITAL COPY", centerX, y + size - 3.2, {
    align: "center",
    maxWidth: size - 6,
  });
}
