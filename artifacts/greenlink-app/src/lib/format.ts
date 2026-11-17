export function formatKES(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Round a numeric quantity to at most 3 decimal places to strip IEEE-754
// floating-point noise (e.g. 5.000000000000001 or 0.30000000000000004).
export function roundQty(qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  const rounded = Math.round((qty + Number.EPSILON) * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

// Round a raw stock-qty number to at most 3 decimal places, stripping trailing
// zeros. Prevents IEEE-754 floating-point noise (e.g. 27.0000000004) from
// leaking into the UI anywhere stock quantities are displayed.
export function formatQty(qty: number): string {
  return String(roundQty(Number(qty || 0)));
}
