import { format } from "date-fns";

/**
 * Opens a thermal-printer-safe receipt in a new tab and auto-triggers print.
 *
 * Designed for 80 mm roll printers (e.g. Epson XP-80C / TM-T20 family).
 * Rules:
 *   • NO coloured backgrounds — thermal paper is white; dark fills print as
 *     solid black blocks and coloured areas are invisible.
 *   • NO white text — it disappears against white paper.
 *   • Structure via borders, bold, and spacing — NOT via background fills.
 *   • Page size: 80 mm wide, height auto so it matches the roll.
 */
export async function printSaleReceipt(sale: any): Promise<void> {
  const shopName = localStorage.getItem("greenlink_shopName") || "GreenLink";
  const shopId   = localStorage.getItem("greenlink_shopId")   || "";
  const items    = (sale.items || []) as any[];
  const isDebt   = sale.saleType === "debt";
  const isBank   = !isDebt && sale.paymentMethod === "bank";
  const payLabel = isDebt ? "Credit / Debt" : isBank ? "M-Pesa / Bank" : "Cash";
  const saleDate = format(new Date(sale.createdAt), "d MMM yyyy");
  const saleTime = format(new Date(sale.createdAt), "h:mm a");
  const refNum   = (sale.id || "").slice(0, 8).toUpperCase() || "—";

  // ── Load shop logo as data-URL (optional — graceful fallback) ───────────────
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
    ? `<img src="${logoDataUrl}" alt="${shopName}" style="height:48px;width:auto;object-fit:contain;display:block;margin:0 auto 6px;" />`
    : "";

  // ── Item rows — plain black text, alternating light rule only ───────────────
  const itemRows = items.map((it: any, i: number) => `
    <tr>
      <td class="tc idx">${i + 1}</td>
      <td class="tl name">${it.productName ?? "—"}</td>
      <td class="tr num">${it.qty}</td>
      <td class="tr num">${Number(it.unitPrice ?? 0).toLocaleString("en-KE")}</td>
      <td class="tr num bold">${Number(it.totalPrice ?? 0).toLocaleString("en-KE")}</td>
    </tr>`).join("");

  const discountRow = (sale.discount ?? 0) > 0
    ? `<tr class="subtotal-row"><td colspan="4" class="tl">Discount</td><td class="tr">- ${Number(sale.discount).toLocaleString("en-KE")}</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Receipt ${refNum}</title>
<style>
  /* ── Reset ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  /* ── Page / body ── */
  /* 80 mm roll; height auto so the paper feeds to content length */
  @page { size: 80mm auto; margin: 4mm 4mm; }
  body {
    font-family: "Courier New", Courier, monospace;
    font-size: 11px;
    color: #000;
    background: #fff;
    width: 72mm;
  }
  .page { width: 72mm; }

  /* ── Utilities ── */
  .tc { text-align: center; }
  .tl { text-align: left; }
  .tr { text-align: right; }
  .bold { font-weight: bold; }
  .sm { font-size: 9px; }
  .lg { font-size: 14px; }
  .xl { font-size: 16px; }

  /* ── Dividers — use dashes, not coloured bars ── */
  .rule  { border: none; border-top: 1px solid #000; margin: 4px 0; }
  .rule2 { border: none; border-top: 2px solid #000; margin: 4px 0; }
  .dash  { border: none; border-top: 1px dashed #555; margin: 4px 0; }

  /* ── Header (centred, no background) ── */
  .header { text-align: center; padding: 4px 0 6px; }
  .shop-name { font-size: 15px; font-weight: bold; letter-spacing: 0.5px; }
  .shop-sub  { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; }

  /* ── Meta row ── */
  .meta { display: flex; justify-content: space-between; font-size: 9px; margin: 4px 0; }

  /* ── Payment badge — border only, no background ── */
  .pay-badge {
    display: inline-block;
    border: 1px solid #000;
    border-radius: 3px;
    padding: 0 4px;
    font-size: 9px;
    font-weight: bold;
    text-transform: uppercase;
  }

  /* ── Customer block (debt) ── */
  .customer-block { border: 1px solid #000; border-radius: 2px; padding: 3px 5px; margin: 4px 0; }
  .customer-block .lbl { font-size: 8px; text-transform: uppercase; letter-spacing: 0.8px; }
  .customer-block .val { font-size: 12px; font-weight: bold; }

  /* ── Items table ── */
  .items-section { margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }

  /* HEADER ROW: white background, black text, underline — NO dark fill */
  thead th {
    font-size: 9px;
    font-weight: bold;
    text-transform: uppercase;
    padding: 3px 2px;
    border-bottom: 1px solid #000;
    border-top: 1px solid #000;
    background: #fff;
    color: #000;
  }
  td {
    padding: 3px 2px;
    font-size: 10.5px;
    border-bottom: 1px dashed #aaa;
    color: #000;
    background: #fff;
  }
  tr:last-child td { border-bottom: none; }
  .idx { width: 16px; font-size: 9px; }
  .name { max-width: 120px; word-break: break-word; }
  .num  { width: 40px; white-space: nowrap; }

  /* ── Totals ── */
  .totals { margin: 4px 0; }
  .subtotal-row td { font-size: 9px; padding: 2px; }
  .grand-row td {
    font-size: 14px;
    font-weight: bold;
    padding: 5px 2px;
    border-top: 2px solid #000;
  }

  /* ── Footer ── */
  .footer { text-align: center; margin: 8px 0 4px; }
  .footer .thanks { font-size: 12px; font-weight: bold; }
  .footer .sub    { font-size: 9px; margin-top: 2px; }
  .footer .brand  { font-size: 8px; margin-top: 6px; letter-spacing: 0.8px; text-transform: uppercase; }

  /* ── Screen preview styling (non-print) ── */
  @media screen {
    body { background: #f5f5f5; display: flex; justify-content: center; padding: 24px; }
    .page {
      background: #fff;
      padding: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,.15);
    }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Logo + Shop name -->
  <div class="header">
    ${logoImg}
    <div class="shop-name">${shopName}</div>
    <div class="shop-sub">Official Receipt</div>
  </div>

  <hr class="rule2">

  <!-- Ref / date / time -->
  <div class="meta">
    <span>Ref: <strong>#${refNum}</strong></span>
    <span>${saleDate} ${saleTime}</span>
  </div>

  <!-- Served by -->
  ${sale.servedBy ? `<div class="meta"><span>Served by:</span><span><strong>${sale.servedBy}</strong></span></div>` : ""}

  <!-- Payment -->
  <div class="meta">
    <span>Payment:</span>
    <span class="pay-badge">${payLabel}</span>
  </div>

  <hr class="dash">

  <!-- Credit customer block -->
  ${isDebt && sale.debtCustomerName ? `
  <div class="customer-block">
    <div class="lbl">Credit Customer</div>
    <div class="val">${sale.debtCustomerName}</div>
  </div>` : ""}

  <!-- Items -->
  <div class="items-section">
    <table>
      <thead><tr>
        <th class="tc idx">#</th>
        <th class="tl name">Item</th>
        <th class="tr num">Qty</th>
        <th class="tr num">Price</th>
        <th class="tr num">Total</th>
      </tr></thead>
      <tbody>
        ${itemRows || '<tr><td colspan="5" class="tc" style="padding:8px">No items</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- Totals -->
  <div class="totals">
    <table>
      ${discountRow}
      <tr class="grand-row">
        <td colspan="4" class="tl bold">TOTAL (KES)</td>
        <td class="tr bold">${Number(sale.totalAmount ?? 0).toLocaleString("en-KE")}</td>
      </tr>
    </table>
  </div>

  <hr class="rule2">

  <!-- Footer -->
  <div class="footer">
    <div class="thanks">Thank you!</div>
    <div class="sub">Keep this receipt as proof of purchase.</div>
    <div class="brand">${shopName} · GreenLink OS</div>
  </div>

</div>
<script>window.onload = () => { window.print(); };</script>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank");
  if (win) win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
}
