/**
 * Splits an array into chunks of at most `size` items.
 *
 * D1 (and SQLite generally) caps the number of bound parameters per
 * statement — D1 enforces 100. Any `WHERE col IN (...)` built from a
 * JS array of ids must be chunked through this before being passed to
 * drizzle's `inArray()`, or the query will throw "too many SQL variables"
 * once the array crosses the limit.
 */
export function chunk<T>(items: T[], size = 90): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
