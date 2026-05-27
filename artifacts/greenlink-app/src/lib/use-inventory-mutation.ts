/**
 * useInventoryMutation — centralized inventory mutation engine.
 *
 * Encapsulates every shared concern for stock-altering operations:
 *   • Snapshot + cancel in-flight queries before an optimistic update
 *   • Apply optimistic cache patches with a typed updater
 *   • Record confirmed results in the product version guard
 *   • Roll back on error (restores snapshot to all matching query entries)
 *   • Invalidate relevant query keys after commit
 *   • Emit structured log lines at every stage
 *
 * Usage:
 *   const inv = useInventoryMutation("pos");
 *   const { mutationId, snapshot } = await inv.prepare();
 *   inv.applyOptimistic(updater, mutationId, diffList);
 *   // ... fire mutation ...
 *   // on success:
 *   inv.commit(product, mutationId);
 *   inv.invalidate([productsKey, movementsKey], mutationId);
 *   // on error:
 *   inv.rollback(snapshot, mutationId);
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListProductsQueryKey,
  getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { logInventory, newMutationId, type InventoryLogEntry } from "@/lib/inventory-logger";

export interface OptimisticDiff {
  productId: string;
  previousQty: number;
  nextQty: number;
}

export interface MutationContext {
  mutationId: string;
  snapshot: [unknown, unknown][];
  productsKey: readonly unknown[];
}

export function useInventoryMutation(source: string) {
  const qc = useQueryClient();

  /**
   * Step 1 — prepare:
   *   Cancel in-flight product fetches so they cannot race with the
   *   optimistic patch, then snapshot the current cache for rollback.
   */
  const prepare = useCallback(
    async (queryKey?: readonly unknown[]): Promise<MutationContext> => {
      const productsKey = queryKey ?? getListProductsQueryKey();
      const mutationId = newMutationId();

      logInventory({
        stage: "pending_added",
        mutationId,
        source,
        timestamp: new Date().toISOString(),
      });

      await qc.cancelQueries({ queryKey: productsKey });
      const snapshot = qc.getQueriesData({ queryKey: productsKey }) as [unknown, unknown][];

      return { mutationId, snapshot, productsKey };
    },
    [qc, source],
  );

  /**
   * Step 2 — applyOptimistic:
   *   Patch the React Query cache immediately so the UI reflects the
   *   expected outcome before the network request returns.
   *   Pass an optional diff list for per-product log lines.
   */
  const applyOptimistic = useCallback(
    (
      ctx: MutationContext,
      updater: (old: any) => any,
      diffs?: OptimisticDiff[],
    ): void => {
      qc.setQueriesData({ queryKey: ctx.productsKey }, updater);

      if (diffs && diffs.length > 0) {
        for (const { productId, previousQty, nextQty } of diffs) {
          logInventory({
            stage: "optimistic_applied",
            mutationId: ctx.mutationId,
            source,
            timestamp: new Date().toISOString(),
            productId,
            previousQty,
            nextQty,
          });
        }
      } else {
        logInventory({
          stage: "optimistic_applied",
          mutationId: ctx.mutationId,
          source,
          timestamp: new Date().toISOString(),
        });
      }
    },
    [qc, source],
  );

  /**
   * Step 3a — commit:
   *   Record the server-confirmed product in the version guard so any
   *   subsequent stale KV refetch is rejected.
   */
  const commit = useCallback(
    (product: any, mutationId: string): void => {
      recordMutationResult(product);
      logInventory({
        stage: "mutation_success",
        mutationId,
        source,
        timestamp: new Date().toISOString(),
        productId: product?.id,
        nextQty: product?.stockQty,
      });
    },
    [source],
  );

  /**
   * Step 3b — rollback:
   *   Restore every matching query cache entry to the pre-optimistic
   *   snapshot. Call this inside the mutation's onError handler.
   */
  const rollback = useCallback(
    (ctx: MutationContext): void => {
      ctx.snapshot.forEach(([key, data]) => qc.setQueryData(key as readonly unknown[], data));
      logInventory({
        stage: "rollback_triggered",
        mutationId: ctx.mutationId,
        source,
        timestamp: new Date().toISOString(),
      });
    },
    [qc, source],
  );

  /**
   * Step 4 — invalidate:
   *   Trigger background refetches after the mutation is fully committed.
   *   Accepts an array of query key arrays to invalidate.
   *   Defaults to products + inventory movements if no keys are provided.
   */
  const invalidate = useCallback(
    (
      ctx: Pick<MutationContext, "mutationId">,
      keys?: (readonly unknown[])[],
    ): void => {
      const targets = keys ?? [
        getListProductsQueryKey(),
        getListInventoryMovementsQueryKey(),
      ];
      for (const key of targets) {
        qc.invalidateQueries({ queryKey: key });
      }
      logInventory({
        stage: "invalidate_triggered",
        mutationId: ctx.mutationId,
        source,
        timestamp: new Date().toISOString(),
        extra: { count: targets.length },
      });
    },
    [qc, source],
  );

  /**
   * Convenience: log a bare mutation event without needing a full entry object.
   */
  const log = useCallback(
    (entry: Omit<InventoryLogEntry, "source">): void => {
      logInventory({ ...entry, source });
    },
    [source],
  );

  return { prepare, applyOptimistic, commit, rollback, invalidate, log };
}
