export const CART_DRAFT_KEY = "greenlink_cart_draft";
export const AUTO_PRINT_KEY = "greenlink_auto_print";

export interface CartItem {
  product: any;
  qty: number;
  unitPrice: number;
}

export type StockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
export type PaymentMode = "cash" | "bank" | "debt";

export const FILTERS: { value: StockFilter; label: string }[] = [
  { value: "in_stock", label: "In Stock" },
  { value: "all", label: "All" },
  { value: "low_stock", label: "Low" },
  { value: "out_of_stock", label: "Out" },
];
