import { customFetch } from "@workspace/api-client-react";
import { format, differenceInDays } from "date-fns";
import { toast } from "sonner";
import {
  drawPdfStamp,
  drawPdfWatermark,
  getPdfShopLogoAssets,
  loadPdfStampLogo,
} from "@/lib/pdf-stamp";
import {
  type CustomerGroup,
  compactDebtProductSummary,
  debtCredit,
  debtHasEffectivePaymentHistory,
  debtPdfAmountPaid,
  debtPdfBalanceDue,
  debtPdfTotalPaid,
  debtProductSummary,
} from "@/lib/debt-utils";

export async function downloadDebtPdf(debtId: string, shopId: string) {
  toast.loading("Generating statement…", { id: "debt-pdf" });
  try {
    const [shopsData, debt] = await Promise.all([
      customFetch<any[]>("/api/shops"),
      customFetch<any>(`/api/debts/${debtId}`),
    ]);
    const shops: any[] = Array.isArray(shopsData) ? shopsData : [];
    const shop =
      shops.find((s: any) => s.id === shopId) ??
      shops.find((s: any) => s.id === debt?.shopId) ??
      shops[0] ?? { name: "GreenLink", id: shopId };
    if (debt?.status === "cancelled") {
      toast.error("No current debt record is available for a statement.", {
        id: "debt-pdf",
      });
      return;
    }
    const payments: any[] = debt?.payments ?? [];
    const items: any[] = debt?.items ?? [];
    const productSummary = debtProductSummary(items);
    const balanceDue = debtPdfBalanceDue(debt);
    const customerCredit = debtCredit(debt);
    const totalPaid = debtPdfAmountPaid(debt);
    const openedDate = format(new Date(debt?.createdAt), "dd MMM yyyy");
    const daysOpen = differenceInDays(new Date(), new Date(debt?.createdAt));
    const generatedAt = format(new Date(), "dd MMM yyyy, h:mm a");

    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const ML = 16,
      MR = 16;
    const CW = W - ML - MR;

    type RGB = [number, number, number];
    const GREEN: RGB = [5, 150, 105];
    const GRNLT: RGB = [209, 250, 229];
    const SLATE: RGB = [30, 41, 59];
    const WHITE: RGB = [255, 255, 255];
    const LGRAY: RGB = [248, 250, 252];
    const MGRAY: RGB = [100, 116, 139];
    const BORD: RGB = [226, 232, 240];
    const RED: RGB = [220, 38, 38];
    const ORANGE: RGB = [234, 88, 12];

    const isPaid = debt?.status === "paid";
    const isPartial = debt?.status === "partial";
    const statusColor: RGB = isPaid ? GREEN : isPartial ? ORANGE : RED;
    const statusLabel = isPaid
      ? customerCredit > 0
        ? "PAID IN FULL · CREDIT"
        : "PAID IN FULL"
      : isPartial
        ? "PARTIALLY PAID"
        : "OUTSTANDING";
    const stampSize = 32;
    const stampX = W - MR - stampSize;
    const stampY = H - 49;

    const shopLogoAssets = getPdfShopLogoAssets(shop?.id ?? shopId);
    const logoUrl = shopLogoAssets.header;
    let logoBase64 = "";
    let logoNatW = 0;
    let logoNatH = 0;
    try {
      const resp = await fetch(logoUrl);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          logoNatW = img.naturalWidth;
          logoNatH = img.naturalHeight;
          resolve();
        };
        img.onerror = () => resolve();
        img.src = blobUrl;
      });
      URL.revokeObjectURL(blobUrl);
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      /* logo optional */
    }
    const stampLogoBase64 = await loadPdfStampLogo(shopLogoAssets.seal);

    function drawHeader(isFirst: boolean) {
      if (isFirst) {
        doc.setFillColor(...WHITE);
        doc.rect(0, 0, W, H, "F");
      }
      doc.setFillColor(...GREEN);
      doc.rect(0, 0, W, 3, "F");

      if (isFirst) {
        const LOGO_H = 18;
        if (logoBase64 && logoNatW > 0) {
          const scale = Math.min(40 / logoNatW, LOGO_H / logoNatH);
          const dW = logoNatW * scale,
            dH = logoNatH * scale;
          doc.addImage(logoBase64, "JPEG", ML, 7, dW, dH);
        }
        const brandTextX = ML + 22;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(...SLATE);
        doc.text(shop?.name ?? "Our Shop", brandTextX, 12, { maxWidth: 104 });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(...MGRAY);
        let sx = 17;
        if (shop?.address) {
          doc.text(shop.address, brandTextX, sx, { maxWidth: 104 });
          sx += 4;
        }
        if (shop?.ownerWhatsapp) {
          doc.text(shop.ownerWhatsapp, brandTextX, sx, { maxWidth: 104 });
          sx += 4;
        }
        if (shop?.email) {
          doc.text(shop.email, brandTextX, sx, { maxWidth: 104 });
        }

        const headerRight = W - MR;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...GREEN);
        doc.text("DEBT STATEMENT", headerRight, 10, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(...SLATE);
        doc.text(
          `#${(debt?.id ?? "").slice(0, 8).toUpperCase()}`,
          headerRight,
          18,
          { align: "right" },
        );
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MGRAY);
        doc.text(`Generated: ${generatedAt}`, headerRight, 23, {
          align: "right",
          maxWidth: 36,
        });

        doc.setDrawColor(...BORD);
        doc.setLineWidth(0.4);
        doc.line(ML, 28, W - MR, 28);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MGRAY);
        const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
        doc.text(
          `${shop?.name ?? ""}  ·  #${(debt?.id ?? "").slice(0, 8).toUpperCase()}  ·  ${debt?.customerName ?? ""}  ·  continued`,
          ML,
          9,
        );
        doc.text(`Page ${pg}`, W - MR, 9, { align: "right" });
        doc.setDrawColor(...BORD);
        doc.setLineWidth(0.3);
        doc.line(ML, 12, W - MR, 12);
      }

      doc.setFillColor(...WHITE);
      doc.setTextColor(0, 0, 0);
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
    }

    function drawFooter() {
      doc.setDrawColor(...BORD);
      doc.setLineWidth(0.3);
      doc.line(ML, H - 12, W - MR, H - 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...MGRAY);
      doc.text(
        "This statement is generated for record-keeping purposes only.",
        ML,
        H - 7,
      );
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...GREEN);
      doc.text(shop?.name ?? "", W - MR, H - 7, { align: "right" });
    }

    function sectionLabel(sy: number, label: string) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...GREEN);
      doc.text(label, ML, sy);
      doc.setDrawColor(...GRNLT);
      doc.setLineWidth(0.6);
      doc.line(ML, sy + 1.5, W - MR, sy + 1.5);
    }

    drawHeader(true);
    let y = 34;

    const LBW = (CW - 5) / 2;
    const RBW = CW - LBW - 5;
    const LBX = ML,
      RBX = ML + LBW + 5;
    const CARD_H = customerCredit > 0 ? 43 : 36;

    doc.setFillColor(...LGRAY);
    doc.setDrawColor(...BORD);
    doc.setLineWidth(0.3);
    doc.roundedRect(LBX, y, LBW, CARD_H, 1.5, 1.5, "FD");
    doc.setFillColor(...GREEN);
    doc.roundedRect(LBX, y, 3.5, CARD_H, 1.5, 1.5, "F");
    doc.rect(LBX + 3.5, y, 3, CARD_H, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MGRAY);
    doc.text("CUSTOMER", LBX + 8, y + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...SLATE);
    doc.text(debt?.customerName ?? "—", LBX + 8, y + 16, {
      maxWidth: LBW - 12,
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MGRAY);
    if (debt?.customerPhone) {
      doc.text(debt.customerPhone, LBX + 8, y + 23);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MGRAY);
    doc.text(`Opened: ${openedDate}  ·  ${daysOpen}d ago`, LBX + 8, y + 29);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...statusColor);
    doc.text(`● ${statusLabel}`, LBX + 8, y + 35);

    doc.setFillColor(...GRNLT);
    doc.setDrawColor(167, 243, 208);
    doc.setLineWidth(0.3);
    doc.roundedRect(RBX, y, RBW, CARD_H, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...GREEN);
    doc.text("DEBT SUMMARY", RBX + 6, y + 7);

    const summaryRows = [
      {
        label: "Total Debt",
        value: `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`,
        color: SLATE,
      },
      {
        label: "Amount Paid",
        value: `KES ${totalPaid.toLocaleString("en-KE")}`,
        color: GREEN,
      },
      {
        label: balanceDue <= 0.005 ? "Paid in Full" : "Balance Due",
        value: `KES ${balanceDue.toLocaleString("en-KE")}`,
        color: isPaid ? GREEN : statusColor,
      },
      ...(customerCredit > 0
        ? [
            {
              label: "Customer Credit",
              value: `KES ${customerCredit.toLocaleString("en-KE")}`,
              color: GREEN,
            },
          ]
        : []),
    ];
    const summaryGap = customerCredit > 0 ? 6 : 7.5;
    summaryRows.forEach((row, i) => {
      const ry = y + 14 + i * summaryGap;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MGRAY);
      doc.text(row.label, RBX + 6, ry);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...(row.color as RGB));
      doc.text(row.value, RBX + RBW - 5, ry, { align: "right" });
    });

    y += CARD_H + 10;

    if (items.length > 0) {
      sectionLabel(y, "ITEMS — LINKED SALE");
      y += 6;
      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR, bottom: 16 },
        showHead: "firstPage",
        head: [["#", "Product / Description", "Qty", "Unit Price (KES)", "Total (KES)"]],
        body: items.map((it: any, i: number) => [
          String(i + 1),
          it.productName ?? it.name ?? "—",
          String(it.qty ?? it.quantity ?? 1),
          Number(it.unitPrice ?? 0).toLocaleString("en-KE"),
          Number(it.totalPrice ?? it.total ?? 0).toLocaleString("en-KE"),
        ]),
        headStyles: {
          fillColor: SLATE,
          textColor: WHITE,
          fontStyle: "bold",
          fontSize: 7.5,
          cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
        },
        bodyStyles: {
          fillColor: false,
          fontSize: 8,
          cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
          textColor: SLATE,
          lineColor: BORD,
          lineWidth: 0.2,
        },
        alternateRowStyles: { fillColor: false },
        columnStyles: {
          0: {
            cellWidth: 14,
            halign: "center",
            fontStyle: "bold",
            textColor: MGRAY,
          },
          1: { cellWidth: "auto" },
          2: { cellWidth: 14, halign: "right" },
          3: { cellWidth: 36, halign: "right", textColor: MGRAY },
          4: {
            cellWidth: 38,
            halign: "right",
            fontStyle: "bold",
            textColor: GREEN,
          },
        },
        tableLineColor: BORD,
        tableLineWidth: 0.2,
        didDrawPage: (data: any) => {
          if (data.pageNumber > 1) drawHeader(false);
        },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    sectionLabel(y, "PAYMENT HISTORY");
    y += 6;

    type HistRow = { cells: string[]; isOpened: boolean; isCredit?: boolean };
    const histRows: HistRow[] = [];
    histRows.push({
      cells: [
        format(new Date(debt?.createdAt), "dd MMM yyyy, HH:mm"),
        "System",
        productSummary,
        "Debt Opened",
        `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`,
        `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`,
      ],
      isOpened: true,
    });
    let running = debt?.totalAmount ?? 0;
    const reversedPaymentIds = new Set(
      payments
        .filter((p: any) => p.paymentType === "reversal" && p.reversalOfId)
        .map((p: any) => p.reversalOfId),
    );
    const printablePayments = payments.filter(
      (p: any) =>
        p.paymentType !== "reversal" &&
        Number(p.amount) >= 0 &&
        !reversedPaymentIds.has(p.id),
    );
    for (const p of printablePayments) {
      const paymentAmount = Number(p.amount || 0);
      const creditCreated = Math.max(0, paymentAmount - Math.max(0, running));
      running -= paymentAmount;
      histRows.push({
        cells: [
          format(new Date(p.paidAt), "dd MMM yyyy, HH:mm"),
          p.recordedBy || "—",
          productSummary,
          p.paymentType === "credit_applied"
            ? "Customer credit applied"
            : `Payment Received${p.note ? ` · ${p.note}` : ""}`,
          `KES ${paymentAmount.toLocaleString("en-KE")}`,
          `KES ${Math.max(0, running).toLocaleString("en-KE")}`,
        ],
        isOpened: false,
      });
      if (creditCreated > 0) {
        histRows.push({
          cells: [
            format(new Date(p.paidAt), "dd MMM yyyy, HH:mm"),
            p.recordedBy || "—",
            productSummary,
            "Customer credit carried forward",
            `KES ${creditCreated.toLocaleString("en-KE")}`,
            `KES ${creditCreated.toLocaleString("en-KE")} credit`,
          ],
          isOpened: false,
          isCredit: true,
        });
      }
    }
    if (isPaid && !debtHasEffectivePaymentHistory(debt)) {
      histRows.push({
        cells: [
          format(new Date(debt?.paidAt ?? debt?.createdAt), "dd MMM yyyy, HH:mm"),
          "System",
          productSummary,
          "Marked paid (payment details unavailable)",
          `KES ${debtPdfAmountPaid(debt).toLocaleString("en-KE")}`,
          "KES 0",
        ],
        isOpened: false,
      });
    } else if (histRows.length === 1) {
      histRows.push({
        cells: ["—", "—", productSummary, "No payments recorded yet", "—", "—"],
        isOpened: false,
      });
    }

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR, bottom: 16 },
      showHead: "firstPage",
      head: [
        ["Date & Time", "Recorded By", "Product", "Entry", "Amount (KES)", "Balance (KES)"],
      ],
      body: histRows.map((r) => r.cells),
      headStyles: {
        fillColor: SLATE,
        textColor: WHITE,
        fontStyle: "bold",
        fontSize: 7.5,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      },
      bodyStyles: {
        fillColor: false,
        fontSize: 8,
        cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
        textColor: SLATE,
        lineColor: BORD,
        lineWidth: 0.2,
      },
      alternateRowStyles: { fillColor: false },
      columnStyles: {
        0: { cellWidth: 31 },
        1: { cellWidth: 24 },
        2: { cellWidth: 34 },
        3: { cellWidth: "auto" },
        4: { cellWidth: 32, halign: "right" },
        5: { cellWidth: 32, halign: "right", fontStyle: "bold" },
      },
      didParseCell: (data: any) => {
        if (data.section !== "body") return;
        const row = histRows[data.row.index];
        if (!row) return;
        if (row.isCredit) {
          data.cell.styles.textColor = GREEN;
          data.cell.styles.fontStyle = "bold";
        } else if (row.isOpened) {
          data.cell.styles.textColor = [100, 116, 139];
          data.cell.styles.fontStyle = "italic";
        } else if (data.column.index === 4) {
          data.cell.styles.textColor = GREEN;
          data.cell.styles.fontStyle = "bold";
        } else if (data.column.index === 5) {
          data.cell.styles.textColor = isPaid ? GREEN : statusColor;
        }
      },
      didDrawPage: (data: any) => {
        if (data.pageNumber > 1) drawHeader(false);
      },
      tableLineColor: BORD,
      tableLineWidth: 0.2,
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    const BS_H = 18;
    if (y + BS_H > stampY - 4) {
      doc.addPage();
      drawHeader(false);
      y = 18;
    }

    const summaryW = CW;
    doc.setFillColor(...LGRAY);
    doc.setDrawColor(...BORD);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, summaryW, BS_H, 2, 2, "FD");
    doc.setFillColor(...GREEN);
    doc.roundedRect(ML, y, 4, BS_H, 2, 2, "F");
    doc.rect(ML + 4, y, 2, BS_H, "F");

    const cols3 = [
      {
        label: "TOTAL DEBT",
        value: `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`,
        vc: SLATE,
      },
      {
        label: "PAID",
        value: `KES ${totalPaid.toLocaleString("en-KE")}`,
        vc: GREEN,
      },
      {
        label: balanceDue <= 0.005 ? "PAID IN FULL" : "BALANCE DUE",
        value: `KES ${balanceDue.toLocaleString("en-KE")}`,
        vc: isPaid ? GREEN : statusColor,
      },
      ...(customerCredit > 0
        ? [
            {
              label: "CUSTOMER CREDIT",
              value: `KES ${customerCredit.toLocaleString("en-KE")}`,
              vc: GREEN,
            },
          ]
        : []),
    ];
    const colW = summaryW / cols3.length;
    cols3.forEach((col, i) => {
      const cx = ML + colW * i + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...GREEN);
      doc.text(col.label, cx, y + 6, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...(col.vc as RGB));
      doc.text(col.value, cx, y + 13, { align: "center" });
      if (i < cols3.length - 1) {
        doc.setDrawColor(...BORD);
        doc.setLineWidth(0.3);
        doc.line(ML + colW * (i + 1), y + 3, ML + colW * (i + 1), y + BS_H - 3);
      }
    });

    const numPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= numPages; p++) {
      doc.setPage(p);
      drawFooter();
    }
    const stampOptions = {
      shopName: shopLogoAssets.sealName,
      logoData: stampLogoBase64,
      status: statusLabel,
      dateLabel: format(new Date(), "dd MMM yyyy"),
      documentRef: `#${(debt?.id ?? "").slice(0, 8).toUpperCase()}`,
    };
    drawPdfWatermark(doc, stampOptions);
    doc.setPage(numPages);
    drawPdfStamp(doc, {
      x: stampX,
      y: stampY,
      size: stampSize,
      ...stampOptions,
    });

    const safeName = (debt?.customerName ?? "customer").replace(/[^a-z0-9]/gi, "_");
    doc.save(`DebtStatement_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`);
    toast.success("Statement downloaded!", { id: "debt-pdf" });
  } catch (err) {
    console.error("Debt PDF error:", err);
    toast.error("Failed to generate statement", { id: "debt-pdf" });
  }
}

