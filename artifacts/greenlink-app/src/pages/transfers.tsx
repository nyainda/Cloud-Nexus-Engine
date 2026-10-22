import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListProductsQueryKey, getListInventoryMovementsQueryKey } from "@workspace/api-client-react";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, X, ChevronDown, Search, RefreshCw, Clock3, ArrowRight } from "lucide-react";
import { format, isToday, isYesterday, isThisWeek } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const SHOP_LABELS: Record<string, string> = {
  "shop-greenlink": "GreenLink",
  "shop-sunrise": "Sunrise Agrovet",
};
function shopLabel(id: string) {
  return SHOP_LABELS[id] ?? id;
}

type TFilter = "all" | "sent" | "received";

function getDateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  if (isThisWeek(d)) return format(d, "EEEE");
  return format(d, "d MMM yyyy");
}

function TransferRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0">
      <Skeleton className="w-7 h-7 rounded-md shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-3 w-14" />
    </div>
  );
}

export default function Transfers() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";

  const qc = useQueryClient();
  const [filter, setFilter] = useState<TFilter>("all");
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (label: string) =>
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });

  // Transfers can be created by the *other* shop, so this device has no local
  // mutation to invalidate off of — some polling is genuinely needed here.
  // But transfers happen a handful of times a day, not every few seconds, and
  // nobody needs to see them the moment the tab is minimized — so we poll
  // slower and only in the foreground, and catch up instantly on focus.
  const { data: transfers, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["transfers", shopId],
    queryFn: () => customFetch<any[]>(`/api/transfers?shopId=${encodeURIComponent(shopId)}&limit=200`),
    enabled: !!shopId,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const filtered = useMemo(() => {
    if (!transfers) return [];
    const query = search.trim().toLowerCase();
    return transfers.filter(t => {
      const matchesDirection = filter === "all" || (filter === "sent" ? t.fromShopId === shopId : t.toShopId === shopId);
      const matchesSearch = !query || [t.productName, t.notes, shopLabel(t.fromShopId), shopLabel(t.toShopId), t.unit]
        .some(value => String(value ?? "").toLowerCase().includes(query));
      return matchesDirection && matchesSearch;
    });
  }, [transfers, filter, shopId, search]);

  const grouped = useMemo(() => {
    const groups: { label: string; items: any[] }[] = [];
    const seen: Record<string, number> = {};
    for (const t of filtered) {
      const label = getDateGroup(t.createdAt);
      if (seen[label] === undefined) {
        seen[label] = groups.length;
        groups.push({ label, items: [] });
      }
      groups[seen[label]].items.push(t);
    }
    return groups;
  }, [filtered]);

  const sentCount = useMemo(() => (transfers ?? []).filter(t => t.fromShopId === shopId).length, [transfers, shopId]);
  const receivedCount = useMemo(() => (transfers ?? []).filter(t => t.toShopId === shopId).length, [transfers, shopId]);

  const handleCancel = async (transfer: any) => {
    if (!confirm(`Cancel transfer of ${transfer.qty} ${transfer.unit || "units"} ${transfer.productName}?\n\nStock will be restored to ${shopLabel(transfer.fromShopId)}.`)) return;

    const mutationId = newMutationId();
    setCancelling(transfer.id);
    logInventory({ stage: "mutation_started", mutationId, source: "transfers/cancel", timestamp: new Date().toISOString(), extra: { transferId: transfer.id, qty: transfer.qty } });

    try {
      await customFetch<any>(`/api/transfers/${transfer.id}`, { method: "DELETE" });
      logInventory({ stage: "mutation_success", mutationId, source: "transfers/cancel", timestamp: new Date().toISOString(), extra: { restored: transfer.qty } });
      toast.success(`Transfer cancelled — ${transfer.qty} ${transfer.unit || "units"} restored to ${shopLabel(transfer.fromShopId)}`);
      refetch();
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
    } catch (e: any) {
      logInventory({ stage: "mutation_error", mutationId, source: "transfers/cancel", timestamp: new Date().toISOString(), extra: { error: e?.message } });
      toast.error(e?.message || "Failed to cancel transfer");
    } finally {
      setCancelling(null);
    }
  };

  const FILTERS: { value: TFilter; label: string; count?: number }[] = [
    { value: "all", label: "All", count: transfers?.length },
    { value: "sent", label: "Sent", count: sentCount },
    { value: "received", label: "Received", count: receivedCount },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Page header and controls */}
      <div className="border-b border-border bg-background px-4 py-5 sm:px-6">
        <div className="mx-auto w-full max-w-6xl space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Stock transfers</h1>
                  <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">Multi-shop</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Track stock moving in and out of <span className="font-medium text-foreground">{shopLabel(shopId)}</span>.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex">
                <Clock3 className="h-4 w-4" />
                Auto-refreshes every minute
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="h-9 gap-2">
                <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">All transfers</p>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10"><ArrowLeftRight className="h-4 w-4" /></div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">{transfers?.length ?? "—"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Recorded for this shop</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">Sent out</p>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400"><ArrowUpRight className="h-4 w-4" /></div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">{sentCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Transfers sent to other shops</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-muted-foreground">Received</p>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><ArrowDownLeft className="h-4 w-4" /></div>
              </div>
              <p className="mt-3 text-2xl font-bold tracking-tight text-foreground tabular-nums">{receivedCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Transfers received from other shops</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, shop or note…" aria-label="Search transfers" className="h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <div className="flex gap-1.5 rounded-xl border border-border bg-muted/40 p-1">
              {FILTERS.map(f => (
                <button key={f.value} onClick={() => setFilter(f.value)} className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:flex-none",
                  filter === f.value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-background hover:text-foreground"
                )}>
                  {f.label}
                  {f.count !== undefined && <span className={cn("tabular-nums", filter === f.value ? "text-primary-foreground/75" : "text-muted-foreground/70")}>{f.count}</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transfer activity */}
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-5 p-4 pb-8 sm:px-6">
        {isLoading ? (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map(i => <TransferRowSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
            <div className="w-14 h-14 rounded-2xl bg-muted/40 border border-border flex items-center justify-center">
              <ArrowLeftRight className="h-7 w-7 opacity-30" />
            </div>
            <p className="text-sm font-semibold">No transfers found</p>
            <p className="text-xs text-center max-w-[220px] opacity-60">
              {filter === "sent"
                ? "You haven't sent any stock to the other shop yet"
                : filter === "received"
                ? "No stock has been received from the other shop yet"
                : "Transfer stock between shops from the Inventory page"}
            </p>
          </div>
        ) : (
          grouped.map(group => {
            const isCollapsed = collapsed.has(group.label);
            return (
              <div key={group.label}>
                {/* Clickable date group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 mb-2 px-1 py-0.5 rounded-lg hover:bg-muted/30 transition-colors"
                >
                  <ChevronDown className={cn(
                    "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                    isCollapsed && "-rotate-90"
                  )} />
                  <span className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                    {group.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40 font-semibold tabular-nums">
                    {group.items.length}
                  </span>
                  <div className="flex-1 h-px bg-border/40" />
                  {isCollapsed && (
                    <span className="text-[10px] text-muted-foreground/40 shrink-0">tap to expand</span>
                  )}
                </button>

                {/* Compact rows — hidden when collapsed */}
                {!isCollapsed && (
                  <div className="space-y-2">
                    {group.items.map((transfer) => {
                      const isSent = transfer.fromShopId === shopId;
                      const canCancel = isOwner && isSent;
                      const isCancelling = cancelling === transfer.id;
                      const d = new Date(transfer.createdAt);

                      return (
                        <div
                          key={transfer.id}
                          className={cn(
                            "flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm transition-colors hover:border-primary/30"
                          )}
                        >
                          {/* Direction icon */}
                          <div className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                            isSent
                              ? "bg-orange-500/10 text-orange-500"
                              : "bg-emerald-500/10 text-emerald-500"
                          )}>
                            {isSent
                              ? <ArrowUpRight className="h-5 w-5" />
                              : <ArrowDownLeft className="h-5 w-5" />}
                          </div>

                          {/* Product + route */}
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-semibold leading-tight text-foreground sm:text-base">
                              {transfer.productName}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              <span className="rounded-lg bg-muted px-2.5 py-1 font-mono font-bold text-foreground">{transfer.qty} {transfer.unit || "units"}</span>
                              <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium", isSent ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}>
                                {shopLabel(transfer.fromShopId)} <ArrowRight className="h-3 w-3 opacity-70" /> {shopLabel(transfer.toShopId)}
                              </span>
                            </div>
                            {transfer.notes && (
                              <p className="mt-2 truncate text-xs italic text-muted-foreground">
                                {transfer.notes}
                              </p>
                            )}
                          </div>

                          {/* Time + cancel */}
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                              {format(d, "h:mm a")}
                            </span>
                            {canCancel && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleCancel(transfer)}
                                disabled={isCancelling}
                                title="Cancel transfer"
                              >
                                {isCancelling ? (
                                  <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <X className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
