import { format } from "date-fns";

/**
 * Prints a thermal-receipt-optimised receipt on an 80 mm roll printer
 * (e.g. Epson XP-80C / TM-T20 family).
 *
 * Approach: inject a print-only overlay directly into the current document
 * and call window.print() — no popup window needed. This sidesteps all
 * popup-blocker, window-resize, and page-size issues.
 *
 * Thermal paper rules baked into the CSS:
 *  • NO dark/coloured backgrounds (print as solid black blocks).
 *  • NO white text (invisible on white paper).
 *  • Structure via bold text, dashes, and rule lines only.
 *  • font-weight 900 everywhere = deeper chemical exposure = slower fading.
 *  • @page size 80mm auto = paper cuts right after last line, zero waste.
 */
export async function printSaleReceipt(sale: any): Promise<void> {
  const shopName = localStorage.getItem("greenlink_shopName") || "GreenLink";
  const shopId   = localStorage.getItem("greenlink_shopId")   || "";
  const items    = (sale.items || []) as any[];
  const isDebt   = sale.saleType === "debt";
  const isBank   = !isDebt && sale.paymentMethod === "bank";
  const payLabel = isDebt ? "CREDIT / DEBT" : isBank ? "M-PESA / BANK" : "CASH";
  const saleDate = format(new Date(sale.createdAt), "d MMM yyyy");
  const saleTime = format(new Date(sale.createdAt), "h:mm a");
  const refNum   = (sale.id || "").slice(0, 8).toUpperCase() || "—";

  // ── Load shop logo as data-URL (optional) ──────────────────────────────────
  const shopIsGreenlink =
    !shopId.includes("sunrise") && !shopName.toLowerCase().includes("sunrise");
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
  } catch { /* logo optional */ }

  const logoImg = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="${shopName}" style="height:40px;width:auto;object-fit:contain;display:block;margin:0 auto 3px;">`
    : "";

  // ── Item rows ──────────────────────────────────────────────────────────────
  const itemRows = items.map((it: any, i: number) => `
    <tr>
      <td style="text-align:center;width:16px;font-size:10px;padding:3px 2px;">${i + 1}.</td>
      <td style="text-align:left;max-width:110px;word-break:break-word;padding:3px 2px;">${it.productName ?? "—"}</td>
      <td style="text-align:right;padding:3px 2px;">${it.qty}</td>
      <td style="text-align:right;padding:3px 2px;">${Number(it.unitPrice ?? 0).toLocaleString("en-KE")}</td>
      <td style="text-align:right;font-weight:900;padding:3px 2px;">${Number(it.totalPrice ?? 0).toLocaleString("en-KE")}</td>
    </tr>`).join("");

  const discountRow = (sale.discount ?? 0) > 0
    ? `<tr>
         <td colspan="4" style="text-align:left;font-size:10px;padding:2px;">Discount</td>
         <td style="text-align:right;font-size:10px;padding:2px;">-${Number(sale.discount).toLocaleString("en-KE")}</td>
       </tr>`
    : "";

  // ── Receipt HTML (injected inline — no popup) ──────────────────────────────
  const receiptHtml = `
    <div style="
      font-family:'Courier New',Courier,monospace;
      font-size:12px;font-weight:700;color:#000;background:#fff;
      width:100%;max-width:72mm;margin:0 auto;
    ">
      <!-- Logo + shop name -->
      <div style="text-align:center;padding:4px 0 5px;">
        ${logoImg}
        <div style="font-size:14px;font-weight:900;letter-spacing:0.3px;text-transform:uppercase;">${shopName}</div>
        <div style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Official Receipt</div>
      </div>

      <div style="border:none;border-top:2px solid #000;margin:5px 0;"></div>

      <!-- Ref / date / time -->
      <div style="display:flex;justify-content:space-between;padding:1px 0;font-size:11px;">
        <span>REF: <strong>#${refNum}</strong></span><span>${saleDate} ${saleTime}</span>
      </div>
      ${sale.servedBy ? `<div style="display:flex;justify-content:space-between;padding:1px 0;font-size:11px;"><span>SERVED BY:</span><span>${sale.servedBy}</span></div>` : ""}
      <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:11px;">
        <span>PAYMENT:</span>
        <span style="display:inline-block;border:2px solid #000;border-radius:2px;padding:1px 5px;font-size:10px;font-weight:900;letter-spacing:0.5px;">${payLabel}</span>
      </div>

      <!-- Credit customer -->
      ${isDebt && sale.debtCustomerName ? `
      <div style="border:2px solid #000;padding:3px 5px;margin:4px 0;">
        <div style="font-size:8px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">Credit Customer</div>
        <div style="font-size:13px;font-weight:900;">${sale.debtCustomerName}</div>
      </div>` : ""}

      <div style="border:none;border-top:1px dashed #000;margin:4px 0;"></div>

      <!-- Items table -->
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr>
            <th style="text-align:center;font-size:9px;font-weight:900;text-transform:uppercase;padding:3px 2px;border-top:2px solid #000;border-bottom:2px solid #000;background:#fff;color:#000;width:16px;">#</th>
            <th style="text-align:left;font-size:9px;font-weight:900;text-transform:uppercase;padding:3px 2px;border-top:2px solid #000;border-bottom:2px solid #000;background:#fff;color:#000;">ITEM</th>
            <th style="text-align:right;font-size:9px;font-weight:900;text-transform:uppercase;padding:3px 2px;border-top:2px solid #000;border-bottom:2px solid #000;background:#fff;color:#000;">QTY</th>
            <th style="text-align:right;font-size:9px;font-weight:900;text-transform:uppercase;padding:3px 2px;border-top:2px solid #000;border-bottom:2px solid #000;background:#fff;color:#000;">PRICE</th>
            <th style="text-align:right;font-size:9px;font-weight:900;text-transform:uppercase;padding:3px 2px;border-top:2px solid #000;border-bottom:2px solid #000;background:#fff;color:#000;">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || `<tr><td colspan="5" style="text-align:center;padding:6px;">No items</td></tr>`}
        </tbody>
      </table>

      <!-- Totals -->
      <table style="width:100%;border-collapse:collapse;">
        ${discountRow}
        <tr>
          <td colspan="4" style="text-align:left;font-size:14px;font-weight:900;border-top:2px solid #000;padding:5px 2px;">TOTAL (KES)</td>
          <td style="text-align:right;font-size:14px;font-weight:900;border-top:2px solid #000;padding:5px 2px;">${Number(sale.totalAmount ?? 0).toLocaleString("en-KE")}</td>
        </tr>
      </table>

      <!-- Footer -->
      <div style="text-align:center;margin-top:6px;padding-top:5px;border-top:2px solid #000;">
        <div style="font-size:13px;font-weight:900;">** THANK YOU! **</div>
        <div style="font-size:9px;font-weight:700;margin-top:2px;">Keep this receipt as proof of purchase.</div>
        <div style="font-size:8px;font-weight:700;margin-top:5px;letter-spacing:0.8px;text-transform:uppercase;">${shopName} · GreenLink OS</div>
      </div>
    </div>
  `;

  // ── Inject into the current document and print ─────────────────────────────
  // 1. Create a wrapper that is hidden on screen but visible when printing
  const wrapper = document.createElement("div");
  wrapper.id = "__receipt_print_wrapper__";
  wrapper.innerHTML = receiptHtml;

  // 2. Inject print-only CSS:
  //    - Hide everything on the page during print
  //    - Show only our receipt wrapper
  //    - Set 80 mm page width, auto height (cuts right after content)
  const style = document.createElement("style");
  style.id = "__receipt_print_style__";
  style.textContent = `
    #__receipt_print_wrapper__ { display: none; }

    @media print {
      @page { size: 80mm auto; margin: 2mm 3mm; }

      /* Hide the entire app */
      body > *:not(#__receipt_print_wrapper__) { display: none !important; visibility: hidden !important; }

      /* Show only the receipt */
      #__receipt_print_wrapper__ {
        display: block !important;
        visibility: visible !important;
        position: fixed;
        top: 0; left: 0;
        width: 100%;
        background: #fff;
        color: #000;
      }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(wrapper);

  // 3. Print — give the DOM one frame to paint before firing
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
      // 4. Clean up after the print dialog closes
      document.head.removeChild(style);
      document.body.removeChild(wrapper);
    });
  });
}
