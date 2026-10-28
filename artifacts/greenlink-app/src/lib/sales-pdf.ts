import { format } from "date-fns";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { getPdfShopLogoAssets } from "@/lib/pdf-stamp";

type PdfColor = [number, number, number];

const BRAND: PdfColor = [18, 112, 68];
const DARK: PdfColor = [9, 83, 49];
const PALE: PdfColor = [237, 247, 240];
const BORDER: PdfColor = [216, 225, 219];
const TEXT: PdfColor = [28, 39, 34];
const MUTED: PdfColor = [91, 105, 119];
const WHITE: PdfColor = [255, 255, 255];
const PAGE_MARGIN = 14;

function money(value: unknown): string {
  const amount = Number(value ?? 0);
  return `KES ${Number.isFinite(amount) ? amount.toLocaleString("en-KE", { maximumFractionDigits: 0 }) : "0"}`;
}

function safeFilePart(value: string): string {
  return value.trim().replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "sale";
}

async function loadHeaderLogo(url: string): Promise<{ data: string; width: number; height: number }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load the shop logo (${response.status}).`);

  const blob = await response.blob();
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not read the shop logo."));
    reader.onerror = () => reject(new Error("Could not read the shop logo."));
    reader.readAsDataURL(blob);
  });

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode the shop logo."));
      img.src = objectUrl;
    });
    return { data, width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function fitText(doc: jsPDF, value: string, maxWidth: number, initialSize = 7): string {
  let size = initialSize;
  doc.setFontSize(size);
  while (doc.getTextWidth(value) > maxWidth && size > 5.2) {
    size = Math.max(5.2, size - 0.2);
    doc.setFontSize(size);
  }
  if (doc.getTextWidth(value) <= maxWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && doc.getTextWidth(`${shortened}...`) > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}...`;
}

