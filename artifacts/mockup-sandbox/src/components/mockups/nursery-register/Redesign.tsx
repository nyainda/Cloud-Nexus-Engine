import "./_group.css";
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Archive,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CirclePlus,
  CreditCard,
  Leaf,
  Package,
  Pencil,
  Plus,
  Receipt,
  Search,
  ShieldCheck,
  ShoppingBasket,
  Smartphone,
  Sprout,
  Tag,
  TrendingUp,
  X,
} from "lucide-react";

type Payment = "cash" | "mpesa" | "credit";
type Variety = {
  id: string;
  name: string;
  category: string;
  price: number;
  active: boolean;
};
type CartLine = {
  varietyId: string;
  name: string;
  category: string;
  quantity: string;
  price: string;
};
type SaleLine = {
  id: string;
  saleId: string;
  date: string;
  name: string;
  category: string;
  quantity: number;
  price: number;
  payment: Payment;
  customer: string;
  phone: string;
};

const initialCategories = ["Vegetables", "Herbs", "Fruit", "Flowers"];
const initialVarieties: Variety[] = [
  { id: "cabbage-gloria", name: "Cabbage · Gloria F1", category: "Vegetables", price: 18, active: true },
  { id: "tomato-anna", name: "Tomato · Anna F1", category: "Vegetables", price: 22, active: true },
  { id: "kale-sukuma", name: "Kale · Sukuma Wiki", category: "Vegetables", price: 15, active: true },
  { id: "onion-red", name: "Red onion", category: "Vegetables", price: 20, active: true },
  { id: "spinach-fordhook", name: "Spinach · Fordhook Giant", category: "Vegetables", price: 16, active: true },
  { id: "pepper-california", name: "Sweet pepper · California Wonder", category: "Vegetables", price: 25, active: true },
  { id: "broccoli-green", name: "Broccoli · Green Sprouting", category: "Vegetables", price: 24, active: true },
  { id: "coriander-dania", name: "Coriander · Dania", category: "Herbs", price: 12, active: true },
  { id: "basil-sweet", name: "Sweet basil", category: "Herbs", price: 14, active: true },
  { id: "parsley-curled", name: "Curled parsley", category: "Herbs", price: 14, active: true },
  { id: "passion-purple", name: "Purple passion fruit", category: "Fruit", price: 35, active: true },
  { id: "tree-tomato", name: "Tree tomato", category: "Fruit", price: 32, active: true },
  { id: "marigold-orange", name: "African marigold · Orange", category: "Flowers", price: 18, active: true },
  { id: "dianthus-mix", name: "Dianthus · mixed", category: "Flowers", price: 28, active: false },
];

const startingSales: SaleLine[] = [
  { id: "line-1", saleId: "sale-a", date: "2026-10-12", name: "Cabbage · Gloria F1", category: "Vegetables", quantity: 200, price: 18, payment: "mpesa", customer: "Mary Wanjiku", phone: "0712 345 678" },
  { id: "line-2", saleId: "sale-a", date: "2026-10-12", name: "Kale · Sukuma Wiki", category: "Vegetables", quantity: 80, price: 15, payment: "mpesa", customer: "Mary Wanjiku", phone: "0712 345 678" },
  { id: "line-3", saleId: "sale-b", date: "2026-10-12", name: "Tomato · Anna F1", category: "Vegetables", quantity: 120, price: 22, payment: "cash", customer: "Peter Mwangi", phone: "0722 987 654" },
  { id: "line-4", saleId: "sale-c", date: "2026-10-11", name: "Coriander · Dania", category: "Herbs", quantity: 90, price: 12, payment: "cash", customer: "Beatrice Njeri", phone: "" },
  { id: "line-5", saleId: "sale-d", date: "2026-10-11", name: "Purple passion fruit", category: "Fruit", quantity: 45, price: 35, payment: "credit", customer: "Anne Njeri", phone: "0703 112 980" },
  { id: "line-6", saleId: "sale-e", date: "2026-10-10", name: "Sweet basil", category: "Herbs", quantity: 60, price: 14, payment: "mpesa", customer: "Kevin Otieno", phone: "" },
  { id: "line-7", saleId: "sale-f", date: "2026-10-09", name: "African marigold · Orange", category: "Flowers", quantity: 72, price: 18, payment: "cash", customer: "Joyce Akinyi", phone: "0718 634 201" },
  { id: "line-8", saleId: "sale-g", date: "2026-10-08", name: "Spinach · Fordhook Giant", category: "Vegetables", quantity: 150, price: 16, payment: "mpesa", customer: "Samuel Kamau", phone: "" },
];

const formatKes = (value: number) =>
  new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(value || 0);

const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-KE", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));

function todayLocal() {
  return "2026-10-12";
}

