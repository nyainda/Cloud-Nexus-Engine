import "./_group.css";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  Eye,
  FileText,
  Leaf,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "draft" | "sent" | "accepted" | "rejected" | "expired";
type Filter = "all" | Status;

interface QuoteItem {
  productName: string;
  unit: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface Quote {
  id: string;
  quoteNumber: string;
  customerName: string;
  customerPhone: string;
  status: Status;
  validUntil: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  items: QuoteItem[];
  invoiceNumber: string | null;
  createdAt: string;
}

const money = (amount: number) =>
  `KES ${amount.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const statusMeta: Record<Status, { label: string; tone: string; dot: string }> = {
  draft: { label: "Draft", tone: "border-zinc-400/20 bg-zinc-400/[0.08] text-zinc-300", dot: "bg-zinc-400" },
  sent: { label: "Sent", tone: "border-sky-300/20 bg-sky-300/[0.08] text-sky-200", dot: "bg-sky-300" },
  accepted: { label: "Accepted", tone: "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200", dot: "bg-emerald-300" },
  rejected: { label: "Rejected", tone: "border-rose-300/20 bg-rose-300/[0.08] text-rose-200", dot: "bg-rose-300" },
  expired: { label: "Expired", tone: "border-amber-300/20 bg-amber-300/[0.08] text-amber-200", dot: "bg-amber-300" },
};

const initialQuotes: Quote[] = [
  {
    id: "q-158",
    quoteNumber: "GL-Q-2026-0158",
    customerName: "Amina Wanjiku",
    customerPhone: "+254 712 345 678",
    status: "draft",
    validUntil: "2026-10-18T00:00:00.000Z",
    subtotal: 38200,
    discountAmount: 1000,
    total: 37200,
    items: [
      { productName: "DAP Fertilizer 50kg", unit: "bag", qty: 4, unitPrice: 6850, total: 27400 },
      { productName: "Urea Fertilizer 50kg", unit: "bag", qty: 2, unitPrice: 5400, total: 10800 },
    ],
    invoiceNumber: null,
    createdAt: "2026-10-04T09:20:00.000Z",
  },
  {
    id: "q-156",
    quoteNumber: "GL-Q-2026-0156",
    customerName: "Muriuki Farm Supplies",
    customerPhone: "+254 722 170 442",
    status: "sent",
    validUntil: "2026-10-12T00:00:00.000Z",
    subtotal: 68400,
    discountAmount: 0,
    total: 68400,
    items: [
      { productName: "Maize Seed H6213 2kg", unit: "packet", qty: 12, unitPrice: 1850, total: 22200 },
      { productName: "NPK 17:17:17 50kg", unit: "bag", qty: 6, unitPrice: 7700, total: 46200 },
    ],
    invoiceNumber: null,
    createdAt: "2026-10-02T13:45:00.000Z",
  },
  {
    id: "q-152",
    quoteNumber: "GL-Q-2026-0152",
    customerName: "Kahawa Growers Co-op",
    customerPhone: "+254 733 608 219",
    status: "accepted",
    validUntil: "2026-10-10T00:00:00.000Z",
    subtotal: 124500,
    discountAmount: 4500,
    total: 120000,
    items: [
      { productName: "CAN Fertilizer 50kg", unit: "bag", qty: 10, unitPrice: 5100, total: 51000 },
      { productName: "Pioneer Maize Seed 10kg", unit: "bag", qty: 5, unitPrice: 14700, total: 73500 },
    ],
    invoiceNumber: "GL-INV-2026-0041",
    createdAt: "2026-09-30T08:10:00.000Z",
  },
  {
    id: "q-149",
    quoteNumber: "GL-Q-2026-0149",
    customerName: "Njeri & Sons Agrovet",
    customerPhone: "+254 701 884 263",
    status: "rejected",
    validUntil: "2026-10-08T00:00:00.000Z",
    subtotal: 24600,
    discountAmount: 600,
    total: 24000,
    items: [
      { productName: "Roundup 1L", unit: "bottle", qty: 8, unitPrice: 2450, total: 19600 },
      { productName: "Knapsack Sprayer 16L", unit: "piece", qty: 1, unitPrice: 5000, total: 5000 },
    ],
    invoiceNumber: null,
    createdAt: "2026-09-27T11:05:00.000Z",
  },
  {
    id: "q-143",
    quoteNumber: "GL-Q-2026-0143",
    customerName: "Kiptoo Valley Farm",
    customerPhone: "+254 724 519 806",
    status: "expired",
    validUntil: "2026-09-29T00:00:00.000Z",
    subtotal: 51900,
    discountAmount: 0,
    total: 51900,
    items: [
      { productName: "Top-dress Urea 50kg", unit: "bag", qty: 7, unitPrice: 5400, total: 37800 },
      { productName: "Maize Seed SC Duma 43 2kg", unit: "packet", qty: 6, unitPrice: 2350, total: 14100 },
    ],
    invoiceNumber: null,
    createdAt: "2026-09-21T15:40:00.000Z",
  },
];

const tabs: { id: Filter; label: string }[] = [
  { id: "all", label: "All quotes" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
  { id: "expired", label: "Expired" },
];

function StatusPill({ status }: { status: Status }) {
  const meta = statusMeta[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold tracking-[0.035em]", meta.tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function QuoteRow({
  quote,
  onStatusChange,
}: {
  quote: Quote;
  onStatusChange: (id: string, status: Status) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hasInvoice = Boolean(quote.invoiceNumber);

  return (
    <article className="group overflow-hidden rounded-xl border border-white/[0.075] bg-[#11150f] transition-colors duration-200 hover:border-[#c9ec57]/25">
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(138px,.9fr)_minmax(152px,1fr)] gap-x-5 gap-y-3 px-4 py-3.5 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-x-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] font-semibold tracking-[-.035em] text-[#d5f186]">{quote.quoteNumber}</span>
            <StatusPill status={quote.status} />
            {quote.invoiceNumber && (
              <span className="rounded-md border border-emerald-300/20 bg-emerald-300/[0.07] px-2 py-1 font-mono text-[9px] font-medium text-emerald-200">
                {quote.invoiceNumber}
              </span>
            )}
          </div>
          <p className="truncate text-[14px] font-semibold tracking-[-.02em] text-[#f0f1e9]">{quote.customerName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-[#899083]">
            <span className="font-mono text-[#a2a99a]">{quote.customerPhone}</span>
            <span className="text-[#53604b]">/</span>
            <span>{format(new Date(quote.createdAt), "dd MMM yyyy")}</span>
            {quote.validUntil && <span className="text-[#6e7865]">Due {format(new Date(quote.validUntil), "dd MMM")}</span>}
          </div>
        </div>

        <div className="flex flex-col justify-center border-l border-white/[0.065] pl-5 max-md:col-start-2 max-md:row-start-1 max-md:border-0 max-md:pl-0 max-md:text-right">
          <span className="text-[9px] font-semibold uppercase tracking-[.13em] text-[#727b6b]">Quote total</span>
          <span className="mt-1 font-mono text-[15px] font-semibold tracking-[-.045em] text-[#edf2df]">{money(quote.total)}</span>
          <span className="mt-1 text-[10px] text-[#818a7b]">
            {quote.items.length} items{quote.discountAmount > 0 ? ` · −${money(quote.discountAmount)}` : ""}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5 border-l border-white/[0.065] pl-4 max-md:col-span-2 max-md:justify-start max-md:border-0 max-md:border-t max-md:pt-2.5 max-md:pl-0">
          <button type="button" disabled title="Load items into POS cart" className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#c9ec57]/20 bg-[#c9ec57]/[0.075] px-2.5 text-[10px] font-bold text-[#d5f186] opacity-80 transition enabled:hover:bg-[#c9ec57]/15 disabled:cursor-not-allowed">
            <ShoppingCart className="h-3 w-3" /> Sell
          </button>
          <button type="button" disabled title={hasInvoice ? "Download issued invoice" : quote.status === "accepted" ? "Issue an invoice from this accepted quotation" : "Accept this quotation and issue its invoice"} className="inline-flex h-7 items-center gap-1.5 rounded-md border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 text-[10px] font-semibold text-emerald-200/90 opacity-80 disabled:cursor-not-allowed">
            <FileText className="h-3 w-3" />
            {hasInvoice ? "Invoice PDF" : quote.status === "accepted" ? "Make invoice" : "Accept & invoice"}
          </button>
          <button type="button" onClick={() => setExpanded(value => !value)} className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-[#9da493] transition-colors hover:bg-white/[0.06] hover:text-[#e5e9dc]">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide" : "Items"}
          </button>
          <span className="mx-0.5 h-4 w-px bg-white/[0.09] max-md:hidden" />
          <button type="button" disabled title="Share via WhatsApp" aria-label="Share via WhatsApp" className="flex h-7 w-7 items-center justify-center rounded-md text-[#68c99b] opacity-70 transition hover:bg-[#68c99b]/10 disabled:cursor-not-allowed"><MessageCircle className="h-3.5 w-3.5" /></button>
          <button type="button" disabled title="Download PDF" aria-label="Download PDF" className="flex h-7 w-7 items-center justify-center rounded-md text-[#a5ad9c] opacity-70 transition hover:bg-white/[0.07] hover:text-[#e5e9dc] disabled:cursor-not-allowed"><Download className="h-3.5 w-3.5" /></button>
          <button type="button" disabled title="Preview" aria-label="Preview" className="flex h-7 w-7 items-center justify-center rounded-md text-[#a5ad9c] opacity-70 transition hover:bg-white/[0.07] hover:text-[#e5e9dc] disabled:cursor-not-allowed"><Eye className="h-3.5 w-3.5" /></button>
          {!hasInvoice && (
            <>
              <button type="button" disabled title="Edit" aria-label="Edit quotation" className="flex h-7 w-7 items-center justify-center rounded-md text-[#a5ad9c] opacity-70 transition hover:bg-[#c9ec57]/10 hover:text-[#d5f186] disabled:cursor-not-allowed"><Edit2 className="h-3.5 w-3.5" /></button>
              <div className="relative">
                <button type="button" onClick={() => setMenuOpen(value => !value)} title="Change status" aria-label="Change status" className={cn("flex h-7 w-7 items-center justify-center rounded-md transition-colors", menuOpen ? "bg-white/[0.08] text-[#e5e9dc]" : "text-[#a5ad9c] hover:bg-white/[0.07] hover:text-[#e5e9dc]")}><MoreHorizontal className="h-4 w-4" /></button>
                {menuOpen && (
                  <>
                    <button type="button" aria-label="Close status menu" onClick={() => setMenuOpen(false)} className="fixed inset-0 z-20 cursor-default" />
                    <div className="absolute right-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-lg border border-white/10 bg-[#1b2118] py-1 shadow-[0_14px_40px_rgba(0,0,0,.45)]">
                      <p className="border-b border-white/[0.07] px-3 py-2 text-[9px] font-bold uppercase tracking-[.14em] text-[#89927e]">Change status</p>
                      {(Object.keys(statusMeta) as Status[]).filter(status => status !== quote.status).map(status => (
                        <button key={status} type="button" onClick={() => { onStatusChange(quote.id, status); setMenuOpen(false); }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[11px] font-medium text-[#dfe4d7] transition-colors hover:bg-white/[0.06]">
                          <span className={cn("h-1.5 w-1.5 rounded-full", statusMeta[status].dot)} /> Mark as {statusMeta[status].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <button type="button" disabled title="Delete quotation" aria-label="Delete quotation" className="flex h-7 w-7 items-center justify-center rounded-md text-[#9a8d83] opacity-70 transition hover:bg-rose-300/10 hover:text-rose-200 disabled:cursor-not-allowed"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/[0.08] bg-[#0d110c]">
          <div className="grid grid-cols-[minmax(0,1fr)_58px_112px_112px] gap-3 border-b border-white/[0.055] px-4 py-2 text-[9px] font-semibold uppercase tracking-[.12em] text-[#727c6b] max-sm:grid-cols-[minmax(0,1fr)_40px_86px]">
            <span>Product</span><span className="text-right">Qty</span><span className="text-right max-sm:hidden">Unit price</span><span className="text-right">Line total</span>
          </div>
          {quote.items.map((item, index) => (
            <div key={`${quote.id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_58px_112px_112px] items-center gap-3 border-b border-white/[0.045] px-4 py-2.5 last:border-0 max-sm:grid-cols-[minmax(0,1fr)_40px_86px]">
              <div className="min-w-0"><p className="truncate text-[11px] font-medium text-[#e5e9dc]">{item.productName}</p><p className="mt-0.5 text-[9px] text-[#7b8573]">{item.unit}</p></div>
              <span className="text-right font-mono text-[10px] text-[#bac1b2]">{item.qty}</span>
              <span className="text-right font-mono text-[10px] text-[#a0a99a] max-sm:hidden">{money(item.unitPrice)}</span>
              <span className="text-right font-mono text-[10px] font-semibold text-[#e5e9dc]">{money(item.total)}</span>
            </div>
          ))}
          {quote.discountAmount > 0 && <div className="flex justify-between border-t border-white/[0.05] px-4 py-2 text-[10px]"><span className="text-[#8f9885]">Discount applied</span><span className="font-mono font-semibold text-rose-200">−{money(quote.discountAmount)}</span></div>}
          <div className="flex items-center justify-between border-t border-[#c9ec57]/10 bg-[#c9ec57]/[0.035] px-4 py-2.5"><span className="text-[9px] font-bold uppercase tracking-[.13em] text-[#a7bf70]">Total</span><span className="font-mono text-[12px] font-semibold text-[#e7f4c5]">{money(quote.total)}</span></div>
        </div>
      )}
    </article>
  );
}

