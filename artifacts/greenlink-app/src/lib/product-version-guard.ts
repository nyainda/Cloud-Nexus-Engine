/**
 * Product version guard — prevents stale background refetches from overwriting
 * optimistic state or confirmed mutation results.
 *
 * The problem this solves:
 *   When a PATCH/POST mutates a product, the server cache is busted before the
 *   response returns. But if a background GET fires in the same window (triggered
 *   by invalidateQueries), it may still receive stale data and overwrite our
 *   correct optimistic/mutation-confirmed cache.
 *
 * How it works:
 *   1. After every successful mutation, the component calls recordMutationResult(product).
 *      This stores the full product object keyed by product ID, keeping the newest
 *      updatedAt seen so far.
 *   2. The QueryCache subscriber in App.tsx calls mergeWithMutationResults() on every
 *      successful products-list fetch.
 *   3. For each product in the fresh response, if its updatedAt is older than the
 *      version we have from a mutation, we substitute our version.
 *   4. If the server's product is newer (e.g. another device updated it), it passes
 *      through and we record it as the new known-good version.
 *   5. NEW PRODUCTS: if a product was recorded via recordMutationResult but is
 *      completely absent from the fresh server response (stale cache missed it),
 *      it is appended to the list so it never disappears after being added.
 */

/** Full product objects from the most recent successful mutation, keyed by product ID. */
const mutationResults = new Map<string, any>();

/**
 * Track which product IDs were created (not just edited) so we know to append
 * them if they are missing from a stale server response.
 */
const newProductIds = new Set<string>();

/**
 * Record the full product returned by a successful mutation.
 * Only stores/updates when the new product's updatedAt is strictly newer.
 */
export function recordMutationResult(product: any, isNew = false): void {
  if (!product?.id) return;
  const existing = mutationResults.get(product.id);
  const isNewer =
    !existing ||
    !existing.updatedAt ||
    (product.updatedAt && product.updatedAt > existing.updatedAt);
  if (isNewer) {
    mutationResults.set(product.id, product);
  }
  if (isNew) {
    newProductIds.add(product.id);
  }
}

/**
 * Merge a fresh product list response with known mutation results.
 *
 * - Products whose server updatedAt < our recorded mutation updatedAt → replaced
 *   with our mutation result (stale response discarded).
 * - Products whose server updatedAt >= our recorded mutation updatedAt → accepted
 *   as authoritative and recorded.
 * - Newly-created products missing from the fresh response → appended so they
 *   never disappear after being added.
 *
 * Returns the same object reference if no products needed changes (fast path
 * — avoids unnecessary re-renders when the server response is fully fresh).
 */
export function mergeWithMutationResults(freshData: any): any {
  if (!freshData?.products || mutationResults.size === 0) return freshData;

  let changed = false;
  const freshIds = new Set<string>();

  const mergedProducts = (freshData.products as any[]).map((fresh: any) => {
    freshIds.add(fresh.id);
    const known = mutationResults.get(fresh.id);
    if (known?.updatedAt && fresh.updatedAt && fresh.updatedAt < known.updatedAt) {
      changed = true;
      return known;
    }
    if (fresh.updatedAt) recordMutationResult(fresh);
    return fresh;
  });

  // Append any newly-created products that the stale server response missed entirely
  const missing: any[] = [];
  for (const id of newProductIds) {
    if (!freshIds.has(id)) {
      const product = mutationResults.get(id);
      if (product) {
        missing.push(product);
        changed = true;
      }
    } else {
      // Server now includes it — it's no longer "new" from our perspective
      newProductIds.delete(id);
    }
  }

  if (!changed) return freshData;

  const finalProducts = missing.length > 0
    ? [...mergedProducts, ...missing]
    : mergedProducts;

  return {
    ...freshData,
    products: finalProducts,
    total: freshData.total != null ? freshData.total + missing.length : undefined,
  };
}
