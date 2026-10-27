import type { jsPDF } from "jspdf";

type StampColor = [number, number, number];

export interface PdfStampOptions {
  x: number;
  y: number;
  size: number;
  shopName: string;
  logoData: string;
  status: string;
  dateLabel: string;
  documentRef?: string;
}

interface StampPalette {
  ink: StampColor;
  wash: StampColor;
}

interface PdfShopLogoAssets {
  header: string;
  printHeader: string;
  seal: string;
  sealName: string;
}

const PDF_SHOP_LOGOS: Record<string, PdfShopLogoAssets> = {
  "shop-greenlink": {
    header: "/logo-greenlink.jpg",
    printHeader: "/logo-greenlink-pdf.jpg",
    seal: "/logo-greenlink-stamp.png",
    sealName: "GreenLink Farm Supplies & Services Ltd",
  },
  "shop-sunrise": {
    header: "/logo-sunrise.jpg",
    printHeader: "/logo-sunrise-pdf.jpg",
    seal: "/logo-sunrise-stamp.png",
    sealName: "Kabatha Sunrise Farm Supplies & Services Ltd",
  },
};

export function getPdfShopLogoAssets(shopId: string | undefined): PdfShopLogoAssets {
  const assets = shopId ? PDF_SHOP_LOGOS[shopId] : undefined;
  if (!assets) {
    throw new Error(`No official PDF logo is configured for shop "${shopId ?? "unknown"}".`);
  }
  return assets;
}

export async function loadPdfStampLogo(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load the official shop seal logo (${response.status}).`);
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The official shop seal logo could not be read."));
    };
    reader.onerror = () => reject(new Error("The official shop seal logo could not be read."));
    reader.readAsDataURL(blob);
  });
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

function drawArcText(
  doc: jsPDF,
  text: string,
  centerX: number,
  centerY: number,
  radius: number,
  centerAngle: number,
  direction: 1 | -1,
  color: StampColor,
  requestedFontSize: number,
): void {
  const characters = [...text.toUpperCase().replace(/\s+/g, " ").trim()];
  if (characters.length === 0) return;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...color);

  const tracking = 0.1;
  const maxArcLength = radius * (Math.PI * 0.82);
  let fontSize = requestedFontSize;
  let widths: number[] = [];
  let totalWidth = 0;

  while (fontSize >= 3.6) {
    doc.setFontSize(fontSize);
    widths = characters.map(character => doc.getTextWidth(character));
    totalWidth = widths.reduce((sum, width) => sum + width, 0) + tracking * (characters.length - 1);
    if (totalWidth <= maxArcLength) break;
    fontSize -= 0.2;
  }

  doc.setFontSize(Math.max(3.6, fontSize));
  widths = characters.map(character => doc.getTextWidth(character));
  totalWidth = widths.reduce((sum, width) => sum + width, 0) + tracking * (characters.length - 1);
  let offset = -totalWidth / 2;

  characters.forEach((character, index) => {
    const width = widths[index];
    const angle = centerAngle + direction * (offset + width / 2) / radius;
    const tangent = angle * 180 / Math.PI + direction * 90;
    doc.text(
      character,
      centerX + radius * Math.cos(angle),
      centerY + radius * Math.sin(angle),
      { align: "center", baseline: "middle", angle: tangent, rotationDirection: 0 },
    );
    offset += width + tracking;
  });
}

function drawFourPointStar(doc: jsPDF, x: number, y: number, radius: number, color: StampColor): void {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.35);
  doc.line(x - radius, y, x, y - radius);
  doc.line(x, y - radius, x + radius, y);
  doc.line(x + radius, y, x, y + radius);
  doc.line(x, y + radius, x - radius, y);
  doc.line(x, y - radius * 0.72, x, y + radius * 0.72);
  doc.line(x - radius * 0.72, y, x + radius * 0.72, y);
}

/** Draw a print-sharp, branded status seal in a reserved page area. */
export function drawPdfStamp(doc: jsPDF, options: PdfStampOptions): void {
  const { x, y, size, shopName, logoData, status, dateLabel, documentRef } = options;
  const scale = size / 46;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const { ink, wash } = getStampPalette(status);
  const statusLabel = getStampStatusLabel(status);

  // Keep the lettering centered in the clear band between the outer and inner rings.
  doc.setFillColor(...wash);
  doc.setDrawColor(...ink);
  doc.setLineWidth(0.75 * scale);
  doc.circle(centerX, centerY, size / 2 - 0.55 * scale, "FD");
  doc.setLineWidth(0.25 * scale);
  doc.circle(centerX, centerY, size / 2 - 4.8 * scale, "S");

  const arcRadius = size / 2 - 2.675 * scale;
  drawArcText(
    doc,
    shopName,
    centerX,
    centerY,
    arcRadius,
    -Math.PI / 2,
    1,
    ink,
    4.8 * scale,
  );
  drawArcText(
    doc,
    "OFFICIAL DIGITAL STAMP",
    centerX,
    centerY,
    arcRadius,
    Math.PI / 2,
    -1,
    ink,
    4.8 * scale,
  );

  const starX = centerX + arcRadius;
  drawFourPointStar(doc, starX, centerY, 1.15 * scale, ink);
  drawFourPointStar(doc, centerX - arcRadius, centerY, 1.15 * scale, ink);

  const logoArea = {
    y: y + 9.1 * scale,
    width: size * 0.74,
    height: 14.2 * scale,
  };
  const logoProperties = doc.getImageProperties(logoData);
  const logoScale = Math.min(
    logoArea.width / logoProperties.width,
    logoArea.height / logoProperties.height,
  );
  const logoWidth = logoProperties.width * logoScale;
  const logoHeight = logoProperties.height * logoScale;
  doc.addImage(
    logoData,
    "PNG",
    centerX - logoWidth / 2,
    logoArea.y + (logoArea.height - logoHeight) / 2,
    logoWidth,
    logoHeight,
  );

  const badgeY = y + 24.4 * scale;
  const badgeWidth = size - 12 * scale;
  const badgeHeight = 8 * scale;
  doc.setFillColor(...ink);
  doc.setDrawColor(...ink);
  doc.roundedRect(
    centerX - badgeWidth / 2,
    badgeY,
    badgeWidth,
    badgeHeight,
    2.2 * scale,
    2.2 * scale,
    "F",
  );
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.max(statusLabel.length > 10 ? 4.9 : 5.3, (statusLabel.length > 10 ? 7.1 : 8.2) * scale));
  doc.text(statusLabel, centerX, badgeY + 5.3 * scale, {
    align: "center",
    maxWidth: badgeWidth - 3 * scale,
  });

  doc.setTextColor(...ink);
  doc.setFontSize(Math.max(4, 5.1 * scale));
  doc.text(dateLabel.toUpperCase(), centerX, y + 35 * scale, {
    align: "center",
    maxWidth: size - 12 * scale,
  });
  if (documentRef) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(Math.max(3.2, 3.7 * scale));
    doc.text(documentRef.toUpperCase(), centerX, y + 38 * scale, {
      align: "center",
      maxWidth: size - 13 * scale,
    });
  }
}
