import type { jsPDF } from "jspdf";

export type StampColor = [number, number, number];

export interface PdfStampOptions {
  x: number;
  y: number;
  size: number;
  shopName: string;
  logoData?: string | null;
  status: string;
  dateLabel: string;
  documentRef?: string;
  subtitle?: string;
  metaLine?: string;
  amountLabel?: string;
  serialCode?: string;
  watermark?: boolean;
}

export interface StampPalette {
  ink: StampColor;
  accent: StampColor;
  wash: StampColor;
}

export interface PdfShopLogoAssets {
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

export function tryGetPdfShopLogoAssets(
  shopId: string | undefined,
  fallbackName?: string,
): PdfShopLogoAssets | null {
  if (shopId && PDF_SHOP_LOGOS[shopId]) return PDF_SHOP_LOGOS[shopId]!;
  const lower = (fallbackName ?? "").toLowerCase();
  if (lower.includes("sunrise") || lower.includes("kabatha")) {
    return PDF_SHOP_LOGOS["shop-sunrise"]!;
  }
  if (lower.includes("greenlink")) {
    return PDF_SHOP_LOGOS["shop-greenlink"]!;
  }
  return null;
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

export function getStampPalette(status: string): StampPalette {
  const normalized = status.toLowerCase();
  if (normalized.includes("partial") || normalized.includes("credit")) {
    if (normalized.includes("paid") && !normalized.includes("partial")) {
      return {
        ink: [17, 102, 62],
        accent: [33, 145, 89],
        wash: [241, 250, 244],
      };
    }
    return {
      ink: [158, 86, 12],
      accent: [202, 114, 24],
      wash: [255, 248, 236],
    };
  }
  if (
    normalized.includes("outstanding") ||
    normalized.includes("unpaid") ||
    normalized.includes("rejected") ||
    normalized.includes("expired") ||
    normalized.includes("void")
  ) {
    return {
      ink: [176, 39, 49],
      accent: [211, 64, 74],
      wash: [255, 243, 244],
    };
  }
  if (
    normalized.includes("draft") ||
    normalized.includes("sent") ||
    normalized.includes("issued") ||
    normalized.includes("invoice")
  ) {
    return {
      ink: [27, 74, 140],
      accent: [49, 108, 188],
      wash: [242, 247, 255],
    };
  }
  return {
    ink: [17, 102, 62],
    accent: [33, 145, 89],
    wash: [241, 250, 244],
  };
}

export function getStampStatusLabel(status: string): string {
  const normalized = status.toLowerCase().trim();
  if (normalized.includes("void")) return "VOIDED";
  if (normalized.includes("credit") && normalized.includes("paid")) return "PAID + CREDIT";
  if (normalized === "on credit") return "ON CREDIT";
  if (normalized.includes("partial")) return "PARTIAL PAYMENT";
  if (normalized.includes("paid")) return "PAID IN FULL";
  if (normalized === "issued") return "OFFICIAL INVOICE";
  return status.trim().toUpperCase() || "VERIFIED";
}

/** Deterministic tamper-evident seal code derived from document metadata. */
export function computeStampSerial(parts: Array<string | undefined | null>): string {
  const shopHint = (parts[0] ?? "GL").trim().toUpperCase();
  const prefix =
    shopHint.includes("SUNRISE") || shopHint.includes("KABATHA") ? "KS" : "GL";
  const raw = parts.map((p) => (p ?? "").trim().toUpperCase()).join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(6, "0").slice(0, 6);
  return `${prefix}-${hex}`;
}

function softenStampColor(color: StampColor, whiteMix: number): StampColor {
  return color.map((channel) => Math.round(channel + (255 - channel) * whiteMix)) as StampColor;
}

function sanitizePdfText(value: string): string {
  return value
    .replace(/[•·]/g, "·")
    .replace(/[—–]/g, "-")
    .replace(/[^\x20-\xFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fitTextToWidth(
  doc: jsPDF,
  rawText: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  fontStyle: "bold" | "normal" = "bold",
  fontFamily: "helvetica" | "courier" = "helvetica",
): { text: string; fontSize: number } {
  const clean = sanitizePdfText(rawText);
  doc.setFont(fontFamily, fontStyle);
  let fontSize = startSize;
  doc.setFontSize(fontSize);
  while (fontSize > minSize && doc.getTextWidth(clean) > maxWidth) {
    fontSize = Math.max(minSize, fontSize - 0.18);
    doc.setFontSize(fontSize);
  }
  let text = clean;
  if (doc.getTextWidth(text) > maxWidth) {
    while (text.length > 2 && doc.getTextWidth(`${text}...`) > maxWidth) {
      text = text.slice(0, -1);
    }
    text = `${text.trimEnd()}...`;
  }
  return { text, fontSize };
}

function placeWatermarkBehindPageContent(
  doc: jsPDF,
  pageNumber: number,
  watermarkStart: number,
): void {
  const pages = (doc as any).internal.pages as string[][];
  const pageCommands = pages?.[pageNumber];
  if (!Array.isArray(pageCommands) || watermarkStart > pageCommands.length) {
    throw new Error(`Could not position the PDF watermark on page ${pageNumber}.`);
  }

  const watermarkCommands = pageCommands.splice(watermarkStart);
  const firstPaintIndex = pageCommands.findIndex((command) =>
    ["f", "f*", "B", "B*"].includes(String(command).trim()),
  );
  // Preserve an existing page background/header band, then paint the seal
  // before the document's text and tables.
  const insertAt = firstPaintIndex >= 0 ? firstPaintIndex + 1 : Math.min(2, pageCommands.length);
  pageCommands.splice(insertAt, 0, ...watermarkCommands);
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
  const characters = [...sanitizePdfText(text).toUpperCase()];
  if (characters.length === 0) return;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...color);

  const maxArcLength = radius * (Math.PI * 0.8);
  let fontSize = requestedFontSize;
  let widths: number[] = [];
  let tracking = 0;
  let totalWidth = 0;

  while (fontSize >= 2.8) {
    doc.setFontSize(fontSize);
    tracking = fontSize * 0.352778 * 0.04;
    widths = characters.map((character) => doc.getTextWidth(character));
    totalWidth = widths.reduce((sum, width) => sum + width, 0) + tracking * (characters.length - 1);
    if (totalWidth <= maxArcLength) break;
    fontSize -= 0.15;
  }

  fontSize = Math.max(2.8, fontSize);
  doc.setFontSize(fontSize);
  tracking = fontSize * 0.352778 * 0.04;
  widths = characters.map((character) => doc.getTextWidth(character));
  totalWidth = widths.reduce((sum, width) => sum + width, 0) + tracking * (characters.length - 1);
  // Center optical cap-height (~0.716em in Helvetica Bold caps) right on `radius`
  const capHeightMm = fontSize * 0.352778 * 0.716;
  const baselineRadius = radius - direction * (capHeightMm * 0.5);
  let offset = -totalWidth / 2;

  characters.forEach((character, index) => {
    const width = widths[index]!;
    const angle = centerAngle + (direction * (offset + width / 2)) / radius;
    const tangent = (angle * 180) / Math.PI + direction * 90;
    doc.text(
      character,
      centerX + baselineRadius * Math.cos(angle),
      centerY + baselineRadius * Math.sin(angle),
      { align: "center", baseline: "alphabetic", angle: tangent, rotationDirection: 0 },
    );
    offset += width + tracking;
  });
}

function drawEightPointEmblem(
  doc: jsPDF,
  x: number,
  y: number,
  radius: number,
  color: StampColor,
  scale: number,
): void {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(0.28 * scale);
  doc.line(x - radius, y, x + radius, y);
  doc.line(x, y - radius, x, y + radius);
  const diag = radius * 0.68;
  doc.line(x - diag, y - diag, x + diag, y + diag);
  doc.line(x - diag, y + diag, x + diag, y - diag);
  doc.circle(x, y, radius * 0.28, "F");
}

function drawVectorDiamond(
  doc: jsPDF,
  x: number,
  y: number,
  radius: number,
  color: StampColor,
  lineWidth: number,
): void {
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  doc.setLineWidth(lineWidth);
  doc.triangle(x, y - radius, x + radius, y, x - radius, y, "F");
  doc.triangle(x, y + radius, x + radius, y, x - radius, y, "F");
}

function drawFallbackCrest(
  doc: jsPDF,
  centerX: number,
  centerY: number,
  scale: number,
  shopName: string,
  ink: StampColor,
  accent: StampColor,
): void {
  const initials = sanitizePdfText(shopName)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("") || "GL";
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.35 * scale);
  doc.roundedRect(centerX - 6.5 * scale, centerY - 3.6 * scale, 13 * scale, 7.2 * scale, 1.8 * scale, 1.8 * scale, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(5.5 * scale);
  doc.setTextColor(...ink);
  doc.text(initials, centerX, centerY + 1.5 * scale, { align: "center" });
}

/** Draw a print-sharp, official multi-ring security seal with structured metadata. */
export function drawPdfStamp(doc: jsPDF, options: PdfStampOptions): void {
  const {
    x,
    y,
    size,
    shopName,
    logoData,
    status,
    dateLabel,
    documentRef,
    subtitle = "OFFICIAL DIGITAL STAMP",
    metaLine,
    amountLabel,
    serialCode,
    watermark = false,
  } = options;

  const scale = size / 46;
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size / 2;

  const palette = getStampPalette(status);
  const detailInk = watermark ? softenStampColor(palette.ink, 0.56) : palette.ink;
  const detailAccent = watermark ? softenStampColor(palette.accent, 0.62) : palette.accent;
  const detailWash = watermark ? softenStampColor(palette.wash, 0.25) : palette.wash;
  const statusLabel = getStampStatusLabel(status);
  const resolvedSerial =
    serialCode || computeStampSerial([shopName, documentRef, dateLabel, statusLabel, amountLabel]);

  // 1. Wash backdrop + heavy outer ring
  doc.setFillColor(...detailWash);
  doc.setDrawColor(...detailInk);
  doc.setLineWidth(0.88 * scale);
  doc.circle(centerX, centerY, radius - 1.15 * scale, "FD");

  // 2. Serrated security perimeter notches around outer rim
  const toothCount = watermark ? 36 : 48;
  const rToothOuter = radius - 0.18 * scale;
  const rToothInner = radius - 0.85 * scale;
  doc.setDrawColor(...detailAccent);
  doc.setLineWidth((watermark ? 0.18 : 0.26) * scale);
  for (let i = 0; i < toothCount; i++) {
    const theta = (i / toothCount) * Math.PI * 2;
    doc.line(
      centerX + rToothInner * Math.cos(theta),
      centerY + rToothInner * Math.sin(theta),
      centerX + rToothOuter * Math.cos(theta),
      centerY + rToothOuter * Math.sin(theta),
    );
  }

  // 3. Secondary guard ring + inner medallion border + 36-bead dot ring
  doc.setDrawColor(...detailAccent);
  doc.setLineWidth(0.22 * scale);
  doc.circle(centerX, centerY, radius - 2.02 * scale, "S");

  const rInnerRing = radius - 5.85 * scale;
  doc.setDrawColor(...detailInk);
  doc.setLineWidth(0.45 * scale);
  doc.circle(centerX, centerY, rInnerRing, "S");

  const rBeadRing = radius - 6.55 * scale;
  const beadCount = 32;
  doc.setFillColor(...detailAccent);
  for (let i = 0; i < beadCount; i++) {
    const theta = (i / beadCount) * Math.PI * 2;
    doc.circle(
      centerX + rBeadRing * Math.cos(theta),
      centerY + rBeadRing * Math.sin(theta),
      0.24 * scale,
      "F",
    );
  }

  // 4. Curved perimeter lettering & 3/9 o'clock star emblems
  const arcRadius = radius - 3.92 * scale;
  drawArcText(
    doc,
    shopName,
    centerX,
    centerY,
    arcRadius,
    -Math.PI / 2,
    1,
    detailInk,
    4.5 * scale,
  );
  drawArcText(
    doc,
    subtitle,
    centerX,
    centerY,
    arcRadius,
    Math.PI / 2,
    -1,
    detailInk,
    4.2 * scale,
  );

  // Side stars + flanking accent dots at 3 & 9 o'clock
  drawEightPointEmblem(doc, centerX + arcRadius, centerY, 1.05 * scale, detailInk, scale);
  drawEightPointEmblem(doc, centerX - arcRadius, centerY, 1.05 * scale, detailInk, scale);
  doc.setFillColor(...detailAccent);
  for (const side of [-1, 1] as const) {
    for (const degOffset of [-9, 9]) {
      const a = (side === 1 ? 0 : Math.PI) + (degOffset * Math.PI) / 180;
      doc.circle(
        centerX + arcRadius * Math.cos(a),
        centerY + arcRadius * Math.sin(a),
        0.3 * scale,
        "F",
      );
    }
  }

  // 5. Upper medallion crest / shop logo centered nicely above banner
  const ribbonHeight = 7.0 * scale;
  const ribbonY = centerY - ribbonHeight / 2 - 0.1 * scale;
  const logoTopBoundary = centerY - rBeadRing + 2.2 * scale;
  const logoBottomBoundary = ribbonY - 0.9 * scale;
  const logoMaxHeight = Math.max(5 * scale, logoBottomBoundary - logoTopBoundary);
  const logoMaxWidth = size * 0.44;

  if (logoData && logoData.startsWith("data:image/")) {
    try {
      const logoProperties = doc.getImageProperties(logoData);
      const format = logoData.startsWith("data:image/jpeg") ? "JPEG" : "PNG";
      const logoScale = Math.min(
        logoMaxWidth / logoProperties.width,
        logoMaxHeight / logoProperties.height,
      );
      const logoWidth = logoProperties.width * logoScale;
      const logoHeight = logoProperties.height * logoScale;
      const logoX = centerX - logoWidth / 2;
      // Nudge wide wordmarks slightly closer to the banner so there is no dead void
      const logoY = logoBottomBoundary - logoHeight - (logoMaxHeight - logoHeight) * 0.3;

      if (watermark) {
        const GraphicsState = (doc as any).GState as
          | (new (parameters: { opacity: number; "stroke-opacity": number }) => unknown)
          | undefined;
        if (!GraphicsState) {
          throw new Error("This PDF renderer does not support watermark transparency.");
        }
        doc.saveGraphicsState();
        try {
          doc.setGState(new GraphicsState({ opacity: 0.35, "stroke-opacity": 0.35 }));
          doc.addImage(logoData, format, logoX, logoY, logoWidth, logoHeight);
        } finally {
          doc.restoreGraphicsState();
        }
      } else {
        doc.addImage(logoData, format, logoX, logoY, logoWidth, logoHeight);
      }
    } catch {
      drawFallbackCrest(
        doc,
        centerX,
        (logoTopBoundary + logoBottomBoundary) / 2,
        scale,
        shopName,
        detailInk,
        detailAccent,
      );
    }
  } else {
    drawFallbackCrest(
      doc,
      centerX,
      (logoTopBoundary + logoBottomBoundary) / 2,
      scale,
      shopName,
      detailInk,
      detailAccent,
    );
  }

  // 6. Central double-framed Status Ribbon Banner (cuts cleanly over inner ring)
  const ribbonWidth = size * 0.85;
  const ribbonX = centerX - ribbonWidth / 2;
  const haloPad = 0.65 * scale;

  // Matte halo so circular ring lines behind ribbon do not collide with edges
  doc.setFillColor(...detailWash);
  doc.setDrawColor(...detailWash);
  doc.roundedRect(
    ribbonX - haloPad,
    ribbonY - haloPad,
    ribbonWidth + haloPad * 2,
    ribbonHeight + haloPad * 2,
    1.9 * scale,
    1.9 * scale,
    "F",
  );

  const bannerFill = watermark ? softenStampColor(palette.ink, 0.86) : detailInk;
  const bannerStroke = watermark ? detailInk : detailInk;
  doc.setFillColor(...bannerFill);
  doc.setDrawColor(...bannerStroke);
  doc.setLineWidth((watermark ? 0.4 : 0.45) * scale);
  doc.roundedRect(
    ribbonX,
    ribbonY,
    ribbonWidth,
    ribbonHeight,
    1.5 * scale,
    1.5 * scale,
    "FD",
  );

  // Fine inset inner rule inside the status ribbon
  const inset = 0.65 * scale;
  const insetColor: StampColor = watermark
    ? softenStampColor(palette.ink, 0.68)
    : softenStampColor(palette.ink, 0.48);
  doc.setDrawColor(...insetColor);
  doc.setLineWidth(0.2 * scale);
  doc.roundedRect(
    ribbonX + inset,
    ribbonY + inset,
    ribbonWidth - inset * 2,
    ribbonHeight - inset * 2,
    1.0 * scale,
    1.0 * scale,
    "S",
  );

  // Left & right diamond rivets inside the ribbon
  const rivetColor: StampColor = watermark ? detailAccent : [255, 255, 255];
  const rivetRadius = 0.82 * scale;
  drawVectorDiamond(doc, ribbonX + 3.1 * scale, ribbonY + ribbonHeight / 2, rivetRadius, rivetColor, 0.1 * scale);
  drawVectorDiamond(
    doc,
    ribbonX + ribbonWidth - 3.1 * scale,
    ribbonY + ribbonHeight / 2,
    rivetRadius,
    rivetColor,
    0.1 * scale,
  );

  // Fitted status headline centered between the diamond rivets
  const statusMaxWidth = ribbonWidth - 9.2 * scale;
  const statusBaseFont = (statusLabel.length > 12 ? 6.5 : statusLabel.length > 9 ? 7.2 : 8.0) * scale;
  const fittedStatus = fitTextToWidth(
    doc,
    statusLabel,
    statusMaxWidth,
    statusBaseFont,
    Math.max(3.8, 4.4 * scale),
    "bold",
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fittedStatus.fontSize);
  doc.setTextColor(...(watermark ? detailInk : ([255, 255, 255] as StampColor)));
  doc.text(fittedStatus.text, centerX, ribbonY + ribbonHeight / 2, {
    align: "center",
    baseline: "middle",
  });

  // 7. Lower medallion details stack (Date, Ref, optional Meta, Seal ID)
  const lowerStart = ribbonY + ribbonHeight + 2.4 * scale;

  // Date stamp line
  const dateText = fitTextToWidth(
    doc,
    dateLabel.toUpperCase(),
    24 * scale,
    Math.max(4.0, 5.0 * scale),
    Math.max(3.5, 4.0 * scale),
    "bold",
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(dateText.fontSize);
  doc.setTextColor(...detailInk);
  doc.text(dateText.text, centerX, lowerStart, { align: "center" });

  // Subtle horizontal divider ticks flanking a thin center rule beneath date
  doc.setDrawColor(...detailAccent);
  doc.setLineWidth(0.18 * scale);
  doc.line(centerX - 9.5 * scale, lowerStart + 1.15 * scale, centerX + 9.5 * scale, lowerStart + 1.15 * scale);

  let nextY = lowerStart + 3.45 * scale;

  if (documentRef) {
    const cleanRef = sanitizePdfText(documentRef).toUpperCase();
    const formattedRef = cleanRef.startsWith("REF") || cleanRef.startsWith("#") || cleanRef.includes("STATEMENT")
      ? cleanRef
      : `REF: ${cleanRef}`;
    const refFitted = fitTextToWidth(
      doc,
      formattedRef,
      20.5 * scale,
      Math.max(3.4, 4.0 * scale),
      Math.max(3.0, 3.3 * scale),
      "bold",
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(refFitted.fontSize);
    doc.setTextColor(...detailInk);
    doc.text(refFitted.text, centerX, nextY, { align: "center" });
    nextY += 2.6 * scale;
  }

  if (metaLine) {
    const metaFitted = fitTextToWidth(
      doc,
      metaLine.toUpperCase(),
      19.2 * scale,
      Math.max(3.0, 3.5 * scale),
      2.4,
      "normal",
    );
    doc.setFont("helvetica", "normal");
    doc.setFontSize(metaFitted.fontSize);
    doc.setTextColor(...detailAccent);
    doc.text(metaFitted.text, centerX, nextY, { align: "center" });
    nextY += 2.45 * scale;
  }

  // Verification Seal ID at the bottom of the inner medallion (skip if space constrained)
  if (nextY <= centerY + rBeadRing - 1.2 * scale) {
    const serialFitted = fitTextToWidth(
      doc,
      `SEAL ${resolvedSerial}`,
      14 * scale,
      Math.max(2.7, 3.25 * scale),
      2.5,
      "bold",
      "courier",
    );
    doc.setFont("courier", "bold");
    doc.setFontSize(serialFitted.fontSize);
    doc.setTextColor(...softenStampColor(detailInk, watermark ? 0.1 : 0.28));
    doc.text(serialFitted.text, centerX, nextY, { align: "center" });
  }
}

/**
 * Repeat the official document stamp as a softly colored watermark on each page.
 * Lightened stamp details and a translucent logo keep it visible without
 * competing with document content.
 */
export function drawPdfWatermark(
  doc: jsPDF,
  options: Omit<PdfStampOptions, "x" | "y" | "size"> & { opacity?: number },
): void {
  const pageCount = (doc as any).internal.getNumberOfPages() as number;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const size = Math.min(46, pageWidth * 0.22, pageHeight * 0.165);
  const x = (pageWidth - size) / 2;
  const y = (pageHeight - size) / 2;
  const { opacity = 1, ...stampOptions } = options;
  const GraphicsState = (doc as any).GState as
    | (new (parameters: { opacity: number; "stroke-opacity": number }) => unknown)
    | undefined;

  if (!GraphicsState) {
    throw new Error("This PDF renderer does not support watermark transparency.");
  }

  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    const pageCommands = (doc as any).internal.pages?.[page] as string[] | undefined;
    if (!Array.isArray(pageCommands)) {
      throw new Error(`Could not access the PDF page content for watermarking page ${page}.`);
    }
    const watermarkStart = pageCommands.length;
    doc.saveGraphicsState();
    try {
      doc.setGState(new GraphicsState({ opacity, "stroke-opacity": opacity }));
      drawPdfStamp(doc, { ...stampOptions, x, y, size, watermark: true });
    } finally {
      doc.restoreGraphicsState();
    }
    placeWatermarkBehindPageContent(doc, page, watermarkStart);
  }
}
