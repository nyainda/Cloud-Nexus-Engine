import "./_group.css";
import { useMemo, useState } from "react";
import { format, startOfMonth, startOfWeek, subDays } from "date-fns";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Ban,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Download,
  FileText,
  Flame,
  Layers3,
  Package,
  Search,
  Share2,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";

type RangeKey = "today" | "week" | "month" | "custom";
type Category = {
  category: string;
  totalRevenue: number;
  totalProfit: number;
  salesCount: number;
  products: { productName: string; qtySold: number; totalRevenue: number; totalProfit: number }[];
};

const shopName = "GreenLink Agrovet · Nakuru";
const fmtKES = (amount: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(amount);
const compactKES = (amount: number) =>
  `KES ${(amount / 1000).toLocaleString("en-KE", { maximumFractionDigits: 1 })}k`;

const categories: Category[] = [
  {
    category: "Fertilizers",
    totalRevenue: 498000,
    totalProfit: 91300,
    salesCount: 73,
    products: [
      { productName: "Urea Fertilizer 50kg", qtySold: 42, totalRevenue: 252000, totalProfit: 37800 },
      { productName: "DAP Fertilizer 50kg", qtySold: 31, totalRevenue: 217000, totalProfit: 43400 },
      { productName: "CAN Fertilizer 50kg", qtySold: 6, totalRevenue: 29000, totalProfit: 10100 },
    ],
  },
  {
    category: "Crop Protection",
    totalRevenue: 386000,
    totalProfit: 101500,
    salesCount: 112,
    products: [
      { productName: "Roundup 1L", qtySold: 58, totalRevenue: 174000, totalProfit: 52200 },
      { productName: "Dithane M-45 1kg", qtySold: 36, totalRevenue: 126000, totalProfit: 31500 },
      { productName: "Attakan 100ml", qtySold: 18, totalRevenue: 86000, totalProfit: 17800 },
    ],
  },
  {
    category: "Seeds",
    totalRevenue: 224000,
    totalProfit: 58600,
    salesCount: 58,
    products: [
      { productName: "Hybrid Maize Seed 2kg", qtySold: 24, totalRevenue: 96000, totalProfit: 24000 },
      { productName: "Rosecoco Bean Seed 1kg", qtySold: 32, totalRevenue: 128000, totalProfit: 34600 },
    ],
  },
  {
    category: "Animal Health",
    totalRevenue: 142000,
    totalProfit: 39100,
    salesCount: 44,
    products: [
      { productName: "Albendazole Dewormer 1L", qtySold: 11, totalRevenue: 77000, totalProfit: 23100 },
      { productName: "Poultry Vitamins 500ml", qtySold: 13, totalRevenue: 65000, totalProfit: 16000 },
    ],
  },
];

const products = [
  { productName: "Urea Fertilizer 50kg", category: "Fertilizers", qty: 42, revenue: 252000, profit: 37800, sales: 39 },
  { productName: "DAP Fertilizer 50kg", category: "Fertilizers", qty: 31, revenue: 217000, profit: 43400, sales: 29 },
  { productName: "Roundup 1L", category: "Crop Protection", qty: 58, revenue: 174000, profit: 52200, sales: 52 },
  { productName: "Dithane M-45 1kg", category: "Crop Protection", qty: 36, revenue: 126000, profit: 31500, sales: 34 },
  { productName: "Hybrid Maize Seed 2kg", category: "Seeds", qty: 24, revenue: 96000, profit: 24000, sales: 21 },
];

const stockItems = [
  { name: "Hand Sprayer 16L", qty: 0, status: "Out of stock" },
  { name: "Calcium Nitrate 25kg", qty: 3, status: "Low stock" },
  { name: "Poultry Feed 50kg", qty: 8, status: "Low stock" },
];

const inventory = [
  { name: "Poultry Feed 50kg", buy: 2940, sell: 3000, qty: 8 },
  { name: "Calcium Nitrate 25kg", buy: 4250, sell: 4400, qty: 3 },
  { name: "Hand Sprayer 16L", buy: 2180, sell: 2400, qty: 0 },
  { name: "Urea Fertilizer 50kg", buy: 4850, sell: 6000, qty: 24 },
  { name: "Maize Seed 2kg", buy: 2950, sell: 4000, qty: 17 },
  { name: "Dithane M-45 1kg", buy: 2625, sell: 3500, qty: 12 },
];

const topProducts = [
  { name: "Urea Fertilizer 50kg", qty: 42, revenue: 252000, profit: 37800 },
  { name: "DAP Fertilizer 50kg", qty: 31, revenue: 217000, profit: 43400 },
  { name: "Roundup 1L", qty: 58, revenue: 174000, profit: 52200 },
  { name: "Dithane M-45 1kg", qty: 36, revenue: 126000, profit: 31500 },
  { name: "Hybrid Maize Seed 2kg", qty: 24, revenue: 96000, profit: 24000 },
];

const voidedSales = [
  { type: "Cash sale", time: "14:42", amount: 4850, reason: "Incorrect item scanned" },
  { type: "Credit sale", time: "13:18", amount: 7200, reason: "Customer changed order" },
];

const hourlySales = [
  { hour: "7am", count: 0 }, { hour: "8am", count: 1 }, { hour: "9am", count: 3 },
  { hour: "10am", count: 5 }, { hour: "11am", count: 8 }, { hour: "12pm", count: 4 },
  { hour: "1pm", count: 7 }, { hour: "2pm", count: 10 }, { hour: "3pm", count: 6 },
  { hour: "4pm", count: 9 }, { hour: "5pm", count: 4 }, { hour: "6pm", count: 2 },
  { hour: "7pm", count: 0 },
];

const today = new Date();
const dailySales = Array.from({ length: 14 }, (_, i) => {
  const date = subDays(today, 13 - i);
  const revenue = 52000 + ((i * 13791) % 39000);
  return {
    date: format(date, "yyyy-MM-dd"),
    label: format(date, "d MMM"),
    revenue,
    profit: Math.round(revenue * 0.2324),
    salesCount: 8 + ((i * 7) % 17),
  };
});

const previousPeriod = { revenue: 1095000, profit: 241000, sales: 263 };
const periodValues = { revenue: 1250000, profit: 290500, sales: 287 };
const moneyIn = { cash: 538000, bank: 528000, credit: 184000, collected: 94500 };
const dashboardToday = {
  revenue: 92300,
  profit: 21800,
  sales: 21,
  cashSales: 68400,
  cashCollected: 12600,
  debtSales: 18400,
  pendingDebt: 87350,
  lowStock: 7,
  outOfStock: 3,
};

function saveCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function printReport(title: string, rows: (string | number)[][]) {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return;
  const body = rows.map((row, index) =>
    `<tr>${row.map((cell) => `<${index === 0 ? "th" : "td"}>${String(cell)}</${index === 0 ? "th" : "td"}>`).join("")}</tr>`
  ).join("");
  popup.document.write(`<html><head><title>${title}</title><style>body{font:14px Arial,sans-serif;padding:36px;color:#17211b}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:24px}td,th{padding:11px;border-bottom:1px solid #dce3dc;text-align:left}th{background:#173b2b;color:white}header{border-bottom:4px solid #c8ff00;padding-bottom:14px}</style></head><body><header><h1>${shopName}</h1><div>${title} · ${format(new Date(), "d MMM yyyy")}</div></header><table>${body}</table><script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
}

function Delta({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span className={`delta ${positive ? "positive" : "negative"}`}>
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function CashUpModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const cashTotal = dashboardToday.cashSales + dashboardToday.cashCollected;
  const text = [
    "END-OF-DAY CASH-UP",
    shopName,
    format(new Date(), "EEEE, d MMMM yyyy"),
    "",
    `Cash in till: ${fmtKES(cashTotal)}`,
    `Cash sales: ${fmtKES(dashboardToday.cashSales)}`,
    `Debt collected: ${fmtKES(dashboardToday.cashCollected)}`,
    `Credit issued: ${fmtKES(dashboardToday.debtSales)}`,
    `Revenue: ${fmtKES(dashboardToday.revenue)}`,
    `Gross profit: ${fmtKES(dashboardToday.profit)}`,
    `Transactions: ${dashboardToday.sales}`,
    `Outstanding debt: ${fmtKES(dashboardToday.pendingDebt)}`,
  ].join("\n");
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "End-of-day cash-up", text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }
  };
  return (
    <div className="cash-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="cash-modal" role="dialog" aria-modal="true" aria-labelledby="cash-up-title">
        <header className="cash-modal-head">
          <div className="cash-modal-mark"><Wallet size={18} /></div>
          <div><h2 id="cash-up-title">End-of-day cash-up</h2><p>{format(new Date(), "EEEE, d MMMM · h:mm a")}</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Close cash-up"><X size={18} /></button>
        </header>
        <div className="cash-total">
          <span>Cash in till</span>
          <strong>{fmtKES(cashTotal)}</strong>
          <small>Cash sales + debt payments received today</small>
        </div>
        <div className="cash-modal-content">
          <div className="cash-group">
            <small>Cash breakdown</small>
            <div><span>Cash sales</span><b>{fmtKES(dashboardToday.cashSales)}</b></div>
            <div><span>Debt payments collected</span><b>{fmtKES(dashboardToday.cashCollected)}</b></div>
            <div className="cash-subtotal"><span>Total cash in till</span><b>{fmtKES(cashTotal)}</b></div>
          </div>
          <div className="cash-group">
            <small>Sales summary</small>
            <div><span>Total revenue</span><b>{fmtKES(dashboardToday.revenue)}</b></div>
            <div><span>Credit issued today</span><b className="warn-text">{fmtKES(dashboardToday.debtSales)}</b></div>
            <div><span>Gross profit</span><b className="profit-text">{fmtKES(dashboardToday.profit)} <i>23.6% margin</i></b></div>
            <div><span>Transactions</span><b>{dashboardToday.sales}</b></div>
          </div>
          <div className="cash-alert"><TrendingDown size={16} /><span>Outstanding debt</span><b>{fmtKES(dashboardToday.pendingDebt)}</b></div>
        </div>
        <footer className="cash-modal-foot">
          <button className="button-quiet" onClick={() => printReport("End-of-day cash-up", [
            ["Item", "Amount"], ["Cash sales", fmtKES(dashboardToday.cashSales)],
            ["Debt collected", fmtKES(dashboardToday.cashCollected)], ["Cash in till", fmtKES(cashTotal)],
            ["Credit issued", fmtKES(dashboardToday.debtSales)], ["Outstanding debt", fmtKES(dashboardToday.pendingDebt)],
          ])}><FileText size={15} /> Print</button>
          <button className="button-primary" onClick={share}>{copied ? <Check size={16} /> : <Share2 size={16} />}{copied ? "Copied" : "Share report"}</button>
        </footer>
      </section>
    </div>
  );
}

export function Refined() {
  const [range, setRange] = useState<RangeKey>("month");
  const [customFrom, setCustomFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [customTo, setCustomTo] = useState(format(today, "yyyy-MM-dd"));
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showCashUp, setShowCashUp] = useState(false);
  const [productInput, setProductInput] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productRange, setProductRange] = useState("This month");
  const [productCopied, setProductCopied] = useState(false);
  const [voidExpanded, setVoidExpanded] = useState(false);

  const activeRange = useMemo(() => {
    if (range === "custom") return { from: customFrom, to: customTo };
    if (range === "today") return { from: format(today, "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
    if (range === "week") return { from: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
    return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  }, [range, customFrom, customTo]);

  const filteredProducts = useMemo(
    () => productQuery.trim().length < 2 ? [] : products.filter((item) => item.productName.toLowerCase().includes(productQuery.trim().toLowerCase())),
    [productQuery],
  );
  const searchSummary = filteredProducts.reduce((sum, item) => ({
    qty: sum.qty + item.qty,
    revenue: sum.revenue + item.revenue,
    profit: sum.profit + item.profit,
    sales: sum.sales + item.sales,
  }), { qty: 0, revenue: 0, profit: 0, sales: 0 });
  const totalCategoryRevenue = categories.reduce((sum, category) => sum + category.totalRevenue, 0);
  const lowMargin = inventory.map((item) => ({
    ...item,
    margin: ((item.sell - item.buy) / item.sell) * 100,
  })).sort((a, b) => a.margin - b.margin);
  const inventoryValue = inventory.reduce((sum, item) => sum + item.qty * item.buy, 0);
  const totalVoided = voidedSales.reduce((sum, item) => sum + item.amount, 0);
  const shareProductResults = async () => {
    const shareText = `${productQuery} sales · ${productRange}\n${filteredProducts.map((item) => `${item.productName}: ${fmtKES(item.revenue)} revenue, ${fmtKES(item.profit)} profit`).join("\n")}\nCombined: ${fmtKES(searchSummary.revenue)} revenue`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${productQuery} sales`, text: shareText });
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setProductCopied(true);
      window.setTimeout(() => setProductCopied(false), 2200);
    } catch {
      try {
        await navigator.clipboard.writeText(shareText);
        setProductCopied(true);
        window.setTimeout(() => setProductCopied(false), 2200);
      } catch {
        setProductCopied(false);
      }
    }
  };

  const exportCategories = (single?: Category, mode: "csv" | "pdf" = "csv") => {
    const selected = single ? [single] : categories;
    const rows: (string | number)[][] = [
      ["Category", "Revenue (KES)", "Profit (KES)", "Units sold", "Margin %", "Share %"],
      ...selected.map((category) => [
        category.category,
        category.totalRevenue,
        category.totalProfit,
        category.salesCount,
        (category.totalProfit / category.totalRevenue * 100).toFixed(1),
        (category.totalRevenue / totalCategoryRevenue * 100).toFixed(1),
      ]),
    ];
    if (mode === "pdf") printReport(single ? `${single.category} sales report` : "Category sales report", rows);
    else saveCsv(single ? `${single.category.toLowerCase().replaceAll(" ", "-")}-sales.csv` : "greenlink-category-sales.csv", rows);
  };

  const comparisonName = range === "today" ? "Yesterday" : range === "week" ? "Last week" : range === "custom" ? "Previous period" : "Last month";

  return (
    <main className="analytics-dashboard refined-analytics">
      <style>{`
        .refined-analytics {
          --page: #111512; --surface: #191e1a; --surface-raised: #1e2520; --line: #2b332d;
          --ink: #edf2e9; --dim: #98a398; --lime: #c8ff00; --good: #79cf91; --amber: #e2ae63;
          --red: #e37e72; --blue: #81b9d4; min-height: 100dvh; background: var(--page); color: var(--ink);
          font-family: 'DM Sans', sans-serif; padding-bottom: 40px;
        }
        .refined-analytics * { box-sizing: border-box; }
        .refined-analytics button { font: inherit; color: inherit; cursor: pointer; }
        .refined-analytics .mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
        .refined-analytics .page-wrap { width: min(1480px, 100%); margin: 0 auto; padding: 0 32px; }
        .refined-analytics .topbar { border-bottom: 1px solid var(--line); background: #141915; }
        .refined-analytics .topbar-inner { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .refined-analytics .brand { display: flex; align-items: center; gap: 12px; }
        .refined-analytics .brand-symbol { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px 10px 10px 3px; color: #111512; background: var(--lime); font: 800 12px 'Syne', sans-serif; letter-spacing: -.8px; }
        .refined-analytics .brand-name { font: 700 15px 'Syne', sans-serif; letter-spacing: -.45px; }
        .refined-analytics .brand-caption { color: #8b968c; font-size: 10px; letter-spacing: .11em; text-transform: uppercase; margin-top: 2px; }
        .refined-analytics .shop-chip { color: #aeb8ae; border-left: 1px solid #354037; margin-left: 6px; padding-left: 18px; font-size: 12px; }
        .refined-analytics .top-actions { display: flex; align-items: center; gap: 12px; }
        .refined-analytics .live-indicator { display: inline-flex; gap: 8px; align-items: center; color: #9db49f; font-size: 11px; }
        .refined-analytics .live-dot { width: 7px; height: 7px; background: #83cf86; border-radius: 100%; box-shadow: 0 0 0 3px #83cf861b; }
        .refined-analytics .button-primary,.refined-analytics .button-quiet,.refined-analytics .icon-button { border: 0; display: inline-flex; align-items: center; justify-content: center; gap: 8px; transition: transform .16s ease, opacity .16s ease, background .16s ease; }
        .refined-analytics .button-primary { border-radius: 9px; padding: 10px 15px; background: var(--lime); color: #151914; font-weight: 750; font-size: 12px; }
        .refined-analytics .button-primary:hover { background: #d7ff50; transform: translateY(-1px); }
        .refined-analytics .button-quiet { border: 1px solid #354037; background: #202721; color: #dbe4da; border-radius: 9px; padding: 9px 12px; font-weight: 650; font-size: 11px; }
        .refined-analytics .button-quiet:hover { background: #29332b; }
        .refined-analytics .icon-button { width: 34px; height: 34px; border-radius: 8px; background: transparent; color: var(--dim); }
        .refined-analytics .icon-button:hover { background: #2a322c; color: var(--ink); }
        .refined-analytics .intro { padding: 27px 0 20px; display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; }
        .refined-analytics h1,.refined-analytics h2,.refined-analytics h3,.refined-analytics p { margin: 0; }
        .refined-analytics h1 { font: 600 30px/1.08 'Clash Display', 'DM Sans', sans-serif; letter-spacing: -1.05px; }
        .refined-analytics .intro-note { color: var(--dim); font-size: 12px; margin-top: 7px; }
        .refined-analytics .period-box { display: flex; align-items: center; gap: 12px; }
        .refined-analytics .range-control { display: flex; gap: 3px; background: #1a201b; border: 1px solid #2d362f; padding: 4px; border-radius: 10px; }
        .refined-analytics .range-control button { border: 0; background: transparent; border-radius: 6px; padding: 7px 10px; font-size: 11px; color: #a9b3a9; white-space: nowrap; }
        .refined-analytics .range-control button.selected { background: #303a31; color: #e8f0e5; box-shadow: inset 0 0 0 1px #445046; }
        .refined-analytics .date-custom { display: flex; align-items: center; gap: 7px; }
        .refined-analytics input[type=date],.refined-analytics .search-input { border: 1px solid #354037; background: #1b211c; color: var(--ink); border-radius: 8px; outline: none; }
        .refined-analytics input[type=date] { width: 132px; padding: 8px; font: 10px 'JetBrains Mono', monospace; }
        .refined-analytics input:focus { border-color: #9fc94a; }
        .refined-analytics .eyebrow { text-transform: uppercase; letter-spacing: .12em; font-weight: 700; color: #97a395; font-size: 9px; }
        .refined-analytics .overview { display: grid; grid-template-columns: minmax(280px, 1.65fr) repeat(3, minmax(150px, .85fr)); gap: 10px; }
        .refined-analytics .hero-kpi,.refined-analytics .metric-kpi,.refined-analytics .panel { background: var(--surface); border: 1px solid var(--line); border-radius: 13px; }
        .refined-analytics .hero-kpi { min-height: 144px; padding: 17px 20px; position: relative; overflow: hidden; background: #1b241c; border-color: #3b4a33; }
        .refined-analytics .hero-kpi:after { content: ''; position: absolute; width: 240px; height: 160px; right: -68px; bottom: -92px; border-radius: 100%; border: 1px solid #c8ff0027; box-shadow: 0 0 0 24px #c8ff0007, 0 0 0 48px #c8ff0005; pointer-events: none; }
        .refined-analytics .hero-head { display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 1; }
        .refined-analytics .hero-head .eyebrow { color: #b8c59d; }
        .refined-analytics .hero-amount { font: 600 34px/1.05 'JetBrains Mono', monospace; letter-spacing: -1.8px; margin-top: 13px; position: relative; z-index: 1; }
        .refined-analytics .hero-foot { display: flex; align-items: center; gap: 10px; margin-top: 11px; color: #aab7a5; font-size: 11px; position: relative; z-index: 1; }
        .refined-analytics .hero-foot b { color: #dce9d5; font-weight: 600; }
        .refined-analytics .metric-kpi { padding: 16px 16px 14px; min-height: 144px; display: flex; flex-direction: column; }
        .refined-analytics .metric-top { display: flex; align-items: center; justify-content: space-between; color: #a3aea2; }
        .refined-analytics .metric-icon { color: var(--lime); width: 29px; height: 29px; display: grid; place-items: center; border: 1px solid #c8ff0029; border-radius: 8px; background: #c8ff000b; }
        .refined-analytics .metric-kpi strong { font: 600 20px 'JetBrains Mono', monospace; letter-spacing: -.8px; margin-top: 14px; }
        .refined-analytics .metric-kpi .metric-caption { color: #8f9b90; font-size: 10px; margin-top: 5px; }
        .refined-analytics .delta { display: inline-flex; align-items: center; gap: 3px; padding: 4px 6px; font: 600 10px 'JetBrains Mono', monospace; border-radius: 5px; }
        .refined-analytics .delta.positive { color: #8bd29a; background: #7acf9013; }
        .refined-analytics .delta.negative { color: #ee9184; background: #e37e7214; }
        .refined-analytics .section-label { display: flex; align-items: baseline; justify-content: space-between; margin: 24px 0 10px; }
        .refined-analytics .section-label h2 { font: 600 15px 'Syne', sans-serif; letter-spacing: -.25px; }
        .refined-analytics .section-label span { color: #859087; font-size: 10px; }
        .refined-analytics .content-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(300px, .92fr); gap: 12px; align-items: stretch; }
        .refined-analytics .panel { min-width: 0; }
        .refined-analytics .panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding: 15px 17px 10px; }
        .refined-analytics .panel-title { font: 600 13px 'Syne', sans-serif; letter-spacing: -.12px; }
        .refined-analytics .panel-subtitle { color: #869087; font-size: 10px; margin-top: 4px; }
        .refined-analytics .legend { display: flex; align-items: center; gap: 12px; color: #a4aea4; font-size: 10px; }
        .refined-analytics .legend span { display: inline-flex; align-items: center; gap: 5px; }
        .refined-analytics .legend i { width: 7px; height: 7px; border-radius: 50%; background: var(--lime); }
        .refined-analytics .legend .legend-profit { background: var(--good); }
        .refined-analytics .chart-holder { height: 230px; width: 100%; padding: 0 8px 0 0; }
        .refined-analytics .recharts-cartesian-grid-horizontal line { stroke: #303831; }
        .refined-analytics .recharts-tooltip-wrapper { outline: none; }
        .refined-analytics .chart-tooltip { background: #222a23; border: 1px solid #424b42; border-radius: 8px; padding: 8px 10px; color: #e7eee4; box-shadow: 0 10px 30px #0005; font-size: 10px; }
        .refined-analytics .chart-tooltip strong { display: block; margin-bottom: 5px; color: #c4cfbf; }
        .refined-analytics .chart-tooltip span { display: block; font-family: 'JetBrains Mono', monospace; line-height: 1.7; }
        .refined-analytics .chart-footer { display: flex; gap: 8px; padding: 10px 15px 14px; border-top: 1px solid #2b332d; }
        .refined-analytics .chart-insight { border-left: 2px solid #c8ff00; padding-left: 9px; }
        .refined-analytics .chart-insight span { display: block; font-size: 9px; color: #8e998f; }
        .refined-analytics .chart-insight b { display: block; font: 600 11px 'JetBrains Mono', monospace; margin-top: 3px; }
        .refined-analytics .side-stack { display: grid; grid-template-rows: auto 1fr; gap: 12px; }
        .refined-analytics .payments { padding: 0 16px 15px; }
        .refined-analytics .payment-row { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 3px 12px; padding: 10px 0; border-bottom: 1px solid #2c342e; }
        .refined-analytics .payment-row:last-of-type { border-bottom: 0; }
        .refined-analytics .pay-label { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #cbd4ca; }
        .refined-analytics .pay-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--lime); }
        .refined-analytics .pay-dot.blue { background: var(--blue); }
        .refined-analytics .pay-dot.amber { background: var(--amber); }
        .refined-analytics .payment-row strong { font: 500 12px 'JetBrains Mono', monospace; }
        .refined-analytics .payment-row small { grid-column: 1 / -1; color: #879287; font-size: 9px; margin-left: 15px; }
        .refined-analytics .payment-bar { height: 6px; display: flex; overflow: hidden; border-radius: 10px; background: #303832; margin: 4px 0 10px; }
        .refined-analytics .payment-bar i:first-child { background: var(--lime); }
        .refined-analytics .payment-bar i:nth-child(2) { background: var(--blue); }
        .refined-analytics .payment-bar i:nth-child(3) { background: var(--amber); }
        .refined-analytics .payment-foot { display: flex; justify-content: space-between; align-items: center; color: #94a095; font-size: 9px; }
        .refined-analytics .payment-foot b { color: #d9e2d7; font: 500 10px 'JetBrains Mono', monospace; }
        .refined-analytics .compare-panel { padding-bottom: 14px; }
        .refined-analytics .compare-head { padding-bottom: 12px; align-items: center; }
        .refined-analytics .compare-rows { padding: 0 16px; }
        .refined-analytics .compare-row { display: grid; grid-template-columns: 1fr 1fr auto; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid #2d352f; }
        .refined-analytics .compare-row > span:first-child { font-size: 10px; color: #a2ada2; }
        .refined-analytics .compare-current { font: 500 11px 'JetBrains Mono', monospace; }
        .refined-analytics .compare-prev { color: #829084; font-size: 9px; margin-top: 3px; }
        .refined-analytics .bottom-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(275px, .8fr) minmax(255px, .75fr); gap: 12px; margin-top: 12px; }
        .refined-analytics .hourly-panel { grid-column: 1 / -1; }
        .refined-analytics .hourly-chart { height: 105px; padding: 0 10px 8px 0; }
        .refined-analytics .peak-pill { border: 1px solid #37423a; background: #232a24; border-radius: 7px; padding: 6px 8px; color: #aab5a9; font-size: 9px; }
        .refined-analytics .peak-pill b { color: var(--lime); font-family: 'JetBrains Mono', monospace; margin-left: 4px; }
        .refined-analytics .product-row { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 9px; align-items: center; padding: 10px 15px; border-top: 1px solid #2b332d; }
        .refined-analytics .rank { color: #9ba69a; font: 500 10px 'JetBrains Mono', monospace; }
        .refined-analytics .product-name { font-size: 10px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .refined-analytics .product-meta { color: #879287; font-size: 9px; margin-top: 4px; display: flex; align-items: center; gap: 7px; }
        .refined-analytics .mini-track { height: 3px; width: 55px; background: #333d35; border-radius: 4px; overflow: hidden; }
        .refined-analytics .mini-track i { display: block; height: 100%; background: var(--lime); border-radius: 4px; }
        .refined-analytics .product-value { text-align: right; }
        .refined-analytics .product-value b { display: block; font: 500 10px 'JetBrains Mono', monospace; }
        .refined-analytics .product-value small { color: #8ec99a; display: block; font: 9px 'JetBrains Mono', monospace; margin-top: 4px; }
        .refined-analytics .category-row { border-top: 1px solid #2b332d; }
        .refined-analytics .category-toggle { border: 0; background: transparent; width: 100%; display: grid; grid-template-columns: 8px minmax(0,1fr) auto 16px; align-items: center; gap: 9px; padding: 12px 14px; text-align: left; }
        .refined-analytics .category-toggle:hover { background: #202821; }
        .refined-analytics .category-mark { width: 7px; height: 26px; border-radius: 4px; background: var(--lime); }
        .refined-analytics .category-row:nth-child(3n) .category-mark { background: #76be8b; }
        .refined-analytics .category-row:nth-child(4n) .category-mark { background: #8dbbd0; }
        .refined-analytics .category-row:nth-child(5n) .category-mark { background: #d8a961; }
        .refined-analytics .category-name { font-size: 10px; font-weight: 650; }
        .refined-analytics .category-detail { color: #839084; font-size: 9px; margin-top: 4px; }
        .refined-analytics .category-total { text-align: right; }
        .refined-analytics .category-total b { display: block; font: 500 10px 'JetBrains Mono', monospace; }
        .refined-analytics .category-total small { color: #869288; font-size: 9px; }
        .refined-analytics .category-products { background: #151a16; border-top: 1px solid #2b332d; padding: 0 12px 7px; }
        .refined-analytics .category-tools { display: flex; justify-content: space-between; align-items: center; padding: 9px 2px; color: #89958a; font-size: 9px; }
        .refined-analytics .category-tools > div { display: flex; gap: 5px; }
        .refined-analytics .tiny-button { border: 1px solid #354037; background: #202721; border-radius: 5px; color: #c5cfc4; display: inline-flex; align-items: center; gap: 4px; padding: 5px 7px; font-size: 9px !important; }
        .refined-analytics .tiny-button:hover { background: #2b352c; }
        .refined-analytics .category-product { display: grid; grid-template-columns: 1fr auto auto; gap: 9px; padding: 7px 2px; border-top: 1px solid #29312b; align-items: center; }
        .refined-analytics .category-product span:first-child { font-size: 9px; color: #bac4b9; }
        .refined-analytics .category-product span:not(:first-child) { font: 9px 'JetBrains Mono', monospace; color: #a0aca0; }
        .refined-analytics .category-progress { height: 3px; background: #303932; overflow: hidden; border-radius: 3px; margin-top: 7px; }
        .refined-analytics .category-progress i { display: block; height: 100%; background: #879c55; }
        .refined-analytics .category-footer { padding: 11px 14px; border-top: 1px solid #333c35; display: flex; align-items: center; justify-content: space-between; color: #9eaa9e; font-size: 9px; }
        .refined-analytics .category-footer b { color: #e1e9df; font: 500 10px 'JetBrains Mono', monospace; }
        .refined-analytics .stock-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 7px; padding: 3px 14px 13px; }
        .refined-analytics .stock-stat { border: 1px solid #344036; border-radius: 8px; padding: 9px 10px; background: #1b221c; }
        .refined-analytics .stock-stat.warn { border-color: #594837; background: #242019; }
        .refined-analytics .stock-stat.critical { border-color: #5c3c39; background: #241d1b; }
        .refined-analytics .stock-stat span { color: #96a195; font-size: 8px; text-transform: uppercase; letter-spacing: .07em; }
        .refined-analytics .stock-stat b { display: block; font: 600 18px 'JetBrains Mono', monospace; margin-top: 6px; }
        .refined-analytics .stock-stat.critical b { color: #e18b7e; }
        .refined-analytics .stock-stat.warn b { color: #e5b56f; }
        .refined-analytics .stock-value { margin: 0 14px 13px; padding: 11px; display: flex; justify-content: space-between; border-top: 1px solid #303932; border-bottom: 1px solid #303932; align-items: center; }
        .refined-analytics .stock-value span { color: #a1aca1; font-size: 10px; }
        .refined-analytics .stock-value b { font: 500 11px 'JetBrains Mono', monospace; }
        .refined-analytics .stock-list-title { padding: 0 14px 7px; color: #839084; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
        .refined-analytics .stock-item { padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #2b332d; }
        .refined-analytics .stock-item span { font-size: 10px; }
        .refined-analytics .stock-item small { font-size: 9px; color: #e0ae67; }
        .refined-analytics .stock-item small.out { color: #e18579; }
        .refined-analytics .debt-strip { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 14px 17px; background: #211e1a; border: 1px solid #493b2e; border-radius: 12px; }
        .refined-analytics .debt-lead { display: flex; align-items: center; gap: 10px; }
        .refined-analytics .debt-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 8px; color: #e4b56e; background: #e4b56e14; }
        .refined-analytics .debt-lead b { display: block; font-size: 11px; }
        .refined-analytics .debt-lead small { display: block; margin-top: 3px; color: #a09583; font-size: 9px; }
        .refined-analytics .debt-total { color: #ebc482; font: 500 15px 'JetBrains Mono', monospace; }
        .refined-analytics .search-panel { margin-top: 12px; }
        .refined-analytics .search-controls { padding: 0 16px 13px; }
        .refined-analytics .search-periods { display: flex; gap: 5px; overflow: auto; padding-bottom: 10px; }
        .refined-analytics .search-periods button { flex: 0 0 auto; border: 1px solid #354037; background: #1d241e; color: #9ba79b; padding: 5px 8px; border-radius: 6px; font-size: 9px; }
        .refined-analytics .search-periods button.active { background: #2d3b26; border-color: #52643c; color: #ddf59e; }
        .refined-analytics .search-wrap { position: relative; }
        .refined-analytics .search-wrap svg { position: absolute; left: 11px; top: 11px; color: #859187; }
        .refined-analytics .search-input { width: 100%; height: 37px; padding: 0 35px; font-size: 10px; }
        .refined-analytics .search-input::placeholder { color: #69766b; }
        .refined-analytics .search-clear { position: absolute; top: 6px; right: 6px; }
        .refined-analytics .search-note { color: #778378; font-size: 9px; padding: 0 16px 13px; }
        .refined-analytics .lookup-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto auto; gap: 10px; padding: 10px 15px; align-items: center; border-top: 1px solid #2b332d; }
        .refined-analytics .lookup-row b { font-size: 10px; }
        .refined-analytics .lookup-row small { display: block; color: #869286; font-size: 9px; margin-top: 3px; }
        .refined-analytics .lookup-row span { font: 9px 'JetBrains Mono', monospace; color: #bdc8bb; text-align: right; }
        .refined-analytics .lookup-summary { display: flex; justify-content: space-between; gap: 8px; padding: 10px 15px; background: #1e2a1d; border-top: 1px solid #34412f; }
        .refined-analytics .lookup-summary span { color: #9eae9a; font-size: 9px; }
        .refined-analytics .lookup-summary b { display: block; color: #def0d4; font: 500 10px 'JetBrains Mono', monospace; margin-top: 4px; }
        .refined-analytics .audit-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.3fr); gap: 12px; margin-top: 12px; }
        .refined-analytics .void-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 15px; }
        .refined-analytics .void-heading { display: flex; align-items: center; gap: 8px; }
        .refined-analytics .void-icon { width: 27px; height: 27px; display: grid; place-items: center; color: #df8b7f; background: #e37e7215; border-radius: 7px; }
        .refined-analytics .void-heading b { display: block; font-size: 10px; }
        .refined-analytics .void-heading small { display: block; color: #8e988e; font-size: 9px; margin-top: 3px; }
        .refined-analytics .void-amount { color: #e58e82; font: 500 10px 'JetBrains Mono', monospace; }
        .refined-analytics .void-detail { border-top: 1px solid #2d352f; padding: 9px 15px; display: flex; justify-content: space-between; align-items: center; color: #b0bab0; font-size: 9px; }
        .refined-analytics .void-detail span:last-child { color: #d79187; font: 10px 'JetBrains Mono', monospace; }
        .refined-analytics .void-toggle { border: 0; background: transparent; color: #8f9b90; display: flex; align-items: center; gap: 4px; font-size: 9px; padding: 0 15px 12px; }
        .refined-analytics .margin-list { padding-bottom: 3px; }
        .refined-analytics .margin-item { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 12px; padding: 9px 14px; border-top: 1px solid #2b332d; align-items: center; }
        .refined-analytics .margin-item b { display: block; font-size: 9px; }
        .refined-analytics .margin-item small { display: block; color: #8b968c; font-size: 8px; margin-top: 4px; }
        .refined-analytics .margin-badge { color: #e0a66d; background: #e2ae6314; border-radius: 5px; padding: 5px 6px; font: 500 9px 'JetBrains Mono', monospace; }
        .refined-analytics .margin-badge.danger { color: #e38b7f; background: #e37e7217; }
        .refined-analytics .modal-spacer { min-height: 100%; }
        .cash-backdrop { position: fixed; inset: 0; z-index: 70; padding: 18px; display: grid; place-items: center; background: #050806bd; backdrop-filter: blur(8px); }
        .cash-modal { width: min(470px, 100%); max-height: min(90dvh, 780px); overflow-y: auto; border-radius: 16px; background: #1b211c; border: 1px solid #3b463c; box-shadow: 0 28px 90px #0008; animation: cash-in .18s ease-out; }
        @keyframes cash-in { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: translateY(0); } }
        .cash-modal-head { display: flex; align-items: center; gap: 10px; padding: 16px 18px; border-bottom: 1px solid #303a32; }
        .cash-modal-head h2 { font: 600 15px 'Syne', sans-serif; }
        .cash-modal-head p { font-size: 10px; color: #8f9c8f; margin-top: 4px; }
        .cash-modal-head .icon-button { margin-left: auto; }
        .cash-modal-mark { width: 32px; height: 32px; display: grid; place-items: center; color: #d4f277; background: #c8ff0015; border-radius: 9px; }
        .cash-total { text-align: center; padding: 21px 15px; background: #20291e; border-bottom: 1px solid #35422f; }
        .cash-total span { display: block; color: #b7c692; text-transform: uppercase; letter-spacing: .12em; font-size: 9px; font-weight: 700; }
        .cash-total strong { display: block; margin-top: 8px; font: 600 31px 'JetBrains Mono', monospace; letter-spacing: -1px; }
        .cash-total small { display: block; margin-top: 4px; color: #8e9a8b; font-size: 9px; }
        .cash-modal-content { padding: 14px 18px; display: grid; gap: 14px; }
        .cash-group > small { display: block; margin-bottom: 6px; color: #89968a; font-size: 9px; text-transform: uppercase; letter-spacing: .11em; font-weight: 700; }
        .cash-group > div { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: #202721; border-bottom: 1px solid #303a32; font-size: 10px; }
        .cash-group > div:first-of-type { border-radius: 8px 8px 0 0; }
        .cash-group > div:last-child { border-radius: 0 0 8px 8px; border-bottom: 0; }
        .cash-group > div span { color: #a4afa4; }
        .cash-group > div b { font: 500 10px 'JetBrains Mono', monospace; }
        .cash-group .cash-subtotal { background: #263124; color: #d9f09a; }
        .cash-group .cash-subtotal span,.cash-group .cash-subtotal b { color: #d9f09a; font-weight: 600; }
        .cash-group .warn-text { color: #e3b271; }
        .cash-group .profit-text { color: #93d39c; }
        .cash-group i { color: #8da293; font: normal 9px 'DM Sans', sans-serif; margin-left: 4px; }
        .cash-alert { display: flex; align-items: center; gap: 8px; border: 1px solid #59463a; background: #29231d; color: #d6b280; border-radius: 8px; padding: 10px; font-size: 10px; }
        .cash-alert b { margin-left: auto; font: 500 10px 'JetBrains Mono', monospace; }
        .cash-modal-foot { padding: 12px 18px 16px; border-top: 1px solid #303a32; display: flex; justify-content: flex-end; gap: 8px; }
        @media (max-width: 1050px) {
          .refined-analytics .page-wrap { padding: 0 22px; }
          .refined-analytics .overview { grid-template-columns: repeat(3, minmax(0,1fr)); }
          .refined-analytics .hero-kpi { grid-column: 1 / -1; min-height: 126px; }
          .refined-analytics .content-grid { grid-template-columns: minmax(0,1.5fr) minmax(270px,.9fr); }
          .refined-analytics .bottom-grid { grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
          .refined-analytics .stock-panel { grid-column: 1 / -1; }
          .refined-analytics .stock-list { display: grid; grid-template-columns: repeat(3,1fr); }
          .refined-analytics .stock-item { border-top: 1px solid #2b332d; gap: 8px; }
        }
        @media (max-width: 760px) {
          .refined-analytics .page-wrap { padding: 0 14px; }
          .refined-analytics .topbar-inner { min-height: 62px; }
          .refined-analytics .shop-chip,.refined-analytics .live-indicator { display: none; }
          .refined-analytics .intro { display: block; padding: 23px 0 16px; }
          .refined-analytics h1 { font-size: 27px; }
          .refined-analytics .period-box { margin-top: 16px; display: block; }
          .refined-analytics .range-control { overflow-x: auto; }
          .refined-analytics .range-control button { flex: 1; }
          .refined-analytics .date-custom { margin-top: 8px; }
          .refined-analytics .date-custom input { flex: 1; width: 0; }
          .refined-analytics .overview { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; }
          .refined-analytics .hero-kpi { min-height: 127px; padding: 15px; }
          .refined-analytics .hero-amount { font-size: 29px; }
          .refined-analytics .metric-kpi { min-height: 123px; padding: 13px; }
          .refined-analytics .metric-kpi strong { font-size: 16px; }
          .refined-analytics .content-grid,.refined-analytics .bottom-grid,.refined-analytics .audit-grid { grid-template-columns: 1fr; }
          .refined-analytics .side-stack { grid-template-rows: auto auto; }
          .refined-analytics .chart-holder { height: 205px; }
          .refined-analytics .hourly-panel,.refined-analytics .stock-panel { grid-column: auto; }
          .refined-analytics .stock-list { display: block; }
          .refined-analytics .stock-item { padding-left: 14px; }
          .refined-analytics .panel-header { padding: 14px 14px 9px; }
          .refined-analytics .legend { gap: 8px; font-size: 9px; }
          .refined-analytics .section-label { margin-top: 20px; }
          .refined-analytics .debt-strip { padding: 12px; }
          .refined-analytics .debt-total { font-size: 12px; }
        }
        @media (max-width: 400px) {
          .refined-analytics .top-actions { gap: 6px; }
          .refined-analytics .top-actions .button-primary { padding: 9px 10px; }
          .refined-analytics .brand-name { font-size: 13px; }
          .refined-analytics .legend { display: none; }
          .refined-analytics .lookup-row { grid-template-columns: minmax(0,1fr) auto; }
          .refined-analytics .lookup-row span:nth-last-child(-n+2) { display: none; }
        }
      `}</style>

      {showCashUp && <CashUpModal onClose={() => setShowCashUp(false)} />}
      <div className="topbar">
        <div className="page-wrap topbar-inner">
          <div className="brand">
            <div className="brand-symbol">GL</div>
            <div><div className="brand-name">GreenLink OS</div><div className="brand-caption">Field-side co-pilot</div></div>
            <div className="shop-chip">{shopName}</div>
          </div>
          <div className="top-actions">
            <span className="live-indicator"><i className="live-dot" /> Live data</span>
            <button className="button-primary" onClick={() => setShowCashUp(true)}><Wallet size={15} /> Cash Up</button>
          </div>
        </div>
      </div>

      <div className="page-wrap">
        <div className="intro">
          <div>
            <h1>Analytics</h1>
            <p className="intro-note">{format(today, "EEEE, d MMMM yyyy")} <span style={{ color: "#647064" }}>·</span> Your shop, at a glance.</p>
          </div>
          <div className="period-box">
            <div className="range-control" aria-label="Report date range">
              {([
                ["today", "Today"], ["week", "This week"], ["month", "This month"], ["custom", "Custom"],
              ] as [RangeKey, string][]).map(([key, label]) => (
                <button key={key} className={range === key ? "selected" : ""} onClick={() => setRange(key)}>{label}</button>
              ))}
            </div>
            {range === "custom" && (
              <div className="date-custom">
                <input type="date" aria-label="Start date" value={customFrom} max={format(today, "yyyy-MM-dd")} onChange={(event) => setCustomFrom(event.target.value)} />
                <span style={{ color: "#778379", fontSize: 10 }}>to</span>
                <input type="date" aria-label="End date" value={customTo} max={format(today, "yyyy-MM-dd")} onChange={(event) => setCustomTo(event.target.value)} />
              </div>
            )}
          </div>
        </div>

        <section className="overview" aria-label="Period sales summary">
          <article className="hero-kpi">
            <div className="hero-head"><span className="eyebrow">Gross revenue · selected period</span><TrendingUp size={17} color="#c8ff00" /></div>
            <div className="hero-amount">{fmtKES(periodValues.revenue)}</div>
            <div className="hero-foot"><Delta value={14.2} /><span>vs {comparisonName.toLowerCase()}</span><b>·</b><span>{periodValues.sales} transactions</span></div>
          </article>
          <article className="metric-kpi">
            <div className="metric-top"><span className="eyebrow">Gross profit</span><div className="metric-icon"><BarChart3 size={15} /></div></div>
            <strong>{fmtKES(periodValues.profit)}</strong><span className="metric-caption">23.2% gross margin</span>
          </article>
          <article className="metric-kpi">
            <div className="metric-top"><span className="eyebrow">Average sale</span><div className="metric-icon"><ShoppingBag size={14} /></div></div>
            <strong>{fmtKES(Math.round(periodValues.revenue / periodValues.sales))}</strong><span className="metric-caption">per transaction</span>
          </article>
          <article className="metric-kpi">
            <div className="metric-top"><span className="eyebrow">Cash collected</span><div className="metric-icon"><Banknote size={15} /></div></div>
            <strong>{fmtKES(moneyIn.collected)}</strong><span className="metric-caption">{fmtKES(moneyIn.credit)} issued on credit</span>
          </article>
        </section>

        <div className="section-label"><h2>Sales pulse</h2><span>{format(new Date(activeRange.from + "T12:00:00"), "d MMM")} — {format(new Date(activeRange.to + "T12:00:00"), "d MMM yyyy")}</span></div>
        <section className="content-grid">
          <article className="panel">
            <div className="panel-header">
              <div><h2 className="panel-title">Daily sales profile</h2><p className="panel-subtitle">Revenue, gross profit and transaction volume</p></div>
              <div className="legend"><span><i /> Revenue</span><span><i className="legend-profit" /> Profit</span></div>
            </div>
            <div className="chart-holder">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dailySales} margin={{ top: 7, right: 13, left: -12, bottom: 0 }}>
                  <defs><linearGradient id="refinedRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c8ff00" stopOpacity=".2" /><stop offset="95%" stopColor="#c8ff00" stopOpacity="0" /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="#303831" strokeDasharray="3 4" />
                  <XAxis dataKey="label" tick={{ fill: "#89958a", fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis yAxisId="money" tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} tick={{ fill: "#89958a", fontSize: 9 }} axisLine={false} tickLine={false} width={38} />
                  <YAxis yAxisId="sales" orientation="right" tick={{ fill: "#707d72", fontSize: 9 }} axisLine={false} tickLine={false} width={25} allowDecimals={false} />
                  <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tooltip"><strong>{label}</strong><span style={{ color: "#c8ff00" }}>Revenue {fmtKES(Number(payload.find((item) => item.dataKey === "revenue")?.value || 0))}</span><span style={{ color: "#8fd19c" }}>Profit {fmtKES(Number(payload.find((item) => item.dataKey === "profit")?.value || 0))}</span><span style={{ color: "#98a398" }}>{payload.find((item) => item.dataKey === "salesCount")?.value} transactions</span></div> : null} />
                  <Bar yAxisId="sales" dataKey="salesCount" fill="#667567" opacity={0.28} radius={[2, 2, 0, 0]} barSize={8} />
                  <Area yAxisId="money" type="monotone" dataKey="revenue" stroke="#c8ff00" strokeWidth={2} fill="url(#refinedRevenue)" activeDot={{ r: 4, fill: "#d8ff62", stroke: "#1b241c", strokeWidth: 2 }} isAnimationActive={false} />
                  <Area yAxisId="money" type="monotone" dataKey="profit" stroke="#79cf91" strokeWidth={1.5} fill="transparent" activeDot={{ r: 3, fill: "#79cf91", strokeWidth: 0 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="chart-footer">
              <div className="chart-insight"><span>Strongest day</span><b>{format(subDays(today, 8), "d MMM")} · {fmtKES(Math.max(...dailySales.map((day) => day.revenue)))}</b></div>
              <div className="chart-insight" style={{ borderColor: "#79cf91" }}><span>Chart window</span><b>14 days</b></div>
              <div className="chart-insight" style={{ borderColor: "#60756a" }}><span>Avg. per day</span><b>{fmtKES(Math.round(periodValues.revenue / 14))}</b></div>
            </div>
          </article>
          <div className="side-stack">
            <article className="panel">
              <div className="panel-header"><div><h2 className="panel-title">Payment mix</h2><p className="panel-subtitle">Sales by payment method</p></div><CalendarDays size={15} color="#879487" /></div>
              <div className="payments">
                <div className="payment-row"><span className="pay-label"><i className="pay-dot" />Cash</span><strong>{fmtKES(moneyIn.cash)}</strong><small>{Math.round(moneyIn.cash / periodValues.revenue * 100)}% of recorded sales</small></div>
                <div className="payment-row"><span className="pay-label"><i className="pay-dot blue" />M-Pesa / bank</span><strong>{fmtKES(moneyIn.bank)}</strong><small>{Math.round(moneyIn.bank / periodValues.revenue * 100)}% of recorded sales</small></div>
                <div className="payment-row"><span className="pay-label"><i className="pay-dot amber" />Credit sales</span><strong>{fmtKES(moneyIn.credit)}</strong><small>{Math.round(moneyIn.credit / periodValues.revenue * 100)}% of recorded sales</small></div>
                <div className="payment-bar"><i style={{ width: "43%" }} /><i style={{ width: "42%" }} /><i style={{ width: "15%" }} /></div>
                <div className="payment-foot"><span>Debt payments collected</span><b>{fmtKES(moneyIn.collected)}</b></div>
              </div>
            </article>
            <article className="panel compare-panel">
              <div className="panel-header compare-head"><div><h2 className="panel-title">Period comparison</h2><p className="panel-subtitle">Compared with {comparisonName.toLowerCase()}</p></div><Activity size={15} color="#8fa27d" /></div>
              <div className="compare-rows">
                {[
                  { label: "Revenue", current: periodValues.revenue, previous: previousPeriod.revenue, change: 14.2 },
                  { label: "Gross profit", current: periodValues.profit, previous: previousPeriod.profit, change: 20.5 },
                  { label: "Transactions", current: periodValues.sales, previous: previousPeriod.sales, change: 9.1 },
                ].map((item) => (
                  <div className="compare-row" key={item.label}>
                    <span>{item.label}</span>
                    <div><div className="compare-current">{item.label === "Transactions" ? item.current : fmtKES(item.current)}</div><div className="compare-prev">prev {item.label === "Transactions" ? item.previous : fmtKES(item.previous)}</div></div>
                    <Delta value={item.change} />
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="bottom-grid">
          <article className="panel">
            <div className="panel-header">
              <div><h2 className="panel-title">Category performance</h2><p className="panel-subtitle">Revenue contribution · select a category to expand</p></div>
              <div style={{ display: "flex", gap: 5 }}>
                <button className="tiny-button" onClick={() => exportCategories(undefined, "pdf")} title="Print category report"><FileText size={12} /> PDF</button>
                <button className="tiny-button" onClick={() => exportCategories(undefined, "csv")} title="Download category report"><Download size={12} /> CSV</button>
              </div>
            </div>
            {categories.map((category, index) => {
              const share = category.totalRevenue / totalCategoryRevenue * 100;
              const expanded = expandedCategory === category.category;
              return (
                <div className="category-row" key={category.category}>
                  <button className="category-toggle" aria-expanded={expanded} onClick={() => setExpandedCategory(expanded ? null : category.category)}>
                    <i className="category-mark" />
                    <div><div className="category-name">{category.category}</div><div className="category-detail">{category.salesCount} units · {(category.totalProfit / category.totalRevenue * 100).toFixed(1)}% margin</div><div className="category-progress"><i style={{ width: `${share}%` }} /></div></div>
                    <div className="category-total"><b>{fmtKES(category.totalRevenue)}</b><small>{share.toFixed(0)}% share</small></div>
                    {expanded ? <ChevronUp size={14} color="#8c988c" /> : <ChevronRight size={14} color="#8c988c" />}
                  </button>
                  {expanded && (
                    <div className="category-products">
                      <div className="category-tools"><span>{category.products.length} products sold</span><div><button className="tiny-button" onClick={() => exportCategories(category, "pdf")}><FileText size={11} /> PDF</button><button className="tiny-button" onClick={() => exportCategories(category, "csv")}><Download size={11} /> CSV</button></div></div>
                      {category.products.map((product) => (
                        <div className="category-product" key={product.productName}>
                          <span>{product.productName}</span><span>×{product.qtySold}</span><span>{fmtKES(product.totalRevenue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="category-footer"><span>Total · 287 units · 23.2% avg. margin</span><b>{fmtKES(totalCategoryRevenue)}</b></div>
          </article>

          <article className="panel">
            <div className="panel-header"><div><h2 className="panel-title">Top products</h2><p className="panel-subtitle">By revenue this period</p></div><Layers3 size={15} color="#a5b774" /></div>
            {topProducts.map((product, index) => (
              <div className="product-row" key={product.name}>
                <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                <div style={{ minWidth: 0 }}><div className="product-name">{product.name}</div><div className="product-meta"><div className="mini-track"><i style={{ width: `${product.revenue / topProducts[0].revenue * 100}%` }} /></div><span>{product.qty} sold</span></div></div>
                <div className="product-value"><b>{fmtKES(product.revenue)}</b><small>+{fmtKES(product.profit)}</small></div>
              </div>
            ))}
          </article>

          <article className="panel stock-panel">
            <div className="panel-header"><div><h2 className="panel-title">Stock health</h2><p className="panel-subtitle">Capital and replenishment watch</p></div><Package size={15} color="#d5a75f" /></div>
            <div className="stock-grid">
              <div className="stock-stat critical"><span>Out of stock</span><b>{dashboardToday.outOfStock}</b></div>
              <div className="stock-stat warn"><span>Low stock</span><b>{dashboardToday.lowStock}</b></div>
              <div className="stock-stat"><span>In stock</span><b>5</b></div>
            </div>
            <div className="stock-value"><span>Inventory value · at cost</span><b>{fmtKES(inventoryValue)}</b></div>
            <div className="stock-list-title">Needs attention</div>
            <div className="stock-list">
              {stockItems.map((item) => <div className="stock-item" key={item.name}><span>{item.name}</span><small className={item.qty === 0 ? "out" : ""}>{item.qty === 0 ? "Out of stock" : `${item.qty} left`}</small></div>)}
            </div>
          </article>
        </section>

        <section className="debt-strip" aria-label="Outstanding debt alert">
          <div className="debt-lead"><div className="debt-icon"><TrendingDown size={17} /></div><div><b>Outstanding debt</b><small>Pending collection across customer accounts</small></div></div>
          <strong className="debt-total">{fmtKES(dashboardToday.pendingDebt)}</strong>
        </section>

        <div className="section-label"><h2>Shop-floor detail</h2><span>Today’s activity and price health</span></div>
        <article className="panel hourly-panel">
          <div className="panel-header">
            <div><h2 className="panel-title">Hourly activity</h2><p className="panel-subtitle">Transactions throughout today</p></div>
            <div className="peak-pill"><Clock3 size={12} style={{ verticalAlign: "middle" }} /> Peak <b>2pm</b> · 10 sales</div>
          </div>
          <div className="hourly-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlySales} margin={{ top: 5, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#303831" strokeDasharray="3 4" />
                <XAxis dataKey="hour" tick={{ fill: "#89958a", fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#89958a", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="chart-tooltip"><strong>{label}</strong><span style={{ color: "#c8ff00" }}>{payload[0].value} transactions</span></div> : null} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} barSize={19}>
                  {hourlySales.map((entry) => <Cell key={entry.hour} fill={entry.hour === "2pm" ? "#c8ff00" : "#566557"} opacity={entry.hour === "2pm" ? 1 : 0.72} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="panel search-panel">
          <div className="panel-header">
            <div><h2 className="panel-title">Product sales lookup</h2><p className="panel-subtitle">Search sales by product name and reporting period</p></div>
            {filteredProducts.length > 0 && <button className="tiny-button" onClick={shareProductResults}>{productCopied ? <Check size={12} /> : <Share2 size={12} />}{productCopied ? "Copied" : "Copy / share"}</button>}
          </div>
          <div className="search-controls">
            <div className="search-periods">
              {["This month", "Last month", "Last 3 months", "This year", "Custom"].map((period) => <button key={period} className={productRange === period ? "active" : ""} onClick={() => setProductRange(period)}>{period}</button>)}
            </div>
            {productRange === "Custom" && <div className="date-custom" style={{ marginBottom: 9 }}><input type="date" aria-label="Lookup start date" /><span style={{ color: "#778379", fontSize: 10 }}>to</span><input type="date" aria-label="Lookup end date" /></div>}
            <div className="search-wrap"><Search size={15} /><input className="search-input" value={productInput} onChange={(event) => { setProductInput(event.target.value); setProductQuery(event.target.value); }} placeholder="Search Roundup, Dithane, Urea…" aria-label="Search products" />{productInput && <button className="icon-button search-clear" aria-label="Clear search" onClick={() => { setProductInput(""); setProductQuery(""); }}><X size={14} /></button>}</div>
          </div>
          {!productQuery.trim() && <p className="search-note">Enter at least two letters to see sales, units and profit by product.</p>}
          {productQuery.trim().length === 1 && <p className="search-note">Add one more letter to search the product list.</p>}
          {productQuery.trim().length >= 2 && filteredProducts.length === 0 && <p className="search-note">No sales found for “{productQuery}”. Try another product name.</p>}
          {filteredProducts.map((item) => <div className="lookup-row" key={item.productName}><div><b>{item.productName}</b><small>{item.category} · {item.sales} transactions</small></div><span>{item.qty} sold</span><span>{fmtKES(item.revenue)}</span><span style={{ color: "#8ec99a" }}>{fmtKES(item.profit)}</span></div>)}
          {filteredProducts.length > 1 && <div className="lookup-summary"><span>Combined · {filteredProducts.length} products · {searchSummary.sales} transactions</span><div><span>Revenue<b>{fmtKES(searchSummary.revenue)}</b></span></div><div><span>Profit<b>{fmtKES(searchSummary.profit)}</b></span></div></div>}
        </article>

        <section className="audit-grid">
          <article className="panel">
            <div className="void-header">
              <div className="void-heading"><div className="void-icon"><Ban size={14} /></div><div><b>Voided sales today</b><small>{voidedSales.length} reversals recorded</small></div></div>
              <strong className="void-amount">−{fmtKES(totalVoided)}</strong>
            </div>
            {voidExpanded && voidedSales.map((sale) => <div className="void-detail" key={sale.time}><span>{sale.type} · {sale.time} · {sale.reason}</span><span>−{fmtKES(sale.amount)}</span></div>)}
            <button className="void-toggle" onClick={() => setVoidExpanded(!voidExpanded)}>{voidExpanded ? "Hide void details" : "View void details"}<ChevronDown size={12} style={{ transform: voidExpanded ? "rotate(180deg)" : undefined }} /></button>
          </article>
          <article className="panel">
            <div className="panel-header"><div><h2 className="panel-title">Low-margin watch</h2><p className="panel-subtitle">Lowest selling-price margins across current stock</p></div><Flame size={15} color="#dfa166" /></div>
            <div className="margin-list">
              {lowMargin.slice(0, 10).map((item) => <div className="margin-item" key={item.name}><div><b>{item.name}</b><small>Buy {fmtKES(item.buy)} <ArrowRight size={10} style={{ verticalAlign: "middle" }} /> Sell {fmtKES(item.sell)}</small></div><span className={`margin-badge ${item.margin < 5 ? "danger" : ""}`}>{item.margin.toFixed(1)}% margin</span></div>)}
            </div>
          </article>
        </section>
        <footer style={{ display: "flex", justifyContent: "space-between", padding: "20px 1px 0", color: "#657167", fontSize: 9 }}>
          <span>GreenLink OS <span style={{ color: "#839080" }}>·</span> Shop reporting</span>
          <span>Data current as of {format(today, "d MMM yyyy")}</span>
        </footer>
      </div>
    </main>
  );
}