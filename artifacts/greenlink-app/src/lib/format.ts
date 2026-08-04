export function formatKES(amount: number): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Round a raw stock-qty number to at most 3 decimal places, stripping trailing
// zeros. Prevents IEEE-754 floating-point noise (e.g. 27.0000000004) from
// leaking into the UI anywhere stock quantities are displayed.
export function formatQty(qty: number): string {
  return parseFloat(qty.toFixed(3)).toString();
}
