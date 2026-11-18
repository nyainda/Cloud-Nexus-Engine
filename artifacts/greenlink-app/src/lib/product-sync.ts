import type { QueryClient } from "@tanstack/react-query";
import { customFetch, getListProductsQueryKey } from "@workspace/api-client-react";
import { mergeWithMutationResults } from "@/lib/product-version-guard";
import { saveProductsToCache } from "@/lib/product-db";

const CATALOG_VERSION_KEY = "greenlink_product_catalog_ver_v1";
const inFlightByShop = new Map<string, Promise<void>>();

function readCatalogVersions(): Record<string, string> {
  try {
    const raw = localStorage.getItem(CATALOG_VERSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getStoredCatalogVersion(shopId: string): string {
  if (!shopId) return "";
  return readCatalogVersions()[shopId] ?? "";
}

export function setStoredCatalogVersion(shopId: string, version: string | undefined | null): void {
  if (!shopId || !version) return;
  try {
    const all = readCatalogVersions();
    if (all[shopId] && all[shopId] >= version) return;
    all[shopId] = version;
    localStorage.setItem(CATALOG_VERSION_KEY, JSON.stringify(all));
  } catch {
    // Ignore storage quota errors cleanly.
  }
}

export function deriveCatalogVersionFromProducts(products: any[] | undefined): string {
  if (!products || products.length === 0) return "";
  let maxUpdatedAt = "";
  for (const p of products) {
    if (typeof p?.updatedAt === "string" && p.updatedAt > maxUpdatedAt) {
      maxUpdatedAt = p.updatedAt;
    }
  }
  return maxUpdatedAt;
}

/**
 * Incrementally syncs only products created, updated, or archived since the last
 * server-confirmed catalog version, avoiding full-catalog D1 scans after every
 * POS sale or periodic poll. Falls back to a full fetch if cache is empty.
 */
export async function syncProductsDelta(qc: QueryClient, shopId: string): Promise<void> {
  if (!shopId) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const existingPromise = inFlightByShop.get(shopId);
  if (existingPromise) return existingPromise;

  const run = (async () => {
    const key = getListProductsQueryKey({ shopId, limit: 3000 });
    const cached: any = qc.getQueryData(key);
    const cachedList: any[] | undefined = cached?.products;

    const since = getStoredCatalogVersion(shopId);
    if (!cachedList || cachedList.length === 0 || !since) {
      await qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      return;
    }

    const res = await customFetch<{
      products?: any[];
      total?: number;
      delta?: boolean;
      catalogVersion?: string;
    }>(
      `/api/products?shopId=${encodeURIComponent(shopId)}&limit=3000&updatedSince=${encodeURIComponent(since)}`,
    );

    if (!res) return;

    // Backwards-compatible guard in case an older worker responds with the full list
    if (res.delta !== true) {
      const merged = mergeWithMutationResults(res);
      qc.setQueryData(key, merged);
      if (Array.isArray(merged?.products) && merged.products.length > 0) {
        setStoredCatalogVersion(shopId, res.catalogVersion || deriveCatalogVersionFromProducts(merged.products));
        saveProductsToCache(shopId, merged.products).catch(() => {});
      }
      return;
    }

    if (res.catalogVersion) {
      setStoredCatalogVersion(shopId, res.catalogVersion);
    }

    const changed = res.products ?? [];
    if (changed.length === 0) return;

    const byId = new Map<string, any>();
    for (const p of changed) {
      if (p?.id) byId.set(p.id, p);
    }

    const nextList: any[] = [];
    const seen = new Set<string>();
    for (const existing of cachedList) {
      if (!existing?.id) continue;
      seen.add(existing.id);
      const updated = byId.get(existing.id);
      if (!updated) {
        nextList.push(existing);
      } else if (updated.isActive !== false && updated.isActive !== 0) {
        nextList.push(updated);
      }
    }

    for (const added of changed) {
      if (!added?.id || seen.has(added.id)) continue;
      if (added.isActive !== false && added.isActive !== 0) {
        nextList.push(added);
      }
    }

    const merged = mergeWithMutationResults({ products: nextList, total: nextList.length });
    qc.setQueryData(key, merged);
    if (Array.isArray(merged?.products)) {
      saveProductsToCache(shopId, merged.products).catch(() => {});
    }
  })().finally(() => {
    inFlightByShop.delete(shopId);
  });

  inFlightByShop.set(shopId, run);
  return run;
}
