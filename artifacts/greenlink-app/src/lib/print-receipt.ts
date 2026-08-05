import { format } from "date-fns";

/**
 * Prints a thermal-receipt-optimised receipt on an 80 mm roll printer
 * (e.g. Epson XP-80C / TM-T20 family).
 *
 * Design rules for thermal paper:
 *  • NO coloured or dark backgrounds — they print as solid black blocks.
 *  • NO white text — invisible on white paper.
 *  • Structure via bold text, lines and dashes only.
 *  • Heavier / larger text = deeper thermal exposure = slower fading.
 *  • Page is 80 mm wide, height AUTO so the cutter fires right after content.
 *  • The popup window is resized to content before print() so the browser
 *    sends only content height to the printer — zero blank paper wasted.
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
    ? `<img src="${logoDataUrl}" alt="${shopName}"
         style="height:44px;width:auto;object-fit:contain;display:block;margin:0 auto 4px;">`
    : "";

  // ── Item rows ──────────────────────────────────────────────────────────────
  const itemRows = items.map((it: any, i: number) => `
    <tr>
      <td class="c idx">${i + 1}.</td>
      <td class="l name">${it.productName ?? "—"}</td>
      <td class="r">${it.qty}</td>
      <td class="r">${Number(it.unitPrice ?? 0).toLocaleString("en-KE")}</td>
      <td class="r b">${Number(it.totalPrice ?? 0).toLocaleString("en-KE")}</td>
    </tr>`).join("");

  const discountRow = (sale.discount ?? 0) > 0
    ? `<tr>
         <td colspan="4" class="l" style="font-size:10px">Discount</td>
         <td class="r" style="font-size:10px">-${Number(sale.discount).toLocaleString("en-KE")}</td>
       </tr>`
    : "";

  // ── Self-contained HTML ────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>Receipt #${refNum}</title>
<style>
/* ── Reset ─────────────────────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

/* ── Page / body ────────────────────────────────────────────────────────
   80 mm wide, height AUTO = paper cuts right after last line.
   font-weight 700 everywhere = deeper thermal exposure = slower fading.   */
@page{size:80mm auto;margin:3mm 3mm;}
html,body{
  width:74mm;height:auto;overflow:hidden;
  font-family:"Courier New",Courier,monospace;
  font-size:12px;font-weight:700;
  color:#000;background:#fff;
}
.page{width:74mm;}

/* ── Helpers ────────────────────────────────────────────────────────── */
.l{text-align:left;} .r{text-align:right;} .c{text-align:center;}
.b{font-weight:900;}
.sm{font-size:10px;} .lg{font-size:15px;} .xl{font-size:18px;}

