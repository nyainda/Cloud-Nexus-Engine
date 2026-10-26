import type { jsPDF } from "jspdf";

export type PdfStampTone = "green" | "blue" | "red" | "amber";

export interface PdfStampOptions {
  shopName: string;
  status: string;
  reference: string;
  tone?: PdfStampTone;
}

/**
 * Draws a compact, non-rotated digital status stamp on the current PDF page.
 * This is a visual document-status mark, not a cryptographic or legal signature.
 */
export function drawPdfDocumentStamp(doc: jsPDF, options: PdfStampOptions): void {
  const colors: Record<PdfStampTone, [number, number, number]> = {
    green: [22, 101, 52],
    blue: [29, 78, 216],
    red: [185, 28, 28],
    amber: [180, 83, 9],
  };
  const tone = options.tone ?? "blue";
  const color = colors[tone];
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = 58;
  const height = 17;
  const x = pageWidth - 12 - width;
  const y = pageHeight - 34;

  doc.setDrawColor(...color);
  doc.setLineWidth(0.65);
  doc.roundedRect(x, y, width, height, 2, 2, "S");
  doc.setDrawColor(...color);
  doc.setLineWidth(0.2);
  doc.roundedRect(x + 1.3, y + 1.3, width - 2.6, height - 2.6, 1.4, 1.4, "S");

  doc.setTextColor(...color);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const status = options.status.trim().toUpperCase().slice(0, 30);
  doc.text(status, x + width / 2, y + 7.2, { align: "center", maxWidth: width - 5 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  const shopName = options.shopName.trim().toUpperCase().slice(0, 48);
  doc.text(shopName || "SHOP", x + width / 2, y + 11.2, { align: "center", maxWidth: width - 5 });
  doc.text(options.reference.trim().slice(0, 32), x + width / 2, y + 14.4, {
    align: "center",
    maxWidth: width - 5,
  });
}
