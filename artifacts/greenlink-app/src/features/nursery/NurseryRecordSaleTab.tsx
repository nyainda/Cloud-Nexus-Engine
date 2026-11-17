import type React from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import { CustomerAutocomplete, type SelectedCustomer } from "@/components/customer-autocomplete";
import {
  Sprout, Plus, Minus, Banknote, Smartphone, Leaf, CheckCircle2, CreditCard,
  ArrowUpRight, X, Search, ShoppingCart, Sparkles, User2, Phone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBusinessDate, type NurseryCartItem, type SaleSource, type Variety } from "./nursery-utils";

export function NurseryRecordSaleTab({
  shopId,
  businessDate,
  varieties,
  matchingSaleVarieties,
  saleCategories,
  productSearch,
  onProductSearchChange,
  productCategory,
  onProductCategoryChange,
  saleVarietiesFetching,
  saleVarietiesError,
  saleVarietiesSuccess,
  onRetrySaleVarieties,
  cart,
  setCart,
  addToCart,
  saleSources,
  paymentMethod,
  onPaymentMethodChange,
  customerName,
  onCustomerNameChange,
  customerPhone,
  onCustomerPhoneChange,
  totalSeedlingsInCart,
  cartTotal,
  saving,
  isOnline,
  onSubmitSale,
}: {
  shopId: string;
  businessDate: string;
  varieties: Variety[];
  matchingSaleVarieties: Variety[];
  saleCategories: string[];
  productSearch: string;
  onProductSearchChange: (value: string) => void;
  productCategory: string;
  onProductCategoryChange: (value: string) => void;
  saleVarietiesFetching: boolean;
  saleVarietiesError: boolean;
  saleVarietiesSuccess: boolean;
  onRetrySaleVarieties: () => void;
  cart: NurseryCartItem[];
  setCart: React.Dispatch<React.SetStateAction<NurseryCartItem[]>>;
  addToCart: (variety: Variety) => void;
  saleSources: SaleSource[];
  paymentMethod: "cash" | "mpesa" | "credit";
  onPaymentMethodChange: (method: "cash" | "mpesa" | "credit") => void;
  customerName: string;
  onCustomerNameChange: (value: string) => void;
  customerPhone: string;
  onCustomerPhoneChange: (value: string) => void;
  totalSeedlingsInCart: number;
  cartTotal: number;
  saving: boolean;
  isOnline: boolean;
  onSubmitSale: (event: FormEvent) => void;
}) {
  return (
    <TabsContent value="record" className="mt-4 focus-visible:outline-none">
      <form onSubmit={onSubmitSale} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_480px] items-start">
        {/* Left: Seedling Catalog Picker */}
        <Card className="rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-muted/20 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Sprout className="h-4 w-4 text-primary" />
                  1. Choose Seedlings
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tap any variety below to add it to the sale ticket
                </p>
              </div>
              <span className="rounded-full bg-primary/12 border border-primary/25 px-2.5 py-1 text-[11px] font-bold text-primary">
                {varieties.length} showing
              </span>
            </div>

            {/* Search + Category filter */}
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px]">
              <div className="relative">
                <Label htmlFor="seedling-search" className="sr-only">Search seedling varieties</Label>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="seedling-search"
                  data-testid="input-nursery-variety-search"
                  value={productSearch}
                  onChange={e => onProductSearchChange(e.target.value)}
                  placeholder="Search cabbage, tomato, kale, avocado…"
                  aria-label="Search seedling varieties"
                  className="h-11 rounded-2xl bg-background pl-10"
                  autoComplete="off"
                />
              </div>
              <select
                data-testid="select-nursery-variety-category"
                aria-label="Filter seedling varieties by category"
                value={productCategory}
                onChange={e => onProductCategoryChange(e.target.value)}
                className="h-11 w-full rounded-2xl border border-input bg-background px-3.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All categories</option>
                {saleCategories.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
            </div>

            {/* Quick Category Pills */}
            {saleCategories.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pt-1">
                <button
                  type="button"
                  onClick={() => onProductCategoryChange("")}
                  className={cn(
                    "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                    !productCategory
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                {saleCategories.map(cat => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => onProductCategoryChange(productCategory === cat ? "" : cat)}
                    className={cn(
                      "shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer",
                      productCategory === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>

          <CardContent className="p-4 space-y-3">
            {(productSearch.trim() || productCategory) && saleVarietiesFetching && (
              <p data-testid="status-nursery-variety-search" role="status" className="rounded-2xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                Finding matching seedlings…
              </p>
            )}

            {(productSearch.trim() || productCategory) && saleVarietiesError && (
              <div data-testid="status-nursery-variety-error" role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm">
                <p className="font-medium text-destructive">Could not load seedling varieties.</p>
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetrySaleVarieties}>Try again</Button>
              </div>
            )}

            {!productSearch.trim() && !productCategory && saleVarietiesSuccess && varieties.length === 0 ? (
              <p data-testid="status-nursery-varieties-empty" className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                There are no active varieties yet. Add one in the Varieties tab before recording a sale.
              </p>
            ) : matchingSaleVarieties.length === 0 && !saleVarietiesFetching ? (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No active varieties match. Try another search or add the variety in the Varieties tab.
              </p>
            ) : (
              <>
                <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {matchingSaleVarieties.slice(0, productSearch.trim() || productCategory ? 8 : 24).map(v => {
                    const inCart = cart.find(c => c.varietyId === v.id);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        data-testid={`button-add-nursery-variety-${v.id}`}
                        aria-label={`Add ${v.name} to sale`}
                        onClick={() => addToCart(v)}
                        className={cn(
                          "group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all cursor-pointer",
                          inCart
                            ? "bg-primary/[0.09] border-primary ring-1 ring-primary/25 shadow-sm"
                            : "bg-muted/25 border-border hover:border-primary/45 hover:bg-muted/45"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="inline-flex items-center gap-1 rounded-full bg-background/70 border border-border/70 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground truncate max-w-[130px]">
                            <Leaf className="h-2.5 w-2.5 text-primary shrink-0" />
                            <span className="truncate">{v.category || "Seedling"}</span>
                          </span>
                          {inCart && (
                            <span className="rounded-full bg-primary text-primary-foreground px-2 py-0.5 text-[10px] font-bold font-mono">
                              ×{inCart.quantity}
                            </span>
                          )}
                        </div>

                        <p className="text-sm font-bold text-foreground leading-snug line-clamp-2 mb-3">
                          {v.name}
                        </p>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50 mt-auto">
                          <span className="text-sm font-bold font-mono text-primary">
                            {formatKES(v.defaultPrice)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-xl bg-primary/12 group-hover:bg-primary group-hover:text-primary-foreground text-primary px-2.5 py-1 text-xs font-bold transition-colors">
                            <Plus className="h-3.5 w-3.5" />
                            Add
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {(productSearch.trim() || productCategory) && matchingSaleVarieties.length > 8 && (
                  <p data-testid="text-nursery-variety-suggestions-more" className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Showing 8 suggestions. Type a longer name to narrow the list.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Right: Live Seedling Sale Ticket */}
        <Card className="rounded-3xl overflow-hidden border-border shadow-lg lg:sticky lg:top-4">
          <CardHeader className="border-b border-border/70 bg-muted/25 px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
                  <ShoppingCart className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold">Seedling Ticket</CardTitle>
                  <p className="text-[11px] text-muted-foreground">
                    {formatBusinessDate(businessDate)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary/15 border border-primary/25 px-2.5 py-0.5 text-[11px] font-bold font-mono text-primary">
                  {cart.length} {cart.length === 1 ? "variety" : "varieties"}
                </span>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCart([])}
                    className="text-[11px] font-semibold text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 space-y-4">
            {/* Chosen Varieties */}
            <div data-testid="section-nursery-sale-items" aria-label="Sale items" className="space-y-2.5">
              {!cart.length ? (
                <div className="rounded-2xl border border-dashed border-border bg-muted/15 py-10 px-4 text-center">
                  <Sparkles className="h-7 w-7 text-primary mx-auto mb-2.5 opacity-80" />
                  <p className="text-sm font-bold text-foreground">No seedlings added yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click any variety card on the left to start building this sale.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-0.5">
                  {cart.map((item, idx) => {
                    const quantity = Number(item.quantity);
                    const unitPriceCents = Math.round(Number(item.unitPrice) * 100);
                    const lineTotal = Number.isSafeInteger(quantity) && quantity > 0 && Number.isSafeInteger(unitPriceCents) && unitPriceCents >= 0 ? (quantity * unitPriceCents) / 100 : 0;
                    const matchingSources = saleSources.filter(source => source.varietyId === item.varietyId);

                    return (
                      <div key={item.varietyId} className="rounded-2xl border border-border bg-muted/20 p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="mt-0.5 inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-md bg-muted text-[10px] font-bold font-mono text-muted-foreground shrink-0">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <p className="text-sm font-bold text-foreground leading-snug break-words">{item.name}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span data-testid={`text-nursery-sale-line-total-${item.varietyId}`} className="text-sm font-bold font-mono text-primary">
                              {formatKES(lineTotal)}
                            </span>
                            <button
                              type="button"
                              data-testid={`button-remove-nursery-variety-${item.varietyId}`}
                              aria-label={`Remove ${item.name}`}
                              onClick={() => setCart(current => current.filter(line => line.varietyId !== item.varietyId))}
                              className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/12 hover:text-destructive cursor-pointer"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label htmlFor={`cart-${item.varietyId}-quantity`} className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                              Qty
                            </Label>
                            <div className="flex items-center rounded-xl border border-border bg-background overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setCart(current => current.map(line => line.varietyId === item.varietyId ? { ...line, quantity: String(Math.max(1, (Number(line.quantity) || 1) - 1)) } : line))}
                                className="h-9 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                              <Input
                                id={`cart-${item.varietyId}-quantity`}
                                data-testid={`input-nursery-sale-quantity-${item.varietyId}`}
                                aria-label={`${item.name} quantity`}
                                type="number"
                                min="1"
                                max="10000000"
                                step="1"
                                inputMode="numeric"
                                value={item.quantity}
                                onChange={e => setCart(current => current.map(line => line.varietyId === item.varietyId ? { ...line, quantity: e.target.value } : line))}
                                className="h-9 border-0 bg-transparent text-center font-mono font-bold px-1 focus-visible:ring-0"
                                required
                              />
                              <button
                                type="button"
                                onClick={() => setCart(current => current.map(line => line.varietyId === item.varietyId ? { ...line, quantity: String((Number(line.quantity) || 0) + 1) } : line))}
                                className="h-9 w-8 flex items-center justify-center text-primary hover:bg-primary/10 cursor-pointer"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor={`cart-${item.varietyId}-price`} className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                              Unit Price (KES)
                            </Label>
                            <Input
                              id={`cart-${item.varietyId}-price`}
                              data-testid={`input-nursery-sale-price-${item.varietyId}`}
                              aria-label={`${item.name} price per seedling`}
                              type="number"
                              min="0"
                              max="1000000"
                              step="0.01"
                              inputMode="decimal"
                              value={item.unitPrice}
                              onChange={e => setCart(current => current.map(line => line.varietyId === item.varietyId ? { ...line, unitPrice: e.target.value } : line))}
                              className="h-9 rounded-xl bg-background text-right font-mono font-bold"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor={`cart-${item.varietyId}-source`} className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                            Plant Source <span className="font-normal normal-case">(optional)</span>
                          </Label>
                          <select
                            id={`cart-${item.varietyId}-source`}
                            aria-label={`${item.name} supplier source`}
                            value={item.sourceSupplierId}
                            onChange={event => setCart(current => current.map(line => line.varietyId === item.varietyId ? { ...line, sourceSupplierId: event.target.value } : line))}
                            className="h-9 w-full rounded-xl border border-input bg-background px-3 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">No source tracked</option>
                            {matchingSources.map(source => (
                              <option key={source.supplierId} value={source.supplierId}>
                                {source.supplierName} · {Number(source.availableQuantity).toLocaleString()} available
                              </option>
                            ))}
                          </select>
                          {item.sourceSupplierId && (Number(item.quantity) > Number(matchingSources.find(source => source.supplierId === item.sourceSupplierId)?.availableQuantity ?? 0)) && (
                            <p role="alert" className="text-xs font-medium text-destructive">
                              Selected source has fewer plants than this sale quantity.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payment Method */}
            <section aria-labelledby="sale-payment-heading" className="space-y-2 pt-2 border-t border-border/70">
              <h2 id="sale-payment-heading" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                2. Payment Method
              </h2>
              <div role="group" aria-label="Payment method" className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-muted/50 p-1">
                <button
                  type="button"
                  data-testid="button-nursery-payment-cash"
                  aria-pressed={paymentMethod === "cash"}
                  onClick={() => onPaymentMethodChange("cash")}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    paymentMethod === "cash"
                      ? "bg-card text-foreground shadow-sm border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Banknote className="h-3.5 w-3.5 text-amber-400" />
                  Cash
                </button>
                <button
                  type="button"
                  data-testid="button-nursery-payment-mpesa"
                  aria-pressed={paymentMethod === "mpesa"}
                  onClick={() => onPaymentMethodChange("mpesa")}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    paymentMethod === "mpesa"
                      ? "bg-card text-foreground shadow-sm border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5 text-sky-400" />
                  M-Pesa
                </button>
                <button
                  type="button"
                  data-testid="button-nursery-payment-credit"
                  aria-pressed={paymentMethod === "credit"}
                  onClick={() => onPaymentMethodChange("credit")}
                  className={cn(
                    "flex h-9 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer",
                    paymentMethod === "credit"
                      ? "bg-violet-500/20 text-violet-300 border border-violet-500/35 shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Credit
                </button>
              </div>
            </section>

            {/* Customer Details */}
            <section aria-labelledby="sale-customer-heading" className="space-y-2.5 rounded-2xl border border-border/70 bg-muted/20 p-3.5">
              <div className="flex items-center justify-between">
                <h2 id="sale-customer-heading" className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-1.5">
                  <User2 className="h-3 w-3 text-primary" />
                  3. Customer Details
                </h2>
                <span className="text-[10px] font-medium text-muted-foreground">
                  {paymentMethod === "credit" ? "Required for credit" : "Optional"}
                </span>
              </div>
              <div className="grid gap-2.5">
                <CustomerAutocomplete
                  shopId={shopId}
                  value={customerName}
                  onChange={onCustomerNameChange}
                  onSelect={(customer: SelectedCustomer) => { onCustomerNameChange(customer.name); onCustomerPhoneChange(customer.phone); }}
                  placeholder={paymentMethod === "credit" ? "Customer name (required)" : "Customer name (optional)"}
                  inputId="nursery-sale-customer"
                  inputTestId="input-nursery-sale-customer"
                  ariaLabel="Customer name"
                  ariaInvalid={paymentMethod === "credit" && !customerName.trim()}
                  maxLength={120}
                />
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    id="nursery-sale-phone"
                    data-testid="input-nursery-sale-phone"
                    value={customerPhone}
                    onChange={e => onCustomerPhoneChange(e.target.value)}
                    placeholder="Phone number (optional)"
                    type="tel"
                    maxLength={40}
                    className="h-9 rounded-xl bg-background/60 pl-9 text-xs"
                  />
                </div>
              </div>
              {paymentMethod === "credit" && (
                <p data-testid="status-nursery-credit-sale" role="status" className="rounded-xl border border-primary/25 bg-primary/8 px-3 py-2 text-xs text-muted-foreground">
                  {customerName.trim()
                    ? `${formatKES(cartTotal)} will be added to ${customerName.trim()}'s debt. No payment is recorded now.`
                    : "Enter the customer name to record this as credit."} Nursery sales do not reduce POS stock.
                </p>
              )}
            </section>

            {/* Total & Submit */}
            <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Sale Total</p>
                  <p data-testid="text-nursery-sale-summary" className="text-[11px] text-muted-foreground mt-0.5">
                    {totalSeedlingsInCart.toLocaleString()} seedlings · {cart.length} {cart.length === 1 ? "variety" : "varieties"}
                  </p>
                </div>
                <p data-testid="text-nursery-sale-total" className="text-2xl font-bold font-mono tabular-nums text-primary">
                  {formatKES(cartTotal)}
                </p>
              </div>

              <Button
                data-testid="button-record-nursery-sale"
                type="submit"
                disabled={saving || cart.length === 0 || !isOnline}
                className="w-full h-11 rounded-2xl font-bold gap-2 shadow-lg shadow-primary/20 cursor-pointer"
              >
                <CheckCircle2 className="h-4 w-4" />
                {saving ? "Recording sale…" : "Record Seedling Sale"}
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </div>

            {!isOnline && (
              <p data-testid="status-nursery-offline" role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                You&apos;re offline. Reconnect before saving; sale entries are not queued offline.
              </p>
            )}
          </CardContent>
        </Card>
      </form>
    </TabsContent>
  );
}
