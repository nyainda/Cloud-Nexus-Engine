import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKES } from "@/lib/format";
import { Sprout, Plus, CalendarDays, Banknote, Smartphone, Leaf, RefreshCw, Archive, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Variety = { id: string; name: string; defaultPrice: number; isActive: number | boolean };
type ReportRow = {
  businessDate: string; varietyId: string; varietyName: string; unitPriceCents: number;
  paymentMethod: "cash" | "mpesa"; quantity: number; totalAmountCents: number;
};
type ReportData = {
  rows: ReportRow[];
  summary: { totalSeedlings: number; totalRevenueCents: number; cashCents: number; mpesaCents: number };
};

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function addDays(date: string, amount: number) {
  const parsed = new Date(date + "T12:00:00");
  parsed.setDate(parsed.getDate() + amount);
  return localDate(parsed);
}
function cents(value: number) { return value / 100; }

export default function NurseryRegister() {
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [businessDate, setBusinessDate] = useState(localDate());
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const [varietyId, setVarietyId] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [unitPrice, setUnitPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa">("cash");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("0");
  const [saving, setSaving] = useState(false);
  const [addingVariety, setAddingVariety] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const varietiesQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId],
    queryFn: () => customFetch("/api/nursery/varieties") as Promise<Variety[]>,
    enabled: !!shopId,
  });
  const reportQuery = useQuery({
    queryKey: ["/api/nursery/report", shopId, from, to],
    queryFn: () => customFetch(`/api/nursery/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) as Promise<ReportData>,
    enabled: !!shopId && !!from && !!to && from <= to,
  });

  const varieties = (varietiesQuery.data ?? []).filter(v => Boolean(v.isActive));
  const selectedVariety = varieties.find(v => v.id === varietyId) ?? varieties[0];
  const report = reportQuery.data;
  const reportRows = report?.rows ?? [];
  const dateRows = useMemo(() => reportRows.filter(row => row.businessDate === businessDate), [reportRows, businessDate]);
  const todaySummary = useMemo(() => dateRows.reduce((sum, row) => ({
    quantity: sum.quantity + Number(row.quantity || 0),
    revenueCents: sum.revenueCents + Number(row.totalAmountCents || 0),
    cashCents: sum.cashCents + (row.paymentMethod === "cash" ? Number(row.totalAmountCents || 0) : 0),
    mpesaCents: sum.mpesaCents + (row.paymentMethod === "mpesa" ? Number(row.totalAmountCents || 0) : 0),
  }), { quantity: 0, revenueCents: 0, cashCents: 0, mpesaCents: 0 }), [dateRows]);

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!selectedVariety) { toast.error("Add a seedling variety first."); return; }
    if (!navigator.onLine) { toast.error("Connect to the internet before saving. Nursery entries are not queued offline yet."); return; }
    const qty = Number(quantity);
    const price = Number(unitPrice === "" ? selectedVariety.defaultPrice : unitPrice);
    if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      toast.error("Enter a positive whole-number quantity and a valid price."); return;
    }
    setSaving(true);
    try {
      await customFetch("/api/nursery/entries", {
        method: "POST",
        body: JSON.stringify({ requestId, businessDate, varietyId: selectedVariety.id, quantity: qty, unitPrice: price, paymentMethod }),
      });
      toast.success(`Saved ${qty.toLocaleString()} ${selectedVariety.name} seedlings`);
      setRequestId(crypto.randomUUID());
      setQuantity("100");
      await qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] });
    } catch (error: any) {
      toast.error(error?.message || "Could not save the entry. Retry without changing the entry to avoid duplicates.");
    } finally {
      setSaving(false);
    }
  }

  async function createVariety(event: React.FormEvent) {
    event.preventDefault();
    if (!newName.trim()) { toast.error("Enter a variety name."); return; }
    setAddingVariety(true);
    try {
      const created = await customFetch("/api/nursery/varieties", {
        method: "POST",
        body: JSON.stringify({ name: newName.trim(), defaultPrice: Number(newPrice) }),
      }) as Variety;
      setNewName("");
      setNewPrice("0");
      setVarietyId(created.id);
      setUnitPrice(String(created.defaultPrice));
      await qc.invalidateQueries({ queryKey: ["/api/nursery/varieties", shopId] });
      toast.success("Seedling variety added.");
    } catch (error: any) {
      toast.error(error?.message || "Could not add variety.");
    } finally { setAddingVariety(false); }
  }

  async function toggleVariety(variety: Variety) {
    try {
      await customFetch(`/api/nursery/varieties/${variety.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !Boolean(variety.isActive) }),
      });
      await qc.invalidateQueries({ queryKey: ["/api/nursery/varieties", shopId] });
      toast.success(Boolean(variety.isActive) ? "Variety archived." : "Variety reactivated.");
    } catch (error: any) { toast.error(error?.message || "Could not update variety."); }
  }

  function choosePeriod(period: "day" | "week" | "month") {
    const end = businessDate;
    const start = period === "day" ? end : period === "week"
      ? addDays(end, -((new Date(end + "T12:00:00").getDay() + 6) % 7))
      : end.slice(0, 7) + "-01";
    setFrom(start); setTo(end);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 pb-10 md:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-600"><Sprout className="h-7 w-7" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Nursery Sales Register</h1>
            <p className="mt-1 text-sm text-muted-foreground">Record seedling quantities and track cash and M-Pesa totals. No stock is deducted.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Label htmlFor="business-date" className="whitespace-nowrap">Sales date</Label>
          <Input id="business-date" type="date" className="w-auto" value={businessDate} onChange={e => { setBusinessDate(e.target.value); setFrom(e.target.value); setTo(e.target.value); }} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600"><Leaf className="h-5 w-5" /></div>
          <div><p className="text-xs text-muted-foreground">Seedlings sold that day</p><p className="text-2xl font-bold tabular-nums">{todaySummary.quantity.toLocaleString()}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Banknote className="h-5 w-5" /></div>
          <div><p className="text-xs text-muted-foreground">Daily sales total</p><p className="text-2xl font-bold tabular-nums">{formatKES(cents(todaySummary.revenueCents))}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600"><Banknote className="h-5 w-5" /></div>
          <div><p className="text-xs text-muted-foreground">Cash</p><p className="text-xl font-bold tabular-nums">{formatKES(cents(todaySummary.cashCents))}</p></div>
        </CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-sky-500/10 p-2.5 text-sky-600"><Smartphone className="h-5 w-5" /></div>
          <div><p className="text-xs text-muted-foreground">M-Pesa</p><p className="text-xl font-bold tabular-nums">{formatKES(cents(todaySummary.mpesaCents))}</p></div>
        </CardContent></Card>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-600" /> Record seedling sales</CardTitle></CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={saveEntry}>
              <div className="space-y-2">
                <Label htmlFor="variety">Seedling variety</Label>
                <select id="variety" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={selectedVariety?.id ?? ""} onChange={e => { const v = varieties.find(item => item.id === e.target.value); setVarietyId(e.target.value); setUnitPrice(v ? String(v.defaultPrice) : ""); }} required>
                  {varieties.length === 0 && <option value="">Add a variety below first</option>}
                  {varieties.map(v => <option key={v.id} value={v.id}>{v.name} · default {formatKES(v.defaultPrice)}</option>)}
                </select>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="quantity">Quantity sold</Label><Input id="quantity" type="number" min="1" step="1" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} required /></div>
                <div className="space-y-2"><Label htmlFor="price">Price per seedling (KES)</Label><Input id="price" type="number" min="0" step="0.01" value={unitPrice === "" && selectedVariety ? String(selectedVariety.defaultPrice) : unitPrice} onChange={e => setUnitPrice(e.target.value)} required /><p className="text-xs text-muted-foreground">Editable for this entry only; the saved default stays unchanged.</p></div>
              </div>
              <div className="space-y-2">
                <Label>Payment method</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPaymentMethod("cash")} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${paymentMethod === "cash" ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground hover:bg-muted/60"}`}><Banknote className="h-4 w-4" /> Cash</button>
                  <button type="button" onClick={() => setPaymentMethod("mpesa")} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${paymentMethod === "mpesa" ? "border-sky-600 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "border-border text-muted-foreground hover:bg-muted/60"}`}><Smartphone className="h-4 w-4" /> M-Pesa</button>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-muted/50 p-4">
                <div><p className="text-sm text-muted-foreground">Entry total</p><p className="text-2xl font-bold tabular-nums">{formatKES((Number(quantity) || 0) * Number(unitPrice === "" ? selectedVariety?.defaultPrice ?? 0 : unitPrice))}</p></div>
                <Button type="submit" disabled={saving || varieties.length === 0 || !navigator.onLine} className="gap-2"><CheckCircle2 className="h-4 w-4" />{saving ? "Saving…" : "Save entry"}</Button>
              </div>
              {!navigator.onLine && <p className="text-xs text-amber-600">Offline: connect before saving. This register does not queue offline entries yet.</p>}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-emerald-600" /> Manage varieties</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={createVariety} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
              <div className="space-y-1"><Label htmlFor="new-name">Variety name</Label><Input id="new-name" placeholder="e.g. Cabbage" value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} required /></div>
              <div className="space-y-1"><Label htmlFor="new-price">Default price (KES)</Label><Input id="new-price" type="number" min="0" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} required /></div>
              <div className="flex items-end"><Button type="submit" disabled={addingVariety} className="w-full gap-1"><Plus className="h-4 w-4" /> Add</Button></div>
            </form>
            <div className="space-y-2">
              {(varietiesQuery.data ?? []).length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Add cabbage, spinach or any seedling varieties sold by this shop.</p>}
              {(varietiesQuery.data ?? []).map(v => <div key={v.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0"><p className="truncate font-semibold">{v.name}</p><p className="text-sm text-muted-foreground">Default: {formatKES(v.defaultPrice)} each · {Boolean(v.isActive) ? "Active" : "Archived"}</p></div>
                <Button type="button" variant="outline" size="sm" onClick={() => toggleVariety(v)} className="shrink-0 gap-1"><Archive className="h-3.5 w-3.5" />{Boolean(v.isActive) ? "Archive" : "Restore"}</Button>
              </div>)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Sales report</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => choosePeriod("day")}>Day</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => choosePeriod("week")}>This week</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => choosePeriod("month")}>This month</Button>
              <div className="flex items-center gap-2"><Label htmlFor="report-from" className="text-xs">From</Label><Input id="report-from" type="date" className="w-auto" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div className="flex items-center gap-2"><Label htmlFor="report-to" className="text-xs">To</Label><Input id="report-to" type="date" className="w-auto" value={to} min={from} onChange={e => setTo(e.target.value)} /></div>
              <Button type="button" size="icon" variant="ghost" aria-label="Refresh report" onClick={() => qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] })}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {reportQuery.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading report…</p> : reportQuery.isError ? <p className="py-8 text-center text-sm text-destructive">Could not load report. Check your connection and try refreshing.</p> : reportRows.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No seedling sales found for this date range.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-3">Date</th><th className="px-3 py-3">Variety</th><th className="px-3 py-3 text-right">Qty</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3">Payment</th><th className="px-3 py-3 text-right">Total</th></tr></thead>
                <tbody>{reportRows.map((row, index) => <tr key={`${row.businessDate}-${row.varietyId}-${row.unitPriceCents}-${row.paymentMethod}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30"><td className="whitespace-nowrap px-3 py-3">{row.businessDate}</td><td className="px-3 py-3 font-medium">{row.varietyName}</td><td className="px-3 py-3 text-right tabular-nums">{Number(row.quantity).toLocaleString()}</td><td className="px-3 py-3 text-right tabular-nums">{formatKES(cents(row.unitPriceCents))}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.paymentMethod === "cash" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-sky-500/10 text-sky-700 dark:text-sky-300"}`}>{row.paymentMethod === "mpesa" ? "M-Pesa" : "Cash"}</span></td><td className="px-3 py-3 text-right font-semibold tabular-nums">{formatKES(cents(row.totalAmountCents))}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Totals are aggregated in D1 by shop, date, variety, price and payment method. Customer-level transactions are not stored.</p>
        </CardContent>
      </Card>
    </div>
  );
}
