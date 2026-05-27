/**
 * Structured inventory mutation logger.
 *
 * Every stage of an inventory mutation (optimistic apply, server start,
 * success, rollback, stale-response rejection, cache invalidation, and
 * pending-mutation bookkeeping) emits a consistent log line that makes
 * debugging stock inconsistencies straightforward.
 *
 * Logging is enabled in development by default and can be toggled at runtime.
 */

export type MutationStage =
  | "optimistic_applied"
  | "mutation_started"
  | "mutation_success"
  | "mutation_error"
  | "rollback_triggered"
  | "stale_rejected"
  | "invalidate_triggered"
  | "pending_added"
  | "pending_removed"
  | "version_compared"
  | "cache_seeded"
  | "cache_saved";

export interface InventoryLogEntry {
  stage: MutationStage;
  mutationId: string;
  source: string;
  timestamp: string;
  productId?: string;
  previousQty?: number;
  nextQty?: number;
  extra?: Record<string, unknown>;
}

let _enabled = import.meta.env.DEV;

export function setInventoryLogging(enabled: boolean): void {
  _enabled = enabled;
}

export function isInventoryLoggingEnabled(): boolean {
  return _enabled;
}

export function logInventory(entry: InventoryLogEntry): void {
  if (!_enabled) return;

  const { stage, mutationId, source, productId, previousQty, nextQty, extra } = entry;

  let line = `[InventoryMutation] ${stage}`;
  if (productId) line += ` product=${productId}`;
  if (previousQty !== undefined) line += ` prev=${previousQty}`;
  if (nextQty !== undefined) line += ` next=${nextQty}`;
  line += ` mutation=${mutationId} source=${source}`;

  if (extra && Object.keys(extra).length > 0) {
    console.log(line, extra);
  } else {
    console.log(line);
  }
}

/** Generate a short mutation ID (8 hex chars) for correlating log lines. */
export function newMutationId(): string {
  return Math.random().toString(16).slice(2, 10);
}