/* ── Dividers ───────────────────────────────────────────────────────── */
.rule {border:none;border-top:2px solid #000;margin:5px 0;}
.dash {border:none;border-top:1px dashed #000;margin:4px 0;}

/* ── Header (centred, no background) ────────────────────────────────── */
.header{text-align:center;padding:4px 0 5px;}
.sname{font-size:14px;font-weight:900;letter-spacing:0.3px;text-transform:uppercase;}
.ssub {font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;}

/* ── Meta rows ──────────────────────────────────────────────────────── */
.row{display:flex;justify-content:space-between;padding:1px 0;font-size:11px;}

/* ── Payment badge — border, no fill ────────────────────────────────── */
.pay{display:inline-block;border:2px solid #000;border-radius:2px;
     padding:1px 5px;font-size:10px;font-weight:900;letter-spacing:0.5px;}

/* ── Credit customer block ──────────────────────────────────────────── */
.cust{border:2px solid #000;padding:3px 5px;margin:4px 0;}
.cust .lbl{font-size:8px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;}
.cust .val{font-size:13px;font-weight:900;}

/* ── Items table ─────────────────────────────────────────────────────
   Header row: white bg + black text + top/bottom border (NO dark fill).
   All td/th: black text, white bg, bold — maximum thermal exposure.     */
table{width:100%;border-collapse:collapse;}
thead th{
  font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.3px;
  padding:3px 2px;
  border-top:2px solid #000;border-bottom:2px solid #000;
  background:#fff;color:#000;
}
td{
  padding:3px 2px;font-size:11px;font-weight:700;
  color:#000;background:#fff;
  border-bottom:1px dashed #555;
}
tr:last-child td{border-bottom:none;}
.idx{width:18px;font-size:10px;}
.name{max-width:110px;word-break:break-word;}

/* ── Totals ─────────────────────────────────────────────────────────── */
.grand td{
  font-size:14px;font-weight:900;
  border-top:2px solid #000;padding:5px 2px;
}

/* ── Footer ─────────────────────────────────────────────────────────── */
.footer{text-align:center;margin-top:6px;padding-top:5px;border-top:2px solid #000;}
.ty   {font-size:13px;font-weight:900;}
.sub  {font-size:9px;font-weight:700;margin-top:2px;}
.brand{font-size:8px;font-weight:700;margin-top:5px;letter-spacing:0.8px;text-transform:uppercase;}

/* ── Screen preview only ─────────────────────────────────────────────── */
@media screen{
  body{background:#bbb;display:flex;justify-content:center;padding:16px;width:auto;}
  .page{background:#fff;padding:10px;box-shadow:0 2px 10px rgba(0,0,0,.3);}
}
</style>
</head>
<body><div class="page">

  <!-- Logo + shop name -->
  <div class="header">
    ${logoImg}
    <div class="sname">${shopName}</div>
    <div class="ssub">Official Receipt</div>
  </div>

  <hr class="rule">

  <!-- Ref / date / time -->
  <div class="row"><span>REF: #${refNum}</span><span>${saleDate} ${saleTime}</span></div>
  ${sale.servedBy ? `<div class="row"><span>SERVED BY:</span><span>${sale.servedBy}</span></div>` : ""}
  <div class="row"><span>PAYMENT:</span><span class="pay">${payLabel}</span></div>

  <!-- Credit customer -->
  ${isDebt && sale.debtCustomerName ? `
  <div class="cust">
    <div class="lbl">Credit Customer</div>
    <div class="val">${sale.debtCustomerName}</div>
  </div>` : ""}

  <hr class="dash">

  <!-- Items table -->
  <table>
    <thead><tr>
      <th class="c idx">#</th>
      <th class="l name">ITEM</th>
      <th class="r">QTY</th>
      <th class="r">PRICE</th>
      <th class="r">TOTAL</th>
    </tr></thead>
    <tbody>
      ${itemRows || '<tr><td colspan="5" class="c" style="padding:6px">No items</td></tr>'}
    </tbody>
  </table>

  <!-- Totals -->
  <table>
    ${discountRow}
    <tr class="grand">
      <td colspan="4" class="l">TOTAL (KES)</td>
      <td class="r b">${Number(sale.totalAmount ?? 0).toLocaleString("en-KE")}</td>
    </tr>
  </table>

  <!-- Footer -->
  <div class="footer">
    <div class="ty">** THANK YOU! **</div>
    <div class="sub">Keep this receipt as proof of purchase.</div>
    <div class="brand">${shopName} · GreenLink OS</div>
  </div>

</div>
<script>
  // Resize the popup to exactly the receipt height before printing.
  // This tells the browser the "page" is only as tall as the content,
  // so the thermal cutter fires right after the last line — zero waste.
  window.onload = function () {
    var h = document.querySelector('.page').scrollHeight;
    // Add small buffer for browser chrome; resizeTo clamps to screen bounds
    try { window.resizeTo(420, h + 80); } catch(e) {}
    setTimeout(function () { window.print(); }, 120);
  };
</script>
</body></html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  // Open popup at a compact size; script will resize it once content loads
  const win  = window.open(url, "_blank", "width=420,height=600,menubar=no,toolbar=no,location=no");
  if (win) win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
}