export async function downloadSalePdf(sale: any, returns: any[] = []): Promise<void> {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const shopLogoAssets = getPdfShopLogoAssets(shopId);
  const shopName = localStorage.getItem("greenlink_shopName") || shopLogoAssets.sealName;
  const logo = await loadHeaderLogo(shopLogoAssets.printHeader);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const ref = String(sale.id || "").slice(0, 8).toUpperCase() || "—";
  const isDebt = sale.saleType === "debt";
  const isVoided = Boolean(sale.isDeleted);
  const paymentLabel = isDebt
    ? "On credit"
    : sale.paymentMethod === "bank"
      ? "M-Pesa / bank"
      : "Cash";
  const statusLabel = isVoided ? "VOIDED" : isDebt ? "ON CREDIT" : "PAID";
  const saleDate = sale.createdAt
    ? format(new Date(sale.createdAt), "dd MMM yyyy, h:mm a")
    : "Date unavailable";
  const items = Array.isArray(sale.items) ? sale.items : [];
  const returnedTotal = returns.reduce((sum, item) => sum + Number(item.totalRefund ?? 0), 0);

  doc.setProperties({
    title: `${shopName} Sales Receipt ${ref}`,
    subject: "Sales history receipt",
    creator: shopName,
  });

  function drawContinuationHeader() {
    const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
    if (currentPage <= 1) return;
    doc.setFillColor(...DARK);
    doc.rect(0, 0, pageWidth, 9, "F");
    doc.setFillColor(...BRAND);
    doc.rect(0, 0, pageWidth, 1.4, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.2);
    doc.setTextColor(...WHITE);
    doc.text(`${shopName}  ·  Sale #${ref}  ·  continued`, PAGE_MARGIN, 6.4);
  }

  function drawFooter(page: number, totalPages: number) {
    const footerTop = pageHeight - 14;
    doc.setFillColor(...DARK);
    doc.rect(0, footerTop, pageWidth, 14, "F");
    doc.setFillColor(...BRAND);
    doc.rect(0, footerTop, pageWidth, 1.4, "F");
    doc.setDrawColor(74, 101, 91);
    doc.setLineWidth(0.2);
    doc.line(70, footerTop + 3, 70, pageHeight - 2.8);
    doc.line(143, footerTop + 3, 143, pageHeight - 2.8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(168, 220, 188);
    doc.text("LOCATION", PAGE_MARGIN, pageHeight - 9.2);
    doc.text("RECEIPT", 76, pageHeight - 9.2);
    doc.text(`PAGE ${page} OF ${totalPages}`, pageWidth - PAGE_MARGIN, pageHeight - 9.2, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.1);
    doc.setTextColor(...WHITE);
    doc.text("Nanyuki, Kenya", PAGE_MARGIN, pageHeight - 4.2);
    doc.text(`#${ref}  ·  Not a tax invoice`, 76, pageHeight - 4.2);
  }

  // Brand header and document identity.
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, pageWidth, 2, "F");
  const logoArea = { x: PAGE_MARGIN, y: 6, width: 56, height: 24 };
  const logoScale = Math.min(logoArea.width / logo.width, logoArea.height / logo.height);
  const logoWidth = logo.width * logoScale;
  const logoHeight = logo.height * logoScale;
  doc.addImage(
    logo.data,
    "JPEG",
    logoArea.x + (logoArea.width - logoWidth) / 2,
    logoArea.y + (logoArea.height - logoHeight) / 2,
    logoWidth,
    logoHeight,
  );

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.setFontSize(17);
  doc.text("SALES RECEIPT", pageWidth - PAGE_MARGIN, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.text(`Reference  #${ref}`, pageWidth - PAGE_MARGIN, 18, { align: "right" });

  const statusColor: PdfColor = isVoided ? [174, 49, 57] : isDebt ? [155, 91, 16] : BRAND;
  doc.setFillColor(...PALE);
  doc.roundedRect(pageWidth - PAGE_MARGIN - 42, 22, 42, 8, 1.6, 1.6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...statusColor);
  doc.text(statusLabel, pageWidth - PAGE_MARGIN - 21, 27.2, { align: "center" });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, 34, pageWidth - PAGE_MARGIN, 34);

  // Compact transaction details.
  const detailsY = 39;
  const detailsHeight = 24;
  doc.setFillColor(...PALE);
  doc.roundedRect(PAGE_MARGIN, detailsY, contentWidth, detailsHeight, 1.8, 1.8, "F");
  doc.setDrawColor(...BORDER);
  doc.roundedRect(PAGE_MARGIN, detailsY, contentWidth, detailsHeight, 1.8, 1.8, "S");
  const detailColumns = [
    { label: "DATE & TIME", value: saleDate, x: PAGE_MARGIN + 5, width: 55 },
    { label: "PAYMENT", value: paymentLabel, x: PAGE_MARGIN + 65, width: 45 },
    { label: "SERVED BY", value: String(sale.servedBy || "—"), x: PAGE_MARGIN + 115, width: 58 },
  ];
  for (const column of detailColumns) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED);
    doc.text(column.label, column.x, detailsY + 8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT);
    doc.setFontSize(7);
    const value = fitText(doc, column.value, column.width, 7);
    doc.text(value, column.x, detailsY + 16);
  }

  let tableStartY = 70;
  if (isDebt && sale.debtCustomerName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...DARK);
    doc.text("CREDIT CUSTOMER", PAGE_MARGIN, 69);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TEXT);
    doc.setFontSize(7);
    doc.text(fitText(doc, String(sale.debtCustomerName), contentWidth - 42, 7), PAGE_MARGIN + 31, 69);
    tableStartY = 76;
  }

  const tableBody = items.length
    ? items.map((item: any, index: number) => {
        const qty = Number(item.qty ?? 0);
        const unitPrice = Number(item.unitPrice ?? 0);
        return [
          String(index + 1),
          String(item.productName || "—"),
          qty.toLocaleString("en-KE"),
          String(item.unit || item.unitName || "—"),
          money(unitPrice),
          money(item.totalPrice ?? qty * unitPrice),
        ];
      })
    : [["1", "Item details unavailable", "—", "—", "—", "—"]];

  autoTable(doc, {
    startY: tableStartY,
    head: [["#", "PRODUCT / DESCRIPTION", "QTY", "UNIT", "UNIT PRICE", "TOTAL"]],
    body: tableBody,
    theme: "grid",
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 16, bottom: 20 },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      textColor: TEXT,
      lineColor: BORDER,
      lineWidth: 0.18,
      cellPadding: 2.6,
      valign: "middle",
    },
    headStyles: {
      fillColor: DARK,
      textColor: WHITE,
      fontStyle: "bold",
      fontSize: 6.5,
      cellPadding: 2.8,
    },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: "auto" },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 17, halign: "center" },
      4: { cellWidth: 30, halign: "right" },
      5: { cellWidth: 31, halign: "right", fontStyle: "bold" },
    },
    didDrawPage: drawContinuationHeader,
  });

  let summaryY = Number((doc as any).lastAutoTable?.finalY ?? tableStartY) + 8;
  const discount = Number(sale.discount ?? 0);
  const summaryRows = (discount > 0 ? 1 : 0) + (returns.length > 0 ? 1 : 0);
  const summaryHeight = summaryRows * 7 + 15;
  if (summaryY + summaryHeight > pageHeight - 18) {
    doc.addPage();
    drawContinuationHeader();
    summaryY = 19;
  }

  const summaryX = pageWidth - PAGE_MARGIN - 86;
  const summaryWidth = 86;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  doc.setTextColor(...MUTED);
  if (discount > 0) {
    doc.text("Discount", summaryX, summaryY);
    doc.setTextColor(...TEXT);
    doc.text(`- ${money(discount)}`, summaryX + summaryWidth, summaryY, { align: "right" });
    summaryY += 7;
    doc.setTextColor(...MUTED);
  }
  if (returns.length > 0) {
    doc.text(`Refunds (${returns.length})`, summaryX, summaryY);
    doc.setTextColor(...TEXT);
    doc.text(`- ${money(returnedTotal)}`, summaryX + summaryWidth, summaryY, { align: "right" });
    summaryY += 7;
  }

  doc.setFillColor(...DARK);
  doc.roundedRect(summaryX, summaryY, summaryWidth, 13, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(...WHITE);
  doc.text(returns.length > 0 ? "SALE TOTAL BEFORE RETURNS" : "TOTAL AMOUNT", summaryX + 4, summaryY + 8);
  doc.setFontSize(8.2);
  doc.text(money(sale.totalAmount), summaryX + summaryWidth - 4, summaryY + 8, { align: "right" });

  if (isVoided) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(174, 49, 57);
    doc.text("VOIDED SALE — not valid for payment", PAGE_MARGIN, summaryY + 7);
  } else if (returns.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.setTextColor(...MUTED);
    doc.text("Sale total shown before processed returns.", PAGE_MARGIN, summaryY + 7);
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    drawFooter(page, pageCount);
  }

  doc.save(`sales-receipt-${safeFilePart(ref)}.pdf`);
}

