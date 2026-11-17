import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/format";
import {
  Search,
  UserPlus,
  ChevronRight,
  Users,
  TrendingDown,
  Star,
  X,
  ArrowUpDown,
  Wallet,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  avatarColor,
  crmKey,
  PAGE_STEP,
  INITIAL_VISIBLE,
  type CustomerEntry,
  type FilterMode,
  type SortMode,
} from "@/features/customers/customer-utils";
import { CustomerFormDialog } from "@/features/customers/CustomerFormDialog";
import { CustomerDetailPanel } from "@/features/customers/CustomerDetailPanel";

// ─── Main customers page ──────────────────────────────────────────────────────
export default function Customers() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const shopName = localStorage.getItem("greenlink_shopName") || "Active Shop";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sortBy, setSortBy] = useState<SortMode>("balance");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerEntry | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerEntry | null>(null);

  const qc = useQueryClient();

  const { data: allCustomers = [], isLoading } = useQuery<CustomerEntry[]>({
    queryKey: crmKey(shopId),
    queryFn: () => customFetch<CustomerEntry[]>(`/api/crm?shopId=${encodeURIComponent(shopId)}`),
    enabled: !!shopId,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [search, filter, sortBy]);

  const stats = useMemo(() => {
    const total = allCustomers.length;
    const registered = allCustomers.filter((c) => c.registered).length;
    const withBalance = allCustomers.filter((c) => c.totalBalance > 0).length;
    const withCredit = allCustomers.filter((c) => (c.totalCredit ?? 0) > 0).length;
    const outstanding = allCustomers.reduce((s, c) => s + Number(c.totalBalance || 0), 0);
    const totalCredit = allCustomers.reduce((s, c) => s + Number(c.totalCredit || 0), 0);
    return { total, registered, withBalance, withCredit, outstanding, totalCredit };
  }, [allCustomers]);

  const FILTERS: Array<{ value: FilterMode; label: string; count: number }> = [
    { value: "all", label: "All", count: stats.total },
    { value: "registered", label: "Registered", count: stats.registered },
    { value: "active", label: "Has Debt", count: allCustomers.filter((c) => c.activeCount > 0 || c.totalBalance > 0).length },
    { value: "credit", label: "Has Credit", count: stats.withCredit },
  ];

  const sortedFiltered = useMemo(() => {
    let list = allCustomers;
    if (filter === "registered") list = list.filter((c) => c.registered);
    else if (filter === "active") list = list.filter((c) => c.activeCount > 0 || c.totalBalance > 0);
    else if (filter === "credit") list = list.filter((c) => (c.totalCredit ?? 0) > 0);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.email || "").toLowerCase().includes(q)
      );
    }

    return [...list].sort((a, b) => {
      if (sortBy === "balance") {
        const diff = (b.totalBalance || 0) - (a.totalBalance || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortBy === "credit") {
        const diff = (b.totalCredit || 0) - (a.totalCredit || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortBy === "paid") {
        const diff = (b.totalPaid || 0) - (a.totalPaid || 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }
      if (sortBy === "recent") {
        const ta = a.lastActivity ? new Date(a.lastActivity).getTime() : new Date(a.createdAt).getTime();
        const tb = b.lastActivity ? new Date(b.lastActivity).getTime() : new Date(b.createdAt).getTime();
        return tb - ta;
      }
      return a.name.localeCompare(b.name);
    });
  }, [allCustomers, filter, search, sortBy]);

  const visibleCustomers = useMemo(
    () => sortedFiltered.slice(0, visibleCount),
    [sortedFiltered, visibleCount]
  );

  const handleSelect = (c: CustomerEntry) => setSelectedCustomer(c);
  const handleClose = () => setSelectedCustomer(null);

  const isSelected = (c: CustomerEntry) =>
    selectedCustomer
      ? c.id && selectedCustomer.id
        ? c.id === selectedCustomer.id
        : c.name === selectedCustomer.name
      : false;

  return (
    <div className="flex flex-col h-[calc(100dvh-3.5rem)] md:h-screen bg-background overflow-hidden">
      {/* ── Sticky Executive Header ───────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border/80 shrink-0">
        <div className="px-4 sm:px-5 pt-3.5 pb-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                <Users className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold font-display tracking-tight truncate">
                  Customers &amp; CRM
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  {shopName} · {stats.total} directory account{stats.total === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/debts"
                className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted text-xs font-semibold text-foreground transition-colors"
              >
                <Wallet className="h-3.5 w-3.5 text-primary" />
                Debt Ledger
              </Link>
              <button
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors shadow-sm"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>New Customer</span>
              </button>
            </div>
          </div>

          {/* Search + Sort Controls */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search customer by name, phone or email…"
                className="pl-9 pr-8 h-9 text-sm bg-muted/40 border-border/60 rounded-xl"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortMode)}
                aria-label="Sort customers"
                className="h-9 rounded-xl border border-border/70 bg-muted/40 px-3 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 w-full sm:w-auto"
              >
                <option value="balance">Sort: Highest Debt</option>
                <option value="recent">Sort: Recent Activity</option>
                <option value="name">Sort: Name (A–Z)</option>
                <option value="paid">Sort: Most Paid</option>
                <option value="credit">Sort: Store Credit</option>
              </select>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap border",
                  filter === f.value
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-muted/50 text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted"
                )}
              >
                {f.label}
                <span
                  className={cn(
                    "text-[10px] font-bold tabular-nums px-1.5 py-0.2 rounded-full",
                    filter === f.value
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-background/70 text-muted-foreground"
                  )}
                >
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body: Split Pane ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Directory List Pane */}
        <div
          className={cn(
            "flex flex-col overflow-hidden transition-[width] duration-150",
            selectedCustomer ? "hidden md:flex md:flex-1" : "flex-1"
          )}
        >
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 pt-4 pb-20 md:pb-8 space-y-4">
            {/* Interactive 4-Card KPI Strip (switches to 2x2 when right panel is open to prevent text clipping) */}
            <div
              className={cn(
                "grid grid-cols-2 gap-2.5 sm:gap-3",
                !selectedCustomer && "lg:grid-cols-4"
              )}
            >
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 transition-colors",
                  filter === "all"
                    ? "bg-card border-primary/50 ring-1 ring-primary/25"
                    : "bg-card/80 border-border/80 hover:border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    All Accounts
                  </span>
                  <Users className="h-3.5 w-3.5 text-primary shrink-0" />
                </div>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 text-foreground">
                  {stats.total}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {stats.registered} registered
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "registered" ? "all" : "registered")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 transition-colors",
                  filter === "registered"
                    ? "bg-card border-primary/50 ring-1 ring-primary/25"
                    : "bg-card/80 border-border/80 hover:border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Saved Profiles
                  </span>
                  <Star className="h-3.5 w-3.5 text-primary fill-primary/20 shrink-0" />
                </div>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 text-foreground">
                  {stats.registered}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  Contacts &amp; limits
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "active" ? "all" : "active")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 transition-colors",
                  filter === "active"
                    ? "bg-rose-500/10 border-rose-500/50 ring-1 ring-rose-500/25"
                    : stats.outstanding > 0
                    ? "bg-rose-500/6 border-rose-500/25 hover:border-rose-500/45"
                    : "bg-card/80 border-border/80 hover:border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total Debt Due
                  </span>
                  <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                </div>
                <p
                  className={cn(
                    "text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 leading-snug break-words",
                    stats.outstanding > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                  )}
                >
                  {formatKES(stats.outstanding)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {stats.withBalance} customer{stats.withBalance === 1 ? "" : "s"} owe
                </p>
              </button>

              <button
                type="button"
                onClick={() => setFilter(filter === "credit" ? "all" : "credit")}
                className={cn(
                  "text-left rounded-2xl border p-3.5 transition-colors",
                  filter === "credit"
                    ? "bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/25"
                    : "bg-card/80 border-border/80 hover:border-border"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Store Credit
                  </span>
                  <Wallet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                </div>
                <p className="text-lg sm:text-xl font-bold font-mono tabular-nums mt-1.5 text-emerald-700 dark:text-emerald-400 leading-snug break-words">
                  {formatKES(stats.totalCredit)}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                  {stats.withCredit} with credit
                </p>
              </button>
            </div>

            {/* Table Card */}
            <div className="rounded-2xl border border-border/80 bg-card overflow-hidden">
              {/* Column Header */}
              <div className="grid grid-cols-[minmax(0,1fr)_auto_20px] sm:grid-cols-[minmax(0,1fr)_130px_92px_20px] gap-x-3 px-4 py-2.5 border-b border-border/70 bg-muted/30">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Customer Account
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right">
                  Balance &amp; Credit
                </span>
                <span className="hidden sm:block text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-center">
                  Status
                </span>
                <span />
              </div>

              {/* Rows */}
              {isLoading ? (
                <div className="divide-y divide-border/40">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                      <div className="w-9 h-9 rounded-xl bg-muted/60 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-36 bg-muted/60 rounded-full" />
                        <div className="h-2.5 w-24 bg-muted/40 rounded-full" />
                      </div>
                      <div className="h-4 w-20 bg-muted/40 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : sortedFiltered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4 gap-3 text-center">
                  <Users className="h-11 w-11 text-muted-foreground/25" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {search ? `No customers match "${search}"` : "No customers match this filter"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {search || filter !== "all"
                        ? "Try clearing your search or switching filters."
                        : "Add your first registered customer profile to track contacts and credit limits."}
                    </p>
                  </div>
                  {search || filter !== "all" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSearch("");
                        setFilter("all");
                      }}
                      className="rounded-xl"
                    >
                      Reset filters
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setAddOpen(true)} className="rounded-xl gap-1.5">
                      <UserPlus className="h-3.5 w-3.5" />
                      Add first customer
                    </Button>
                  )}
                </div>
              ) : (
                <div className="divide-y divide-border/45">
                  {visibleCustomers.map((customer) => (
                    <div
                      key={customer.id ?? `u-${customer.name}`}
                      onClick={() => handleSelect(customer)}
                      className={cn(
                        "grid grid-cols-[minmax(0,1fr)_auto_20px] sm:grid-cols-[minmax(0,1fr)_130px_92px_20px] gap-x-3 items-center px-4 py-3 cursor-pointer transition-colors",
                        isSelected(customer)
                          ? "bg-primary/10 ring-1 ring-inset ring-primary/35"
                          : "hover:bg-muted/35"
                      )}
                    >
                      {/* Customer Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0",
                            avatarColor(customer.name, customer.totalBalance > 0)
                          )}
                        >
                          {customer.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-semibold text-foreground truncate">
                              {customer.name}
                            </span>
                            {customer.registered && (
                              <Star
                                className="h-3 w-3 text-primary fill-primary shrink-0"
                                aria-label="Registered profile"
                              />
                            )}
                            {customer.creditLimit != null && (
                              <span className="hidden lg:inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 tabular-nums">
                                Limit {formatKES(customer.creditLimit)}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {customer.phone || customer.email || (
                              <span className="italic opacity-75">No phone or email</span>
                            )}
                          </p>
                          {customer.latestDebtAmount != null && customer.lastActivity && (
                            <p className="text-[10px] text-sky-600 dark:text-sky-400 truncate mt-0.5">
                              Latest: {formatKES(customer.latestDebtAmount)} ·{" "}
                              {format(new Date(customer.lastActivity), "d MMM yyyy")}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Balance / Credit */}
                      <div className="text-right min-w-0">
                        <p
                          className={cn(
                            "text-sm font-bold font-mono tabular-nums",
                            customer.totalBalance > 0
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-muted-foreground"
                          )}
                        >
                          {customer.totalBalance > 0 ? formatKES(customer.totalBalance) : "Ksh 0"}
                        </p>
                        {customer.totalCredit > 0 && (
                          <p className="text-[10px] font-medium font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            Credit: {formatKES(customer.totalCredit)}
                          </p>
                        )}
                        {(customer.totalPaid ?? 0) > 0 && (
                          <p className="text-[10px] font-mono tabular-nums text-muted-foreground">
                            Paid: {formatKES(customer.totalPaid)}
                          </p>
                        )}
                      </div>

                      {/* Status Pill */}
                      <div className="hidden sm:flex justify-center">
                        {customer.totalBalance > 0 || customer.activeCount > 0 ? (
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-2.5 py-1 rounded-full whitespace-nowrap tabular-nums",
                              customer.totalBalance > 0
                                ? "bg-rose-500/12 text-rose-700 dark:text-rose-400 border border-rose-500/20"
                                : "bg-amber-500/12 text-amber-700 dark:text-amber-400 border border-amber-500/20"
                            )}
                          >
                            {customer.activeCount} active
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                            Clear
                          </span>
                        )}
                      </div>

                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination Footer */}
              {!isLoading && sortedFiltered.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 border-t border-border/60 bg-muted/20 text-xs">
                  <span className="text-muted-foreground tabular-nums">
                    Showing <span className="font-semibold text-foreground">1–{visibleCustomers.length}</span> of{" "}
                    <span className="font-semibold text-foreground">{sortedFiltered.length}</span> customer
                    {sortedFiltered.length === 1 ? "" : "s"}
                  </span>
                  {sortedFiltered.length > visibleCount && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setVisibleCount((n) => n + PAGE_STEP)}
                        className="h-7 rounded-lg text-xs font-semibold"
                      >
                        Show {Math.min(PAGE_STEP, sortedFiltered.length - visibleCount)} more
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVisibleCount(sortedFiltered.length)}
                        className="h-7 rounded-lg text-xs font-semibold text-primary"
                      >
                        Show all ({sortedFiltered.length})
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Desktop Right Split Panel ── */}
        {selectedCustomer && (
          <div className="hidden md:flex flex-col w-[410px] lg:w-[430px] border-l border-border/80 overflow-hidden shrink-0">
            <CustomerDetailPanel
              customer={selectedCustomer}
              shopId={shopId}
              onClose={handleClose}
              onEdit={() => setEditTarget(selectedCustomer)}
              isOwner={isOwner}
            />
          </div>
        )}
      </div>

      {/* ── Mobile Bottom Sheet ────────────────────────────────────────────── */}
      {selectedCustomer && (
        <div className="md:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            onClick={handleClose}
          />
          <div
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-3xl flex flex-col overflow-hidden border-t border-border shadow-2xl"
            style={{ maxHeight: "90vh" }}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/25" />
            </div>
            <CustomerDetailPanel
              customer={selectedCustomer}
              shopId={shopId}
              onClose={handleClose}
              onEdit={() => setEditTarget(selectedCustomer)}
              isOwner={isOwner}
            />
          </div>
        </div>
      )}

      {/* ── Form Dialogs ───────────────────────────────────────────────────── */}
      <CustomerFormDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        shopId={shopId}
      />
      <CustomerFormDialog
        open={!!editTarget}
        onClose={(updated) => {
          setEditTarget(null);
          if (updated) {
            setSelectedCustomer((prev) => (prev ? { ...prev, ...updated } : null));
            qc.invalidateQueries({ queryKey: crmKey(shopId) });
          }
        }}
        shopId={shopId}
        initial={editTarget}
      />
    </div>
  );
}
