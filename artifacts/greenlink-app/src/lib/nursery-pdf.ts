import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type NurseryPdfEntry = {
  id: string;
  requestId: string;
  businessDate: string;
  varietyId: string;
  varietyName: string;
  customerName: string;
  customerPhone: string;
  quantity: number;
  unitPriceCents: number;
  totalAmountCents: number;
  paymentMethod: "cash" | "mpesa" | "credit";
  debtId: string | null;
  createdAt: string;
};

type PdfBrand = { shopName: string; logoDataUrl?: string | null };
const money = (cents: number) => new Intl.NumberFormat("en-KE", {
  style: "currency", currency: "KES", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(cents || 0) / 100);
const dateLabel = (value: string) => {
  if (!value) return "—";
  const date = new Date(value + "T12:00:00");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
};
const paymentLabel = (value: string) => value === "mpesa" ? "M-Pesa" : value === "credit" ? "Credit" : "Cash";
const safeFilePart = (value: string) => value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 48) || "customer";

function addBrandHeader(doc: jsPDF, brand: PdfBrand, title: string, subtitle: string) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(20, 83, 45);
  doc.rect(0, 0, width, 7, "F");
  let textX = 16;
  if (brand.logoDataUrl?.startsWith("data:image/")) {
    try {
      const format = brand.logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
      doc.addImage(brand.logoDataUrl, format, 15, 14, 18, 18, undefined, "FAST");
      textX = 39;
    } catch {
      // A malformed or unsupported shop logo should never prevent the document being generated.
    }
  }
  doc.setTextColor(20, 83, 45);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(brand.shopName || "Nursery", textX, 20, { maxWidth: width - textX - 15 });
  doc.setTextColor(100, 116, 105);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("NURSERY SALES • CUSTOMER RECORDS", textX, 26);
  doc.setDrawColor(220, 229, 222);
  doc.line(15, 36, width - 15, 36);
  doc.setTextColor(24, 35, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(title, 15, 47);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 105);
  doc.setFontSize(9);
  doc.text(subtitle, 15, 53, { maxWidth: width - 30 });
}

function addFooter(doc: jsPDF, brand: PdfBrand) {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.setDrawColor(220, 229, 222);
    doc.line(15, height - 15, width - 15, height - 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(112, 124, 115);
    doc.text(brand.shopName || "Nursery", 15, height - 9);
    doc.text(`Page ${page} of ${pages}`, width - 15, height - 9, { align: "right" });
  }
}

function addWatermark(doc: jsPDF, shopName: string) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  doc.setTextColor(239, 243, 240);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(27);
  doc.text((shopName || "NURSERY").toLocaleUpperCase().slice(0, 34), width / 2, height / 2, {
    align: "center", angle: 32, maxWidth: width - 28,
  });
}

export function downloadNurseryReceipt(entry: NurseryPdfEntry, brand: PdfBrand) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  addBrandHeader(doc, brand, "SALES RECEIPT", `Receipt reference: NUR-${entry.id.slice(0, 8).toUpperCase()} • Sale date: ${dateLabel(entry.businessDate)}`);
  addWatermark(doc, brand.shopName);
  const customerName = entry.customerName?.trim() || "Walk-in customer";
  doc.setFillColor(246, 249, 246);
  doc.roundedRect(15, 61, 180, 26, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 105);
  doc.text("BILLED TO", 20, 69);
  doc.text("PAYMENT METHOD", 130, 69);
  doc.setFontSize(10);
  doc.setTextColor(24, 35, 28);
  doc.text(customerName.slice(0, 48), 20, 76);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(entry.customerPhone?.trim() || "No phone recorded", 20, 82);
  doc.setFont("helvetica", "bold");
  doc.text(paymentLabel(entry.paymentMethod), 130, 77);
  if (entry.paymentMethod === "credit") {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(124, 74, 0);
    doc.text("Outstanding / credit sale", 130, 82);
  }
  autoTable(doc, {
    startY: 95,
    head: [["Seedling variety", "Quantity", "Unit price", "Line total"]],
    body: [[entry.varietyName, Number(entry.quantity).toLocaleString("en-KE"), money(entry.unitPriceCents), money(entry.totalAmountCents)]],
    theme: "grid",
    margin: { left: 15, right: 15, bottom: 24 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: [35, 48, 39], lineColor: [225, 232, 226], lineWidth: 0.2 },
    headStyles: { fillColor: [20, 83, 45], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 248] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
  });
  const finalY = (doc as any).lastAutoTable?.finalY ?? 115;
  doc.setFillColor(240, 247, 241);
  doc.roundedRect(120, finalY + 8, 75, 22, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 99, 85);
  doc.setFontSize(9);
  doc.text("TOTAL PAID / RECORDED", 125, finalY + 16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 83, 45);
  doc.setFontSize(14);
  doc.text(money(entry.totalAmountCents), 190, finalY + 25, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 105);
  doc.setFontSize(9);
  doc.text("Thank you for supporting our nursery.", 15, Math.min(finalY + 24, 260));
  doc.setFontSize(8);
  doc.text(`Recorded at: ${entry.createdAt ? new Date(entry.createdAt).toLocaleString("en-KE") : "Not available"}`, 15, Math.min(finalY + 31, 267));
  addFooter(doc, brand);
  doc.save(`nursery-receipt-${safeFilePart(customerName)}-${entry.businessDate}-${entry.id.slice(0, 8)}.pdf`);
}

