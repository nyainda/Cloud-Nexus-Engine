import { useState, useMemo, useEffect } from "react";
import { useListDebts, getListDebtsQueryKey, customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toTitleCase } from "@/components/customer-autocomplete";
import { NurseryDebtSettlementDialog } from "@/components/NurseryDebtSettlementDialog";
import {
  computeNurseryProjection,
  findMatchingSupplier,
  loadNurserySettlementState,
  type NurserySettlementMetrics,
  type NurserySupplierSummary,
} from "@/lib/nursery-settlement";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/format";
import {
  Search, Phone, CheckCircle2, Wallet,
  MessageCircle, AlertTriangle, Clock, TrendingDown, History,
  ChevronRight, Send, X, ArrowUpDown, Sprout,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  type CustomerGroup,
  debtBalanceDue,
  debtCredit,
  debtAmountPaid,
} from "@/lib/debt-utils";
import { AddDebtDialog } from "@/features/debts/DebtRecordDialogs";
import { CustomerGroupRow } from "@/features/debts/DebtRows";
import { DebtDetailPanel } from "@/features/debts/DebtDetailPanel";

type DebtTab = "unpaid" | "partial" | "overdue" | "paid" | "all";

export default function Debts() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role   = localStorage.getItem("greenlink_role")   || "";
  const isOwner = role === "owner";

  const [search, setSearch]             = useState("");
  const debouncedSearch                 = useDebounce(search, 100);
  const [tab, setTab]                   = useState<DebtTab>("all");
  const [viewMode, setViewMode]         = useState<"customers" | "records">("customers");
  const [sortBy, setSortBy]             = useState<"balance_desc" | "oldest" | "newest" | "name_asc">("balance_desc");
  const [visibleCount, setVisibleCount] = useState(10);
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [bulkRemindOpen, setBulkRemindOpen] = useState(false);
  const shopName = localStorage.getItem("greenlink_shopName") || "Shop";
  const [plantSettleTarget, setPlantSettleTarget] = useState<{
    customerName: string;
    customerPhone?: string;
    initialTab?: "settle" | "history";
  } | null>(null);

  const suppliersQuery = useQuery<{ rows: NurserySupplierSummary[] }>({
    queryKey: ["/api/nursery/suppliers", shopId],
    queryFn: () => customFetch<{ rows: NurserySupplierSummary[] }>("/api/nursery/suppliers"),
    enabled: !!shopId,
    staleTime: 30_000,
  });
  const nurserySuppliers = suppliersQuery.data?.rows ?? [];

  useEffect(() => {
    setVisibleCount(10);
  }, [debouncedSearch, tab, viewMode, sortBy]);

  const qc = useQueryClient();

  // Invalidate handles writes on this device; polling makes updates from other
  // devices visible without requiring a page change or cache clear.
  const { data: allDebts, isLoading } = useListDebts(
    { shopId },
    {
      query: {
        queryKey: getListDebtsQueryKey({ shopId }),
        enabled: !!shopId,
        staleTime: 60_000,
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchInterval: 180_000,
        refetchIntervalInBackground: false,
      },
    }
  );

  const nurserySettlementQuery = useQuery<NurserySettlementMetrics>({
    queryKey: [
      "nursery-settlement-state",
      shopId,
      "debts-page",
      (allDebts as any[] | undefined)?.length ?? 0,
      ((allDebts as any[]) || []).reduce((s, d) => s + Number(d?.balance || 0), 0),
    ],
    queryFn: () =>
      loadNurserySettlementState({
        qc,
        shopId,
        shopName,
        allDebts: (allDebts as any[]) || [],
        suppliers: nurserySuppliers,
      }),
    enabled: !!shopId && !isLoading,
    staleTime: 60_000,
  });
  const nurseryMetrics = nurserySettlementQuery.data;
  const nurseryProjection = useMemo(() => {
    if (!nurseryMetrics) return null;
    return computeNurseryProjection({
      metrics: nurseryMetrics,
      poolMode: nurseryMetrics.shopConfig.poolMode,
      shopCommissionPct: nurseryMetrics.shopConfig.commissionPct,
    });
  }, [nurseryMetrics]);
  const nurseryTotalGross = nurseryMetrics?.grossTotal ?? 0;

  // Keep selectedDebt in sync when data refreshes
  useEffect(() => {
    if (selectedDebt && allDebts) {
      const fresh = (allDebts as any[]).find((d: any) => d.id === selectedDebt.id);
      if (fresh) setSelectedDebt(fresh);
    }
  }, [allDebts]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const debts = (allDebts || []) as any[];
    const active  = debts.filter((d: any) => d.status !== "paid" && d.status !== "cancelled");
    const overdue = active.filter((d: any) => differenceInDays(new Date(), new Date(d.createdAt)) > 30);
    const partial = debts.filter((d: any) => d.status === "partial");
    const paid    = debts.filter((d: any) => d.status === "paid");
    const unpaid  = debts.filter((d: any) => d.status === "unpaid");
    return {
      totalBalance:  active.reduce((s: number, d: any)  => s + debtBalanceDue(d), 0),
      totalDebt:     debts.reduce((s: number, d: any)   => s + (d.totalAmount || 0), 0),
      activeCount:   active.length,
      overdueCount:  overdue.length,
      overdueBalance: overdue.reduce((s: number, d: any) => s + debtBalanceDue(d), 0),
      overdueWithPhone: overdue.filter((d: any) => d.customerPhone),
      partialCount:  partial.length,
      partialBalance: partial.reduce((s: number, d: any) => s + debtBalanceDue(d), 0),
      paidCount:     paid.length,
      paidTotal:     paid.reduce((s: number, d: any)    => s + (d.totalAmount || 0), 0),
      unpaidCount:   unpaid.length,
      totalCount:    debts.length,
    };
  }, [allDebts]);

  const filtered = useMemo(() => {
    const debts = (allDebts || []) as any[];
    let list = debts;
    if (tab === "overdue") {
      list = debts.filter((d: any) => d.status !== "paid" && d.status !== "cancelled" && differenceInDays(new Date(), new Date(d.createdAt)) > 30);
    } else if (tab !== "all") {
      list = debts.filter((d: any) => d.status === tab);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((d: any) =>
        d.customerName.toLowerCase().includes(q) ||
        (d.customerPhone || "").includes(q)
      );
    }
    return [...list].sort((a: any, b: any) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "name_asc":
          return (a.customerName || "").localeCompare(b.customerName || "");
        default:
          return (b.balance || 0) - (a.balance || 0);
      }
    });
  }, [allDebts, tab, debouncedSearch, sortBy]);

  const grouped = useMemo(() => {
    const map = new Map<string, CustomerGroup>();

    // Track which debt is the newest per group so the group's display name
    // reflects the latest rename, not whichever debt happened to sort first.
    const newestSeenAt = new Map<string, string>();
    const oldestSeenAt = new Map<string, string>();

    for (const debt of filtered) {
      const key = debt.customerName?.trim().replace(/\s+/g, " ").toLowerCase() || "unknown";
      if (!map.has(key)) {
        map.set(key, {
          key,
          customerName: debt.customerName || "Unknown",
          customerPhone: debt.customerPhone || "",
          debts: [],
          activeDebts: [],
          totalAmount: 0,
          totalBalance: 0,
          totalCredit: 0,
          worstStatus: "cancelled",
          isOverdue: false,
        });
        newestSeenAt.set(key, debt.createdAt);
        oldestSeenAt.set(key, debt.createdAt);
      }
      const g = map.get(key)!;
      g.debts.push(debt);
      g.totalAmount += debt.totalAmount || 0;
      if (debt.status !== "cancelled") {
        g.totalBalance += debtBalanceDue(debt);
        g.totalCredit += debtCredit(debt);
      }
      if (debt.status !== "paid" && debt.status !== "cancelled") {
        g.activeDebts.push(debt);
        const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
        if (daysAgo > 30) g.isOverdue = true;
      }
      const statusRank = { unpaid: 3, partial: 2, paid: 1, cancelled: 0 } as Record<string, number>;
      if ((statusRank[debt.status] ?? 0) > (statusRank[g.worstStatus] ?? 0)) {
        g.worstStatus = debt.status as "unpaid" | "partial" | "paid" | "cancelled";
      }
      if (debt.createdAt >= (newestSeenAt.get(key) ?? debt.createdAt)) {
        newestSeenAt.set(key, debt.createdAt);
        if (debt.customerName) g.customerName = debt.customerName;
        if (debt.customerPhone) g.customerPhone = debt.customerPhone;
      }
      if (debt.createdAt < (oldestSeenAt.get(key) ?? debt.createdAt)) {
        oldestSeenAt.set(key, debt.createdAt);
      }
    }

    const list = Array.from(map.values());
    return list.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(oldestSeenAt.get(a.key) ?? 0).getTime() - new Date(oldestSeenAt.get(b.key) ?? 0).getTime();
        case "newest":
          return new Date(newestSeenAt.get(b.key) ?? 0).getTime() - new Date(newestSeenAt.get(a.key) ?? 0).getTime();
        case "name_asc":
          return a.customerName.localeCompare(b.customerName);
        default:
          return b.totalBalance - a.totalBalance;
      }
    });
  }, [filtered, sortBy]);

  const activeListTotal = viewMode === "customers" ? grouped.length : filtered.length;
  const visibleGroups = useMemo(() => grouped.slice(0, visibleCount), [grouped, visibleCount]);
  const visibleDebts = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  const TABS: { value: DebtTab; label: string; count: number }[] = [
    { value: "unpaid",  label: "Unpaid",       count: stats.unpaidCount  },
    { value: "partial", label: "Partial",      count: stats.partialCount },
    { value: "overdue", label: "Overdue 30d+", count: stats.overdueCount },
    { value: "paid",    label: "Paid",         count: stats.paidCount    },
    { value: "all",     label: "All",          count: stats.totalCount   },
  ];

  const STAT_CARDS: {
    label: string;
    tabKey: DebtTab;
    value: string;
    sub: string;
    Icon: any;
    iconBg: string;
    iconColor: string;
    valueCss: string;
    ringCss: string;
  }[] = [
    {
      label: "Total Debt",
      tabKey: "all",
      value: formatKES(stats.totalBalance),
      sub: `Across ${stats.activeCount} active records`,
      Icon: TrendingDown,
      iconBg: "bg-destructive/12 border-destructive/25",
      iconColor: "text-destructive",
      valueCss: "text-destructive",
      ringCss: "border-destructive/45 bg-destructive/[0.06]",
    },
    {
      label: "Overdue 30d+",
      tabKey: "overdue",
      value: formatKES(stats.overdueBalance),
      sub: `${stats.overdueCount} record${stats.overdueCount !== 1 ? "s" : ""}`,
      Icon: Clock,
      iconBg: stats.overdueCount > 0 ? "bg-rose-500/12 border-rose-500/25" : "bg-muted/40 border-border/60",
      iconColor: stats.overdueCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
      valueCss: stats.overdueCount > 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground",
      ringCss: "border-rose-500/45 bg-rose-500/[0.06]",
    },
    {
      label: "Partial Paid",
      tabKey: "partial",
      value: formatKES(stats.partialBalance),
      sub: `${stats.partialCount} record${stats.partialCount !== 1 ? "s" : ""}`,
      Icon: AlertTriangle,
      iconBg: stats.partialCount > 0 ? "bg-amber-500/12 border-amber-500/25" : "bg-muted/40 border-border/60",
      iconColor: stats.partialCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      valueCss: stats.partialCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
      ringCss: "border-amber-500/45 bg-amber-500/[0.06]",
    },
    {
      label: "Settled / Paid",
      tabKey: "paid",
      value: formatKES(stats.paidTotal),
      sub: `${stats.paidCount} record${stats.paidCount !== 1 ? "s" : ""}`,
      Icon: CheckCircle2,
      iconBg: "bg-emerald-500/12 border-emerald-500/25",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      valueCss: "text-emerald-600 dark:text-emerald-400",
      ringCss: "border-emerald-500/45 bg-emerald-500/[0.06]",
    },
  ];

  return (
    <div className="flex h-full overflow-hidden bg-background text-foreground">

      {/* ── Left Workspace Panel (Full width up to 2xl, side-by-side 2xl+) ─ */}
      <div className={cn(
        "flex flex-col min-w-0 flex-1 overflow-hidden transition-all duration-200",
        selectedDebt && "hidden sm:flex"
      )}>
        <div className="flex-1 overflow-y-auto">
          {/* Executive Header */}
          <header className="border-b border-border/70 bg-background/90 px-4 sm:px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <div className="flex items-center gap-3.5 min-w-[230px] flex-1">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/12 border border-primary/25 text-primary">
                  <Wallet className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-primary">
                    <span>Credit Ledger</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </div>
                  <h1 className="font-display text-2xl sm:text-[26px] font-bold tracking-normal leading-tight text-foreground">
                    Customer Debts
                  </h1>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    Track credit balances, partial settlements, statements & WhatsApp reminders.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {(nurseryTotalGross > 0 || nurserySuppliers.length > 0) && (
                  <button
                    type="button"
                    onClick={() =>
                      setPlantSettleTarget({
                        customerName:
                          nurserySuppliers.find((s) => !!s.customerName)?.customerName ??
                          nurserySuppliers[0]?.name ??
                          "",
                        customerPhone:
                          nurserySuppliers.find((s) => !!s.customerPhone)?.customerPhone ??
                          nurserySuppliers[0]?.phone ??
                          "",
                      })
                    }
                    className="inline-flex h-9 items-center gap-1.5 px-3 rounded-xl bg-emerald-500/12 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-colors cursor-pointer"
                    title="Clear nursery owner debts using this shop's sold plants"
                  >
                    <Sprout className="h-3.5 w-3.5" />
                    Plant Proceeds · {formatKES(nurseryTotalGross)}
                  </button>
                )}
                {stats.overdueWithPhone.length > 0 && (
                  <button
                    onClick={() => setBulkRemindOpen(true)}
                    className="inline-flex h-9 items-center gap-1.5 px-3 rounded-xl bg-[#25D366]/12 border border-[#25D366]/30 text-[#25D366] text-xs font-bold hover:bg-[#25D366]/20 transition-colors"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Remind
                    <span className="bg-[#25D366]/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums">
                      {stats.overdueWithPhone.length}
                    </span>
                  </button>
                )}

                <div className="inline-flex items-center rounded-xl border border-border/70 bg-muted/45 p-0.5">
                  <button
                    onClick={() => setViewMode("customers")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                      viewMode === "customers" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Customers
                  </button>
                  <button
                    onClick={() => setViewMode("records")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                      viewMode === "records" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Records
                  </button>
                </div>

                <AddDebtDialog shopId={shopId} onAdded={() => qc.invalidateQueries({ queryKey: getListDebtsQueryKey() })} />
              </div>
            </div>

            {/* Interactive 4-Card KPI Strip */}
            <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {STAT_CARDS.map(({ label, tabKey, value, sub, Icon, iconBg, iconColor, valueCss, ringCss }) => {
                const isActive = tab === tabKey;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setTab(tabKey); setSelectedDebt(null); }}
                    className={cn(
                      "text-left rounded-2xl border p-3.5 transition-all hover:border-primary/40",
                      isActive ? ringCss : "border-border/80 bg-card/95"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
                        <p className={cn("font-display mt-1 text-lg sm:text-xl font-bold tabular-nums leading-tight truncate", valueCss)}>
                          {value}
                        </p>
                      </div>
                      <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center shrink-0", iconBg)}>
                        <Icon className={cn("h-4 w-4", iconColor)} />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5 truncate">{sub}</p>
                  </button>
                );
              })}
            </div>
          </header>

          {/* Main Workspace Container */}
          <div className="p-4 sm:p-6 space-y-4">
            {nurseryMetrics && nurseryProjection && (nurseryMetrics.grossTotal > 0 || nurseryMetrics.settledPayments.length > 0) && (
              <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3.5 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <Sprout className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-foreground truncate">
                        Nursery Plant Proceeds · {shopName}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        Collected Cash+M-Pesa vs amount already used to pay debts
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-xl text-xs gap-1.5 cursor-pointer"
                      onClick={() =>
                        setPlantSettleTarget({
                          customerName:
                            nurserySuppliers.find((s) => !!s.customerName)?.customerName ??
                            nurserySuppliers[0]?.name ??
                            "",
                          customerPhone:
                            nurserySuppliers.find((s) => !!s.customerPhone)?.customerPhone ??
                            nurserySuppliers[0]?.phone ??
                            "",
                          initialTab: "history",
                        })
                      }
                    >
                      <History className="h-3.5 w-3.5" />
                      Used Ledger ({nurseryMetrics.settledPayments.length + nurseryMetrics.payouts.length})
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                      onClick={() =>
                        setPlantSettleTarget({
                          customerName:
                            nurserySuppliers.find((s) => !!s.customerName)?.customerName ??
                            nurserySuppliers[0]?.name ??
                            "",
                          customerPhone:
                            nurserySuppliers.find((s) => !!s.customerPhone)?.customerPhone ??
                            nurserySuppliers[0]?.phone ??
                            "",
                          initialTab: "settle",
                        })
                      }
                    >
                      <Sprout className="h-3.5 w-3.5" />
                      Settle w/ Plants
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="rounded-xl border border-border/60 bg-background/75 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Collected Cash+M-Pesa</p>
                    <p className="mt-0.5 text-sm font-bold font-mono tabular-nums text-foreground">
                      {formatKES(nurseryMetrics.collectedCashMpesa)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">of {formatKES(nurseryMetrics.grossTotal)} total</p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/75 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Used to Pay Debts</p>
                    <p className="mt-0.5 text-sm font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {formatKES(nurseryMetrics.d1SettledNetTotal)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {nurseryMetrics.settledPayments.length} settlement{nurseryMetrics.settledPayments.length === 1 ? "" : "s"} in D1
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/60 bg-background/75 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Shop Profit Kept</p>
                    <p className="mt-0.5 text-sm font-bold font-mono tabular-nums text-foreground">
                      {formatKES(nurseryProjection.totalShopProfit)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{nurseryMetrics.shopConfig.commissionPct}% split</p>
                  </div>
                  <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Available Plant Balance</p>
                    <p className="mt-0.5 text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {formatKES(nurseryProjection.availableNetProceeds)}
                    </p>
                    <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80">
                      {nurseryMetrics.payoutNetTotal > 0 ? `After ${formatKES(nurseryMetrics.payoutNetTotal)} payouts` : "Ready to clear debts"}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* Search + Sort + Status Pills Card */}
            <div className="rounded-2xl border border-border/80 bg-card/95 p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    placeholder={`Search across ${stats.totalCount.toLocaleString()} debts by customer name or phone…`}
                    className="pl-10 pr-9 h-10 text-sm bg-background/70 border-border/80 rounded-xl focus-visible:border-primary"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      type="button"
                      aria-label="Clear customer search"
                      onClick={() => setSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="relative inline-flex items-center shrink-0">
                  <select
                    aria-label="Sort customer debts"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as typeof sortBy)}
                    style={{ WebkitAppearance: "none", MozAppearance: "none", appearance: "none" }}
                    className="h-10 appearance-none rounded-xl border border-border/80 bg-background/70 pl-3.5 pr-9 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer w-full sm:w-auto"
                  >
                    <option value="balance_desc">Highest balance first</option>
                    <option value="oldest">Oldest / most overdue</option>
                    <option value="newest">Most recent first</option>
                    <option value="name_asc">Name: A to Z</option>
                  </select>
                  <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                {TABS.map(t => (
                  <button
                    key={t.value}
                    onClick={() => { setTab(t.value); setSelectedDebt(null); }}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap",
                      tab === t.value
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-muted/40 border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <span>{t.label}</span>
                    {t.count > 0 && (
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums",
                        tab === t.value ? "bg-black/15 text-primary-foreground" : "bg-background/80 text-foreground"
                      )}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Accounts / Records Ledger Card */}
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card/95">
              {/* Header row */}
              {!isLoading && filtered.length > 0 && (
                viewMode === "customers" ? (
                  <div className="hidden sm:grid grid-cols-[minmax(190px,1.5fr)_minmax(110px,0.8fr)_minmax(115px,0.9fr)_92px_auto] items-center gap-3 px-4 py-2.5 border-b border-border/70 bg-muted/25 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <span>Customer Account</span>
                    <span className="text-right">Total Issued</span>
                    <span className="text-right">Balance Due</span>
                    <span className="text-center">Status</span>
                    <span className="text-right">Actions</span>
                  </div>
                ) : (
                  <div className="hidden sm:grid grid-cols-[auto_1fr_120px_115px_100px_32px] items-center gap-3 px-4 py-2.5 border-b border-border/70 bg-muted/25 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <div className="w-9" />
                    <span>Customer</span>
                    <span className="text-right">Total Issued</span>
                    <span className="text-right">Balance Due</span>
                    <span className="text-center">Status</span>
                    <div />
                  </div>
                )
              )}

              {/* Loading skeletons */}
              {isLoading ? (
                <div className="divide-y divide-border/50">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-4 animate-pulse">
                      <div className="w-10 h-10 rounded-xl bg-muted/60 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3.5 w-36 bg-muted/60 rounded-full" />
                        <div className="h-2.5 w-24 bg-muted/40 rounded-full" />
                      </div>
                      <div className="hidden sm:block h-3.5 w-20 bg-muted/40 rounded-full" />
                      <div className="h-4 w-20 bg-muted/50 rounded-full" />
                      <div className="hidden sm:block h-6 w-16 bg-muted/35 rounded-full" />
                    </div>
                  ))}
                </div>

              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2.5 text-muted-foreground">
                  <CheckCircle2 className="h-11 w-11 text-emerald-500/25" />
                  <p className="text-sm font-semibold text-foreground">
                    {tab === "paid" ? "No paid debts yet" : "All clear!"}
                  </p>
                  <p className="text-xs text-center px-8">
                    {search ? `No customer or phone matching "${search}"` : `No ${tab !== "all" ? tab + " " : ""}debt accounts found.`}
                  </p>
                </div>

              ) : (
                <div>
                  {viewMode === "customers" ? (
                    visibleGroups.map((group) => (
                      <CustomerGroupRow
                        key={group.key}
                        group={group}
                        onSelectDebt={setSelectedDebt}
                        matchedSupplier={findMatchingSupplier(nurserySuppliers, group.customerName, group.customerPhone)}
                        plantPaidAmount={nurseryMetrics?.settledByCustomerKey[group.key] ?? 0}
                        onOpenPlantSettle={(target) => setPlantSettleTarget(target)}
                      />
                    ))
                  ) : (
                    <div className="divide-y divide-border/50">
                      {visibleDebts.map((debt: any) => {
                        const isPaid    = debt.status === "paid";
                        const isPartial = debt.status === "partial";
                        const daysAgo   = differenceInDays(new Date(), new Date(debt.createdAt));
                        const isOverdue = !isPaid && daysAgo > 30;
                        const isSelected = selectedDebt?.id === debt.id;

                        const avatarBg =
                          isPaid    ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-600 dark:text-emerald-400" :
                          isOverdue ? "bg-rose-500/12 border-rose-500/25 text-rose-600 dark:text-rose-400" :
                          isPartial ? "bg-amber-500/12 border-amber-500/25 text-amber-600 dark:text-amber-400" :
                                      "bg-destructive/12 border-destructive/25 text-destructive";

                        const balanceCss =
                          isPaid    ? "text-emerald-600 dark:text-emerald-400" :
                          isOverdue ? "text-rose-600 dark:text-rose-400" :
                          isPartial ? "text-amber-600 dark:text-amber-400" :
                                      "text-destructive";

                        const statusBadge =
                          isPaid    ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" :
                          isOverdue ? "bg-rose-500/12 text-rose-600 dark:text-rose-400 border-rose-500/25" :
                          isPartial ? "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/25" :
                                      "bg-destructive/12 text-destructive border-destructive/25";

                        const balanceDue = debtBalanceDue(debt);
                        const customerCredit = debtCredit(debt);
                        const statusLabel =
                          isOverdue ? "Overdue" :
                          isPaid    ? (customerCredit > 0 ? "Paid + Credit" : "Paid") :
                          isPartial ? "Partial" :
                                      "Unpaid";

                        const initials = debt.customerName
                          .split(" ").map((w: string) => w[0] ?? "").slice(0, 2).join("").toUpperCase();

                        const totalPaid = debtAmountPaid(debt);

                        return (
                          <div
                            key={debt.id}
                            onClick={() => setSelectedDebt(isSelected ? null : debt)}
                            className={cn(
                              "group cursor-pointer transition-colors",
                              "flex sm:grid sm:grid-cols-[auto_1fr_120px_115px_100px_32px] items-center gap-3 px-4 py-3.5",
                              isSelected
                                ? "bg-primary/10 border-l-2 border-l-primary"
                                : "hover:bg-muted/25 border-l-2 border-l-transparent"
                            )}
                          >
                            <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center text-xs font-bold shrink-0", avatarBg)}>
                              {initials || "?"}
                            </div>

                            <div className="flex-1 sm:flex-none min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate leading-snug">{toTitleCase(debt.customerName)}</p>
                              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                                {debt.customerPhone ? (
                                  <span className="inline-flex items-center gap-1 font-mono">
                                    <Phone className="h-2.5 w-2.5 shrink-0" />{debt.customerPhone}
                                  </span>
                                ) : (
                                  <span className="italic">No phone</span>
                                )}
                                <span>·</span>
                                <span>{daysAgo === 0 ? "Today" : `${daysAgo}d ago`}</span>
                              </p>
                            </div>

                            <div className="hidden sm:block text-right">
                              <p className="text-sm font-semibold font-mono tabular-nums text-foreground">{formatKES(debt.totalAmount)}</p>
                              <p className="text-[10px] text-muted-foreground tabular-nums">Paid: {formatKES(totalPaid)}</p>
                            </div>

                            <div className="text-right shrink-0">
                              <p className={cn("text-sm font-bold font-mono tabular-nums", balanceCss)}>{formatKES(balanceDue)}</p>
                              {customerCredit > 0 && (
                                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                                  +{formatKES(customerCredit)} credit
                                </p>
                              )}
                            </div>

                            <div className="hidden sm:flex justify-center">
                              <span className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider", statusBadge)}>
                                {statusLabel}
                              </span>
                            </div>

                            <div className="hidden sm:flex items-center justify-center">
                              <ChevronRight className={cn("h-4 w-4 transition-colors", isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {!isLoading && filtered.length > 0 && (
                <div className="border-t border-border/70 bg-muted/20 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground tabular-nums">
                  <span>
                    Showing{" "}
                    <strong className="text-foreground">
                      {Math.min(visibleCount, activeListTotal).toLocaleString()}
                    </strong>{" "}
                    of{" "}
                    <strong className="text-foreground">{activeListTotal.toLocaleString()}</strong>{" "}
                    {viewMode === "customers" ? `customer${activeListTotal !== 1 ? "s" : ""}` : `record${activeListTotal !== 1 ? "s" : ""}`}
                    {activeListTotal > visibleCount && " — use Search above for instant lookup"}
                  </span>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedDebt && (
                      <span className="text-[11px] font-semibold text-primary hidden lg:inline mr-2">
                        Inspecting #{selectedDebt.id.slice(0, 8).toUpperCase()}
                      </span>
                    )}
                    {visibleCount > 10 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 rounded-lg px-2.5 text-xs"
                        onClick={() => setVisibleCount(10)}
                      >
                        Show 10
                      </Button>
                    )}
                    {activeListTotal > visibleCount && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-lg px-2.5 text-xs font-semibold"
                          onClick={() => setVisibleCount(n => Math.min(n + 10, activeListTotal))}
                        >
                          Load 10 more
                        </Button>
                        {activeListTotal - visibleCount > 10 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-lg px-2.5 text-xs"
                            onClick={() => setVisibleCount(n => Math.min(n + 25, activeListTotal))}
                          >
                            +25
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>{/* end left panel */}

      {/* ── Detail panel: docked on 2xl+, slide-over drawer on <= xl ───── */}
      {selectedDebt && (
        <div className="hidden 2xl:flex flex-col w-[460px] shrink-0 border-l border-border/80 bg-card/95">
          <DebtDetailPanel
            debt={selectedDebt}
            isOwner={isOwner}
            onClose={() => setSelectedDebt(null)}
            onOpenPlantSettle={(target) => setPlantSettleTarget(target)}
          />
        </div>
      )}

      {/* ── Slide-over drawer (mobile bottom sheet / tablet+desktop slide-over) ── */}
      {selectedDebt && (
        <div className="2xl:hidden fixed inset-0 z-50 flex flex-col justify-end sm:flex-row sm:justify-end">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-xs" onClick={() => setSelectedDebt(null)} />
          <div
            className="relative bg-card rounded-t-2xl sm:rounded-none sm:border-l sm:border-border/80 flex flex-col shadow-2xl w-full sm:w-[450px] sm:h-full max-h-[92dvh] sm:max-h-full overflow-hidden animate-in fade-in-0 duration-150"
          >
            <div className="sm:hidden w-10 h-1 bg-muted-foreground/25 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />
            <DebtDetailPanel
              debt={selectedDebt}
              isOwner={isOwner}
              onClose={() => setSelectedDebt(null)}
              onOpenPlantSettle={(target) => setPlantSettleTarget(target)}
            />
          </div>
        </div>
      )}

      {/* ── Bulk WhatsApp remind dialog ───────────────────────────────── */}
      {bulkRemindOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setBulkRemindOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-card border border-border rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="font-bold text-sm text-foreground flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-[#25D366]" />
                  WhatsApp Reminders
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {stats.overdueWithPhone.length} overdue customer{stats.overdueWithPhone.length !== 1 ? "s" : ""} with phone numbers
                </p>
              </div>
              <button onClick={() => setBulkRemindOpen(false)} className="text-muted-foreground/50 hover:text-foreground p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {stats.overdueWithPhone.map((debt: any) => {
                const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
                const msg = `Hi ${debt.customerName}, you have an outstanding balance of ${formatKES(debt.balance)} at our shop (${daysAgo} days overdue). Please settle at your earliest convenience. Thank you!`;
                const waUrl = `https://wa.me/${debt.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
                return (
                  <a key={debt.id} href={waUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-[#25D366]/10 border border-border/50 hover:border-[#25D366]/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-destructive/15 flex items-center justify-center shrink-0 text-sm font-bold text-destructive">
                      {debt.customerName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{debt.customerName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono font-bold text-destructive">{formatKES(debt.balance)}</span>
                        {" · "}{daysAgo}d overdue
                      </p>
                    </div>
                    <MessageCircle className="h-4 w-4 text-[#25D366] shrink-0" />
                  </a>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground/50 text-center">
                Tap a customer to open WhatsApp with a pre-filled message
              </p>
            </div>
          </div>
        </div>
      )}

      <NurseryDebtSettlementDialog
        open={!!plantSettleTarget}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPlantSettleTarget(null);
        }}
        shopId={shopId}
        shopName={shopName}
        customerName={plantSettleTarget?.customerName}
        customerPhone={plantSettleTarget?.customerPhone}
        initialTab={plantSettleTarget?.initialTab}
        externalDebts={allDebts || []}
        suppliers={nurserySuppliers}
      />

    </div>
  );
}
