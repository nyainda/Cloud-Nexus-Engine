export function printCategoryPdf(
  categories: any[],
  period: string,
  shopName: string,
) {
  const totalRev = categories.reduce((s, c) => s + c.totalRevenue, 0);
  const totalProfit = categories.reduce((s, c) => s + c.totalProfit, 0);
  const totalItems = categories.reduce((s, c) => s + c.salesCount, 0);
  const totalMargin = totalRev > 0 ? (totalProfit / totalRev) * 100 : 0;

  const fmt = (n: number) =>
    n.toLocaleString("en-KE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  const rows = categories
    .map((c) => {
      const share =
        totalRev > 0 ? ((c.totalRevenue / totalRev) * 100).toFixed(1) : "0.0";
      const margin =
        c.totalRevenue > 0
          ? ((c.totalProfit / c.totalRevenue) * 100).toFixed(1)
          : "0.0";
      return `<tr>
      <td>${c.category}</td>
      <td class="num">KES ${fmt(c.totalRevenue)}</td>
      <td class="num">KES ${fmt(c.totalProfit)}</td>
      <td class="num">${c.salesCount}</td>
      <td class="num">${margin}%</td>
      <td class="num">${share}%</td>
    </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${shopName} — Category Report</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 36px; color: #111; background: #fff; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; border-bottom: 3px solid #C8FF00; padding-bottom: 16px; }
    .shop-badge { display: flex; align-items: center; gap: 10px; }
    .shop-icon { width: 42px; height: 42px; background: #C8FF00; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    h1 { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -0.5px; }
    .report-type { font-size: 12px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    .meta { text-align: right; font-size: 11px; color: #888; line-height: 1.7; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
    thead th { background: #111; color: #fff; padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
    thead th.num { text-align: right; }
    tbody td { padding: 9px 12px; border-bottom: 1px solid #e8e8e8; color: #222; }
    tbody tr:nth-child(even) { background: #f8f8f8; }
    .num { text-align: right; font-family: "SF Mono", "Fira Code", monospace; font-size: 12px; }
    .tfoot td { padding: 10px 12px; font-weight: 800; background: #f0f0f0; font-size: 13px; border-top: 2px solid #ccc; }
    .profit { color: #16a34a; }
    .footer { margin-top: 28px; font-size: 10px; color: #aaa; text-align: center; }
    @media print { body { padding: 20px; } @page { margin: 15mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="shop-badge">
      <div class="shop-icon">🌿</div>
      <div>
        <h1>${shopName}</h1>
        <div class="report-type">Category Sales Report</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>Period:</strong> ${period}</div>
      <div><strong>Generated:</strong> ${new Date().toLocaleString("en-KE")}</div>
      <div>${categories.length} categories</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th class="num">Revenue (KES)</th>
        <th class="num">Profit (KES)</th>
        <th class="num">Items Sold</th>
        <th class="num">Margin</th>
        <th class="num">Share</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL</td>
        <td class="num">KES ${fmt(totalRev)}</td>
        <td class="num profit">KES ${fmt(totalProfit)}</td>
        <td class="num">${totalItems}</td>
        <td class="num">${totalMargin.toFixed(1)}%</td>
        <td class="num">100.0%</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">GreenLink OS &nbsp;·&nbsp; Confidential — ${shopName}</div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 400); }<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) {
    win.addEventListener("afterprint", () => {
      URL.revokeObjectURL(url);
    });
  }
}

export function downloadCategoryCsv(
  categories: any[],
  period: string,
  shopName: string,
) {
  const totalRev = categories.reduce((s, c) => s + c.totalRevenue, 0);
  const headers = [
    "Category",
    "Revenue (KES)",
    "Profit (KES)",
    "Items Sold",
    "Margin %",
    "Share %",
  ];
  const rows = categories.map((c) => {
    const share =
      totalRev > 0 ? ((c.totalRevenue / totalRev) * 100).toFixed(1) : "0.0";
    const margin =
      c.totalRevenue > 0
        ? ((c.totalProfit / c.totalRevenue) * 100).toFixed(1)
        : "0.0";
    return [
      `"${c.category}"`,
      c.totalRevenue.toFixed(0),
      c.totalProfit.toFixed(0),
      c.salesCount,
      margin,
      share,
    ].join(",");
  });
  const totalRow = [
    '"TOTAL"',
    totalRev.toFixed(0),
    categories.reduce((s, c) => s + c.totalProfit, 0).toFixed(0),
    categories.reduce((s, c) => s + c.salesCount, 0),
    totalRev > 0
      ? (
          (categories.reduce((s, c) => s + c.totalProfit, 0) / totalRev) *
          100
        ).toFixed(1)
      : "0.0",
    "100.0",
  ].join(",");
  const csv = [
    `"${shopName} — Category Sales Report"`,
    `"Period: ${period}"`,
    `"Generated: ${new Date().toLocaleString("en-KE")}"`,
    "",
    headers.join(","),
    ...rows,
    totalRow,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `category-sales-${period.replace(/\s/g, "-").toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadSingleCategoryCsv(
  cat: any,
  period: string,
  shopName: string,
) {
  const prods: any[] = cat.products ?? [];
  const headers = [
    "Product",
    "Qty Sold",
    "Revenue (KES)",
    "Profit (KES)",
    "Margin %",
  ];
  const rows = prods.map((p: any) => {
    const margin =
      p.totalRevenue > 0
        ? ((p.totalProfit / p.totalRevenue) * 100).toFixed(1)
        : "0.0";
    return [
      `"${p.productName}"`,
      Number(p.qtySold).toFixed(2),
      p.totalRevenue.toFixed(0),
      p.totalProfit.toFixed(0),
      margin,
    ].join(",");
  });
  const totalRow = [
    '"TOTAL"',
    prods.reduce((s: number, p: any) => s + p.qtySold, 0).toFixed(2),
    cat.totalRevenue.toFixed(0),
    cat.totalProfit.toFixed(0),
    cat.totalRevenue > 0
      ? ((cat.totalProfit / cat.totalRevenue) * 100).toFixed(1)
      : "0.0",
  ].join(",");
  const csv = [
    `"${shopName} — ${cat.category} Sales Report"`,
    `"Period: ${period}"`,
    `"Generated: ${new Date().toLocaleString("en-KE")}"`,
    "",
    headers.join(","),
    ...rows,
    totalRow,
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${cat.category.toLowerCase().replace(/\s+/g, "-")}-sales-${period.replace(/\s/g, "-").toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printSingleCategoryPdf(
  cat: any,
  period: string,
  shopName: string,
) {
  const prods: any[] = cat.products ?? [];
  const fmt = (n: number) =>
    n.toLocaleString("en-KE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  const rows = prods
    .map((p: any) => {
      const margin =
        p.totalRevenue > 0
          ? ((p.totalProfit / p.totalRevenue) * 100).toFixed(1)
          : "0.0";
      return `<tr>
      <td>${p.productName}</td>
      <td class="num">${Number(p.qtySold).toFixed(2)}</td>
      <td class="num">KES ${fmt(p.totalRevenue)}</td>
      <td class="num">KES ${fmt(p.totalProfit)}</td>
      <td class="num">${margin}%</td>
    </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${shopName} — ${cat.category}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 36px; color: #111; background: #fff; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; border-bottom: 3px solid #C8FF00; padding-bottom: 16px; }
    .shop-badge { display: flex; align-items: center; gap: 10px; }
    .shop-icon { width: 42px; height: 42px; background: #C8FF00; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    h1 { font-size: 22px; font-weight: 800; color: #111; letter-spacing: -0.5px; }
    .report-type { font-size: 12px; color: #666; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    .meta { text-align: right; font-size: 11px; color: #888; line-height: 1.7; }
    .summary { display: flex; gap: 24px; margin-bottom: 16px; padding: 12px 16px; background: #f8f8f8; border-radius: 8px; font-size: 12px; }
    .summary .item label { font-size: 10px; text-transform: uppercase; color: #999; letter-spacing: 0.4px; display: block; }
    .summary .item span { font-size: 15px; font-weight: 800; color: #111; }
    .summary .item.profit span { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
    thead th { background: #111; color: #fff; padding: 9px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
    thead th.num { text-align: right; }
    tbody td { padding: 9px 12px; border-bottom: 1px solid #e8e8e8; color: #222; }
    tbody tr:nth-child(even) { background: #f8f8f8; }
    .num { text-align: right; font-family: "SF Mono", "Fira Code", monospace; font-size: 12px; }
    .tfoot td { padding: 10px 12px; font-weight: 800; background: #f0f0f0; font-size: 13px; border-top: 2px solid #ccc; }
    .profit { color: #16a34a; }
    .footer { margin-top: 28px; font-size: 10px; color: #aaa; text-align: center; }
    @media print { body { padding: 20px; } @page { margin: 15mm; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="shop-badge">
      <div class="shop-icon">🌿</div>
      <div>
        <h1>${shopName}</h1>
        <div class="report-type">${cat.category} — Sales Breakdown</div>
      </div>
    </div>
    <div class="meta">
      <div><strong>Period:</strong> ${period}</div>
      <div><strong>Generated:</strong> ${new Date().toLocaleString("en-KE")}</div>
      <div>${prods.length} product${prods.length !== 1 ? "s" : ""}</div>
    </div>
  </div>
  <div class="summary">
    <div class="item"><label>Revenue</label><span>KES ${fmt(cat.totalRevenue)}</span></div>
    <div class="item profit"><label>Profit</label><span>KES ${fmt(cat.totalProfit)}</span></div>
    <div class="item"><label>Units Sold</label><span>${Number(cat.salesCount).toFixed(2)}</span></div>
    <div class="item"><label>Margin</label><span>${cat.totalRevenue > 0 ? ((cat.totalProfit / cat.totalRevenue) * 100).toFixed(1) : 0}%</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="num">Qty Sold</th>
        <th class="num">Revenue (KES)</th>
        <th class="num">Profit (KES)</th>
        <th class="num">Margin</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td>TOTAL</td>
        <td class="num">${prods.reduce((s: number, p: any) => s + p.qtySold, 0).toFixed(2)}</td>
        <td class="num">KES ${fmt(cat.totalRevenue)}</td>
        <td class="num profit">KES ${fmt(cat.totalProfit)}</td>
        <td class="num">${cat.totalRevenue > 0 ? ((cat.totalProfit / cat.totalRevenue) * 100).toFixed(1) : 0}%</td>
      </tr>
    </tfoot>
  </table>
  <div class="footer">GreenLink OS &nbsp;·&nbsp; Confidential — ${shopName}</div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 400); }<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank");
  if (win) win.addEventListener("afterprint", () => URL.revokeObjectURL(url));
}
