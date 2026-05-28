/**
 * useOfflineSync — detects connectivity, processes the offline mutation queue
 * when the device reconnects, and exposes status for UI feedback.
 *
 * Usage: mounted once in Layout.tsx (via OfflineBanner). The hook auto-fires
 * syncNow() on the "online" window event — no polling needed.
 *
 * Conflict detection: after a successful sync, re-fetches the product list and
 * warns the owner if any product stock went negative (e.g. two devices sold the
 * same units while one was offline).
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getListProductsQueryKey,
  getListDebtsQueryKey,
  getListInventoryMovementsQueryKey,
  getListProductsQueryOptions,
} from "@workspace/api-client-react";
import {
  getPendingMutations,
  getPendingCount,
  deleteMutation,
  markMutationFailed,
  incrementAttempts,
  type QueuedMutation,
} from "@/lib/offline-queue";
import { toast } from "sonner";

/** Returns a human-readable error string from any thrown value. */
function extractErrorMsg(err: unknown): string {
  if (err && typeof err === "object") {
    // ApiError from customFetch — has .message from the server response body
    if ("message" in err && typeof (err as any).message === "string") {
      const msg = (err as any).message as string;
      if (msg && msg !== "[object Object]") return msg;
    }
    // Network-level failure (no response at all)
    if ("name" in err && (err as any).name === "TypeError") {
      return "No connection — will retry on reconnect";
    }
  }
  return "Sync failed — will retry";
}

async function processMutation(m: QueuedMutation): Promise<{ ok: boolean; errorMsg?: string }> {
  await incrementAttempts(m.id);
  const payload = JSON.parse(m.payload);
  try {
    if (m.type === "sale") {
      await customFetch("/api/sales", { method: "POST", body: JSON.stringify(payload) });
    } else if (m.type === "restock") {
      const { productId, ...data } = payload as { productId: string; [k: string]: unknown };
      await customFetch(`/api/products/${productId}/restock`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    } else if (m.type === "debt_payment") {
      const { debtId, ...data } = payload as { debtId: string; [k: string]: unknown };
      await customFetch(`/api/debts/${debtId}/payments`, {
        method: "POST",
        body: JSON.stringify(data),
      });
    }
    await deleteMutation(m.id);
    return { ok: true };
  } catch (err) {
    const errorMsg = extractErrorMsg(err);
    await markMutationFailed(m.id, errorMsg);
    return { ok: false, errorMsg };
  }
}

export function useOfflineSync(shopId: string) {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const qc = useQueryClient();

  const refreshCount = useCallback(async () => {
    if (!shopId) return;
    try {
      const count = await getPendingCount(shopId);
      setPendingCount(count);
    } catch {}
  }, [shopId]);

  const syncNow = useCallback(async () => {
    if (!shopId || syncingRef.current || !navigator.onLine) return;
    const pending = await getPendingMutations(shopId);
    if (pending.length === 0) return;

    syncingRef.current = true;
    setSyncing(true);

    let ok = 0;
    let fail = 0;
    const failReasons: string[] = [];

    for (const m of pending) {
      const result = await processMutation(m);
      if (result.ok) {
        ok++;
      } else {
        fail++;
        if (result.errorMsg && !failReasons.includes(result.errorMsg)) {
          failReasons.push(result.errorMsg);
        }
      }
    }

    syncingRef.current = false;
    setSyncing(false);

    if (ok > 0) {
      toast.success(
        `Synced ${ok} offline ${ok === 1 ? "transaction" : "transactions"} ✓`,
        { duration: 4000 },
      );

      // Invalidate all affected query caches
      qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
      qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });

      // ── Conflict detection ──────────────────────────────────────────────────
      // Re-fetch the product list from the server (not just invalidate) so we
      // can inspect the authoritative stock levels immediately after sync.
      // If any product has negative stock, two devices sold the same units
      // while one was offline — warn the owner to reconcile manually.
      try {
        const opts = getListProductsQueryOptions({ shopId, limit: 3000 });
        const freshData = await qc.fetchQuery(opts) as { products?: any[] } | undefined;
        const negativeStock = (freshData?.products ?? []).filter(
          (p: any) => typeof p.stockQty === "number" && p.stockQty < 0
        );
        if (negativeStock.length > 0) {
          const names = negativeStock
            .slice(0, 3)
            .map((p: any) => p.canonicalName ?? p.name ?? "Unknown")
            .join(", ");
          const extra = negativeStock.length > 3 ? ` and ${negativeStock.length - 3} more` : "";
          toast.warning(
            `Stock conflict: ${names}${extra} went below zero — check inventory and restock`,
            { duration: 10_000 },
          );
        }
      } catch {
        // Non-fatal — just invalidate if the fetch fails
        qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      }
    }

    if (fail > 0) {
      const reason = failReasons.length > 0 ? ` (${failReasons[0]})` : "";
      toast.error(
        `${fail} ${fail === 1 ? "transaction" : "transactions"} failed to sync${reason} — check Settings › Offline Sync`,
        { duration: 8000 },
      );
    }

    await refreshCount();
  }, [shopId, qc, refreshCount]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      syncNow();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncNow]);

  useEffect(() => {
    refreshCount();
  }, [refreshCount]);

  return { isOnline, pendingCount, syncing, syncNow, refreshCount };
}
