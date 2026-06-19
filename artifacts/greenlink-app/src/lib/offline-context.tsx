/**
 * OfflineSyncContext — single shared instance of useOfflineSync for the whole app.
 *
 * Why: both OfflineBanner and the POS queue badge need pendingCount/isOnline/syncing.
 * Two separate useOfflineSync calls would create two competing sync loops that both
 * fire mount-sync and both listen for "online" — causing double-syncs and race
 * conditions when multiple devices reconnect at the same time.
 *
 * Usage:
 *   — Layout.tsx provides <OfflineSyncProvider shopId={shopId}>
 *   — OfflineBanner and POS consume useOfflineSyncCtx()
 */

import { createContext, useContext, type ReactNode } from "react";
import { useOfflineSync } from "@/lib/use-offline-sync";

interface OfflineSyncCtx {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  syncNow: () => Promise<void>;
  refreshCount: () => Promise<void>;
}

const Ctx = createContext<OfflineSyncCtx | null>(null);

export function OfflineSyncProvider({ shopId, children }: { shopId: string; children: ReactNode }) {
  const value = useOfflineSync(shopId);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOfflineSyncCtx(): OfflineSyncCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOfflineSyncCtx must be used inside OfflineSyncProvider");
  return ctx;
}
