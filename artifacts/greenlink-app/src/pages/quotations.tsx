import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  customFetch,
  useGetShop,
  getGetShopQueryKey,
} from "@workspace/api-client-react";
import {
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  X,
  ClipboardList,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type Quotation,
  KES,
  STATUS_META,
} from "@/lib/quotation-utils";
import { downloadPdf } from "@/lib/quotation-pdf";
import { PrintView } from "@/features/quotations/PrintView";
import { QuotationBuilder } from "@/features/quotations/QuotationBuilder";
import { QuotationCard } from "@/features/quotations/QuotationCard";

// ─── Main page ────────────────────────────────────────────────────────────────

type StatusFilter =
  | "all"
  | "draft"
  | "sent"
  | "accepted"
  | "invoiced"
  | "rejected"
  | "expired";
type QuoteSortMode = "newest" | "value" | "customer" | "validUntil";
type PageView = "list" | "builder" | "print";

const QUOTES_INITIAL_VISIBLE = 15;
const QUOTES_PAGE_STEP = 20;

export default function Quotations() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const shopName = localStorage.getItem("greenlink_shopName") || "Active Shop";
  const [, setLocation] = useLocation();
  const [view, setView] = useState<PageView>("list");
  const [quoteList, setQuoteList] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [sortBy, setSortBy] = useState<QuoteSortMode>("newest");
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(QUOTES_INITIAL_VISIBLE);
  const [editTarget, setEditTarget] = useState<Quotation | null>(null);
  const [printTarget, setPrintTarget] = useState<Quotation | null>(null);
  const [clearingDrafts, setClearingDrafts] = useState(false);
  const [invoiceBusyId, setInvoiceBusyId] = useState<string | null>(null);

  const { data: shopData } = useGetShop(shopId, {
    query: { enabled: !!shopId, queryKey: getGetShopQueryKey(shopId) },
  });
  const shop = shopData as any;

  const loadQuotations = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const data = (await customFetch(
        `/api/quotations?shopId=${shopId}&limit=200`,
      )) as Quotation[];
      setQuoteList(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations]);

  useEffect(() => {
    setVisibleCount(QUOTES_INITIAL_VISIBLE);
  }, [filter, search, sortBy]);

  const filtered = useMemo(() => {
    let list = quoteList;
    if (filter === "invoiced") {
      list = list.filter((q) => Boolean(q.invoiceNumber));
    } else if (filter !== "all") {
      list = list.filter((q) => q.status === filter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (x) =>
          x.customerName.toLowerCase().includes(q) ||
          x.quoteNumber.toLowerCase().includes(q) ||
          (x.invoiceNumber || "").toLowerCase().includes(q) ||
          (x.customerPhone || "").toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "value") return b.total - a.total;
      if (sortBy === "customer") return a.customerName.localeCompare(b.customerName);
      if (sortBy === "validUntil") {
        const va = a.validUntil ? new Date(a.validUntil).getTime() : Number.MAX_SAFE_INTEGER;
        const vb = b.validUntil ? new Date(b.validUntil).getTime() : Number.MAX_SAFE_INTEGER;
        return va - vb;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [quoteList, filter, search, sortBy]);

  const visibleQuotes = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: quoteList.length, invoiced: 0 };
    quoteList.forEach((q) => {
      c[q.status] = (c[q.status] ?? 0) + 1;
      if (q.invoiceNumber) c.invoiced += 1;
    });
    return c;
  }, [quoteList]);

  const handleSave = (q: Quotation) => {
    setQuoteList((prev) => {
      const idx = prev.findIndex((x) => x.id === q.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = q;
        return next;
      }
      return [q, ...prev];
    });
    toast.success(
      editTarget ? "Quotation updated" : `${q.quoteNumber} created!`,
    );
    setView("list");
    setEditTarget(null);
  };

  const handleStatusChange = async (
    q: Quotation,
    status: Quotation["status"],
  ) => {
    try {
      const updated = (await customFetch(`/api/quotations/${q.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })) as Quotation;
      setQuoteList((prev) =>
        prev.map((x) => (x.id === updated.id ? updated : x)),
      );
      toast.success(`Marked as ${STATUS_META[status].label}`);
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (q: Quotation) => {
    if (!confirm(`Delete ${q.quoteNumber}? This cannot be undone.`)) return;
    try {
      await customFetch(`/api/quotations/${q.id}`, { method: "DELETE" });
      setQuoteList((prev) => prev.filter((x) => x.id !== q.id));
      toast.success("Quotation deleted");
    } catch {
      toast.error("Failed to delete");
    }
  };

  const handleClearDrafts = async () => {
    const drafts = quoteList.filter((q) => q.status === "draft");
    if (drafts.length === 0) {
      toast.info("No drafts to clear");
      return;
    }
    if (
      !confirm(
        `Delete all ${drafts.length} draft quotation${drafts.length !== 1 ? "s" : ""}?`,
      )
    )
      return;
    setClearingDrafts(true);
    let deleted = 0;
    for (const q of drafts) {
      try {
        await customFetch(`/api/quotations/${q.id}`, { method: "DELETE" });
        deleted++;
      } catch {}
    }
    setQuoteList((prev) => prev.filter((q) => q.status !== "draft"));
    toast.success(`Cleared ${deleted} draft${deleted !== 1 ? "s" : ""}`);
    setClearingDrafts(false);
  };

  const handleConvertToSale = (q: Quotation) => {
    sessionStorage.setItem(
      "greenlink_pending_cart",
      JSON.stringify({
        items: q.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          qty: item.qty,
          unitPrice: item.unitPrice,
          unit: item.unit,
        })),
        customerName: q.customerName,
        discount: q.discountAmount,
        fromQuote: q.quoteNumber,
      }),
    );
    toast.success(`Loading ${q.quoteNumber} into POS…`);
    setLocation("/pos");
  };

  const handleInvoice = async (q: Quotation) => {
    if (invoiceBusyId) return;
    if (q.invoiceNumber) {
      await downloadPdf(q, shop, "invoice");
      return;
    }
    setInvoiceBusyId(q.id);
    try {
      if (q.status !== "accepted") {
        const accepted = (await customFetch(`/api/quotations/${q.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "accepted" }),
        })) as Quotation;
        setQuoteList((prev) =>
          prev.map((item) => (item.id === accepted.id ? accepted : item)),
        );
      }
      const issued = (await customFetch(`/api/quotations/${q.id}/invoice`, {
        method: "POST",
      })) as Quotation;
      setQuoteList((prev) =>
        prev.map((item) => (item.id === issued.id ? issued : item)),
      );
      toast.success(`${issued.invoiceNumber} issued`);
      await downloadPdf(issued, shop, "invoice");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not issue invoice");
    } finally {
      setInvoiceBusyId(null);
    }
  };

  if (view === "print" && printTarget) {
    return (
      <PrintView
        quotation={printTarget}
        shop={shop}
        onClose={() => {
          setView("list");
          setPrintTarget(null);
        }}
      />
    );
  }

  if (view === "builder") {
    return (
      <div className="flex flex-col h-full bg-background">
        <QuotationBuilder
          shopId={shopId}
          editQuotation={editTarget}
          onSave={handleSave}
          onCancel={() => {
            setView("list");
            setEditTarget(null);
          }}
        />
      </div>
    );
  }

  const TABS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All quotes" },
    { id: "draft", label: "Draft" },
    { id: "sent", label: "Sent" },
    { id: "accepted", label: "Accepted" },
    { id: "invoiced", label: "Invoiced" },
    { id: "rejected", label: "Rejected" },
    { id: "expired", label: "Expired" },
  ];

  const draftCount = counts["draft"] ?? 0;
  const totalValue = filtered.reduce((s, q) => s + q.total, 0);
  const acceptedValue = quoteList
    .filter((q) => q.status === "accepted")
    .reduce((s, q) => s + q.total, 0);
  const openQuotes = quoteList.filter((q) => q.status === "draft" || q.status === "sent");
  const openCount = openQuotes.length;
  const openValue = openQuotes.reduce((s, q) => s + q.total, 0);
  const invoicedQuotes = quoteList.filter((q) => Boolean(q.invoiceNumber));
  const invoicedCount = invoicedQuotes.length;
  const invoicedValue = invoicedQuotes.reduce((s, q) => s + q.total, 0);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky Executive Header */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur-md shrink-0">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 pt-4 pb-3.5 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="font-display text-lg sm:text-xl font-bold leading-tight tracking-tight text-foreground truncate">
                  Quotations &amp; Proforma
                </h1>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {shopName} · {quoteList.length} quote{quoteList.length !== 1 ? "s" : ""} on file
                  {filtered.length !== quoteList.length && ` · ${filtered.length} matching`}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {draftCount > 0 && (
                <button
                  type="button"
                  onClick={handleClearDrafts}
                  disabled={clearingDrafts}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 text-xs font-semibold text-rose-700 dark:text-rose-400 transition-colors hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {clearingDrafts ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">Clear {draftCount} draft{draftCount !== 1 ? "s" : ""}</span>
                  <span className="sm:hidden">Clear drafts</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setEditTarget(null);
                  setView("builder");
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> New Quote
              </button>
            </div>
          </div>

          {/* Search + Sort Row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="relative block min-w-0 flex-1">
              <span className="sr-only">Search quotations</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer, phone, quote # or invoice #…"
                className="h-9 w-full rounded-xl border border-border/70 bg-muted/40 pl-9 pr-9 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/75"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>

            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as QuoteSortMode)}
                aria-label="Sort quotations"
                className="h-9 rounded-xl border border-border/70 bg-muted/40 px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35 w-full sm:w-auto"
              >
                <option value="newest">Sort: Newest First</option>
                <option value="value">Sort: Highest Value</option>
                <option value="customer">Sort: Customer (A–Z)</option>
                <option value="validUntil">Sort: Expiring Soonest</option>
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          <div
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar"
            role="group"
            aria-label="Filter quotations by status"
          >
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={filter === tab.id}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
                  filter === tab.id
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted hover:text-foreground",
                )}
              >
                <span>{tab.label}</span>
                <span
                  className={cn(
                    "font-mono text-[10px] font-bold tabular-nums px-1.5 py-0.2 rounded-full",
                    filter === tab.id
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background/70 text-muted-foreground",
                  )}
                >
                  {counts[tab.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 pb-20 md:pb-8 space-y-4">
          {/* Interactive 4-Card KPI Strip */}
          {!loading && quoteList.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 sm:p-4 transition-colors",
                  filter === "all"
                    ? "bg-card border-primary/50 ring-1 ring-primary/25"
                    : "bg-card/80 border-border/80 hover:border-border",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/12 flex items-center justify-center shrink-0">
                    <ClipboardList className="h-4 w-4 text-primary" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                    {filtered.length} shown
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-2.5">
                  Pipeline in View
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-foreground leading-snug break-words mt-0.5">
                  {KES(totalValue)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "accepted" ? "all" : "accepted")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 sm:p-4 transition-colors",
                  filter === "accepted"
                    ? "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/25"
                    : "bg-card/80 border-border/80 hover:border-emerald-500/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/12 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {counts["accepted"] ?? 0} won
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-2.5">
                  Accepted Value
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 leading-snug break-words mt-0.5">
                  {KES(acceptedValue)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "sent" ? "all" : "sent")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 sm:p-4 transition-colors",
                  filter === "sent"
                    ? "bg-sky-500/10 border-sky-500/50 ring-1 ring-sky-500/25"
                    : "bg-card/80 border-border/80 hover:border-sky-500/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl bg-sky-500/12 flex items-center justify-center shrink-0">
                    <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/12 text-sky-700 dark:text-sky-400 tabular-nums">
                    {openCount} open
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-2.5">
                  Awaiting Follow-Up
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-foreground leading-snug break-words mt-0.5">
                  {KES(openValue)}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "invoiced" ? "all" : "invoiced")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 sm:p-4 transition-colors",
                  filter === "invoiced"
                    ? "bg-amber-500/10 border-amber-500/50 ring-1 ring-amber-500/25"
                    : "bg-card/80 border-border/80 hover:border-amber-500/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/12 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/12 text-amber-700 dark:text-amber-400 tabular-nums">
                    {invoicedCount} issued
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-muted-foreground mt-2.5">
                  Invoiced Total
                </p>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums text-foreground leading-snug break-words mt-0.5">
                  {KES(invoicedValue)}
                </p>
              </button>
            </div>
          )}

          {loading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-muted/40 border border-border/50 animate-pulse"
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <p className="text-sm font-bold text-foreground">
                {search || filter !== "all"
                  ? "No matching quotations"
                  : "No quotations yet"}
              </p>
              <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
                {search || filter !== "all"
                  ? "Try another customer name, phone number, quote number, or status filter."
                  : "Create your first professional quotation to send on WhatsApp, download as PDF, or convert to a POS sale."}
              </p>
              {search || filter !== "all" ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setFilter("all");
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  Clear search &amp; filters
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditTarget(null);
                    setView("builder");
                  }}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Plus className="h-4 w-4" /> Create first quote
                </button>
              )}
            </div>
          ) : (
            <section aria-label="Quotation list" className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {filter === "all"
                    ? "Recent quotations"
                    : filter === "invoiced"
                      ? "Invoiced quotations"
                      : `${STATUS_META[filter].label} quotations`}
                  <span className="ml-2 font-mono font-semibold text-foreground tabular-nums">
                    {filtered.length}
                  </span>
                </p>
                {search && (
                  <p className="max-w-[55%] truncate text-xs text-muted-foreground">
                    Matching &ldquo;{search}&rdquo;
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                {visibleQuotes.map((q) => (
                  <QuotationCard
                    key={q.id}
                    q={q}
                    shop={shop}
                    onEdit={() => {
                      setEditTarget(q);
                      setView("builder");
                    }}
                    onPrint={() => {
                      setPrintTarget(q);
                      setView("print");
                    }}
                    onStatusChange={(s) => handleStatusChange(q, s)}
                    onDelete={() => handleDelete(q)}
                    onDownloadPdf={() => downloadPdf(q, shop)}
                    onConvertToSale={() => handleConvertToSale(q)}
                    onInvoice={() => {
                      void handleInvoice(q);
                    }}
                    invoiceBusy={invoiceBusyId === q.id}
                  />
                ))}
              </div>

              {/* Pagination Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-2xl border border-border/70 bg-card/60 px-4 py-3 text-xs">
                <span className="text-muted-foreground tabular-nums">
                  Showing{" "}
                  <span className="font-semibold text-foreground">1–{visibleQuotes.length}</span> of{" "}
                  <span className="font-semibold text-foreground">{filtered.length}</span> quotation
                  {filtered.length === 1 ? "" : "s"}
                </span>
                {filtered.length > visibleCount && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisibleCount((n) => n + QUOTES_PAGE_STEP)}
                      className="inline-flex h-8 items-center rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                      Show {Math.min(QUOTES_PAGE_STEP, filtered.length - visibleCount)} more
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisibleCount(filtered.length)}
                      className="inline-flex h-8 items-center rounded-xl px-3 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      Show all ({filtered.length})
                    </button>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
