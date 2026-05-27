/**
 * Product version guard — prevents stale background refetches from overwriting
 * optimistic state or confirmed mutation results.
 *
 * The problem this solves:
 *   Cloudflare KV is eventually consistent. When a PATCH/POST mutates a product,
 *   the KV cache is busted server-side before the response returns. But if a
 *   background GET fires in the same ~2s window (triggered by invalidateQueries),
 *   it may still hit a CDN edge node that hasn't propagated the bust yet and return
 *   the old product data — overwriting our correct optimistic/mutation-confirmed cache.
 *
 * How it works:
 *   1. After every successful mutation, the component calls recordMutationResult(product).
 *      This stores the full product object keyed by product ID, keeping the newest
 *      updatedAt seen so far.
 *   2. The QueryCache subscriber in App.tsx calls mergeWithMutationResults() on every
 *      successful products-list fetch.
 *   3. For each product in the fresh response, if its updatedAt is older than the
 *      version we have from a mutation, we substitute our version. The server gave us
 *      a stale KV hit — we silently discard it.
 *   4. If the server's product is newer (e.g. another device updated it), it passes
 *      through and we record it as the new known-good version.
 */

/** Full product objects from the most recent successful mutation, keyed by product ID. */
const mutationResults = new Map<string, any>();

/**
 * Record the full product returned by a successful mutation.
 * Only stores/updates when the new product's updatedAt is strictly newer.
 */
export function recordMutationResult(product: any): void {
  if (!product?.id) return;
  const existing = mutationResults.get(product.id);
  const isNewer =
    !existing ||
    !existing.updatedAt ||
    (product.updatedAt && product.updatedAt > existing.updatedAt);
  if (isNewer) {
    mutationResults.set(product.id, product);
  }
}

/**
 * Merge a fresh product list response with known mutation results.
 *
 * - Products whose server updatedAt < our recorded mutation updatedAt → replaced
 *   with our mutation result (stale KV response discarded).
 * - Products whose server updatedAt >= our recorded mutation updatedAt → accepted
 *   as authoritative (another device may have made a newer change) and recorded.
 *
 * Returns the same object reference if no products needed replacement (fast path
 * — avoids unnecessary re-renders when the server response is fully fresh).
 */
export function mergeWithMutationResults(freshData: any): any {
  if (!freshData?.products || mutationResults.size === 0) return freshData;

  let changed = false;
  const mergedProducts = (freshData.products as any[]).map((fresh: any) => {
    const known = mutationResults.get(fresh.id);
    if (known?.updatedAt && fresh.updatedAt && fresh.updatedAt < known.updatedAt) {
      changed = true;
      return known;
    }
    if (fresh.updatedAt) recordMutationResult(fresh);
    return fresh;
  });

  return changed ? { ...freshData, products: mergedProducts } : freshData;
}
