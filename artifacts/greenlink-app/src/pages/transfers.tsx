import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch, getListProductsQueryKey, getListInventoryMovementsQueryKey } from "@workspace/api-client-react";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight, X, Package, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
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

function TransferSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
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
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!transfers) return [];
    if (filter === "sent") return transfers.filter(t => t.fromShopId === shopId);
    if (filter === "received") return transfers.filter(t => t.toShopId === shopId);
    return transfers;
  }, [transfers, filter, shopId]);

  const sentCount = useMemo(() => (transfers ?? []).filter(t => t.fromShopId === shopId).length, [transfers, shopId]);
  const receivedCount = useMemo(() => (transfers ?? []).filter(t => t.toShopId === shopId).length, [transfers, shopId]);

  const handleCancel = async (transfer: any) => {
    if (!confirm(`Cancel transfer of ${transfer.qty} ${transfer.unit || "units"} ${transfer.productName}?\n\nStock will be restored to ${shopLabel(transfer.fromShopId)} and deducted from ${shopLabel(transfer.toShopId)}.`)) return;

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
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border px-4 py-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-primary" />
              Stock Transfers
            </h1>
            <p className="text-xs text-muted-foreground">
              {shopLabel(shopId)} · {transfers ? `${transfers.length} transfer${transfers.length !== 1 ? "s" : ""}` : "Loading…"}
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
                <span className={cn("text-[10px] font-bold tabular-nums", filter === f.value ? "text-primary-foreground/70" : "text-muted-foreground/50")}>
                  {f.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 pb-8 space-y-3">
        {isLoading ? (
          <>{[1,2,3,4,5].map(i => <TransferSkeleton key={i} />)}</>
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
          filtered.map(transfer => {
            const isSent = transfer.fromShopId === shopId;
            const other = isSent ? transfer.toShopId : transfer.fromShopId;
            const canCancel = isOwner && isSent;
            const isCancelling = cancelling === transfer.id;

            return (
              <div key={transfer.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {/* Direction icon */}
                  <div className={cn(
                    "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0",
                    isSent
                      ? "bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400"
                      : "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400"
                  )}>
                    {isSent
                      ? <ArrowUpRight className="h-4 w-4" />
                      : <ArrowDownLeft className="h-4 w-4" />}
                  </div>

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                        isSent
                          ? "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300"
                          : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                      )}>
                        {isSent ? "Sent" : "Received"}
                      </span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
                      <span className="text-xs text-muted-foreground font-medium">{shopLabel(other)}</span>
                    </div>

                    <p className="text-sm font-semibold text-foreground mt-1 truncate">
                      {transfer.productName}
                    </p>

                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="font-mono font-bold text-foreground">
                        {transfer.qty} {transfer.unit || "units"}
                      </span>
                      <span>·</span>
                      <span title={format(new Date(transfer.createdAt), "PPpp")}>
                        {formatDistanceToNow(new Date(transfer.createdAt), { addSuffix: true })}
                      </span>
                    </div>

                    {transfer.notes && (
                      <p className="text-xs text-muted-foreground/70 mt-1 italic">"{transfer.notes}"</p>
                    )}
                  </div>

                  {/* Cancel button */}
                  {canCancel && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => handleCancel(transfer)}
                      disabled={isCancelling}
                      title="Cancel transfer"
                    >
                      {isCancelling ? (
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>

                {/* Footer row */}
                <div className="flex items-center justify-between pt-2 border-t border-border/60">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Package className="h-3 w-3" />
                    <span>{shopLabel(transfer.fromShopId)}</span>
                    <ArrowUpRight className="h-2.5 w-2.5" />
                    <span>{shopLabel(transfer.toShopId)}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {format(new Date(transfer.createdAt), "d MMM, h:mm a")}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