export function Refined() {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return quotes.filter(quote => {
      const matchesStatus = filter === "all" || quote.status === filter;
      const matchesSearch = !query || quote.customerName.toLowerCase().includes(query) || quote.quoteNumber.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [quotes, filter, search]);

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: quotes.length, draft: 0, sent: 0, accepted: 0, rejected: 0, expired: 0 };
    quotes.forEach(quote => { result[quote.status] += 1; });
    return result;
  }, [quotes]);

  const totalValue = filtered.reduce((sum, quote) => sum + quote.total, 0);
  const acceptedValue = quotes.filter(quote => quote.status === "accepted").reduce((sum, quote) => sum + quote.total, 0);
  const openCount = counts.draft + counts.sent;
  const draftCount = counts.draft;

  return (
    <main className="quotation-screen min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto min-h-[100dvh] max-w-[1440px] px-6 pb-8 pt-5 max-sm:px-4 max-sm:pt-4">
        <header className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#c9ec57]/25 bg-[#c9ec57]/[0.08] text-[#d5f186]">
              <Leaf className="h-[17px] w-[17px]" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-[12px] font-bold tracking-[.035em] text-[#eef2e6]">GREENLINK</span>
                <span className="h-3 w-px bg-white/15" />
                <span className="text-[10px] font-medium tracking-[.04em] text-[#90998a]">STORE WORKBENCH</span>
              </div>
              <p className="mt-0.5 text-[9px] uppercase tracking-[.14em] text-[#65705e]">Counter operations / Quotations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {draftCount > 0 && <button type="button" disabled title="Clear draft quotations" className="inline-flex h-9 items-center gap-2 rounded-lg border border-rose-300/15 bg-rose-300/[0.045] px-3 text-[11px] font-semibold text-rose-200/80 opacity-75 disabled:cursor-not-allowed max-sm:hidden"><Trash2 className="h-3.5 w-3.5" />Clear {draftCount} draft{draftCount !== 1 ? "s" : ""}</button>}
            <button type="button" disabled title="Create a new quote" className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#c9ec57] px-3.5 text-[11px] font-bold text-[#19200e] shadow-[inset_0_1px_0_rgba(255,255,255,.25)] transition hover:bg-[#d6f57a] disabled:cursor-not-allowed disabled:opacity-90"><Plus className="h-3.5 w-3.5" />New quote</button>
          </div>
        </header>

        <section className="flex items-end justify-between gap-4 py-5 max-sm:items-start max-sm:flex-col">
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-px w-5 bg-[#c9ec57]/70" />
              <span className="text-[9px] font-bold uppercase tracking-[.18em] text-[#a8c75b]">Sales desk</span>
            </div>
            <h1 className="font-display text-[27px] font-semibold leading-none tracking-[-.045em] text-[#f1f2e9] max-sm:text-[24px]">Quotations</h1>
            <p className="mt-2 text-[11px] text-[#8e9787]">
              {quotes.length} quotes on file{filtered.length !== quotes.length ? ` · ${filtered.length} shown` : ""}
              <span className="mx-2 text-[#4f5948]">/</span>
              <span className="text-[#a6b397]">Prepared for a busy counter.</span>
            </p>
          </div>
          <div className="flex items-center gap-1.5 pb-0.5 text-[10px] text-[#899282] max-sm:hidden">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c9ec57]" />
            Local quotation register
          </div>
        </section>

        <section className="mb-4 grid grid-cols-[1.15fr_1fr_.82fr] overflow-hidden rounded-xl border border-white/[0.08] bg-[#11150f] max-sm:grid-cols-3">
          <div className="px-4 py-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#7e8874]">Value in view</p>
            <p className="mt-1.5 font-mono text-[16px] font-medium tracking-[-.045em] text-[#f0f2e9]">{money(totalValue)}</p>
          </div>
          <div className="border-l border-white/[0.07] px-4 py-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#83b99b]">Accepted value</p>
            <p className="mt-1.5 font-mono text-[16px] font-medium tracking-[-.045em] text-[#cce8d1]">{money(acceptedValue)}</p>
          </div>
          <div className="border-l border-white/[0.07] px-4 py-3.5">
            <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#a8c75b]">Open quotes</p>
            <p className="mt-1.5 font-mono text-[16px] font-medium tracking-[-.045em] text-[#d8ed9a]">{openCount}<span className="ml-1.5 font-sans text-[10px] font-normal text-[#7e8874]">to follow up</span></p>
          </div>
        </section>

        <section aria-label="Search and filter quotations">
          <div className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
            <label className="relative block min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#7d8774]" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a customer or quote number" className="h-10 w-full rounded-lg border border-white/[0.09] bg-[#11150f] pl-9 pr-10 text-[12px] text-[#e8ebe1] outline-none transition placeholder:text-[#6f7868] focus:border-[#c9ec57]/40 focus:ring-2 focus:ring-[#c9ec57]/[0.08]" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#929b88] transition hover:bg-white/[0.07] hover:text-white"><X className="h-3 w-3" /></button>}
            </label>
            <div className="flex items-center gap-1 overflow-x-auto max-sm:w-full">
              {tabs.map(tab => (
                <button key={tab.id} type="button" onClick={() => setFilter(tab.id)} className={cn("flex h-9 shrink-0 items-center gap-2 rounded-lg border px-2.5 text-[10px] font-semibold transition-colors", filter === tab.id ? "border-[#c9ec57]/25 bg-[#c9ec57]/[0.09] text-[#e1f6a9]" : "border-transparent text-[#929a8b] hover:bg-white/[0.045] hover:text-[#e2e7da]")}>
                  {tab.label}
                  {counts[tab.id] > 0 && <span className={cn("font-mono text-[9px]", filter === tab.id ? "text-[#bddc64]" : "text-[#68725f]")}>{String(counts[tab.id]).padStart(2, "0")}</span>}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4">
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[9px] font-bold uppercase tracking-[.15em] text-[#78826e]">
              {filter === "all" ? "Recent quotations" : `${statusMeta[filter].label} quotations`}
              <span className="ml-2 font-mono font-medium tracking-normal text-[#56604e]">{String(filtered.length).padStart(2, "0")}</span>
            </p>
            {search && <p className="max-w-[55%] truncate text-[10px] text-[#87917d]">Matching “{search}”</p>}
          </div>
          <div className="space-y-2">
            {filtered.map(quote => (
              <QuoteRow key={quote.id} quote={quote} onStatusChange={(id, status) => setQuotes(previous => previous.map(item => item.id === id ? { ...item, status } : item))} />
            ))}
            {filtered.length === 0 && (
              <div className="flex min-h-[230px] flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.11] bg-[#11150f]/70 px-6 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-[#c9ec57]/15 bg-[#c9ec57]/[0.05] text-[#a8c75b]"><FileText className="h-5 w-5" /></div>
                <p className="text-[13px] font-semibold text-[#e7eadf]">{search || filter !== "all" ? "No matching quotations" : "No quotations yet"}</p>
                <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-[#7f8975]">{search || filter !== "all" ? "Try another customer name, quote number, or status." : "Create a quote to start a customer conversation."}</p>
                {(search || filter !== "all") && <button type="button" onClick={() => { setSearch(""); setFilter("all"); }} className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#c9ec57] hover:text-[#e1f6a9]">Clear search and filters <ArrowUpRight className="h-3 w-3" /></button>}
              </div>
            )}
          </div>
        </section>
        <footer className="mt-5 flex items-center justify-between border-t border-white/[0.06] px-1 pt-3 text-[9px] text-[#586250]">
          <span>GreenLink POS <span className="mx-1.5 text-[#3e4838]">/</span> Shop quotations</span>
          <span className="font-mono tracking-wide">KES · EAST AFRICA</span>
        </footer>
      </div>
    </main>
  );
}
