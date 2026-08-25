export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonical display form for a customer's name, used everywhere a debt or
 * customer record is created/renamed (POS, debts, CRM, sale-on-credit).
 *
 * Previously each entry point normalized (or didn't normalize) casing on its
 * own — some title-cased client-side, some sent raw input straight through —
 * so the *same* person could end up stored as "John Mwangi" on one debt and
 * "john mwangi" on another. Doing it once, here, server-side, means every
 * write path produces an identical string for the same input, so records
 * for one person always collapse to one spelling.
 */
export function normalizeCustomerName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Lowercased/trimmed key for case-insensitive matching of customer names. */
export function customerNameKey(name: string): string {
  return name.trim().toLowerCase();
}
