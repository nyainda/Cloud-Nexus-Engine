import { format } from "date-fns";

/**
 * Opens a styled receipt in a new tab and auto-triggers the browser print dialog.
 * Works for both cash sales and debt records.
 * The receipt window is self-contained HTML (logo embedded as data-URL) so it
 * prints cleanly even if the tab is closed immediately after printing.
 */
export async function printSaleReceipt(sale: any): Promise<void> {
  const shopName = localStorage.getItem("greenlink_shopName") || "GreenLink";
  const shopId   = localStorage.getItem("greenlink_shopId")   || "";
  const items = (sale.items || []) as any[];
  const isDebt = sale.saleType === "debt";
  const isBank = !isDebt && sale.paymentMethod === "bank";
  const payLabel = isDebt ? "Credit / Debt" : isBank ? "M-Pesa / Bank" : "Cash";
  const payColor = isDebt ? "#d97706" : isBank ? "#2563eb" : "#059669";
  const saleDate = format(new Date(sale.createdAt), "d MMM yyyy");
  const saleTime = format(new Date(sale.createdAt), "h:mm a");
  const refNum = (sale.id || "").slice(0, 8).toUpperCase() || "—";

  // ── Load shop logo as data-URL ──────────────────────────────────────────────
  const shopIsGreenlink = !shopId.includes("sunrise") && !shopName.toLowerCase().includes("sunrise");
  const logoUrl = shopIsGreenlink ? "/logo-greenlink.jpg" : "/logo-sunrise.jpg";
  let logoDataUrl = "";
  try {
    const resp = await fetch(logoUrl);
    if (resp.ok) {
      const blob = await resp.blob();
      logoDataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    }
  } catch { /* logo is optional */ }

  const logoImg = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="${shopName}" class="shop-logo" />`
    : "";

  const itemRows = items.map((it: any, i: number) => `
    <tr class="${i % 2 === 1 ? "alt" : ""}">
      <td class="num idx">${i + 1}</td>
      <td class="name">${it.productName ?? "—"}</td>
      <td class="num">${it.qty}</td>
      <td class="num">KES ${Number(it.unitPrice ?? 0).toLocaleString("en-KE")}</td>
      <td class="num bold">KES ${Number(it.totalPrice ?? 0).toLocaleString("en-KE")}</td>
    </tr>`).join("");

  const discountRow = sale.discount > 0
    ? `<div class="total-row"><span class="label muted">Discount</span><span class="value red">- KES ${Number(sale.discount).toLocaleString("en-KE")}</span></div>`
    : "";

  const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>Receipt ${refNum} — ${shopName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 600px; margin: 0 auto; padding: 0 0 48px; }

  /* Top accent bar */
  .top-bar { height: 5px; background: linear-gradient(90deg, #059669 0%, #10b981 100%); }

  /* Header */
  .header { display: flex; justify-content: space-between; align-items: center; padding: 24px 32px 20px; border-bottom: 1.5px solid #e2e8f0; }
  .brand-block { display: flex; align-items: center; gap: 12px; }
  .shop-logo { height: 48px; width: auto; object-fit: contain; border-radius: 6px; }
  .shop-text .shop-name { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.4px; }
  .shop-text .shop-sub { font-size: 10px; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.8px; }
  .doc-meta { text-align: right; }
  .doc-type { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #059669; }
  .doc-ref { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 2px; letter-spacing: -0.5px; }
  .doc-date { font-size: 11px; color: #64748b; margin-top: 3px; }

  /* Info strip */
  .info-strip { display: flex; gap: 0; padding: 0 32px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
  .info-item { padding: 14px 0; padding-right: 28px; }
  .info-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #94a3b8; margin-bottom: 4px; }
  .info-value { font-size: 12px; font-weight: 600; color: #0f172a; }
  .info-item.right { margin-left: auto; padding-right: 0; text-align: right; }
  .pay-badge { display: inline-block; padding: 3px 11px; border-radius: 20px; font-size: 11px; font-weight: 700; background: ${payColor}15; color: ${payColor}; border: 1px solid ${payColor}35; }

  /* Customer block for debt */
  .customer-block { margin: 0 32px 0; background: #fffbeb; border: 1px solid #fde68a; border-top: none; padding: 10px 14px; display: flex; align-items: center; gap: 10px; }
  .customer-block .lbl { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #d97706; }
  .customer-block .val { font-size: 13px; font-weight: 700; color: #0f172a; }

  /* Items table */
  .items-section { margin: 20px 32px 0; }
  .section-title { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.8px; color: #059669; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
  thead tr { background: #1e293b; color: #fff; }
  thead th { padding: 9px 10px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  th.name, td.name { text-align: left; }
  th.num, td.num { text-align: right; }
  th.idx, td.idx { text-align: center; width: 32px; }
  td { padding: 9px 10px; font-size: 11.5px; color: #0f172a; border-bottom: 1px solid #f1f5f9; }
  tr:last-child td { border-bottom: none; }
  tr.alt td { background: #f8fafc; }
  td.bold { font-weight: 700; color: #059669; }
  td.idx { color: #94a3b8; font-size: 10px; font-weight: 600; }

  /* Totals */
  .totals { margin: 14px 32px 0; border-top: 2px solid #e2e8f0; padding-top: 12px; }
  .total-row { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; }
  .total-row.grand { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin-top: 8px; }
  .label { font-size: 12px; color: #64748b; }
  .value { font-size: 12px; font-weight: 600; color: #0f172a; }
  .label.muted { color: #94a3b8; font-size: 11px; }
  .value.red { color: #dc2626; }
  .grand .label { font-size: 14px; font-weight: 800; color: #0f172a; }
  .grand .value { font-size: 18px; font-weight: 800; color: #059669; font-family: "Courier New", monospace; }

  /* Footer */
  .footer { margin: 32px 32px 0; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; }
  .footer .thanks { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 4px; }
  .footer .sub { font-size: 11px; color: #94a3b8; }
  .footer .brand { font-size: 9px; font-weight: 700; color: #059669; margin-top: 14px; letter-spacing: 1px; text-transform: uppercase; }

  @media print {
    body { background: #fff; }
    .page { padding-bottom: 32px; }
    @page { margin: 8mm; size: A5; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="top-bar"></div>

  <div class="header">
    <div class="brand-block">
      ${logoImg}
      <div class="shop-text">
        <div class="shop-name">${shopName}</div>
        <div class="shop-sub">Official Receipt</div>
      </div>
    </div>
    <div class="doc-meta">
      <div class="doc-type">Receipt</div>
      <div class="doc-ref">#${refNum}</div>
      <div class="doc-date">${saleDate} &nbsp;·&nbsp; ${saleTime}</div>
    </div>
  </div>

  <div class="info-strip">
    <div class="info-item">
      <div class="info-label">Payment</div>
      <div class="info-value"><span class="pay-badge">${payLabel}</span></div>
    </div>
    ${sale.servedBy ? `<div class="info-item"><div class="info-label">Served by</div><div class="info-value">${sale.servedBy}</div></div>` : ""}
    <div class="info-item right">
      <div class="info-label">Total Amount</div>
      <div class="info-value" style="font-size:18px;color:#059669;font-weight:800;font-family:'Courier New',monospace">KES ${Number(sale.totalAmount ?? 0).toLocaleString("en-KE")}</div>
    </div>
  </div>

  ${isDebt && sale.debtCustomerName ? `<div class="customer-block"><div><div class="lbl">Credit Customer</div><div class="val">${sale.debtCustomerName}</div></div></div>` : ""}

  <div class="items-section">
    <div class="section-title">Items Purchased</div>
    <table>
      <thead><tr>
        <th class="idx">#</th>
        <th class="name">Item</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Total</th>
      </tr></thead>
      <tbody>${itemRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:20px">No items</td></tr>'}</tbody>
    </table>
  </div>

  <div class="totals">
    ${discountRow}
    <div class="total-row grand">
      <span class="label">Total</span>
      <span class="value">KES ${Number(sale.totalAmount ?? 0).toLocaleString("en-KE")}</span>
    </div>
  </div>

  <div class="footer">
    <div class="thanks">Thank you for your business!</div>
    <div class="sub">Keep this receipt as proof of purchase.</div>
    <div class="brand">${shopName} &nbsp;·&nbsp; Powered by GreenLink OS</div>
  </div>
</div>
<script>window.onload = () => { window.print(); };</script>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
}
