import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import {
  Sprout, RefreshCw, ClipboardList, Pencil, Save, X, Trash2, Search, SlidersHorizontal,
  ReceiptText, CircleDollarSign,
} from "lucide-react";
import {
  cents,
  formatBusinessDate,
  type IndividualSaleEntry,
  type NurserySaleEditState,
  type Variety,
} from "./nursery-utils";

export function NurserySalesLedgerTab({
  from,
  to,
  individualTotal,
  individualSaleSummary,
  statementCustomer,
  onStatementCustomerChange,
  statementPhone,
  onStatementPhoneChange,
  statementBusy,
  onCreateCustomerStatement,
  saleSearch,
  onSaleSearchChange,
  salePaymentFilter,
  onSalePaymentFilterChange,
  salesPage,
  salesPageSize,
  individualPageCount,
  onSalesPageChange,
  editingSaleId,
  onCancelSaleEdit,
  saleEdit,
  onSaleEditChange,
  saleEditSearch,
  onSaleEditSearchChange,
  saleEditVarietyOptions,
  saleEditVarietiesFetching,
  onSelectEditVariety,
  onSaveSaleEdit,
  busySaleId,
  entriesLoading,
  entriesError,
  entriesFetching,
  onRetryEntries,
  filteredIndividualEntries,
  selectedSaleIds,
  onToggleSaleSelection,
  onDownloadSelectedSalesPdf,
  onClearSelectedSales,
  onDownloadReceipt,
  onBeginEditSale,
  onDeleteSale,
}: {
  from: string;
  to: string;
  individualTotal: number;
  individualSaleSummary: { quantity: number; totalCents: number; creditCents: number };
  statementCustomer: string;
  onStatementCustomerChange: (val: string) => void;
  statementPhone: string;
  onStatementPhoneChange: (val: string) => void;
  statementBusy: boolean;
  onCreateCustomerStatement: () => void;
  saleSearch: string;
  onSaleSearchChange: (val: string) => void;
  salePaymentFilter: "all" | "cash" | "mpesa" | "credit";
  onSalePaymentFilterChange: (val: "all" | "cash" | "mpesa" | "credit") => void;
  salesPage: number;
  salesPageSize: number;
  individualPageCount: number;
  onSalesPageChange: (nextPage: number | ((prev: number) => number)) => void;
  editingSaleId: string | null;
  onCancelSaleEdit: () => void;
  saleEdit: NurserySaleEditState;
  onSaleEditChange: (updater: (prev: NurserySaleEditState) => NurserySaleEditState) => void;
  saleEditSearch: string;
  onSaleEditSearchChange: (val: string) => void;
  saleEditVarietyOptions: Variety[];
  saleEditVarietiesFetching: boolean;
  onSelectEditVariety: (variety: { id: string; name: string }) => void;
  onSaveSaleEdit: (event: FormEvent) => void;
  busySaleId: string | null;
  entriesLoading: boolean;
  entriesError: boolean;
  entriesFetching: boolean;
  onRetryEntries: () => void;
  filteredIndividualEntries: IndividualSaleEntry[];
  selectedSaleIds: string[];
  onToggleSaleSelection: (id: string) => void;
  onDownloadSelectedSalesPdf: () => void;
  onClearSelectedSales: () => void;
  onDownloadReceipt: (entry: IndividualSaleEntry) => void;
  onBeginEditSale: (entry: IndividualSaleEntry) => void;
  onDeleteSale: (entry: IndividualSaleEntry) => void;
}) {
  return (
    <TabsContent value="sales" className="mt-4 space-y-4 focus-visible:outline-none">
      <Card className="overflow-hidden rounded-3xl border-border shadow-sm">
        <CardHeader className="border-b border-border/70 bg-muted/20 pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-primary/25 bg-primary/12 p-3 text-primary"><ReceiptText className="h-5 w-5" /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-lg">Individual Sales Ledger</CardTitle>
                  <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Sale Ledger
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Review transactions, print receipts, generate customer statements, or correct entries.</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-border bg-background/70 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Entries</p>
                <p className="mt-0.5 text-base font-bold font-mono tabular-nums">{individualTotal.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-border bg-background/70 px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Seedlings</p>
                <p className="mt-0.5 text-base font-bold font-mono tabular-nums">{individualSaleSummary.quantity.toLocaleString()}</p>
              </div>
              <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] px-3 py-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">Value</p>
                <p className="mt-0.5 text-base font-bold font-mono tabular-nums text-primary">{formatKES(cents(individualSaleSummary.totalCents))}</p>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-4 sm:p-5">
          {/* Customer Statement PDF Box */}
          <section className="rounded-2xl border border-primary/20 bg-primary/[0.04] p-4" aria-label="Customer statement generator">
            <div className="mb-3 flex items-start gap-2.5">
              <ReceiptText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <h3 className="text-sm font-bold">Customer Purchase Statement (PDF)</h3>
                <p className="text-xs text-muted-foreground">Retrieve saved purchases for a customer between {formatBusinessDate(from)} and {formatBusinessDate(to)}.</p>
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
              <div className="space-y-1">
                <Label htmlFor="nursery-statement-customer" className="text-xs">Customer name</Label>
                <Input id="nursery-statement-customer" value={statementCustomer} onChange={e => onStatementCustomerChange(e.target.value)} maxLength={120} placeholder="Enter saved customer name" className="h-10 rounded-xl bg-background" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="nursery-statement-phone" className="text-xs">Phone number (optional)</Label>
                <Input id="nursery-statement-phone" value={statementPhone} onChange={e => onStatementPhoneChange(e.target.value)} maxLength={40} inputMode="tel" placeholder="Phone number" className="h-10 rounded-xl bg-background" />
              </div>
              <Button type="button" onClick={onCreateCustomerStatement} disabled={statementBusy || (!statementCustomer.trim() && !statementPhone.trim()) || !from || !to || from > to} className="h-10 rounded-xl gap-2 cursor-pointer">
                {statementBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                {statementBusy ? "Preparing…" : "Generate Statement"}
              </Button>
            </div>
          </section>

          {/* Search & Filter */}
          <div className="grid gap-2.5 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={saleSearch} onChange={e => { onSaleSearchChange(e.target.value); onSalesPageChange(1); }} placeholder="Search customer, phone, seedling or date…" aria-label="Search individual sales" className="h-10 rounded-xl bg-background pl-10" />
            </div>
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select aria-label="Filter by payment method" value={salePaymentFilter} onChange={e => { onSalePaymentFilterChange(e.target.value as typeof salePaymentFilter); onSalesPageChange(1); }} className="h-10 w-full appearance-none rounded-xl border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                <option value="all">All payment methods</option>
                <option value="cash">Cash</option>
                <option value="mpesa">M-Pesa</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { onSaleSearchChange(""); onSalePaymentFilterChange("all"); onSalesPageChange(1); }} disabled={!saleSearch && salePaymentFilter === "all"} className="h-10 rounded-xl">Clear</Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>Showing <span className="font-semibold text-foreground">{individualTotal ? ((salesPage - 1) * salesPageSize + 1).toLocaleString() : "0"}–{Math.min(salesPage * salesPageSize, individualTotal).toLocaleString()}</span> of {individualTotal.toLocaleString()}</p>
            <p className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5" /> Credit total: <span className="font-semibold font-mono text-foreground">{formatKES(cents(individualSaleSummary.creditCents))}</span></p>
          </div>

          {editingSaleId && (
            <form onSubmit={onSaveSaleEdit} className="rounded-2xl border border-primary/35 bg-primary/[0.05] p-4 shadow-sm sm:p-5">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/15 p-2 text-primary"><Pencil className="h-4 w-4" /></div>
                  <div>
                    <p className="font-bold">Edit Sale Entry</p>
                    <p className="text-xs text-muted-foreground">Save corrections to refresh reports and balances.</p>
                  </div>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Cancel sale edit" onClick={onCancelSaleEdit}><X className="h-4 w-4" /></Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="sale-edit-date">Sale date</Label><Input id="sale-edit-date" data-testid="input-nursery-edit-date" type="date" value={saleEdit.businessDate} onChange={e => onSaleEditChange(s => ({ ...s, businessDate: e.target.value }))} required /></div>
                <div className="space-y-1.5">
                  <Label htmlFor="sale-edit-variety-search">Find a variety</Label>
                  <Input id="sale-edit-variety-search" data-testid="input-nursery-edit-variety-search" value={saleEditSearch} onChange={e => onSaleEditSearchChange(e.target.value)} placeholder="Type the start of a name…" autoComplete="off" />
                  <select
                    id="sale-edit-variety"
                    data-testid="select-nursery-edit-variety"
                    aria-label="Selected seedling variety"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                    value={saleEdit.varietyId}
                    onChange={e => {
                      const selected = saleEditVarietyOptions.find(variety => variety.id === e.target.value);
                      onSaleEditChange(s => ({ ...s, varietyId: e.target.value }));
                      if (selected) onSelectEditVariety({ id: selected.id, name: selected.name });
                    }}
                    required
                  >
                    {saleEditVarietyOptions.map(v => <option key={v.id} value={v.id}>{v.name}{Boolean(v.isActive) ? "" : " (archived)"}</option>)}
                  </select>
                  <p className="text-xs text-muted-foreground">{saleEditVarietiesFetching ? "Searching varieties…" : "Search and pick variety."}</p>
                </div>
                <div className="space-y-1.5"><Label htmlFor="sale-edit-qty">Quantity</Label><Input id="sale-edit-qty" data-testid="input-nursery-edit-quantity" type="number" min="1" max="10000000" step="1" inputMode="numeric" value={saleEdit.quantity} onChange={e => onSaleEditChange(s => ({ ...s, quantity: e.target.value }))} required /></div>
                <div className="space-y-1.5"><Label htmlFor="sale-edit-price">Unit price (KES)</Label><Input id="sale-edit-price" data-testid="input-nursery-edit-price" type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={saleEdit.unitPrice} onChange={e => onSaleEditChange(s => ({ ...s, unitPrice: e.target.value }))} required /></div>
                <div className="space-y-1.5"><Label htmlFor="sale-edit-payment">Payment method</Label><select id="sale-edit-payment" data-testid="select-nursery-edit-payment" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={saleEdit.paymentMethod} onChange={e => onSaleEditChange(s => ({ ...s, paymentMethod: e.target.value as "cash" | "mpesa" | "credit" }))}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="credit">Credit</option></select></div>
                <div className="space-y-1.5"><Label htmlFor="sale-edit-customer">Customer name</Label><Input id="sale-edit-customer" data-testid="input-nursery-edit-customer" value={saleEdit.customerName} onChange={e => onSaleEditChange(s => ({ ...s, customerName: e.target.value }))} maxLength={120} placeholder="Walk-in customer if blank" /></div>
                <div className="space-y-1.5"><Label htmlFor="sale-edit-phone">Customer phone</Label><Input id="sale-edit-phone" data-testid="input-nursery-edit-phone" type="tel" value={saleEdit.customerPhone} onChange={e => onSaleEditChange(s => ({ ...s, customerPhone: e.target.value }))} maxLength={40} /></div>
              </div>
              {saleEdit.paymentMethod === "credit" && (
                <p data-testid="status-nursery-edit-credit" className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
                  Credit entries require a customer and positive price. Sales with payments already recorded must be reconciled in Debts before editing or deleting.
                </p>
              )}
              <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
                <Button data-testid="button-cancel-nursery-edit" type="button" variant="outline" onClick={onCancelSaleEdit}>Cancel</Button>
                <Button data-testid="button-save-nursery-edit" type="submit" disabled={busySaleId === editingSaleId} className="gap-2"><Save className="h-4 w-4" /> Save changes</Button>
              </div>
            </form>
          )}

          {entriesLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl border bg-muted/40" />)}</div>
          ) : entriesError ? (
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
              <p className="font-medium text-destructive">Could not load individual sales</p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetryEntries}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
            </div>
          ) : !filteredIndividualEntries.length ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center">
              <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 font-semibold">{saleSearch || salePaymentFilter !== "all" ? "No matching sales found" : "No individual entries in this period"}</p>
              {(saleSearch || salePaymentFilter !== "all") && (
                <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { onSaleSearchChange(""); onSalePaymentFilterChange("all"); onSalesPageChange(1); }}>Clear filters</Button>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold">{selectedSaleIds.filter(id => filteredIndividualEntries.some(entry => entry.id === id)).length} sale lines selected</p>
                  <p className="text-xs text-muted-foreground">Combine same-customer lines into a single PDF receipt.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={!filteredIndividualEntries.some(entry => selectedSaleIds.includes(entry.id))} onClick={onDownloadSelectedSalesPdf} className="gap-1.5 rounded-xl"><ReceiptText className="h-4 w-4" /> Download combined PDF</Button>
                  <Button type="button" variant="ghost" size="sm" disabled={!selectedSaleIds.length} onClick={onClearSelectedSales} className="rounded-xl">Clear</Button>
                </div>
              </div>

              {/* Mobile / Tablet Cards */}
              <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
                {filteredIndividualEntries.map(entry => (
                  <div key={entry.id} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4">
                    <div className={"absolute inset-x-0 top-0 h-1 " + (entry.paymentMethod === "cash" ? "bg-amber-400" : entry.paymentMethod === "mpesa" ? "bg-sky-400" : "bg-violet-400")} />
                    <div className="flex items-start justify-between gap-3 pt-1">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input type="checkbox" aria-label={`Select ${entry.varietyName} sale`} checked={selectedSaleIds.includes(entry.id)} onChange={() => onToggleSaleSelection(entry.id)} className="h-4 w-4 rounded border-border accent-primary" />
                        Select
                      </label>
                      <span className={"shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase " + (entry.paymentMethod === "cash" ? "bg-amber-500/12 text-amber-400" : entry.paymentMethod === "mpesa" ? "bg-sky-500/12 text-sky-400" : "bg-violet-500/12 text-violet-400")}>
                        {entry.paymentMethod === "mpesa" ? "M-Pesa" : entry.paymentMethod === "credit" ? "Credit" : "Cash"}
                      </span>
                    </div>

                    <div className="mt-3 flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary"><Sprout className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-sm">{entry.varietyName}</p>
                        <p className="text-xs text-muted-foreground">{formatBusinessDate(entry.businessDate)} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-muted/35 p-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[11px] text-muted-foreground">Sale total</span>
                        <span className="text-lg font-bold font-mono text-primary">{formatKES(cents(entry.totalAmountCents))}</span>
                      </div>
                      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground font-mono">
                        <span>{Number(entry.quantity).toLocaleString()} seedlings</span>
                        <span>@ {formatKES(cents(entry.unitPriceCents))}</span>
                      </div>
                    </div>

                    <p className="mt-2.5 truncate text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{entry.customerName || "Walk-in"}</span>
                      {entry.customerPhone ? ` · ${entry.customerPhone}` : ""}
                      {entry.sourceSupplierName ? ` · Source: ${entry.sourceSupplierName}` : ""}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                      <Button type="button" variant="outline" size="sm" onClick={() => onDownloadReceipt(entry)} className="gap-1 rounded-xl h-8 text-xs"><ReceiptText className="h-3.5 w-3.5" /> PDF</Button>
                      <Button type="button" variant="outline" size="sm" disabled={busySaleId === entry.id || !!entry.sourceSupplierId} title={entry.sourceSupplierId ? "Supplier-linked sales are locked to preserve stock and debt records." : undefined} onClick={() => onBeginEditSale(entry)} className="flex-1 gap-1 rounded-xl h-8 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      <Button type="button" variant="ghost" size="sm" disabled={busySaleId === entry.id || !!entry.sourceSupplierId} title={entry.sourceSupplierId ? "Supplier-linked sales are locked to preserve stock and debt records." : undefined} onClick={() => { if (window.confirm("Delete this " + entry.varietyName + " sale for " + formatKES(cents(entry.totalAmountCents)) + "? The linked totals will be adjusted.")) onDeleteSale(entry); }} className="gap-1 rounded-xl h-8 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden overflow-x-auto rounded-2xl border border-border/70 xl:block">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-muted/40">
                    <tr className="border-b border-border text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="w-10 px-3 py-3" aria-label="Select sale"></th>
                      <th className="px-4 py-3">Date / Time</th>
                      <th className="px-4 py-3">Seedlings / Customer</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Unit Price</th>
                      <th className="px-4 py-3">Payment</th>
                      <th className="px-4 py-3 text-right">Sale Total</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIndividualEntries.map(entry => (
                      <tr key={entry.id} className={"border-b border-border/60 last:border-0 transition-colors hover:bg-muted/25 " + (selectedSaleIds.includes(entry.id) ? "bg-primary/5" : "")}>
                        <td className="w-10 px-3 py-3.5"><input type="checkbox" aria-label={`Select ${entry.varietyName} sale`} checked={selectedSaleIds.includes(entry.id)} onChange={() => onToggleSaleSelection(entry.id)} className="h-4 w-4 rounded border-border accent-primary" /></td>
                        <td className="whitespace-nowrap px-4 py-3.5">
                          <p className="font-semibold text-xs">{formatBusinessDate(entry.businessDate)}</p>
                          <p className="text-[11px] font-mono text-muted-foreground">{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-bold text-sm">{entry.varietyName}</p>
                          <p className="text-xs text-muted-foreground">{entry.customerName || "Walk-in customer"}{entry.customerPhone ? " · " + entry.customerPhone : ""}{entry.sourceSupplierName ? ` · Source: ${entry.sourceSupplierName}` : ""}</p>
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold font-mono tabular-nums">{Number(entry.quantity).toLocaleString()}</td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-muted-foreground">{formatKES(cents(entry.unitPriceCents))}</td>
                        <td className="px-4 py-3.5">
                          <span className={"inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold " + (entry.paymentMethod === "cash" ? "bg-amber-500/12 text-amber-400" : entry.paymentMethod === "mpesa" ? "bg-sky-500/12 text-sky-400" : "bg-violet-500/12 text-violet-400")}>
                            {entry.paymentMethod === "mpesa" ? "M-Pesa" : entry.paymentMethod === "credit" ? "Credit" : "Cash"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold font-mono tabular-nums text-primary">{formatKES(cents(entry.totalAmountCents))}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex justify-end gap-1.5">
                            <Button type="button" variant="outline" size="sm" onClick={() => onDownloadReceipt(entry)} className="gap-1 rounded-xl h-8 text-xs"><ReceiptText className="h-3.5 w-3.5" /> PDF</Button>
                            <Button type="button" variant="outline" size="sm" disabled={busySaleId === entry.id || !!entry.sourceSupplierId} title={entry.sourceSupplierId ? "Supplier-linked sales are locked to preserve stock and debt records." : undefined} onClick={() => onBeginEditSale(entry)} className="gap-1 rounded-xl h-8 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                            <Button type="button" variant="ghost" size="sm" disabled={busySaleId === entry.id || !!entry.sourceSupplierId} title={entry.sourceSupplierId ? "Supplier-linked sales are locked to preserve stock and debt records." : undefined} onClick={() => { if (window.confirm("Delete this " + entry.varietyName + " sale for " + formatKES(cents(entry.totalAmountCents)) + "? The linked totals will be adjusted.")) onDeleteSale(entry); }} className="gap-1 rounded-xl h-8 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {individualTotal > 0 && (
            <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Page {salesPage} of {individualPageCount} · 25 transactions per page</p>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={salesPage <= 1 || entriesFetching} onClick={() => onSalesPageChange(page => Math.max(1, page - 1))}>Previous</Button>
                <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={salesPage >= individualPageCount || entriesFetching} onClick={() => onSalesPageChange(page => Math.min(individualPageCount, page + 1))}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}