export function Redesign() {
  const [categories, setCategories] = useState(initialCategories);
  const [varieties, setVarieties] = useState(initialVarieties);
  const [sales, setSales] = useState(startingSales);
  const [businessDate, setBusinessDate] = useState(todayLocal());
  const [activeCategory, setActiveCategory] = useState("All seedlings");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<Payment>("cash");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState("");
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueFilter, setCatalogueFilter] = useState<"active" | "all" | "archived">("active");
  const [newVariety, setNewVariety] = useState({ name: "", category: "Vegetables", price: "" });
  const [newCategory, setNewCategory] = useState("");
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingVariety, setEditingVariety] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ name: "", price: "" });
  const [saleQuery, setSaleQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [editingSale, setEditingSale] = useState<string | null>(null);
  const [saleDraft, setSaleDraft] = useState({ quantity: "", price: "", payment: "cash" as Payment });

  const monthKey = businessDate.slice(0, 7);
  const monthSales = useMemo(() => sales.filter((sale) => sale.date.slice(0, 7) === monthKey), [sales, monthKey]);
  const daySales = useMemo(() => sales.filter((sale) => sale.date === businessDate), [sales, businessDate]);
  const monthQuantity = monthSales.reduce((sum, sale) => sum + sale.quantity, 0);
  const monthRevenue = monthSales.reduce((sum, sale) => sum + sale.quantity * sale.price, 0);
  const dayQuantity = daySales.reduce((sum, sale) => sum + sale.quantity, 0);
  const dayRevenue = daySales.reduce((sum, sale) => sum + sale.quantity * sale.price, 0);
  const dayByPayment = {
    cash: daySales.filter((sale) => sale.payment === "cash").reduce((sum, sale) => sum + sale.quantity * sale.price, 0),
    mpesa: daySales.filter((sale) => sale.payment === "mpesa").reduce((sum, sale) => sum + sale.quantity * sale.price, 0),
    credit: daySales.filter((sale) => sale.payment === "credit").reduce((sum, sale) => sum + sale.quantity * sale.price, 0),
  };
  const categoryReport = categories
    .map((category) => {
      const rows = monthSales.filter((sale) => sale.category === category);
      return {
        category,
        quantity: rows.reduce((sum, sale) => sum + sale.quantity, 0),
        revenue: rows.reduce((sum, sale) => sum + sale.quantity * sale.price, 0),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  const maxCategoryRevenue = Math.max(...categoryReport.map((row) => row.revenue), 1);
  const activeVarieties = varieties.filter((variety) => variety.active);
  const visibleVarieties = activeVarieties
    .filter((variety) => activeCategory === "All seedlings" || variety.category === activeCategory)
    .filter((variety) => variety.name.toLowerCase().includes(search.trim().toLowerCase()));
  const catalogueRows = varieties
    .filter((variety) => catalogueFilter === "all" || (catalogueFilter === "active" ? variety.active : !variety.active))
    .filter((variety) => variety.name.toLowerCase().includes(catalogueSearch.trim().toLowerCase()));
  const cartTotal = cart.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.price) || 0), 0);
  const cartQuantity = cart.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const currentMonth = new Intl.DateTimeFormat("en-KE", { month: "long", year: "numeric" }).format(new Date(`${businessDate.slice(0, 7)}-01T12:00:00`));

  function addToCart(variety: Variety) {
    setNotice("");
    setCart((current) => {
      const existing = current.find((line) => line.varietyId === variety.id);
      if (existing) {
        return current.map((line) =>
          line.varietyId === variety.id ? { ...line, quantity: String((Number(line.quantity) || 0) + 50) } : line,
        );
      }
      return [...current, { varietyId: variety.id, name: variety.name, category: variety.category, quantity: "100", price: String(variety.price) }];
    });
  }

  function updateCartLine(varietyId: string, field: "quantity" | "price", value: string) {
    setCart((current) => current.map((line) => (line.varietyId === varietyId ? { ...line, [field]: value } : line)));
  }

  function recordSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) {
      setNotice("Add at least one variety to this sale.");
      return;
    }
    if (payment === "credit" && !customer.trim()) {
      setNotice("Add a customer name before recording a credit sale.");
      return;
    }
    if (cart.some((line) => Number(line.quantity) < 1 || !Number.isInteger(Number(line.quantity)) || Number(line.price) < 0)) {
      setNotice("Check each line: quantity must be a whole number and price cannot be negative.");
      return;
    }
    const saleId = `sale-${Date.now()}`;
    const created = cart.map((line, index) => ({
      id: `${saleId}-${index}`,
      saleId,
      date: businessDate,
      name: line.name,
      category: line.category,
      quantity: Number(line.quantity),
      price: Number(line.price),
      payment,
      customer: customer.trim() || "Walk-in customer",
      phone: phone.trim(),
    }));
    setSales((current) => [...created, ...current]);
    setCart([]);
    setCustomer("");
    setPhone("");
    setNotice(`Sale recorded · ${cartQuantity.toLocaleString()} seedlings · ${formatKes(cartTotal)}`);
  }

  function addVariety(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newVariety.name.trim();
    const price = Number(newVariety.price);
    if (!name || !newVariety.category || !Number.isFinite(price) || price < 0) return;
    const variety = { id: `variety-${Date.now()}`, name, category: newVariety.category, price, active: true };
    setVarieties((current) => [variety, ...current]);
    setNewVariety({ name: "", category: categories[0] ?? "Vegetables", price: "" });
    setNotice(`${name} added to the catalogue.`);
  }

  function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name || categories.some((category) => category.toLowerCase() === name.toLowerCase())) return;
    setCategories((current) => [...current, name]);
    setNewCategory("");
    setNewVariety((current) => ({ ...current, category: name }));
    setNotice(`${name} category is ready to use.`);
  }

  function saveVarietyEdit(variety: Variety) {
    const name = editDraft.name.trim();
    const price = Number(editDraft.price);
    if (!name || !Number.isFinite(price) || price < 0) return;
    setVarieties((current) => current.map((row) => (row.id === variety.id ? { ...row, name, price } : row)));
    setEditingVariety(null);
  }

  function beginSaleEdit(sale: SaleLine) {
    setEditingSale(sale.id);
    setSaleDraft({ quantity: String(sale.quantity), price: String(sale.price), payment: sale.payment });
  }

  function saveSaleEdit(sale: SaleLine) {
    const quantity = Number(saleDraft.quantity);
    const price = Number(saleDraft.price);
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return;
    setSales((current) => current.map((row) => row.id === sale.id ? { ...row, quantity, price, payment: saleDraft.payment } : row));
    setEditingSale(null);
  }

  const filteredSales = sales
    .filter((sale) => sale.date.slice(0, 7) === monthKey)
    .filter((sale) => paymentFilter === "all" || sale.payment === paymentFilter)
    .filter((sale) => {
      const needle = saleQuery.trim().toLowerCase();
      return !needle || `${sale.name} ${sale.customer} ${sale.phone} ${sale.date}`.toLowerCase().includes(needle);
    });

  return (
    <main className="nursery-register min-h-[100dvh]">
      <style>{`
        .nursery-register {
          --paper: #f5f6ef;
          --surface: #fffef9;
          --ink: #24362c;
          --muted: #738078;
          --line: #e3e9df;
          --pine: #315d46;
          --pine-deep: #234a37;
          --sage: #e7efe5;
          --lime: #c6d87d;
          --clay: #b56c4d;
          --honey: #d6a94f;
          background: var(--paper);
          color: var(--ink);
          font-family: "DM Sans", sans-serif;
          overflow-x: hidden;
          position: relative;
        }
        .nursery-register * { box-sizing: border-box; }
        .nursery-register .display { font-family: "Syne", sans-serif; }
        .nursery-register .mono { font-variant-numeric: tabular-nums; }
        .nursery-register .lift { transition: transform .18s ease, border-color .18s ease, background-color .18s ease, box-shadow .18s ease; }
        .nursery-register .lift:hover { transform: translateY(-2px); }
        .nursery-register .soft-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .nursery-register .soft-scroll::-webkit-scrollbar-thumb { background: #cbd5c8; border-radius: 99px; }
        .nursery-register input, .nursery-register select, .nursery-register button { font: inherit; }
        .nursery-register input:focus, .nursery-register select:focus { outline: 2px solid #8ca98f; outline-offset: 1px; }
        @keyframes settle { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: translateY(0); } }
        .nursery-register .arrive { animation: settle .45s ease both; }
        .nursery-register .arrive-2 { animation-delay: .08s; }
        .nursery-register .arrive-3 { animation-delay: .14s; }
        @media (prefers-reduced-motion: reduce) { .nursery-register *, .nursery-register *::before, .nursery-register *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
      `}</style>

      <div className="mx-auto max-w-[1480px] px-4 pb-14 pt-5 sm:px-7 sm:pt-8 xl:px-10">
        <header className="arrive mb-7 flex flex-col justify-between gap-5 border-b border-[#dce4d9] pb-6 md:flex-row md:items-end">
          <div className="flex items-start gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#315d46] text-[#f4f5e8] shadow-[0_9px_24px_rgba(49,93,70,.17)]">
              <Sprout size={28} strokeWidth={1.8} />
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-[3px] border-[#f5f6ef] bg-[#c6d87d]" />
            </div>
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#718076]">GreenLink · Kijani nursery</p>
                <span className="rounded-full bg-[#e4eddf] px-2 py-0.5 text-[10px] font-semibold text-[#426b4f]">REGISTER OPEN</span>
              </div>
              <h1 className="display text-[29px] font-semibold leading-tight tracking-[-.045em] text-[#26392e] sm:text-[36px]">Nursery sales register</h1>
              <p className="mt-1 text-[13px] text-[#758078]">A clear count of every seedling sold. Stock is tracked separately.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-[13px] border border-[#dce5da] bg-[#fffef9] px-3 py-2.5 shadow-[0_2px_9px_rgba(44,61,47,.03)]">
              <CalendarDays size={16} className="text-[#607e68]" />
              <label className="text-[11px] font-semibold text-[#68776d]" htmlFor="sale-date">Sales date</label>
              <input id="sale-date" type="date" value={businessDate} onChange={(event) => setBusinessDate(event.target.value)} className="w-[132px] border-0 bg-transparent text-[12px] font-semibold text-[#34493a]" />
            </div>
            <div className="flex items-center gap-2 rounded-[13px] border border-[#dce5da] bg-[#fffef9] px-3.5 py-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#edf2e8] text-[#54745b]"><ShieldCheck size={15} /></span>
              <span className="text-[11px] font-semibold text-[#64736a]">Local register</span>
              <span className="h-1.5 w-1.5 rounded-full bg-[#7d9a60]" />
            </div>
          </div>
        </header>

        <section className="arrive arrive-2 mb-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="relative overflow-hidden rounded-[18px] border border-[#dfe7dc] bg-[#fffef9] p-4 shadow-[0_3px_10px_rgba(36,54,44,.025)]">
            <div className="flex items-start justify-between">
              <div><p className="text-[11px] font-semibold text-[#78847b]">Seedlings today</p><p className="mono mt-2 text-[27px] font-semibold tracking-[-.04em] text-[#284c38]">{dayQuantity.toLocaleString()}</p></div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e7efe5] text-[#477254]"><Leaf size={18} /></span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#849087]"><span className="h-1.5 w-1.5 rounded-full bg-[#90a970]" /> selected sales date</div>
            <div className="absolute -bottom-8 -right-6 h-24 w-24 rounded-full border-[15px] border-[#f2f5ec]" />
          </div>
          <div className="relative overflow-hidden rounded-[18px] border border-[#315d46] bg-[#315d46] p-4 text-[#f8f7ec] shadow-[0_8px_18px_rgba(49,93,70,.1)]">
            <div className="flex items-start justify-between">
              <div><p className="text-[11px] font-medium text-[#d4dfcf]">Sales value today</p><p className="mono mt-2 text-[25px] font-semibold tracking-[-.04em]">{formatKes(dayRevenue)}</p></div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[#e5ebc4]"><Banknote size={18} /></span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#cedacb]"><TrendingUp size={12} /> Gross value recorded</div>
            <div className="absolute -bottom-9 -right-5 h-24 w-24 rounded-full border-[15px] border-white/[.06]" />
          </div>
          <div className="rounded-[18px] border border-[#dfe7dc] bg-[#fffef9] p-4 shadow-[0_3px_10px_rgba(36,54,44,.025)]">
            <div className="flex items-start justify-between">
              <div><p className="text-[11px] font-semibold text-[#78847b]">Collected</p><p className="mono mt-2 text-[23px] font-semibold tracking-[-.04em] text-[#34493a]">{formatKes(dayByPayment.cash + dayByPayment.mpesa)}</p></div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f3eedc] text-[#a8833f]"><CheckCircle2 size={18} /></span>
            </div>
            <div className="mt-2 flex gap-3 text-[10px] text-[#849087]"><span>Cash {formatKes(dayByPayment.cash)}</span><span>M-Pesa {formatKes(dayByPayment.mpesa)}</span></div>
          </div>
          <div className="rounded-[18px] border border-[#dfe7dc] bg-[#fffef9] p-4 shadow-[0_3px_10px_rgba(36,54,44,.025)]">
            <div className="flex items-start justify-between">
              <div><p className="text-[11px] font-semibold text-[#78847b]">Customer credit</p><p className="mono mt-2 text-[23px] font-semibold tracking-[-.04em] text-[#895b47]">{formatKes(dayByPayment.credit)}</p></div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4e8df] text-[#a26a4d]"><CreditCard size={18} /></span>
            </div>
            <div className="mt-2 text-[10px] text-[#849087]">Recorded against named customers</div>
          </div>
        </section>

        <div className="arrive arrive-3 grid items-start gap-5 xl:grid-cols-[minmax(0,1.12fr)_minmax(390px,.88fr)]">
          <section className="overflow-hidden rounded-[20px] border border-[#dce5da] bg-[#fffef9] shadow-[0_5px_20px_rgba(36,54,44,.035)]">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e7ebe3] px-5 py-5 sm:px-6">
              <div className="flex gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#e8f0e6] text-[#406d4f]"><ShoppingBasket size={19} /></span>
                <div><p className="display text-[18px] font-semibold tracking-[-.025em]">Build a sale</p><p className="mt-0.5 text-[11px] text-[#7b877d]">Add each seedling type, then record payment once.</p></div>
              </div>
              <span className="rounded-full bg-[#f0f3e9] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#65805e]">Counter entry</span>
            </div>
            <div className="px-5 py-5 sm:px-6">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a968c]" />
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a seedling variety…" className="h-10 w-full rounded-[11px] border border-[#dfe6dc] bg-[#fbfcf7] pl-9 pr-3 text-[12px] text-[#36483c] placeholder:text-[#9aa49a]" aria-label="Search seedling varieties" />
                </div>
                <button type="button" onClick={() => setCatalogueOpen((value) => !value)} className="flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[#dfe6dc] px-3 text-[11px] font-semibold text-[#536b58] transition hover:bg-[#f3f6ef]">
                  <Package size={15} /> Manage catalogue <ChevronDown size={14} className={`transition-transform ${catalogueOpen ? "rotate-180" : ""}`} />
                </button>
              </div>

              <div className="soft-scroll mb-4 flex gap-1.5 overflow-x-auto pb-1">
                {["All seedlings", ...categories].map((category) => {
                  const selected = activeCategory === category;
                  const count = category === "All seedlings" ? activeVarieties.length : activeVarieties.filter((row) => row.category === category).length;
                  return (
                    <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`whitespace-nowrap rounded-full px-3 py-2 text-[10px] font-semibold transition ${selected ? "bg-[#315d46] text-[#fffef5]" : "bg-[#f3f5ef] text-[#68796c] hover:bg-[#e9efe5]"}`}>
                      {category}<span className={`ml-1.5 ${selected ? "text-[#cbd9b6]" : "text-[#98a399]"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="soft-scroll max-h-[258px] overflow-y-auto rounded-[13px] border border-[#e6ebe3] bg-[#fbfcf8] p-1.5">
                {visibleVarieties.length ? (
                  <div className="grid gap-1 sm:grid-cols-2">
                    {visibleVarieties.map((variety) => (
                      <button key={variety.id} type="button" onClick={() => addToCart(variety)} className="lift flex min-h-[59px] items-center justify-between gap-2 rounded-[10px] border border-transparent px-3 py-2 text-left hover:border-[#dce7da] hover:bg-white">
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold text-[#3d5143]">{variety.name}</span>
                          <span className="mt-1 block text-[10px] text-[#89958a]">{variety.category} <span className="px-1 text-[#c0c8be]">·</span> {formatKes(variety.price)} each</span>
                        </span>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8f0e6] text-[#477353]"><Plus size={15} /></span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center">
                    <Sprout size={22} className="mx-auto text-[#9eaf9c]" />
                    <p className="mt-2 text-[12px] font-semibold text-[#53685a]">No seedlings in this view</p>
                    <p className="mt-1 text-[10px] text-[#8d998e]">Try a different category or search.</p>
                  </div>
                )}
              </div>

              {catalogueOpen && (
                <div className="mt-4 rounded-[15px] border border-[#dce5da] bg-[#f9faf5] p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div><p className="display text-[14px] font-semibold">Catalogue care</p><p className="mt-0.5 text-[10px] text-[#7e8a80]">Keep your growing list tidy and easy to scan.</p></div>
                    <button type="button" aria-label="Close catalogue manager" onClick={() => setCatalogueOpen(false)} className="rounded-md p-1 text-[#829085] hover:bg-[#e9eee6]"><X size={16} /></button>
                  </div>
                  <form onSubmit={addVariety} className="grid gap-2 rounded-[12px] border border-[#e2e8df] bg-white p-3 sm:grid-cols-[1.5fr_1fr_.65fr_auto] sm:items-end">
                    <label className="text-[10px] font-semibold text-[#6d7b70]">Variety name
                      <input required maxLength={80} value={newVariety.name} onChange={(event) => setNewVariety({ ...newVariety, name: event.target.value })} placeholder="e.g. Carrot · Nantes" className="mt-1 h-9 w-full rounded-[8px] border border-[#e0e6dd] px-2.5 text-[11px] font-normal text-[#33473a]" />
                    </label>
                    <label className="text-[10px] font-semibold text-[#6d7b70]">Category
                      <select value={newVariety.category} onChange={(event) => setNewVariety({ ...newVariety, category: event.target.value })} className="mt-1 h-9 w-full rounded-[8px] border border-[#e0e6dd] bg-white px-2 text-[11px] text-[#33473a]">
                        {categories.map((category) => <option key={category}>{category}</option>)}
                      </select>
                    </label>
                    <label className="text-[10px] font-semibold text-[#6d7b70]">KES each
                      <input required min="0" step="0.01" type="number" value={newVariety.price} onChange={(event) => setNewVariety({ ...newVariety, price: event.target.value })} placeholder="18" className="mt-1 h-9 w-full rounded-[8px] border border-[#e0e6dd] px-2.5 text-[11px] font-normal text-[#33473a]" />
                    </label>
                    <button type="submit" className="flex h-9 items-center justify-center gap-1 rounded-[8px] bg-[#315d46] px-3 text-[10px] font-bold text-white transition hover:bg-[#234a37]"><Plus size={14} /> Add</button>
                  </form>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9aa49b]" />
                      <input value={catalogueSearch} onChange={(event) => setCatalogueSearch(event.target.value)} placeholder="Search catalogue…" className="h-8 w-full rounded-[8px] border border-[#e0e6dd] bg-white pl-8 pr-2 text-[10px]" />
                    </div>
                    <select aria-label="Catalogue status filter" value={catalogueFilter} onChange={(event) => setCatalogueFilter(event.target.value as "active" | "all" | "archived")} className="h-8 rounded-[8px] border border-[#e0e6dd] bg-white px-2 text-[10px] text-[#637368]">
                      <option value="active">Active varieties</option><option value="all">All varieties</option><option value="archived">Archived</option>
                    </select>
                  </div>
                  <div className="soft-scroll mt-2 max-h-[176px] overflow-y-auto rounded-[10px] border border-[#e5eae2] bg-white">
                    {catalogueRows.map((variety) => (
                      <div key={variety.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eef1eb] px-3 py-2 last:border-0">
                        {editingVariety === variety.id ? (
                          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                            <input aria-label="Edit variety name" value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} className="h-8 min-w-[140px] flex-1 rounded-[7px] border border-[#dce5da] px-2 text-[10px]" />
                            <input aria-label="Edit default price" type="number" min="0" step="0.01" value={editDraft.price} onChange={(event) => setEditDraft({ ...editDraft, price: event.target.value })} className="h-8 w-[82px] rounded-[7px] border border-[#dce5da] px-2 text-[10px]" />
                            <button type="button" onClick={() => saveVarietyEdit(variety)} aria-label="Save variety edit" className="rounded-[7px] bg-[#315d46] px-2 text-white"><Check size={14} /></button>
                            <button type="button" onClick={() => setEditingVariety(null)} aria-label="Cancel variety edit" className="rounded-[7px] bg-[#f0f3ed] px-2 text-[#637368]"><X size={14} /></button>
                          </div>
                        ) : (
                          <>
                            <div className="min-w-0"><p className={`truncate text-[10px] font-semibold ${variety.active ? "text-[#405346]" : "text-[#9aa39b]"}`}>{variety.name}</p><p className="mt-0.5 text-[9px] text-[#929c91]">{variety.category} · {formatKes(variety.price)} each{variety.active ? "" : " · archived"}</p></div>
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => { setEditingVariety(variety.id); setEditDraft({ name: variety.name, price: String(variety.price) }); }} aria-label={`Edit ${variety.name}`} className="rounded-[7px] p-1.5 text-[#7a897c] hover:bg-[#edf2ea] hover:text-[#315d46]"><Pencil size={13} /></button>
                              <button type="button" onClick={() => setVarieties((current) => current.map((row) => row.id === variety.id ? { ...row, active: !row.active } : row))} aria-label={variety.active ? `Archive ${variety.name}` : `Restore ${variety.name}`} className="rounded-[7px] p-1.5 text-[#7a897c] hover:bg-[#edf2ea] hover:text-[#315d46]"><Archive size={13} /></button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {!catalogueRows.length && <p className="px-3 py-5 text-center text-[10px] text-[#88948a]">No matching varieties.</p>}
                  </div>
                  <div className="mt-3 border-t border-[#e5eae2] pt-3">
                    {!categoryFormOpen ? (
                      <button type="button" onClick={() => setCategoryFormOpen(true)} className="flex items-center gap-1.5 text-[10px] font-semibold text-[#53745a] hover:text-[#315d46]"><CirclePlus size={14} /> Add a shop category</button>
                    ) : (
                      <form onSubmit={addCategory} className="flex gap-2">
                        <input autoFocus required value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="e.g. Indigenous trees" className="h-8 flex-1 rounded-[8px] border border-[#dce5da] bg-white px-2.5 text-[10px]" />
                        <button type="submit" className="rounded-[8px] bg-[#315d46] px-3 text-[10px] font-bold text-white">Save category</button>
                        <button type="button" onClick={() => setCategoryFormOpen(false)} aria-label="Cancel category creation" className="rounded-[8px] px-2 text-[#78877b]"><X size={15} /></button>
                      </form>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1.5">{categories.map((category) => <span key={category} className="rounded-full bg-[#edf2e9] px-2 py-1 text-[9px] font-medium text-[#708071]">{category}</span>)}</div>
                  </div>
                </div>
              )}

              <form onSubmit={recordSale} className="mt-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-[12px] font-semibold text-[#3e5144]"><ShoppingBasket size={15} className="text-[#638168]" /> Sale items <span className="rounded-full bg-[#eef2e9] px-2 py-0.5 text-[9px] font-bold text-[#6b806b]">{cart.length} varieties</span></p>
                  {cart.length > 0 && <button type="button" onClick={() => setCart([])} className="text-[10px] font-medium text-[#9a7a67] hover:text-[#895b47]">Clear sale</button>}
                </div>
                {cart.length ? (
                  <div className="space-y-2">
                    {cart.map((line) => (
                      <div key={line.varietyId} className="grid gap-2 rounded-[12px] border border-[#e4e9e0] bg-[#fcfcf8] p-3 sm:grid-cols-[minmax(0,1fr)_90px_100px_90px_28px] sm:items-center">
                        <div className="min-w-0"><p className="truncate text-[11px] font-semibold text-[#405346]">{line.name}</p><p className="mt-0.5 text-[9px] text-[#909a90]">{line.category}</p></div>
                        <label className="text-[9px] font-semibold text-[#818d81]">Qty
                          <input type="number" min="1" step="1" aria-label={`${line.name} quantity`} value={line.quantity} onChange={(event) => updateCartLine(line.varietyId, "quantity", event.target.value)} className="mt-1 h-8 w-full rounded-[7px] border border-[#e0e6dd] bg-white px-2 text-[11px] text-[#34493a]" />
                        </label>
                        <label className="text-[9px] font-semibold text-[#818d81]">KES each
                          <input type="number" min="0" step="0.01" aria-label={`${line.name} price`} value={line.price} onChange={(event) => updateCartLine(line.varietyId, "price", event.target.value)} className="mt-1 h-8 w-full rounded-[7px] border border-[#e0e6dd] bg-white px-2 text-[11px] text-[#34493a]" />
                        </label>
                        <div className="text-left sm:text-right"><p className="text-[9px] text-[#929d92]">Line total</p><p className="mono mt-1 text-[11px] font-bold text-[#405b45]">{formatKes((Number(line.quantity) || 0) * (Number(line.price) || 0))}</p></div>
                        <button type="button" aria-label={`Remove ${line.name}`} onClick={() => setCart((current) => current.filter((row) => row.varietyId !== line.varietyId))} className="rounded-md p-1 text-[#9a9d91] hover:bg-[#f6e9e2] hover:text-[#a3644b]"><X size={15} /></button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[13px] border border-dashed border-[#cfdccd] bg-[#fafbf6] px-4 py-5 text-center">
                    <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[#eaf0e6] text-[#64806a]"><Plus size={17} /></span>
                    <p className="mt-2 text-[11px] font-semibold text-[#5b6e5f]">Start with a seedling variety</p>
                    <p className="mt-1 text-[10px] text-[#96a097]">Choose above · quantity starts at 100 and can be changed.</p>
                  </div>
                )}

                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1.15fr]">
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[.12em] text-[#7f8b80]">Payment method</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        ["cash", "Cash", Banknote],
                        ["mpesa", "M-Pesa", Smartphone],
                        ["credit", "Credit", CreditCard],
                      ] as const).map(([method, label, Icon]) => (
                        <button key={method} type="button" onClick={() => setPayment(method)} className={`flex h-9 items-center justify-center gap-1 rounded-[9px] border text-[10px] font-semibold transition ${payment === method ? "border-[#719477] bg-[#ebf2e8] text-[#3e6a4b]" : "border-[#e2e8df] bg-white text-[#78857b] hover:bg-[#f6f8f3]"}`}>
                          <Icon size={13} /> {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="col-span-2 text-[10px] font-semibold text-[#7f8b80]">Customer {payment === "credit" ? <span className="text-[#a76549">· required for credit</span> : <span className="font-normal">(optional)</span>}
                      <input value={customer} onChange={(event) => setCustomer(event.target.value)} placeholder="Name for receipt or credit" className="mt-1 h-9 w-full rounded-[9px] border border-[#e0e6dd] bg-white px-2.5 text-[11px] font-normal text-[#34493a] placeholder:text-[#a3aca3]" />
                    </label>
                    <label className="col-span-2 text-[10px] font-semibold text-[#7f8b80]">Phone <span className="font-normal">(optional)</span>
                      <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07xx xxx xxx" className="mt-1 h-9 w-full rounded-[9px] border border-[#e0e6dd] bg-white px-2.5 text-[11px] font-normal text-[#34493a] placeholder:text-[#a3aca3]" />
                    </label>
                  </div>
                </div>

                {notice && <p role="status" className={`mt-3 rounded-[9px] px-3 py-2 text-[10px] font-medium ${notice.startsWith("Sale recorded") || notice.includes("added") || notice.includes("ready") ? "bg-[#eaf1e7] text-[#42684a]" : "bg-[#f7eee6] text-[#955e43]"}`}>{notice}</p>}

                <div className="mt-4 flex flex-col gap-3 rounded-[14px] bg-[#eef3e9] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><p className="text-[10px] font-semibold text-[#758374]">Sale total</p><p className="mono mt-0.5 text-[24px] font-semibold tracking-[-.04em] text-[#2f503a]">{formatKes(cartTotal)}</p><p className="text-[10px] text-[#7e8e7e]">{cartQuantity.toLocaleString()} seedlings · {cart.length} varieties</p></div>
                  <button type="submit" disabled={!cart.length} className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#315d46] px-5 text-[11px] font-bold text-white shadow-[0_4px_9px_rgba(49,93,70,.15)] transition hover:bg-[#234a37] disabled:cursor-not-allowed disabled:bg-[#aebcaf]">
                    <CheckCircle2 size={16} /> Record sale <ArrowUpRight size={14} />
                  </button>
                </div>
              </form>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="overflow-hidden rounded-[20px] border border-[#dce5da] bg-[#fffef9] shadow-[0_5px_20px_rgba(36,54,44,.035)]">
              <div className="flex items-start justify-between gap-3 border-b border-[#e7ebe3] px-5 py-5">
                <div className="flex gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#f3eedc] text-[#a4813c]"><BarChart3 size={19} /></span>
                  <div><p className="display text-[17px] font-semibold tracking-[-.025em]">{currentMonth} at a glance</p><p className="mt-0.5 text-[10px] text-[#7b877d]">Plants sold and sales value by category</p></div>
                </div>
                <span className="rounded-full border border-[#e4e9dd] bg-[#fbfcf7] px-2.5 py-1 text-[9px] font-semibold text-[#778379]">{monthSales.length} lines</span>
              </div>
              <div className="px-5 py-4">
                <div className="mb-4 grid grid-cols-2 gap-2.5">
                  <div className="rounded-[12px] bg-[#f2f5ed] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#849084]">Plants sold</p><p className="mono mt-1 text-[18px] font-semibold text-[#365640]">{monthQuantity.toLocaleString()}</p></div>
                  <div className="rounded-[12px] bg-[#f2f5ed] px-3 py-2.5"><p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[#849084]">Sales total</p><p className="mono mt-1 text-[18px] font-semibold text-[#365640]">{formatKes(monthRevenue)}</p></div>
                </div>
                <div className="mb-2 grid grid-cols-[minmax(0,1fr)_72px_98px] gap-2 px-1 text-[9px] font-bold uppercase tracking-[.12em] text-[#98a197]">
                  <span>Category</span><span className="text-right">Seedlings</span><span className="text-right">Sales</span>
                </div>
                <div className="divide-y divide-[#edf0e9]">
                  {categoryReport.map((row, index) => (
                    <div key={row.category} className="grid grid-cols-[minmax(0,1fr)_72px_98px] items-center gap-2 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${index === 0 ? "bg-[#618262]" : index === 1 ? "bg-[#d0ad5c]" : index === 2 ? "bg-[#bf8064]" : "bg-[#93a5a0]"}`} /><span className="truncate text-[11px] font-semibold text-[#4c5e50]">{row.category}</span></div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[#edf1e9]"><span className="block h-full rounded-full bg-[#91aa7d]" style={{ width: `${row.revenue ? Math.max(4, (row.revenue / maxCategoryRevenue) * 100) : 0}%` }} /></div>
                      </div>
                      <span className="mono text-right text-[10px] font-medium text-[#66766a]">{row.quantity.toLocaleString()}</span>
                      <span className="mono text-right text-[10px] font-bold text-[#405a46]">{formatKes(row.revenue)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-[10px] border border-[#e8ecdf] bg-[#fafbf6] px-3 py-2.5">
                  <Tag size={13} className="mt-0.5 shrink-0 text-[#879774]" />
                  <p className="text-[9px] leading-relaxed text-[#788579]">Category totals follow the shop’s catalogue groups. Create a new category any time your range grows.</p>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-[20px] border border-[#dce5da] bg-[#fffef9] shadow-[0_5px_20px_rgba(36,54,44,.035)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7ebe3] px-5 py-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#edf1e9] text-[#55735b]"><Receipt size={16} /></span>
                  <div><p className="display text-[14px] font-semibold">Recent sales</p><p className="text-[9px] text-[#89958a]">This month · newest first</p></div>
                </div>
                <span className="rounded-full bg-[#f1f4ed] px-2 py-1 text-[9px] font-semibold text-[#728174]">{filteredSales.length} shown</span>
              </div>
              <div className="flex gap-2 border-b border-[#edf0e9] px-4 py-3">
                <div className="relative min-w-0 flex-1">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#98a198]" />
                  <input value={saleQuery} onChange={(event) => setSaleQuery(event.target.value)} placeholder="Search sales…" className="h-8 w-full rounded-[8px] border border-[#e3e8e0] bg-[#fbfcf8] pl-8 pr-2 text-[10px]" aria-label="Search recent sales" />
                </div>
                <select aria-label="Filter recent sales by payment" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="h-8 rounded-[8px] border border-[#e3e8e0] bg-white px-2 text-[10px] text-[#69776d]">
                  <option value="all">All payments</option><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="credit">Credit</option>
                </select>
              </div>
              <div className="soft-scroll max-h-[330px] overflow-y-auto">
                {filteredSales.length ? filteredSales.slice(0, 18).map((sale) => (
                  <div key={sale.id} className="border-b border-[#edf0e9] px-4 py-3 last:border-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-[10px] font-semibold text-[#415448]">{sale.name}</p>
                          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${sale.payment === "cash" ? "bg-[#f4efdf] text-[#91783e]" : sale.payment === "mpesa" ? "bg-[#e9f1e8] text-[#507353]" : "bg-[#f4e9e2] text-[#9a684e]"}`}>{sale.payment === "mpesa" ? "M-Pesa" : sale.payment}</span>
                        </div>
                        <p className="mt-1 truncate text-[9px] text-[#879287]">{sale.customer} · {dateLabel(sale.date)} · {sale.category}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="mono text-[10px] font-bold text-[#3f5845]">{formatKes(sale.quantity * sale.price)}</p>
                        <p className="mono mt-1 text-[9px] text-[#8c978d]">{sale.quantity.toLocaleString()} × {formatKes(sale.price)}</p>
                      </div>
                    </div>
                    {editingSale === sale.id ? (
                      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-[9px] bg-[#f4f6f0] p-2">
                        <label className="text-[8px] font-semibold text-[#758175]">Qty<input type="number" min="1" step="1" value={saleDraft.quantity} onChange={(event) => setSaleDraft({ ...saleDraft, quantity: event.target.value })} className="mt-1 h-7 w-[62px] rounded-[6px] border border-[#dce4d8] bg-white px-1.5 text-[10px]" /></label>
                        <label className="text-[8px] font-semibold text-[#758175]">KES each<input type="number" min="0" step="0.01" value={saleDraft.price} onChange={(event) => setSaleDraft({ ...saleDraft, price: event.target.value })} className="mt-1 h-7 w-[72px] rounded-[6px] border border-[#dce4d8] bg-white px-1.5 text-[10px]" /></label>
                        <label className="text-[8px] font-semibold text-[#758175]">Paid by<select value={saleDraft.payment} onChange={(event) => setSaleDraft({ ...saleDraft, payment: event.target.value as Payment })} className="mt-1 h-7 rounded-[6px] border border-[#dce4d8] bg-white px-1.5 text-[9px]"><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="credit">Credit</option></select></label>
                        <button type="button" onClick={() => saveSaleEdit(sale)} className="flex h-7 items-center gap-1 rounded-[6px] bg-[#315d46] px-2 text-[9px] font-semibold text-white"><Check size={12} /> Save</button>
                        <button type="button" onClick={() => setEditingSale(null)} className="h-7 rounded-[6px] px-2 text-[9px] font-semibold text-[#7d897f]">Cancel</button>
                      </div>
                    ) : (
                      <div className="mt-1 flex justify-end gap-1">
                        <button type="button" onClick={() => beginSaleEdit(sale)} aria-label={`Edit ${sale.name} sale`} className="rounded-[6px] p-1 text-[#9aa39a] hover:bg-[#eff3ec] hover:text-[#426b4d]"><Pencil size={12} /></button>
                        <button type="button" onClick={() => setSales((current) => current.filter((row) => row.id !== sale.id))} aria-label={`Delete ${sale.name} sale`} className="rounded-[6px] p-1 text-[#9aa39a] hover:bg-[#f5eae4] hover:text-[#a5684e]"><X size={12} /></button>
                      </div>
                    )}
                  </div>
                )) : (
                  <div className="px-4 py-9 text-center">
                    <Receipt size={20} className="mx-auto text-[#aab4a8]" />
                    <p className="mt-2 text-[11px] font-semibold text-[#647267]">No sales match those filters</p>
                    <p className="mt-1 text-[9px] text-[#929d93]">Try another customer, variety or payment type.</p>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-[#edf0e9] bg-[#fbfcf8] px-4 py-2.5 text-[9px] text-[#8a958b]">
                <span>Edits update the month totals above.</span><span className="flex items-center gap-1 font-medium text-[#66806b]"><Check size={11} /> Up to date</span>
              </div>
            </section>
          </aside>
        </div>
        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#dde5da] pt-4 text-[9px] text-[#8b968b]">
          <span>GreenLink nursery register <span className="px-1.5">·</span> quantities recorded, stock unchanged</span>
          <span>Local mock register · no network connection</span>
        </footer>
      </div>
    </main>
  );
}
