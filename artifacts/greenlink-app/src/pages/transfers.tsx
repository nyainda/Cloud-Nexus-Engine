import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListProductsQueryKey, getListInventoryMovementsQueryKey } from "@workspace/api-client-react";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, X, Package } from "lucide-react";
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
  if (isThisWeek(d)) return format(d, "EEEE"); // "Monday", "Tuesday", etc.
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
  const [cancelling, setCancelling] = useState<string | null>(null);

  const { data: transfers, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["transfers", shopId],
    queryFn: () => customFetch<any[]>(`/api/transfers?shopId=${encodeURIComponent(shopId)}&limit=200`),
    enabled: !!shopId,
    staleTime: 20_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });

  const filtered = useMemo(() => {
    if (!transfers) return [];
    if (filter === "sent") return transfers.filter(t => t.fromShopId === shopId);
    if (filter === "received") return transfers.filter(t => t.toShopId === shopId);
    return transfers;
  }, [transfers, filter, shopId]);

  // Group by date label
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
      {/* Sticky header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
              Stock Transfers
            </h1>
            <p className="text-xs text-muted-foreground">
              {shopLabel(shopId)}
              {transfers !== undefined && (
                <> · <span className="font-semibold">{transfers.length}</span> transfer{transfers.length !== 1 ? "s" : ""}</>
              )}
            </p>
          </div>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {format(new Date(), "d MMM yyyy")}
          </Badge>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border",
                filter === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {f.label}
              {f.count !== undefined && (
                <span className={cn(
                  "text-[10px] font-bold tabular-nums",
                  filter === f.value ? "text-primary-foreground/70" : "text-muted-foreground/50"
                )}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pb-8 space-y-4">
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
          grouped.map(group => (
            <div key={group.label}>
              {/* Date group label */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[11px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                  {group.label}
                </span>
                <span className="text-[10px] text-muted-foreground/40 font-semibold tabular-nums">
                  {group.items.length}
                </span>
                <div className="flex-1 h-px bg-border/40" />
              </div>

              {/* Compact rows */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {group.items.map((transfer, idx) => {
                  const isSent = transfer.fromShopId === shopId;
                  const other = isSent ? transfer.toShopId : transfer.fromShopId;
                  const canCancel = isOwner && isSent;
                  const isCancelling = cancelling === transfer.id;
                  const d = new Date(transfer.createdAt);

                  return (
                    <div
                      key={transfer.id}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3",
                        idx < group.items.length - 1 && "border-b border-border/40"
                      )}
                    >
                      {/* Direction icon */}
                      <div className={cn(
                        "w-7 h-7 rounded-md flex items-center justify-center shrink-0",
                        isSent
                          ? "bg-orange-500/10 text-orange-500"
                          : "bg-emerald-500/10 text-emerald-500"
                      )}>
                        {isSent
                          ? <ArrowUpRight className="h-3.5 w-3.5" />
                          : <ArrowDownLeft className="h-3.5 w-3.5" />}
                      </div>

                      {/* Product + route */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate leading-tight">
                          {transfer.productName}
                        </p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[11px] font-mono font-bold text-foreground/70">
                            {transfer.qty} {transfer.unit || "units"}
                          </span>
                          <span className="text-[10px] text-muted-foreground/40">·</span>
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wide",
                            isSent ? "text-orange-500/80" : "text-emerald-500/80"
                          )}>
                            {isSent ? "→" : "←"}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {shopLabel(other)}
                          </span>
                        </div>
                        {transfer.notes && (
                          <p className="text-[10px] text-muted-foreground/50 italic truncate mt-0.5">
                            {transfer.notes}
                          </p>
                        )}
                      </div>

                      {/* Time + cancel */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-muted-foreground/60 font-mono tabular-nums">
                          {format(d, "h:mm a")}
                        </span>
                        {canCancel && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
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
            </div>
          ))
        )}
      </div>
    </div>
  );
}
