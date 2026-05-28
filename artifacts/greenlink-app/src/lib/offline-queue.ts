/**
 * offline-queue — IndexedDB-backed queue for mutations that fail while offline.
 *
 * When the device has no network, sales / restocks / debt payments are saved
 * here instead of being dropped. On reconnect, useOfflineSync processes the
 * queue in chronological order and replays them against the server.
 *
 * Queue entries are simple JSON blobs so the payload schema matches the
 * server's existing POST body — no special server support needed.
 */

import Dexie, { type Table } from "dexie";

export type QueuedMutationType = "sale" | "restock" | "debt_payment";

export interface QueuedMutation {
  id: string;
  type: QueuedMutationType;
  shopId: string;
  payload: string;
  createdAt: string;
  attempts: number;
  status: "pending" | "failed";
  errorMsg?: string;
}

class OfflineQueueDb extends Dexie {
  mutations!: Table<QueuedMutation>;
  constructor() {
    super("greenlink_offline_queue_v1");
    this.version(1).stores({
      mutations: "id, type, shopId, status, createdAt",
    });
  }
}

let _db: OfflineQueueDb | null = null;
function getDb(): OfflineQueueDb {
  if (!_db) _db = new OfflineQueueDb();
  return _db;
}

export async function enqueueMutation(
  type: QueuedMutationType,
  shopId: string,
  payload: object,
): Promise<string> {
  const id = crypto.randomUUID();
  await getDb().mutations.add({
    id,
    type,
    shopId,
    payload: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: "pending",
  });
  return id;
}

export async function getPendingMutations(shopId: string): Promise<QueuedMutation[]> {
  return getDb()
    .mutations.where("shopId")
    .equals(shopId)
    .and((m) => m.status === "pending")
    .sortBy("createdAt");
}

export async function getPendingCount(shopId: string): Promise<number> {
  return getDb()
    .mutations.where("shopId")
    .equals(shopId)
    .and((m) => m.status === "pending")
    .count();
}

export async function deleteMutation(id: string): Promise<void> {
  await getDb().mutations.delete(id);
}

export async function markMutationFailed(id: string, errorMsg: string): Promise<void> {
  await getDb().mutations.update(id, { status: "failed" as const, errorMsg });
}

export async function incrementAttempts(id: string): Promise<void> {
  const db = getDb();
  const m = await db.mutations.get(id);
  if (m) await db.mutations.update(id, { attempts: m.attempts + 1 });
}

export async function retryFailedMutations(shopId: string): Promise<void> {
  await getDb()
    .mutations.where("shopId")
    .equals(shopId)
    .and((m) => m.status === "failed")
    .modify({ status: "pending" as const, attempts: 0, errorMsg: undefined });
}

export async function getFailedMutations(shopId: string): Promise<QueuedMutation[]> {
  return getDb()
    .mutations.where("shopId")
    .equals(shopId)
    .and((m) => m.status === "failed")
    .toArray();
}

export async function clearAllMutations(shopId: string): Promise<void> {
  await getDb().mutations.where("shopId").equals(shopId).delete();
}
