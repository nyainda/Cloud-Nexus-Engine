/**
 * useOfflineSync — detects connectivity, processes the offline mutation queue
 * when the device reconnects, and exposes status for UI feedback.
 *
 * Usage: mount once in Layout.tsx. The hook auto-fires syncNow() on the
 * "online" window event, so no polling needed.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  customFetch,
  getListProductsQueryKey,
  getListDebtsQueryKey,
  getListInventoryMovementsQueryKey,
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

async function processMutation(m: QueuedMutation): Promise<boolean> {
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
    return true;
  } catch {
    await markMutationFailed(m.id, "Network error");
    return false;
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
    for (const m of pending) {
      const success = await processMutation(m);
      if (success) ok++;
      else fail++;
    }

    syncingRef.current = false;
    setSyncing(false);

    if (ok > 0) {
      toast.success(
        `Synced ${ok} offline ${ok === 1 ? "transaction" : "transactions"} ✓`,
        { duration: 4000 },
      );
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
      qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
    }
    if (fail > 0) {
      toast.error(
        `${fail} ${fail === 1 ? "transaction" : "transactions"} failed to sync — tap Retry in the banner`,
        { duration: 6000 },
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