export async function downloadCustomerPdf(
  group: CustomerGroup,
  shopId: string,
) {
  toast.loading("Generating customer statement…", { id: "customer-debt-pdf" });
  try {
    const currentDebts = group.debts.filter(
      (debt: any) => debt.status !== "cancelled",
    );
    if (currentDebts.length === 0) {
      toast.error("No current debt records are available for a statement.", {
        id: "customer-debt-pdf",
      });
      return;
    }
    const [shopsData, ...fetchedDetails] = await Promise.all([
      customFetch<any[]>("/api/shops"),
      ...currentDebts.map((d: any) => customFetch<any>(`/api/debts/${d.id}`)),
    ]);
    const details = fetchedDetails.filter(
      (debt: any) => debt?.status !== "cancelled",
    );
    if (details.length === 0) {
      toast.error("No current debt records are available for a statement.", {
        id: "customer-debt-pdf",
      });
      return;
    }
    const shop =
      (Array.isArray(shopsData) ? shopsData : []).find(
        (s: any) => s.id === shopId,
      ) ?? { name: "GreenLink" };
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const ML = 16,
      MR = 16,
      CW = W - ML - MR;
    const green: [number, number, number] = [5, 150, 105];
    const slate: [number, number, number] = [30, 41, 59];
    const muted: [number, number, number] = [100, 116, 139];
    const border: [number, number, number] = [226, 232, 240];
    const totalAmount = details.reduce(
      (s, d: any) => s + Number(d?.totalAmount || 0),
      0,
    );
    const totalBalance = details.reduce(
      (s, d: any) => s + debtPdfBalanceDue(d),
      0,
    );
    const totalCredit = details.reduce((s, d: any) => s + debtCredit(d), 0);
    const totalPaid = details.reduce((s, d: any) => s + debtPdfTotalPaid(d), 0);
    const money = (n: number) =>
      `KES ${Number(n || 0).toLocaleString("en-KE")}`;
    const status =
      totalBalance <= 0
        ? totalCredit > 0
          ? "PAID IN FULL · CREDIT"
          : "PAID IN FULL"
        : totalPaid > 0
          ? "PARTIALLY PAID"
          : "OUTSTANDING";
    const stampSize = 32;
    const stampX = W - MR - stampSize;
    const stampY = H - 49;

    const shopLogoAssets = getPdfShopLogoAssets(shop?.id ?? shopId);
    let logoBase64 = "";
    let logoNatW = 0;
    let logoNatH = 0;
    try {
      const response = await fetch(shopLogoAssets.header);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => {
          logoNatW = image.naturalWidth;
          logoNatH = image.naturalHeight;
          resolve();
        };
        image.onerror = () => resolve();
        image.src = blobUrl;
      });
      URL.revokeObjectURL(blobUrl);
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve("");
        reader.readAsDataURL(blob);
      });
    } catch {
      /* logo is optional */
    }
    const stampLogoBase64 = await loadPdfStampLogo(shopLogoAssets.seal);

    doc.setFillColor(...green);
    doc.rect(0, 0, W, 3, "F");
    if (logoBase64 && logoNatW > 0 && logoNatH > 0) {
      const logoH = 14;
      const scale = Math.min(28 / logoNatW, logoH / logoNatH);
      doc.addImage(
        logoBase64,
        "JPEG",
        ML,
        6,
        logoNatW * scale,
        logoNatH * scale,
      );
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...slate);
    doc.text(shop.name || "GreenLink", ML + 32, 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...green);
    const headerRight = W - MR;
    doc.text("CUSTOMER DEBT STATEMENT", headerRight, 12, {
      align: "right",
      maxWidth: 44,
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...muted);
    doc.text(
      `Generated ${format(new Date(), "dd MMM yyyy, HH:mm")}`,
      headerRight,
      17,
      { align: "right", maxWidth: 44 },
    );
    doc.setDrawColor(...border);
    doc.line(ML, 23, W - MR, 23);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...slate);
    doc.text(group.customerName, ML, 34);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(group.customerPhone || "No phone number", ML, 40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...green);
    doc.text(status, W - MR, 35, { align: "right" });

    autoTable(doc, {
      startY: 47,
      margin: { left: ML, right: MR },
      head: [
        ["Debt Ref", "Date", "Products / Notes", "Status", "Total", "Paid", "Balance"],
      ],
      body: details.map((d: any) => [
        `#${String(d.id).slice(0, 8).toUpperCase()}`,
        format(new Date(d.createdAt), "dd MMM yyyy"),
        `${compactDebtProductSummary(d.items)}${d.notes ? ` · ${String(d.notes).slice(0, 42)}` : ""}`,
        d.status === "paid"
          ? debtCredit(d) > 0
            ? "PAID + CREDIT"
            : "PAID"
          : d.status === "partial"
            ? "PARTIAL"
            : "UNPAID",
        money(d.totalAmount),
        money(debtPdfAmountPaid(d)),
        money(debtPdfBalanceDue(d)),
      ]),
      headStyles: {
        fillColor: slate,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7,
      },
      bodyStyles: {
        fillColor: false,
        fontSize: 7.5,
        textColor: slate,
        lineColor: border,
        lineWidth: 0.2,
      },
      alternateRowStyles: { fillColor: false },
      columnStyles: {
        0: { cellWidth: 23 },
        1: { cellWidth: 27 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 22, fontStyle: "bold" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 28, halign: "right" },
        6: { cellWidth: 31, halign: "right", fontStyle: "bold" },
      },
    });

    let y = (doc as any).lastAutoTable.finalY + 10;

    const itemRows = details.flatMap((d: any) =>
      (d.items || []).map((item: any) => [
        `#${String(d.id).slice(0, 8).toUpperCase()}`,
        item.productName ?? item.name ?? "—",
        String(item.qty ?? item.quantity ?? 1),
        money(item.unitPrice),
        money(item.totalPrice ?? item.total),
      ]),
    );
    if (itemRows.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...green);
      doc.text("ITEMS TAKEN — ALL DEBT RECORDS", ML, y);
      y += 5;
      autoTable(doc, {
        startY: y,
        margin: { left: ML, right: MR },
        head: [["Debt Ref", "Product / Description", "Qty", "Unit Price", "Total"]],
        body: itemRows,
        headStyles: {
          fillColor: slate,
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7,
        },
        bodyStyles: {
          fillColor: false,
          fontSize: 7.5,
          textColor: slate,
          lineColor: border,
          lineWidth: 0.2,
        },
        alternateRowStyles: { fillColor: false },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 18, halign: "right" },
          3: { cellWidth: 32, halign: "right" },
          4: { cellWidth: 32, halign: "right", fontStyle: "bold" },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...green);
    doc.text("PAYMENT HISTORY", ML, y);
    y += 5;
    const paymentRows = details.flatMap((d: any) => {
      const reversedPaymentIds = new Set(
        (d.payments || [])
          .filter((p: any) => p.paymentType === "reversal" && p.reversalOfId)
          .map((p: any) => p.reversalOfId),
      );
      const printablePayments = (d.payments || []).filter(
        (p: any) =>
          p.paymentType !== "reversal" &&
          Number(p.amount) >= 0 &&
          !reversedPaymentIds.has(p.id),
      );
      if (printablePayments.length === 0 && d.status === "paid") {
        return [
          [
            format(new Date(d.paidAt ?? d.createdAt), "dd MMM yyyy, HH:mm"),
            `#${String(d.id).slice(0, 8).toUpperCase()}`,
            compactDebtProductSummary(d.items),
            "Marked paid (payment details unavailable)",
            "—",
            money(debtPdfAmountPaid(d)),
          ],
        ];
      }
      let running = Number(d.totalAmount || 0);
      return printablePayments.flatMap((p: any) => {
        const paymentAmount = Number(p.amount || 0);
        const creditCreated = Math.max(0, paymentAmount - Math.max(0, running));
        running -= paymentAmount;
        const rows = [
          [
            format(new Date(p.paidAt), "dd MMM yyyy, HH:mm"),
            `#${String(d.id).slice(0, 8).toUpperCase()}`,
            compactDebtProductSummary(d.items),
            p.paymentType === "credit_applied"
              ? "Customer credit applied"
              : `Payment received${p.note ? ` · ${p.note}` : ""}`,
            p.recordedBy || "—",
            money(paymentAmount),
          ],
        ];
        if (creditCreated > 0) {
          rows.push([
            format(new Date(p.paidAt), "dd MMM yyyy, HH:mm"),
            `#${String(d.id).slice(0, 8).toUpperCase()}`,
            compactDebtProductSummary(d.items),
            "Customer credit carried forward",
            p.recordedBy || "—",
            money(creditCreated),
          ]);
        }
        return rows;
      });
    });
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [
        ["Date & Time", "Debt Ref", "Products", "Entry", "Recorded By", "Amount"],
      ],
      body: paymentRows.length
        ? paymentRows
        : [["—", "—", "—", "No payments recorded", "—", "—"]],
      headStyles: {
        fillColor: slate,
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7,
      },
      bodyStyles: {
        fillColor: false,
        fontSize: 7.5,
        textColor: slate,
        lineColor: border,
        lineWidth: 0.2,
      },
      alternateRowStyles: { fillColor: false },
      columnStyles: {
        0: { cellWidth: 31 },
        1: { cellWidth: 22 },
        2: { cellWidth: 34 },
        3: { cellWidth: "auto" },
        4: { cellWidth: 27 },
        5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
    const summaryHeight = 20;
    const summaryWidth = CW;
    if (y + summaryHeight > stampY - 4) {
      doc.addPage();
      const pageNumber = (doc as any).internal.getNumberOfPages();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...green);
      doc.text("CUSTOMER DEBT STATEMENT — SUMMARY", ML, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      doc.text(`Page ${pageNumber}`, W - MR, 12, { align: "right" });
      doc.setDrawColor(...border);
      doc.line(ML, 16, W - MR, 16);
      y = 22;
    }
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(...border);
    doc.roundedRect(ML, y, summaryWidth, summaryHeight, 2, 2, "FD");
    const summary = [
      ["TOTAL DEBT", money(totalAmount)],
      ["TOTAL PAID", money(totalPaid)],
      [totalBalance <= 0.005 ? "PAID IN FULL" : "BALANCE DUE", money(totalBalance)],
      ...(totalCredit > 0 ? [["CUSTOMER CREDIT", money(totalCredit)]] : []),
    ];
    summary.forEach(([label, value], i) => {
      const colW = summaryWidth / summary.length;
      const x = ML + colW * i + colW / 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6);
      doc.setTextColor(...green);
      doc.text(label, x, y + 7, { align: "center" });
      const valueColor: [number, number, number] =
        label === "BALANCE DUE" && totalBalance > 0
          ? [220, 38, 38]
          : i === 1 || label === "CUSTOMER CREDIT" || label === "PAID IN FULL"
            ? green
            : slate;
      doc.setFontSize(9);
      doc.setTextColor(...valueColor);
      doc.text(value, x, y + 14, { align: "center" });
    });
    doc.setDrawColor(...border);
    doc.line(ML, H - 13, W - MR, H - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(
      "This statement shows the customer's current debt balances, payments, and credit.",
      ML,
      H - 8,
    );
    const pageCount = (doc as any).internal.getNumberOfPages();
    const stampOptions = {
      shopName: shopLogoAssets.sealName,
      logoData: stampLogoBase64,
      status,
      dateLabel: format(new Date(), "dd MMM yyyy"),
      documentRef: "CUSTOMER STATEMENT",
    };
    drawPdfWatermark(doc, stampOptions);
    doc.setPage(pageCount);
    drawPdfStamp(doc, {
      x: stampX,
      y: stampY,
      size: stampSize,
      ...stampOptions,
    });
    const safeName = group.customerName.replace(/[^a-z0-9]/gi, "_");
    doc.save(
      `CustomerDebtStatement_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`,
    );
    toast.success("Customer statement downloaded!", { id: "customer-debt-pdf" });
  } catch (err) {
    console.error("Customer debt PDF error:", err);
    toast.error("Failed to generate customer statement", {
      id: "customer-debt-pdf",
    });
  }
}
