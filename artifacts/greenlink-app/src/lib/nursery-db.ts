import Dexie, { type Table } from "dexie";

export type CachedNurseryVariety = {
  id: string;
  shopId: string;
  name: string;
  defaultPrice: number;
  isActive: number | boolean;
  createdAt?: string;
};

class NurseryDatabase extends Dexie {
  varieties!: Table<CachedNurseryVariety>;

  constructor() {
    super("greenlink_nursery_cache_v1");
    this.version(1).stores({
      varieties: "[shopId+id], shopId, name, isActive",
    });
  }
}

let dbInstance: NurseryDatabase | undefined;
function db() {
  if (!dbInstance) dbInstance = new NurseryDatabase();
  return dbInstance;
}

export async function loadCachedNurseryVarieties(shopId: string) {
  try {
    const rows = await db().varieties.where("shopId").equals(shopId).toArray();
    return rows.map(({ shopId: _shopId, ...variety }) => variety);
  } catch {
    return [];
  }
}

export async function saveNurseryVarietiesToCache(shopId: string, varieties: Array<Omit<CachedNurseryVariety, "shopId">>) {
  if (!shopId) return;
  try {
    await db().transaction("rw", db().varieties, async () => {
      await db().varieties.where("shopId").equals(shopId).delete();
      if (varieties.length) {
        await db().varieties.bulkPut(varieties.map((variety) => ({ ...variety, shopId })));
      }
    });
  } catch {
    // IndexedDB is an acceleration layer; the server remains authoritative.
  }
}