export function downloadNurseryStatement(entries: NurseryPdfEntry[], brand: PdfBrand, customerName: string, customerPhone: string, from: string, to: string) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const title = "CUSTOMER PURCHASE STATEMENT";
  addBrandHeader(doc, brand, title, `Statement period: ${dateLabel(from)} to ${dateLabel(to)}`);
  addWatermark(doc, brand.shopName);
  const totalQuantity = entries.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0);
  const totalCents = entries.reduce((sum, entry) => sum + Number(entry.totalAmountCents || 0), 0);
  const creditCents = entries.filter(entry => entry.paymentMethod === "credit").reduce((sum, entry) => sum + Number(entry.totalAmountCents || 0), 0);
  doc.setFillColor(246, 249, 246);
  doc.roundedRect(15, 61, 180, 25, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 105);
  doc.text("CUSTOMER", 20, 69);
  doc.text("CONTACT", 110, 69);
  doc.setFontSize(10);
  doc.setTextColor(24, 35, 28);
  doc.text((customerName || "Customer").slice(0, 42), 20, 77);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text((customerPhone || "Not recorded").slice(0, 35), 110, 77);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 105);
  doc.text(`${entries.length.toLocaleString()} line items • ${totalQuantity.toLocaleString()} seedlings`, 20, 82);
  autoTable(doc, {
    startY: 94,
    head: [["Sale date", "Seedling variety", "Qty", "Unit price", "Total", "Payment"]],
    body: entries.map(entry => [dateLabel(entry.businessDate), entry.varietyName, Number(entry.quantity).toLocaleString("en-KE"), money(entry.unitPriceCents), money(entry.totalAmountCents), paymentLabel(entry.paymentMethod)]),
    theme: "grid",
    margin: { left: 15, right: 15, bottom: 26 },
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 2.7, textColor: [35, 48, 39], lineColor: [225, 232, 226], lineWidth: 0.2, overflow: "linebreak" },
    headStyles: { fillColor: [20, 83, 45], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 250, 248] },
    columnStyles: { 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
    didDrawPage: () => addWatermark(doc, brand.shopName),
  });
  const finalY = (doc as any).lastAutoTable?.finalY ?? 110;
  if (finalY > 235) doc.addPage();
  const summaryY = finalY > 235 ? 24 : finalY + 9;
  doc.setFillColor(240, 247, 241);
  doc.roundedRect(110, summaryY, 85, 31, 3, 3, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80, 99, 85);
  doc.text("TOTAL RECORDED VALUE", 115, summaryY + 8);
  doc.text("Credit sales within period", 115, summaryY + 21);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 83, 45);
  doc.text(money(totalCents), 190, summaryY + 15, { align: "right" });
  doc.setFontSize(9);
  doc.setTextColor(124, 74, 0);
  doc.text(money(creditCents), 190, summaryY + 25, { align: "right" });
  addFooter(doc, brand);
  doc.save(`nursery-statement-${safeFilePart(customerName)}-${from}-to-${to}.pdf`);
}
