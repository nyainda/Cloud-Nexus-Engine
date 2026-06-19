/**
 * OfflineBanner — sticky bar shown when the device is offline or when
 * there are queued mutations waiting to sync.
 *
 * Consumes OfflineSyncContext (provided by Layout) — no direct useOfflineSync
 * call here so the sync loop runs exactly once across the whole app.
 *
 * States:
 *  • Offline + pending  → red bar with count
 *  • Offline, no pending → amber bar "read-only mode"
 *  • Online + syncing   → blue pulsing bar
 *  • Online + failed    → orange bar with Retry button
 *  • Online, no pending → nothing rendered
 */

import { WifiOff, RefreshCw, CloudUpload } from "lucide-react";
import { cn } from "@/lib/utils";
import { retryFailedMutations } from "@/lib/offline-queue";
import { useOfflineSyncCtx } from "@/lib/offline-context";

export function OfflineBanner() {
  const { isOnline, pendingCount, syncing, syncNow, refreshCount } = useOfflineSyncCtx();

  const handleRetry = async () => {
    const shopId = localStorage.getItem("greenlink_shopId") || "";
    if (!shopId) return;
    await retryFailedMutations(shopId);
    await refreshCount();
    syncNow();
  };

  if (isOnline && pendingCount === 0 && !syncing) return null;

  if (syncing) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 text-blue-400">
        <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
        <p className="text-xs font-semibold">
          Syncing {pendingCount} offline {pendingCount === 1 ? "transaction" : "transactions"}…
        </p>
      </div>
    );
  }

  if (!isOnline && pendingCount > 0) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-destructive">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <p className="text-xs font-semibold flex-1">
          Offline · {pendingCount} {pendingCount === 1 ? "transaction" : "transactions"} queued — will sync on reconnect
        </p>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-400">
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
        <p className="text-xs font-semibold">Offline — read-only mode · Products available from cache</p>
      </div>
    );
  }

  if (isOnline && pendingCount > 0) {
    return (
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-orange-500/10 border-b border-orange-500/20 text-orange-400">
        <CloudUpload className="h-3.5 w-3.5 shrink-0" />
        <p className="text-xs font-semibold flex-1">
          {pendingCount} {pendingCount === 1 ? "transaction" : "transactions"} failed to sync
        </p>
        <button
          onClick={handleRetry}
          className={cn(
            "text-[11px] font-bold px-2.5 py-1 rounded-full",
            "bg-orange-500/20 border border-orange-500/30 text-orange-300 hover:bg-orange-500/30 transition-colors",
          )}
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}