/** Download a PDF report for the currently filtered sales-history list. */
export async function downloadSalesHistoryPdf(sales: any[], options: { dateLabel: string; filterLabel?: string; includeProfit?: boolean }): Promise<void> {
  if (!sales.length) throw new Error("There are no sales to export.");
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const assets = getPdfShopLogoAssets(shopId);
  const shopName = localStorage.getItem("greenlink_shopName") || assets.sealName;
  const logo = await loadHeaderLogo(assets.printHeader);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const includeProfit = Boolean(options.includeProfit);
  const total = sales.reduce((sum, sale) => sum + Number(sale.totalAmount ?? 0), 0);
  const profit = sales.reduce((sum, sale) => sum + Number(sale.totalProfit ?? 0), 0);
  const cashCount = sales.filter(sale => sale.saleType !== "debt" && sale.paymentMethod !== "bank").length;
  const mpesaCount = sales.filter(sale => sale.saleType !== "debt" && sale.paymentMethod === "bank").length;
  const debtCount = sales.filter(sale => sale.saleType === "debt").length;
  doc.setProperties({ title: shopName + " Sales History - " + options.dateLabel, subject: "Sales history report", creator: shopName });
  doc.setFillColor(...WHITE); doc.rect(0, 0, pageWidth, pageHeight, "F");
  doc.setFillColor(...BRAND); doc.rect(0, 0, pageWidth, 2, "F");
  const logoScale = Math.min(42 / logo.width, 19 / logo.height);
  doc.addImage(logo.data, "JPEG", margin, 5, logo.width * logoScale, logo.height * logoScale);
  doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK); doc.setFontSize(17);
  doc.text("SALES HISTORY REPORT", pageWidth - margin, 12, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(options.dateLabel + (options.filterLabel ? " · " + options.filterLabel : ""), pageWidth - margin, 18, { align: "right" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...TEXT); doc.text(shopName, margin, 29);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MUTED);
  doc.text("Generated " + format(new Date(), "dd MMM yyyy, h:mm a") + " · " + sales.length + " transaction(s)", margin, 34);
  const summaryY = 40;
  const summaryW = includeProfit ? 68 : 83;
  const summary = [
    { label: "TOTAL SALES", value: String(sales.length) }, { label: "CASH", value: String(cashCount) },
    { label: "M-PESA", value: String(mpesaCount) }, { label: "CREDIT / DEBT", value: String(debtCount) },
    { label: "REVENUE", value: money(total) }, ...(includeProfit ? [{ label: "PROFIT", value: money(profit) }] : []),
  ];
  summary.forEach((item, index) => {
    const x = margin + index * (summaryW + 3);
    doc.setFillColor(...PALE); doc.roundedRect(x, summaryY, summaryW, 16, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.setTextColor(...MUTED); doc.text(item.label, x + 3, summaryY + 5);
    doc.setFontSize(8.2); doc.setTextColor(...DARK); doc.text(item.value, x + 3, summaryY + 11.5);
  });
  const body = sales.map((sale, index) => {
    const payment = sale.saleType === "debt" ? "Credit / debt" : sale.paymentMethod === "bank" ? "M-Pesa" : "Cash";
    const items = (Array.isArray(sale.items) ? sale.items : []).map((item: any) => String(item.productName || "Item") + " × " + String(item.qty ?? 0)).join(", ");
    return [String(index + 1), sale.createdAt ? format(new Date(sale.createdAt), "HH:mm") : "—",
      String(sale.id || "").slice(0, 8).toUpperCase() || "—", payment, String(sale.debtCustomerName || sale.servedBy || "—"),
      items || "Item details unavailable", money(sale.totalAmount), ...(includeProfit ? [money(sale.totalProfit)] : [])];
  });
  autoTable(doc, {
    startY: 61,
    head: [["#", "TIME", "SALE REF", "PAYMENT", "CUSTOMER / CASHIER", "ITEMS", "TOTAL", ...(includeProfit ? ["PROFIT"] : [])]],
    body, theme: "grid", margin: { left: margin, right: margin, top: 10, bottom: 16 },
    styles: { font: "helvetica", fontSize: 7, textColor: TEXT, lineColor: BORDER, lineWidth: 0.18, cellPadding: 2.2, valign: "middle", overflow: "linebreak" },
    headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 6.5 },
    alternateRowStyles: { fillColor: [248, 250, 249] },
    columnStyles: { 0: { cellWidth: 8, halign: "center" }, 1: { cellWidth: 15 }, 2: { cellWidth: 22 }, 3: { cellWidth: 25 }, 4: { cellWidth: 38 }, 5: { cellWidth: "auto" }, 6: { cellWidth: 29, halign: "right", fontStyle: "bold" }, ...(includeProfit ? { 7: { cellWidth: 27, halign: "right" as const } } : {}) },
    didDrawPage: () => {
      const page = doc.internal.getCurrentPageInfo().pageNumber;
      doc.setFillColor(...DARK); doc.rect(0, pageHeight - 9, pageWidth, 9, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(6); doc.setTextColor(...WHITE);
      doc.text(shopName, margin, pageHeight - 3.5); doc.text("Page " + page, pageWidth - margin, pageHeight - 3.5, { align: "right" });
    },
  });
  doc.save("sales-history-" + safeFilePart(options.dateLabel) + ".pdf");
}
