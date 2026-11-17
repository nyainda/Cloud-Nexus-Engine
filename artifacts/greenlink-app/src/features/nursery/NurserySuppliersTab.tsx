import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import { Sprout, Plus, RefreshCw, Users, PackagePlus, History } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  cents,
  formatBusinessDate,
  type SupplierRow,
  type SupplierCustomer,
  type SupplierRecord,
  type Variety,
} from "./nursery-utils";

export function NurserySuppliersTab({
  supplierName,
  onSupplierNameChange,
  supplierPhone,
  onSupplierPhoneChange,
  supplierNotes,
  onSupplierNotesChange,
  supplierCustomerSearch,
  onSupplierCustomerSearchChange,
  supplierCustomerId,
  onSupplierCustomerIdChange,
  debouncedSupplierCustomerSearch,
  supplierCustomers,
  supplierCustomersLoading,
  supplierCustomersError,
  savingSupplier,
  onCreateNurserySupplier,
  receiveSupplierId,
  onReceiveSupplierIdChange,
  receiveDate,
  onReceiveDateChange,
  receiveVarietySearch,
  onReceiveVarietySearchChange,
  receiveVarietyId,
  onReceiveVarietyIdChange,
  receiveVarieties,
  receiveVarietiesLoading,
  receiveVarietiesError,
  receiveVarietiesFetching,
  receiveQuantity,
  onReceiveQuantityChange,
  receiveNotes,
  onReceiveNotesChange,
  savingReceipt,
  onSaveNurseryReceipt,
  supplierRows,
  suppliersLoading,
  suppliersError,
  suppliersFetching,
  onRefreshSuppliers,
  selectedSupplierId,
  onSelectSupplierId,
  selectedSupplier,
  supplierRecords,
  supplierRecordsLoading,
  supplierRecordsError,
  onRefreshSupplierRecords,
  onLinkSupplierCustomer,
  onOpenSettlementModal,
}: {
  supplierName: string;
  onSupplierNameChange: (val: string) => void;
  supplierPhone: string;
  onSupplierPhoneChange: (val: string) => void;
  supplierNotes: string;
  onSupplierNotesChange: (val: string) => void;
  supplierCustomerSearch: string;
  onSupplierCustomerSearchChange: (val: string) => void;
  supplierCustomerId: string;
  onSupplierCustomerIdChange: (id: string) => void;
  debouncedSupplierCustomerSearch: string;
  supplierCustomers: SupplierCustomer[];
  supplierCustomersLoading: boolean;
  supplierCustomersError: boolean;
  savingSupplier: boolean;
  onCreateNurserySupplier: (event: FormEvent) => void;
  receiveSupplierId: string;
  onReceiveSupplierIdChange: (id: string) => void;
  receiveDate: string;
  onReceiveDateChange: (val: string) => void;
  receiveVarietySearch: string;
  onReceiveVarietySearchChange: (val: string) => void;
  receiveVarietyId: string;
  onReceiveVarietyIdChange: (id: string) => void;
  receiveVarieties: Variety[];
  receiveVarietiesLoading: boolean;
  receiveVarietiesError: boolean;
  receiveVarietiesFetching: boolean;
  receiveQuantity: string;
  onReceiveQuantityChange: (val: string) => void;
  receiveNotes: string;
  onReceiveNotesChange: (val: string) => void;
  savingReceipt: boolean;
  onSaveNurseryReceipt: (event: FormEvent) => void;
  supplierRows: SupplierRow[];
  suppliersLoading: boolean;
  suppliersError: boolean;
  suppliersFetching: boolean;
  onRefreshSuppliers: () => void;
  selectedSupplierId: string;
  onSelectSupplierId: (id: string) => void;
  selectedSupplier: SupplierRow | null;
  supplierRecords: SupplierRecord[];
  supplierRecordsLoading: boolean;
  supplierRecordsError: boolean;
  onRefreshSupplierRecords: () => void;
  onLinkSupplierCustomer: () => void;
  onOpenSettlementModal: (tab: "settle" | "history", target: { customerName: string; customerPhone: string }) => void;
}) {
  return (
    <TabsContent value="suppliers" className="mt-4 space-y-4 focus-visible:outline-none">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="text-base">Add Plant Supplier</CardTitle>
            <p className="text-xs text-muted-foreground">Link an existing shop customer if sales from this supplier reduce their debt.</p>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={onCreateNurserySupplier} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nursery-supplier-name" className="text-xs">Supplier name</Label>
                  <Input id="nursery-supplier-name" value={supplierName} onChange={event => onSupplierNameChange(event.target.value)} maxLength={120} placeholder="e.g. Greenhouse supplier" required className="rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nursery-supplier-phone" className="text-xs">Supplier phone</Label>
                  <Input id="nursery-supplier-phone" type="tel" value={supplierPhone} onChange={event => onSupplierPhoneChange(event.target.value)} maxLength={40} placeholder="Optional phone" className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nursery-supplier-customer-search" className="text-xs">Link existing customer <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="nursery-supplier-customer-search" value={supplierCustomerSearch} onChange={event => { onSupplierCustomerSearchChange(event.target.value); onSupplierCustomerIdChange(""); }} placeholder="Search customer name or phone" autoComplete="off" className="rounded-xl" />
                {debouncedSupplierCustomerSearch.trim().length >= 2 && supplierCustomersLoading && <p role="status" className="text-xs text-muted-foreground">Searching shop customers…</p>}
                {debouncedSupplierCustomerSearch.trim().length >= 2 && supplierCustomersError && <p role="alert" className="text-xs text-destructive">Could not find customers. Try again.</p>}
                {!!supplierCustomers.length && !supplierCustomerId && (
                  <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-background">
                    {supplierCustomers.map(customer => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          onSupplierCustomerIdChange(customer.id);
                          if (!supplierName.trim()) onSupplierNameChange(customer.name);
                          if (!supplierPhone.trim()) onSupplierPhoneChange(customer.phone ?? "");
                        }}
                        className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50 cursor-pointer"
                      >
                        <span className="min-w-0"><span className="block truncate font-medium">{customer.name}</span><span className="text-xs text-muted-foreground">{customer.phone || "No phone"}</span></span>
                        <span className="shrink-0 text-xs font-semibold font-mono">{formatKES(cents(customer.outstandingDebtCents))} owed</span>
                      </button>
                    ))}
                  </div>
                )}
                {supplierCustomerId && (
                  <p className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs text-primary">
                    Linked to {supplierCustomers.find(customer => customer.id === supplierCustomerId)?.name ?? "selected customer"}.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nursery-supplier-notes" className="text-xs">Notes</Label>
                <Input id="nursery-supplier-notes" value={supplierNotes} onChange={event => onSupplierNotesChange(event.target.value)} maxLength={500} placeholder="Optional delivery notes" className="rounded-xl" />
              </div>
              <Button type="submit" disabled={savingSupplier} className="w-full sm:w-auto rounded-xl gap-2 cursor-pointer">
                <Plus className="h-4 w-4" />{savingSupplier ? "Adding…" : "Add Supplier"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <CardTitle className="text-base">Record Plants Received</CardTitle>
            <p className="text-xs text-muted-foreground">Each delivery is tracked against its supplier source.</p>
          </CardHeader>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={onSaveNurseryReceipt} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nursery-receipt-supplier" className="text-xs">Supplier</Label>
                  <select id="nursery-receipt-supplier" value={receiveSupplierId} onChange={event => onReceiveSupplierIdChange(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" required>
                    <option value="">Choose a supplier</option>
                    {supplierRows.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nursery-receipt-date" className="text-xs">Date received</Label>
                  <Input id="nursery-receipt-date" type="date" value={receiveDate} onChange={event => onReceiveDateChange(event.target.value)} required className="rounded-xl" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nursery-receipt-variety-search" className="text-xs">Find a plant variety</Label>
                <Input id="nursery-receipt-variety-search" value={receiveVarietySearch} onChange={event => { onReceiveVarietySearchChange(event.target.value); onReceiveVarietyIdChange(""); }} placeholder="Type at least two letters to search" autoComplete="off" className="rounded-xl" />
                {receiveVarietySearch.trim().length >= 2 && receiveVarietiesLoading && <p role="status" className="text-xs text-muted-foreground">Searching varieties…</p>}
                {receiveVarietySearch.trim().length >= 2 && receiveVarietiesError && <p role="alert" className="text-xs text-destructive">Could not load varieties.</p>}
                {!!receiveVarieties.length && (
                  <select id="nursery-receipt-variety" value={receiveVarietyId} onChange={event => onReceiveVarietyIdChange(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" required>
                    <option value="">Choose a variety</option>
                    {receiveVarieties.map(variety => <option key={variety.id} value={variety.id}>{variety.name} · {variety.category}</option>)}
                  </select>
                )}
                {receiveVarietySearch.trim().length >= 2 && !receiveVarietiesFetching && receiveVarieties.length === 0 && (
                  <p className="text-xs text-muted-foreground">No active variety matched. Add it in the Varieties tab first.</p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nursery-receipt-quantity" className="text-xs">Plants received</Label>
                  <Input id="nursery-receipt-quantity" type="number" min="1" max="10000000" step="1" inputMode="numeric" value={receiveQuantity} onChange={event => onReceiveQuantityChange(event.target.value)} required className="rounded-xl font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="nursery-receipt-notes" className="text-xs">Delivery notes</Label>
                  <Input id="nursery-receipt-notes" value={receiveNotes} onChange={event => onReceiveNotesChange(event.target.value)} maxLength={500} placeholder="Optional" className="rounded-xl" />
                </div>
              </div>
              <Button type="submit" disabled={savingReceipt || !supplierRows.length || !receiveVarietyId} className="w-full sm:w-auto rounded-xl gap-2 cursor-pointer">
                <PackagePlus className="h-4 w-4" />{savingReceipt ? "Saving…" : "Record Delivery"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-base">Supplier Balances & Source Stock</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Select a supplier card to inspect deliveries and debt offsets.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const target = selectedSupplier ?? supplierRows.find(s => !!s.customerId) ?? supplierRows[0];
                  onOpenSettlementModal("settle", {
                    customerName: target?.customerName || target?.name || "",
                    customerPhone: target?.customerPhone || target?.phone || "",
                  });
                }}
                className="gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              >
                <Sprout className="h-3.5 w-3.5" />
                Settle Debt w/ Plants
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const target = selectedSupplier ?? supplierRows.find(s => !!s.customerId) ?? supplierRows[0];
                  onOpenSettlementModal("history", {
                    customerName: target?.customerName || target?.name || "",
                    customerPhone: target?.customerPhone || target?.phone || "",
                  });
                }}
                className="gap-1.5 rounded-xl cursor-pointer"
              >
                <History className="h-3.5 w-3.5" />
                Debt Usage Ledger
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={suppliersFetching} onClick={onRefreshSuppliers} className="gap-2 rounded-xl cursor-pointer">
                <RefreshCw className={`h-3.5 w-3.5 ${suppliersFetching ? "animate-spin" : ""}`} />Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-5">
          {suppliersLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading suppliers…</p>
          ) : suppliersError ? (
            <div role="alert" className="py-6 text-center"><p className="font-medium text-destructive">Could not load suppliers.</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRefreshSuppliers}>Try again</Button></div>
          ) : !supplierRows.length ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No nursery suppliers yet. Add one above, then record each plant delivery.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {supplierRows.map(supplier => (
                <button
                  key={supplier.id}
                  type="button"
                  onClick={() => onSelectSupplierId(supplier.id)}
                  aria-pressed={selectedSupplierId === supplier.id}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-all cursor-pointer",
                    selectedSupplierId === supplier.id
                      ? "border-primary bg-primary/[0.08] ring-1 ring-primary/25 shadow-sm"
                      : "border-border hover:border-primary/40 hover:bg-muted/25"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-sm">{supplier.name}</p>
                      <p className="truncate text-xs text-muted-foreground mt-0.5">
                        {supplier.customerId ? `Linked · ${supplier.customerName || "Customer"}` : "No customer debt link"}
                        {supplier.phone ? ` · ${supplier.phone}` : ""}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", selectedSupplierId === supplier.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      {selectedSupplierId === supplier.id ? "Active" : "View"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
                    <div><p className="text-[9px] font-bold uppercase text-muted-foreground">Plants left</p><p className="mt-1 text-sm font-bold font-mono tabular-nums">{Number(supplier.onHandPlants).toLocaleString()}</p></div>
                    <div><p className="text-[9px] font-bold uppercase text-muted-foreground">Debt left</p><p className="mt-1 text-sm font-bold font-mono tabular-nums text-destructive">{formatKES(cents(supplier.customerDebtCents))}</p></div>
                    <div><p className="text-[9px] font-bold uppercase text-muted-foreground">Credit</p><p className="mt-1 text-sm font-bold font-mono tabular-nums text-emerald-400">{formatKES(cents(supplier.supplierCreditCents))}</p></div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedSupplier && (
        <Card className="rounded-3xl overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-muted/20">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-base">{selectedSupplier.name} · Activity Ledger</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {selectedSupplier.customerId ? `Linked to ${selectedSupplier.customerName || "shop customer"}. Sales reduce this customer's debt first.` : "Link this supplier to an existing customer to apply future sale proceeds to their debt."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onOpenSettlementModal("settle", {
                    customerName: selectedSupplier.customerName || selectedSupplier.name,
                    customerPhone: selectedSupplier.customerPhone || selectedSupplier.phone || "",
                  })}
                  className="gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                >
                  <Sprout className="h-3.5 w-3.5" />
                  Clear Debt & Shop Profit
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onSelectSupplierId("")}>Close</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <section className="rounded-2xl border border-border/70 bg-muted/20 p-3.5">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor="nursery-link-customer-search" className="text-xs">Link existing shop customer</Label>
                  <Input id="nursery-link-customer-search" value={supplierCustomerSearch} onChange={event => { onSupplierCustomerSearchChange(event.target.value); onSupplierCustomerIdChange(""); }} placeholder="Search by customer name or phone" autoComplete="off" className="rounded-xl bg-background" />
                </div>
                <Button type="button" onClick={onLinkSupplierCustomer} disabled={!supplierCustomerId} className="gap-2 rounded-xl cursor-pointer">
                  <Users className="h-4 w-4" />{selectedSupplier.customerId ? "Update link" : "Link customer"}
                </Button>
              </div>
              {!!supplierCustomers.length && (
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {supplierCustomers.map(customer => (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => onSupplierCustomerIdChange(customer.id)}
                      className={`rounded-full border px-3 py-1 text-xs cursor-pointer ${supplierCustomerId === customer.id ? "border-primary bg-primary/15 text-primary font-semibold" : "border-border bg-background hover:bg-muted"}`}
                    >
                      {customer.name}{customer.phone ? ` · ${customer.phone}` : ""} · owes {formatKES(cents(customer.outstandingDebtCents))}
                    </button>
                  ))}
                </div>
              )}
            </section>

            {supplierRecordsLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading supplier activity…</p>
            ) : supplierRecordsError ? (
              <div role="alert" className="py-6 text-center"><p className="font-medium text-destructive">Could not load supplier activity.</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRefreshSupplierRecords}>Try again</Button></div>
            ) : !supplierRecords.length ? (
              <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No deliveries or source sales have been recorded for this supplier yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-border/70">
                <table className="w-full min-w-[650px] text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Record</th>
                      <th className="px-4 py-3">Variety</th>
                      <th className="px-4 py-3 text-right">Plants</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierRecords.map(record => {
                      const label = record.recordType === "receipt" ? "Plants received" : record.recordType === "sale_proceeds" ? "Sale proceeds" : record.recordType === "debt_offset" ? "Applied to debt" : record.recordType;
                      return (
                        <tr key={record.id} className="border-b border-border/60 last:border-0">
                          <td className="whitespace-nowrap px-4 py-3 text-xs">{formatBusinessDate(record.recordedAt.slice(0, 10))}</td>
                          <td className="px-4 py-3 font-semibold text-xs">{label}</td>
                          <td className="px-4 py-3 text-xs">{record.varietyName || "—"}</td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">{Number(record.quantity || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-bold font-mono tabular-nums">{record.amountCents ? formatKES(cents(Math.abs(Number(record.amountCents)))) : "—"}</td>
                          <td className="max-w-[260px] truncate px-4 py-3 text-xs text-muted-foreground" title={record.note}>{record.note || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </TabsContent>
  );
}
