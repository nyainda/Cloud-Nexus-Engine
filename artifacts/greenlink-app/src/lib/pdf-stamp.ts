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

interface StampPalette {
  ink: StampColor;
  wash: StampColor;
}

function getStampPalette(status: string): StampPalette {
  const normalized = status.toLowerCase();
  if (normalized.includes("partial")) {
    return { ink: [155, 91, 16], wash: [255, 248, 235] };
  }
  if (
    normalized.includes("outstanding") ||
    normalized.includes("unpaid") ||
    normalized.includes("rejected") ||
    normalized.includes("expired")
  ) {
    return { ink: [174, 49, 57], wash: [255, 243, 243] };
  }
  if (
    normalized.includes("draft") ||
    normalized.includes("sent") ||
    normalized.includes("issued")
  ) {
    return { ink: [42, 84, 147], wash: [242, 247, 255] };
  }
  return { ink: [23, 111, 69], wash: [240, 249, 243] };
}

function getStampStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("credit")) return "PAID + CREDIT";
  if (normalized.includes("partial")) return "PARTIAL";
  if (normalized.includes("paid")) return "PAID";
  return status.toUpperCase();
}

/** Draw a print-sharp, branded status seal in a reserved page area. */
export function drawPdfStamp(doc: jsPDF, options: PdfStampOptions): void {
  const { x, y, size, shopName, status, dateLabel } = options;
  const scale = size / 42;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const { ink, wash } = getStampPalette(status);
  const statusLabel = getStampStatusLabel(status);
  const shopLabel = shopName.trim().length > 24
    ? `${shopName.trim().slice(0, 23)}…`
    : shopName.trim();

  // A quiet tinted face, double rule, and clear status band stay readable when printed.
  doc.setFillColor(...wash);
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.75 * scale);
  doc.circle(centerX, centerY, size / 2 - 0.65 * scale, "FD");
  doc.setLineWidth(0.28 * scale);
  doc.circle(centerX, centerY, size / 2 - 2.4 * scale, "S");

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ink);
  doc.setFontSize(5.5 * scale);
  doc.text("DOCUMENT STATUS", centerX, y + 6.2 * scale, {
    align: "center",
    maxWidth: size - 9 * scale,
  });
  doc.setFontSize(6 * scale);
  doc.text(shopLabel || "GreenLink", centerX, y + 10.5 * scale, {
    align: "center",
    maxWidth: size - 9 * scale,
  });

  // A compact sunrise-and-furrows mark reflects the existing farm-supply brands.
  const gold: StampColor = [190, 132, 31];
  const sunY = y + 14.7 * scale;
  doc.setDrawColor(...gold);
  doc.setFillColor(...gold);
  doc.setLineWidth(0.35 * scale);
  doc.circle(centerX, sunY, 1.25 * scale, "F");
  doc.line(centerX - 3 * scale, sunY + 1.6 * scale, centerX + 3 * scale, sunY + 1.6 * scale);
  doc.line(centerX - 4 * scale, sunY + 2.6 * scale, centerX + 4 * scale, sunY + 2.6 * scale);
  doc.line(centerX - 2.1 * scale, sunY - 2.1 * scale, centerX - 1.5 * scale, sunY - 1.5 * scale);
  doc.line(centerX + 2.1 * scale, sunY - 2.1 * scale, centerX + 1.5 * scale, sunY - 1.5 * scale);

  const badgeY = y + 20.2 * scale;
  const badgeWidth = size - 8 * scale;
  const badgeHeight = 8.2 * scale;
  doc.setFillColor(...ink);
  doc.setDrawColor(...ink);
  doc.roundedRect(
    centerX - badgeWidth / 2,
    badgeY,
    badgeWidth,
    badgeHeight,
    2.3 * scale,
    2.3 * scale,
    "F",
  );
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize((statusLabel.length > 10 ? 7.1 : 8.5) * scale);
  doc.text(statusLabel, centerX, badgeY + 5.6 * scale, {
    align: "center",
    maxWidth: badgeWidth - 3 * scale,
  });

  doc.setTextColor(...ink);
  doc.setFontSize(5.4 * scale);
  doc.text(dateLabel.toUpperCase(), centerX, y + 31.8 * scale, {
    align: "center",
    maxWidth: size - 9 * scale,
  });
  doc.setFontSize(4.8 * scale);
  doc.text("DIGITAL COPY", centerX, y + size - 3.5 * scale, {
    align: "center",
    maxWidth: size - 9 * scale,
  });
}
