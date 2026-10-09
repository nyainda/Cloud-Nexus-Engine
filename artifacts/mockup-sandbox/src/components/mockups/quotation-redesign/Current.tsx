import "./_group.css";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Edit2,
  Eye,
  FileText,
  Loader2,
  MessageCircle,
  MoreVertical,
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

const KES = (amount: number) =>
  "KES " +
  amount.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const STATUS_META: Record<Status, { label: string; color: string }> = {
  draft: { label: "Draft", color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20" },
  sent: { label: "Sent", color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  accepted: { label: "Accepted", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  rejected: { label: "Rejected", color: "text-red-400 bg-red-400/10 border-red-400/20" },
  expired: { label: "Expired", color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
};

const INITIAL_QUOTES: Quote[] = [
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
];

function StatusBadge({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex items-center text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border", meta.color)}>
      {meta.label}
    </span>
  );
}

function CurrentQuoteCard({
  quote,
  onStatusChange,
}: {
  quote: Quote;
  onStatusChange: (quoteId: string, status: Status) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/20 transition-all group">
      <div className="h-0.5 bg-primary/0 group-hover:bg-primary/60 transition-colors" />
      <div className="px-4 py-3.5">
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-black text-primary font-mono tracking-tight">{quote.quoteNumber}</span>
              <StatusBadge status={quote.status} />
              {quote.invoiceNumber && (
                <span className="text-[9px] font-black text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded-full">
                  {quote.invoiceNumber}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-foreground truncate leading-tight">{quote.customerName}</p>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              {quote.customerPhone && <span className="text-[11px] text-muted-foreground/50 font-mono">{quote.customerPhone}</span>}
              <span className="text-[11px] text-muted-foreground/35">
                {format(new Date(quote.createdAt), "dd MMM yyyy")}
                {quote.validUntil && ` · Valid till ${format(new Date(quote.validUntil), "dd MMM")}`}
              </span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-base font-black text-primary font-mono">{KES(quote.total)}</p>
            <p className="text-[10px] text-muted-foreground/40 mt-0.5">
              {quote.items.length} item{quote.items.length !== 1 ? "s" : ""}
              {quote.discountAmount > 0 && ` · −${KES(quote.discountAmount)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 pt-2 border-t border-border/30 flex-wrap">
          <button className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-primary-foreground text-[10px] font-black transition-all">
            <ShoppingCart className="h-3 w-3" /><span>Sell</span>
          </button>
          <button className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 text-[10px] font-black transition-all">
            <FileText className="h-3 w-3" /><span>{quote.invoiceNumber ? "Invoice PDF" : quote.status === "accepted" ? "Make invoice" : "Accept & invoice"}</span>
          </button>
          <button onClick={() => setExpanded(value => !value)} className="h-7 px-2 flex items-center gap-1 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors text-[10px] font-semibold">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide" : "Items"}
          </button>
          <div className="flex-1" />
          <button className="h-7 w-7 flex items-center justify-center rounded-lg text-[#25D366] hover:bg-[#25D366]/10 transition-colors" title="Share via WhatsApp"><MessageCircle className="h-3.5 w-3.5" /></button>
          <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors" title="Download PDF"><Download className="h-3.5 w-3.5" /></button>
          <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors" title="Preview"><Eye className="h-3.5 w-3.5" /></button>
          {!quote.invoiceNumber && (
            <>
              <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors" title="Edit"><Edit2 className="h-3.5 w-3.5" /></button>
              <div className="relative">
                <button onClick={() => setMenuOpen(value => !value)} className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors" title="Change status"><MoreVertical className="h-3.5 w-3.5" /></button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-44 bg-card border border-border rounded-xl shadow-2xl z-40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-border/40"><p className="text-[10px] font-black text-muted-foreground/40 uppercase tracking-wider">Change Status</p></div>
                    {(["draft", "sent", "accepted", "rejected", "expired"] as Status[]).filter(status => status !== quote.status).map(status => (
                      <button key={status} onClick={() => { onStatusChange(quote.id, status); setMenuOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-muted/60 flex items-center gap-2.5 border-b border-border/20 last:border-0">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", status === "accepted" ? "bg-emerald-400" : status === "sent" ? "bg-blue-400" : status === "rejected" ? "bg-red-400" : status === "expired" ? "bg-amber-400" : "bg-zinc-400")} />
                        Mark as {STATUS_META[status].label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors" title="Delete quotation"><Trash2 className="h-3.5 w-3.5" /></button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40 bg-muted/10">
          <div className="px-4 py-1.5 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 text-[9px] font-black uppercase tracking-widest text-muted-foreground/30 border-b border-border/20">
            <span>Product</span><span className="text-right">Qty</span><span className="text-right">Unit Price</span><span className="text-right">Total</span>
          </div>
          {quote.items.map((item, index) => (
            <div key={index} className="px-4 py-2.5 grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center border-b border-border/15 last:border-0">
              <div className="min-w-0"><p className="text-xs font-semibold text-foreground truncate">{item.productName}</p><p className="text-[10px] text-muted-foreground/40 mt-0.5">{item.unit}</p></div>
              <span className="text-xs font-mono text-muted-foreground text-right">{item.qty}</span>
              <span className="text-xs font-mono text-muted-foreground/60 text-right">{KES(item.unitPrice)}</span>
              <span className="text-xs font-black font-mono text-foreground text-right">{KES(item.total)}</span>
            </div>
          ))}
          {quote.discountAmount > 0 && <div className="px-4 py-2 flex justify-between text-xs border-t border-border/20 bg-muted/20"><span className="text-muted-foreground/50">Discount applied</span><span className="font-mono font-bold text-red-400">−{KES(quote.discountAmount)}</span></div>}
          <div className="px-4 py-2.5 flex justify-between items-center bg-primary/5 border-t border-primary/10"><span className="text-[10px] font-black text-primary/60 uppercase tracking-wider">Total</span><span className="text-sm font-black font-mono text-primary">{KES(quote.total)}</span></div>
        </div>
      )}
    </div>
  );
}

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "sent", label: "Sent" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
];

export function Current() {
  const [quotes, setQuotes] = useState(INITIAL_QUOTES);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading] = useState(false);

  const filtered = useMemo(() => {
    let list = quotes;
    if (filter !== "all") list = list.filter(quote => quote.status === filter);
    const query = search.trim().toLowerCase();
    if (query) list = list.filter(quote => quote.customerName.toLowerCase().includes(query) || quote.quoteNumber.toLowerCase().includes(query));
    return list;
  }, [quotes, filter, search]);

  const counts = useMemo(() => {
    const result: Partial<Record<Filter, number>> = { all: quotes.length };
    quotes.forEach(quote => { result[quote.status] = (result[quote.status] ?? 0) + 1; });
    return result;
  }, [quotes]);

  const draftCount = counts.draft ?? 0;
  const totalValue = filtered.reduce((sum, quote) => sum + quote.total, 0);
  const acceptedValue = quotes.filter(quote => quote.status === "accepted").reduce((sum, quote) => sum + quote.total, 0);

  return (
    <div className="quotation-screen min-h-screen bg-background text-foreground">
      <div className="flex flex-col min-h-screen bg-background">
        <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <h1 className="text-lg font-black text-foreground font-display tracking-tight">Quotations</h1>
              <p className="text-[11px] text-muted-foreground/50">{quotes.length} quote{quotes.length !== 1 ? "s" : ""}{filtered.length !== quotes.length ? ` · ${filtered.length} shown` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              {draftCount > 0 && <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-destructive/10 text-destructive border border-destructive/20 text-xs font-bold hover:bg-destructive/20 transition-colors"><Trash2 className="h-3 w-3" />Clear {draftCount} Draft{draftCount !== 1 ? "s" : ""}</button>}
              <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black hover:bg-primary/90 transition-colors"><Plus className="h-3.5 w-3.5" />New Quote</button>
            </div>
          </div>

          {quotes.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-muted/30 rounded-xl px-3 py-2 border border-border/40"><p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/40 mb-0.5">Total Value</p><p className="text-sm font-black text-foreground font-mono">{KES(totalValue)}</p></div>
              <div className="bg-emerald-500/5 rounded-xl px-3 py-2 border border-emerald-500/15"><p className="text-[9px] font-black uppercase tracking-wider text-emerald-500/60 mb-0.5">Accepted</p><p className="text-sm font-black text-emerald-400 font-mono">{KES(acceptedValue)}</p></div>
              <div className="bg-primary/5 rounded-xl px-3 py-2 border border-primary/15"><p className="text-[9px] font-black uppercase tracking-wider text-primary/50 mb-0.5">Open</p><p className="text-sm font-black text-primary font-mono">{(counts.draft ?? 0) + (counts.sent ?? 0)}</p></div>
            </div>
          )}

          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by customer name or quote number…" className="w-full h-9 pl-9 pr-9 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/35 focus:outline-none focus:ring-1 focus:ring-primary/30" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded-full bg-muted-foreground/20 hover:bg-muted-foreground/30"><X className="h-2.5 w-2.5 text-muted-foreground" /></button>}
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setFilter(tab.id)} className={cn("flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-black whitespace-nowrap transition-all shrink-0", filter === tab.id ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted/70")}>
                {tab.label}
                {(counts[tab.id] ?? 0) > 0 && <span className={cn("text-[9px] font-black px-1 py-0.5 rounded-full min-w-[16px] text-center", filter === tab.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground/60")}>{counts[tab.id]}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3"><Loader2 className="h-6 w-6 text-primary animate-spin" /><p className="text-sm text-muted-foreground/50">Loading quotations…</p></div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center"><div className="w-14 h-14 rounded-2xl bg-muted/20 flex items-center justify-center"><FileText className="h-7 w-7 text-muted-foreground/20" /></div><div><p className="text-sm font-bold text-foreground">{search || filter !== "all" ? "No matching quotations" : "No quotations yet"}</p><p className="text-xs text-muted-foreground/40 mt-1">{search || filter !== "all" ? "Try a different filter or clear search" : "Create your first quote to get started"}</p></div>{!search && filter === "all" && <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black hover:bg-primary/90 transition-colors"><Plus className="h-4 w-4" />Create First Quote</button>}</div>
          ) : (
            <div className="p-4 space-y-3">
              {filtered.map(quote => <CurrentQuoteCard key={quote.id} quote={quote} onStatusChange={(id, status) => setQuotes(previous => previous.map(item => item.id === id ? { ...item, status } : item))} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
