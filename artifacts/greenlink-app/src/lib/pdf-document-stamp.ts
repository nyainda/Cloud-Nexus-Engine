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

/**
 * Crop the blank margins around an existing shop logo before embedding it in a stamp.
 * This is why logos with large white margins looked tiny in the earlier PDF output.
 */
export async function prepareStampLogo(dataUrl?: string): Promise<{ dataUrl?: string; aspectRatio?: number }> {
  if (!dataUrl || typeof document === "undefined") return {};
  try {
    const image = new Image();
    image.src = dataUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to load shop logo"));
    });

    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) return { dataUrl, aspectRatio: image.naturalWidth / image.naturalHeight };
    sourceContext.drawImage(image, 0, 0);
    const pixels = sourceContext.getImageData(0, 0, source.width, source.height).data;

    let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const i = (y * source.width + x) * 4;
        const alpha = pixels[i + 3];
        // Treat near-white JPEG background as empty, but retain all coloured/dark logo artwork.
        const visible = alpha > 12 && (pixels[i] < 242 || pixels[i + 1] < 242 || pixels[i + 2] < 242);
        if (visible) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      return { dataUrl, aspectRatio: image.naturalWidth / image.naturalHeight };
    }

    const padX = Math.max(2, Math.round((maxX - minX + 1) * 0.035));
    const padY = Math.max(2, Math.round((maxY - minY + 1) * 0.06));
    minX = Math.max(0, minX - padX);
    minY = Math.max(0, minY - padY);
    maxX = Math.min(source.width - 1, maxX + padX);
    maxY = Math.min(source.height - 1, maxY + padY);

    const crop = document.createElement("canvas");
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    const cropContext = crop.getContext("2d");
    if (!cropContext) return { dataUrl, aspectRatio: image.naturalWidth / image.naturalHeight };
    cropContext.fillStyle = "#ffffff";
    cropContext.fillRect(0, 0, crop.width, crop.height);
    cropContext.drawImage(source, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return { dataUrl: crop.toDataURL("image/jpeg", 0.96), aspectRatio: crop.width / crop.height };
  } catch {
    return { dataUrl };
  }
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

  // A clear, substantial seal with safe margins from the page edge.
  const diameter = 50;
  const x = pageWidth - 12 - diameter;
  const y = pageHeight - 17 - diameter;
  const cx = x + diameter / 2;
  const cy = y + diameter / 2;
  const outerR = diameter / 2;

  // White knockout protects stamp legibility when positioned over document whitespace.
  doc.setFillColor(...white);
  doc.circle(cx, cy, outerR - 0.1, "F");

  // Bold outer ring, inner rings and fine radial engraving.
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.85);
  doc.circle(cx, cy, outerR, "S");
  doc.setLineWidth(0.32);
  doc.circle(cx, cy, outerR - 1.35, "S");
  doc.setLineWidth(0.48);
  doc.circle(cx, cy, outerR - 2.5, "S");
  doc.setLineWidth(0.2);
  doc.circle(cx, cy, outerR - 3.6, "S");

  for (let i = 0; i < 44; i++) {
    const angle = (Math.PI * 2 * i) / 44;
    const major = i % 4 === 0;
    const r1 = outerR - (major ? 5.0 : 4.5);
    const r2 = outerR - 3.9;
    doc.setLineWidth(major ? 0.3 : 0.16);
    doc.line(
      cx + Math.cos(angle) * r1,
      cy + Math.sin(angle) * r1,
      cx + Math.cos(angle) * r2,
      cy + Math.sin(angle) * r2,
    );
  }

  // The key fix: crop whitespace first, then use a larger logo window without stretching.
  const panelX = x + 6.4;
  const panelY = y + 4.0;
  const panelW = diameter - 12.8;
  const panelH = 11.2;
  doc.setFillColor(...white);
  doc.roundedRect(panelX, panelY, panelW, panelH, 1.8, 1.8, "F");
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.22);
  doc.roundedRect(panelX, panelY, panelW, panelH, 1.8, 1.8, "S");

  if (options.logoDataUrl) {
    try {
      const maxLogoW = panelW - 1.6;
      const maxLogoH = panelH - 1.0;
      const aspect = options.logoAspectRatio && options.logoAspectRatio > 0 ? options.logoAspectRatio : 2.5;
      let logoW = Math.min(maxLogoW, maxLogoH * aspect);
      let logoH = logoW / aspect;
      if (logoH > maxLogoH) {
        logoH = maxLogoH;
        logoW = logoH * aspect;
      }
      doc.addImage(options.logoDataUrl, "JPEG", cx - logoW / 2, panelY + (panelH - logoH) / 2, logoW, logoH, undefined, "FAST");
    } catch {
      // The rest of the seal remains useful if the optional image cannot be embedded.
    }
  }

  // Readable shop identity below the logo panel.
  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.6);
  const shopLines = doc
    .splitTextToSize(options.shopName.trim().toUpperCase() || "SHOP", diameter - 8)
    .slice(0, 2);
  doc.text(shopLines, cx, y + 17.1, { align: "center", lineHeightFactor: 1.0 });

  // High-contrast status band: short wording stays bold and easy to read.
  const ribbonY = y + 21.0;
  const ribbonH = 7.0;
  doc.setFillColor(...ink);
  doc.roundedRect(x + 3.5, ribbonY, diameter - 7, ribbonH, 1.2, 1.2, "F");
  doc.setTextColor(...white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(options.status.length > 18 ? 6.1 : options.status.length > 12 ? 7.1 : 8.5);
  doc.text(options.status.trim().toUpperCase().slice(0, 30), cx, ribbonY + 4.7, {
    align: "center",
    maxWidth: diameter - 9,
  });

  doc.setTextColor(...ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.1);
  const documentType = (options.documentType || "BUSINESS DOCUMENT").trim().toUpperCase().slice(0, 28);
  doc.text(documentType, cx, y + 31.1, { align: "center", maxWidth: diameter - 8 });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.9);
  if (options.dateLabel) {
    doc.text(options.dateLabel.trim().slice(0, 24), cx, y + 34.2, {
      align: "center",
      maxWidth: diameter - 8,
    });
  }
  doc.text(options.reference.trim().slice(0, 34), cx, y + 36.8, {
    align: "center",
    maxWidth: diameter - 8,
  });

  doc.setDrawColor(...ink);
  doc.setLineWidth(0.25);
  doc.line(x + 9, y + 37.8, x + diameter - 9, y + 37.8);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(4.4);
  doc.text("OFFICIAL BUSINESS RECORD", cx, y + 40.5, { align: "center" });

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
}
