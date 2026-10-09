import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKES } from "@/lib/format";
import { loadCachedNurseryVarieties, saveNurseryVarietiesToCache } from "@/lib/nursery-db";
import { CustomerAutocomplete, type SelectedCustomer } from "@/components/customer-autocomplete";
import { Sprout, Plus, CalendarDays, Banknote, Smartphone, Leaf, RefreshCw, Archive, CheckCircle2, CreditCard, Users, TrendingUp, ClipboardList, PackagePlus, ArrowUpRight, Pencil, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Variety = { id: string; name: string; defaultPrice: number; isActive: number | boolean };
type ReportRow = {
  businessDate: string; varietyId: string; varietyName: string; unitPriceCents: number;
  paymentMethod: "cash" | "mpesa" | "credit"; quantity: number; totalAmountCents: number;
};
type ReportData = {
  rows: ReportRow[];
  summary: { totalSeedlings: number; totalRevenueCents: number; cashCents: number; mpesaCents: number; creditCents: number };
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
type CustomerInsightRow = { customerKey: string; customerName: string; customerPhone: string; varietyName: string; quantity: number; totalAmountCents: number; lastPurchase: string };
type IndividualSaleEntry = { id: string; requestId: string; businessDate: string; varietyName: string; customerName: string; customerPhone: string; quantity: number; unitPriceCents: number; totalAmountCents: number; paymentMethod: "cash" | "mpesa" | "credit"; debtId: string | null; createdAt: string };

export default function NurseryRegister() {
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [businessDate, setBusinessDate] = useState(localDate());
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const [varietyId, setVarietyId] = useState("");
  const [quantity, setQuantity] = useState("100");
  const [unitPrice, setUnitPrice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "credit">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("0");
  const [saving, setSaving] = useState(false);
  const [addingVariety, setAddingVariety] = useState(false);
  const [editingVarietyId, setEditingVarietyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPrice, setEditingPrice] = useState("");
  const [busyVarietyId, setBusyVarietyId] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());

  const varietiesQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId],
    queryFn: () => customFetch("/api/nursery/varieties") as Promise<Variety[]>,
    enabled: !!shopId,
  });

  // Seed the catalogue from IndexedDB immediately, then let the API reconcile it.
  useEffect(() => {
    if (!shopId) return;
    let cancelled = false;
    loadCachedNurseryVarieties(shopId).then((cached) => {
      if (cancelled || !cached.length) return;
      if (!qc.getQueryData<Variety[]>(["/api/nursery/varieties", shopId])) {
        qc.setQueryData(["/api/nursery/varieties", shopId], cached);
      }
    });
    return () => { cancelled = true; };
  }, [shopId, qc]);

  useEffect(() => {
    if (varietiesQuery.data) void saveNurseryVarietiesToCache(shopId, varietiesQuery.data);
  }, [shopId, varietiesQuery.data]);
  const individualEntriesQuery = useQuery({
    queryKey: ["/api/nursery/entries", shopId, from, to],
    queryFn: () => customFetch("/api/nursery/entries?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&limit=300") as Promise<{ rows: IndividualSaleEntry[] }>,
    enabled: !!shopId && !!from && !!to && from <= to,
  });
  const customerInsightsQuery = useQuery({
    queryKey: ["/api/nursery/customer-insights", shopId, from, to],
    queryFn: () => customFetch(`/api/nursery/customer-insights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) as Promise<{ rows: CustomerInsightRow[] }>,
    enabled: !!shopId && !!from && !!to && from <= to,
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
    creditCents: sum.creditCents + (row.paymentMethod === "credit" ? Number(row.totalAmountCents || 0) : 0),
  }), { quantity: 0, revenueCents: 0, cashCents: 0, mpesaCents: 0, creditCents: 0 }), [dateRows]);

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!selectedVariety) { toast.error("Add a seedling variety first."); return; }
    if (paymentMethod === "credit" && !customerName.trim()) { toast.error("Choose or enter the customer for a credit sale."); return; }
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
        body: JSON.stringify({ requestId, businessDate, varietyId: selectedVariety.id, quantity: qty, unitPrice: price, paymentMethod, customerName: customerName.trim() || undefined, customerPhone: customerPhone.trim() || undefined }),
      });
      toast.success(`Saved ${qty.toLocaleString()} ${selectedVariety.name} seedlings`);
      setRequestId(crypto.randomUUID());
      setQuantity("100");
      setCustomerName("");
      setCustomerPhone("");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/customer-insights", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/entries", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/debts"] }),
        qc.invalidateQueries({ queryKey: ["/api/crm"] }),
      ]);
    } catch (error: any) {
      toast.error(error?.message || "Could not save the entry. Retry without changing the entry to avoid duplicates.");
    } finally {
      setSaving(false);
    }
  }

  async function createVariety(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim().replace(/\\s+/g, " ");
    const price = Number(newPrice);
    if (!name) { toast.error("Enter a variety name."); return; }
    if (!Number.isFinite(price) || price < 0 || price > 1000000) { toast.error("Enter a valid price."); return; }
    const key = ["/api/nursery/varieties", shopId] as const;
    const previous = qc.getQueryData<Variety[]>(key) ?? [];
    const tempId = "local-" + crypto.randomUUID();
    const optimistic: Variety = { id: tempId, name, defaultPrice: price, isActive: 1 };
    const next = [optimistic, ...previous];
    qc.setQueryData(key, next);
    void saveNurseryVarietiesToCache(shopId, next);
    setNewName("");
    setNewPrice("0");
    setVarietyId(tempId);
    setUnitPrice(String(price));
    setAddingVariety(true);
    try {
      const created = await customFetch("/api/nursery/varieties", {
        method: "POST",
        body: JSON.stringify({ name, defaultPrice: price }),
      }) as Variety;
      const current = qc.getQueryData<Variety[]>(key) ?? [];
      const reconciled = current.some(v => v.id === tempId)
        ? current.map(v => v.id === tempId ? created : v)
        : [created, ...current.filter(v => v.id !== created.id)];
      qc.setQueryData(key, reconciled);
      void saveNurseryVarietiesToCache(shopId, reconciled);
      setVarietyId(created.id);
      setUnitPrice(String(created.defaultPrice));
      toast.success("Seedling variety added.");
    } catch (error: any) {
      qc.setQueryData(key, previous);
      void saveNurseryVarietiesToCache(shopId, previous);
      if (varietyId === tempId) setVarietyId(previous.find(v => Boolean(v.isActive))?.id ?? "");
      toast.error(error?.message || "Could not add variety. The local change was reverted.");
    } finally { setAddingVariety(false); }
  }

  function beginEditVariety(variety: Variety) {
    setEditingVarietyId(variety.id);
    setEditingName(variety.name);
    setEditingPrice(String(variety.defaultPrice));
  }

  async function saveVarietyEdit(variety: Variety) {
    const name = editingName.trim().replace(/\\s+/g, " ");
    const price = Number(editingPrice);
    if (!name || name.length > 80) { toast.error("Variety name must be 1–80 characters."); return; }
    if (!Number.isFinite(price) || price < 0 || price > 1000000) { toast.error("Enter a valid price."); return; }
    const key = ["/api/nursery/varieties", shopId] as const;
    const previous = qc.getQueryData<Variety[]>(key) ?? [];
    const optimistic = previous.map(v => v.id === variety.id ? { ...v, name, defaultPrice: price } : v);
    qc.setQueryData(key, optimistic);
    void saveNurseryVarietiesToCache(shopId, optimistic);
    setEditingVarietyId(null);
    setBusyVarietyId(variety.id);
    try {
      const updated = await customFetch(`/api/nursery/varieties/${encodeURIComponent(variety.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name, defaultPrice: price }),
      }) as Variety;
      const current = qc.getQueryData<Variety[]>(key) ?? [];
      const reconciled = current.map(v => v.id === variety.id ? updated : v);
      qc.setQueryData(key, reconciled);
      void saveNurseryVarietiesToCache(shopId, reconciled);
      toast.success("Variety updated.");
    } catch (error: any) {
      qc.setQueryData(key, previous);
      void saveNurseryVarietiesToCache(shopId, previous);
      toast.error(error?.message || "Could not update variety. The local change was reverted.");
    } finally { setBusyVarietyId(null); }
  }

  async function toggleVariety(variety: Variety) {
    const key = ["/api/nursery/varieties", shopId] as const;
    const previous = qc.getQueryData<Variety[]>(key) ?? [];
    const isActive = !Boolean(variety.isActive);
    const optimistic = previous.map(v => v.id === variety.id ? { ...v, isActive: isActive ? 1 : 0 } : v);
    qc.setQueryData(key, optimistic);
    void saveNurseryVarietiesToCache(shopId, optimistic);
    setBusyVarietyId(variety.id);
    try {
      const updated = await customFetch(`/api/nursery/varieties/${encodeURIComponent(variety.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }) as Variety;
      const current = qc.getQueryData<Variety[]>(key) ?? [];
      const reconciled = current.map(v => v.id === variety.id ? updated : v);
      qc.setQueryData(key, reconciled);
      void saveNurseryVarietiesToCache(shopId, reconciled);
      toast.success(isActive ? "Variety restored." : "Variety archived.");
    } catch (error: any) {
      qc.setQueryData(key, previous);
      void saveNurseryVarietiesToCache(shopId, previous);
      toast.error(error?.message || "Could not update variety. The local change was reverted.");
    } finally { setBusyVarietyId(null); }
  }

  async function deleteVariety(variety: Variety) {
    const key = ["/api/nursery/varieties", shopId] as const;
    const previous = qc.getQueryData<Variety[]>(key) ?? [];
    const remaining = previous.filter(v => v.id !== variety.id);
    qc.setQueryData(key, remaining);
    void saveNurseryVarietiesToCache(shopId, remaining);
    if (varietyId === variety.id) {
      setVarietyId(remaining.find(v => Boolean(v.isActive))?.id ?? "");
      setUnitPrice("");
    }
    setBusyVarietyId(variety.id);
    try {
      const result = await customFetch(`/api/nursery/varieties/${encodeURIComponent(variety.id)}`, { method: "DELETE" }) as { deleted?: boolean; archived?: boolean };
      const current = qc.getQueryData<Variety[]>(key) ?? [];
      const finalRows = result.archived
        ? [...current, { ...variety, isActive: 0 }]
        : current.filter(v => v.id !== variety.id);
      qc.setQueryData(key, finalRows);
      void saveNurseryVarietiesToCache(shopId, finalRows);
      toast.success(result.archived ? "This variety has sales history, so it was archived to preserve reports." : "Variety deleted.");
    } catch (error: any) {
      qc.setQueryData(key, previous);
      void saveNurseryVarietiesToCache(shopId, previous);
      toast.error(error?.message || "Could not delete variety. The local change was reverted.");
    } finally { setBusyVarietyId(null); }
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
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
        <Card><CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-violet-500/10 p-2.5 text-violet-600"><CreditCard className="h-5 w-5" /></div>
          <div><p className="text-xs text-muted-foreground">Sold on credit</p><p className="text-xl font-bold tabular-nums">{formatKES(cents(todaySummary.creditCents))}</p></div>
        </CardContent></Card>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)]">
        <Card>
          <CardHeader className="rounded-t-xl border-b border-emerald-500/15 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent pb-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm"><PackagePlus className="h-5 w-5" /></div><div className="min-w-0 flex-1"><CardTitle className="text-lg">New seedling sale</CardTitle><p className="mt-1 text-sm font-normal text-muted-foreground">Enter the quantity, price and how the customer paid.</p></div><span className="rounded-full border border-emerald-600/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Sales entry</span></div></CardHeader>
          <CardContent className="space-y-4 pt-5">
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
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setPaymentMethod("cash")} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${paymentMethod === "cash" ? "border-emerald-600 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border text-muted-foreground hover:bg-muted/60"}`}><Banknote className="h-4 w-4" /> Cash</button>
                  <button type="button" onClick={() => setPaymentMethod("mpesa")} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${paymentMethod === "mpesa" ? "border-sky-600 bg-sky-500/10 text-sky-700 dark:text-sky-300" : "border-border text-muted-foreground hover:bg-muted/60"}`}><Smartphone className="h-4 w-4" /> M-Pesa</button>
                  <button type="button" onClick={() => setPaymentMethod("credit")} className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-colors ${paymentMethod === "credit" ? "border-violet-600 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border text-muted-foreground hover:bg-muted/60"}`}><CreditCard className="h-4 w-4" /> Credit</button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Customer (optional for cash / M-Pesa; required for credit)</Label>
                <CustomerAutocomplete
                  shopId={shopId}
                  value={customerName}
                  onChange={setCustomerName}
                  onSelect={(customer: SelectedCustomer) => { setCustomerName(customer.name); setCustomerPhone(customer.phone); }}
                  placeholder="Search existing customer or enter a name"
                />
                <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone number (optional)" type="tel" />
                {paymentMethod === "credit" && <p className="text-xs text-violet-700 dark:text-violet-300">This creates a debt in the existing Debts and Customers screens. No inventory is deducted.</p>}
              </div>
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-600/15 bg-gradient-to-br from-emerald-500/10 to-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm text-muted-foreground">Entry total</p><p className="text-2xl font-bold tabular-nums">{formatKES((Number(quantity) || 0) * Number(unitPrice === "" ? selectedVariety?.defaultPrice ?? 0 : unitPrice))}</p></div>
                <Button type="submit" disabled={saving || varieties.length === 0 || !navigator.onLine} className="h-11 gap-2 px-5 shadow-sm"><CheckCircle2 className="h-4 w-4" />{saving ? "Saving sale…" : "Record sale"}<ArrowUpRight className="h-4 w-4" /></Button>
              </div>
              {!navigator.onLine && <p className="text-xs text-amber-600">Offline: connect before saving. This register does not queue offline entries yet.</p>}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="rounded-t-xl border-b border-sky-500/15 bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent pb-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-sky-600 p-2.5 text-white shadow-sm"><Sprout className="h-5 w-5" /></div><div className="min-w-0 flex-1"><CardTitle className="text-lg">Seedling catalogue</CardTitle><p className="mt-1 text-sm font-normal text-muted-foreground">Set up varieties and their usual selling prices.</p></div><span className="rounded-full border border-sky-600/20 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">{(varietiesQuery.data ?? []).filter(v => Boolean(v.isActive)).length} active</span></div></CardHeader>
          <CardContent className="space-y-4 pt-5">
            <form onSubmit={createVariety} className="rounded-xl border border-dashed border-sky-600/30 bg-sky-500/[0.04] p-3"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-sky-600" /> Add a seedling variety</div><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px_auto]">
              <div className="space-y-1"><Label htmlFor="new-name">Variety name</Label><Input id="new-name" placeholder="e.g. Cabbage" value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} required /></div>
              <div className="space-y-1"><Label htmlFor="new-price">Default price (KES)</Label><Input id="new-price" type="number" min="0" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} required /></div>
              <div className="flex items-end"><Button type="submit" disabled={addingVariety} className="w-full gap-1 bg-sky-600 text-white hover:bg-sky-700"><Plus className="h-4 w-4" /> Add</Button></div>
            </div></form>
            <div className="space-y-2">
              {(varietiesQuery.data ?? []).length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Add cabbage, spinach or any seedling varieties sold by this shop.</p>}
              {(varietiesQuery.data ?? []).map(v => <div key={v.id} className="group rounded-xl border border-border bg-card p-3 transition-colors hover:border-sky-600/30 hover:bg-sky-500/[0.03]">
                {editingVarietyId === v.id ? (
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                    <div className="space-y-1"><Label htmlFor={`edit-name-${v.id}`}>Variety name</Label><Input id={`edit-name-${v.id}`} value={editingName} onChange={e => setEditingName(e.target.value)} maxLength={80} autoFocus /></div>
                    <div className="space-y-1"><Label htmlFor={`edit-price-${v.id}`}>Default price (KES)</Label><Input id={`edit-price-${v.id}`} type="number" min="0" step="0.01" value={editingPrice} onChange={e => setEditingPrice(e.target.value)} /></div>
                    <div className="flex items-end gap-1"><Button type="button" size="sm" disabled={busyVarietyId === v.id} onClick={() => saveVarietyEdit(v)} className="gap-1"><Save className="h-3.5 w-3.5" /> Save</Button><Button type="button" size="icon" variant="ghost" aria-label="Cancel editing" onClick={() => setEditingVarietyId(null)}><X className="h-4 w-4" /></Button></div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{v.name}</p><p className="text-sm text-muted-foreground">Default: {formatKES(v.defaultPrice)} each · {Boolean(v.isActive) ? "Active" : "Archived"}</p></div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button type="button" variant="outline" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => beginEditVariety(v)} className="gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                      <Button type="button" variant="outline" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => toggleVariety(v)} className="gap-1"><Archive className="h-3.5 w-3.5" />{Boolean(v.isActive) ? "Archive" : "Restore"}</Button>
                      <Button type="button" variant="destructive" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => { if (window.confirm(`Delete ${v.name}? Varieties with sales history will be archived instead.`)) void deleteVariety(v); }} className="gap-1"><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
                    </div>
                  </div>
                )}
              </div>)}
            </div>
          </CardContent>
        </Card>
      </div>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-600" /> Customer buying insights</CardTitle>
          <p className="text-sm text-muted-foreground">Customers who were named during entry, ranked by seedling spend for the selected report period.</p>
        </CardHeader>
        <CardContent>
          {customerInsightsQuery.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Loading customer insights…</p>
            : customerInsightsQuery.isError ? <p className="py-6 text-center text-sm text-destructive">Could not load customer insights.</p>
            : !customerInsightsQuery.data?.rows?.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No named customer purchases in this date range yet. Add a customer to a sale to start seeing buying patterns.</p>
            : (() => {
              const grouped = new Map<string, { name: string; phone: string; quantity: number; totalCents: number; lastPurchase: string; varieties: Map<string, number> }>();
              for (const row of customerInsightsQuery.data.rows) {
                const item = grouped.get(row.customerKey) ?? { name: row.customerName, phone: row.customerPhone, quantity: 0, totalCents: 0, lastPurchase: row.lastPurchase, varieties: new Map<string, number>() };
                item.quantity += Number(row.quantity || 0);
                item.totalCents += Number(row.totalAmountCents || 0);
                if (row.lastPurchase > item.lastPurchase) item.lastPurchase = row.lastPurchase;
                item.varieties.set(row.varietyName, (item.varieties.get(row.varietyName) ?? 0) + Number(row.quantity || 0));
                grouped.set(row.customerKey, item);
              }
              const customers = [...grouped.values()].sort((a, b) => b.totalCents - a.totalCents);
              return <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Customers buying</p><p className="text-2xl font-bold">{customers.length}</p></div>
                  <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Named seedlings sold</p><p className="text-2xl font-bold">{customers.reduce((sum, customer) => sum + customer.quantity, 0).toLocaleString()}</p></div>
                  <div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Named sales value</p><p className="text-2xl font-bold">{formatKES(customers.reduce((sum, customer) => sum + customer.totalCents, 0) / 100)}</p></div>
                </div>
                <div className="space-y-2">
                  {customers.map((customer) => {
                    const favorite = [...customer.varieties.entries()].sort((a, b) => b[1] - a[1])[0];
                    return <div key={customer.name.toLowerCase()} className="flex flex-col gap-2 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold">{customer.name}</p>
                        <p className="text-xs text-muted-foreground">{customer.phone || "No phone recorded"} · Last purchase {customer.lastPurchase}</p>
                        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> Most purchased: {favorite?.[0] ?? "—"} ({favorite?.[1].toLocaleString() ?? "0"} seedlings)</p>
                      </div>
                      <div className="sm:text-right"><p className="text-lg font-bold tabular-nums">{formatKES(customer.totalCents / 100)}</p><p className="text-xs text-muted-foreground">{customer.quantity.toLocaleString()} seedlings</p></div>
                    </div>;
                  })}
                </div>
              </div>;
            })()}
        </CardContent>
      </Card>


      <Card>
        <CardHeader className="border-b border-border/70 bg-muted/20">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-indigo-500/10 p-2.5 text-indigo-600 dark:text-indigo-300"><ClipboardList className="h-5 w-5" /></div>
              <div><CardTitle>Individual sales</CardTitle><p className="mt-1 text-sm font-normal text-muted-foreground">Every recorded sale, not just daily totals.</p></div>
            </div>
            <span className="w-fit rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">{individualEntriesQuery.data?.rows?.length ?? 0} entries shown</span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {individualEntriesQuery.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading individual sales…</p>
            : individualEntriesQuery.isError ? <p className="py-8 text-center text-sm text-destructive">Could not load individual sales. Refresh and try again.</p>
            : !individualEntriesQuery.data?.rows?.length ? <div className="rounded-xl border border-dashed p-8 text-center"><ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/60" /><p className="mt-2 font-medium">No individual entries in this period</p><p className="mt-1 text-sm text-muted-foreground">New sales will appear here after this feature is deployed. Older records remain available in the aggregated sales report.</p></div>
            : <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-3">Date / time</th><th className="px-3 py-3">Seedlings / customer</th><th className="px-3 py-3 text-right">Quantity</th><th className="px-3 py-3 text-right">Unit price</th><th className="px-3 py-3">Payment</th><th className="px-3 py-3 text-right">Sale total</th></tr></thead>
                <tbody>{individualEntriesQuery.data.rows.map((entry) => <tr key={entry.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-3"><p>{entry.businessDate}</p><p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></td>
                  <td className="px-3 py-3"><p className="font-semibold">{entry.varietyName}</p><p className="text-xs text-muted-foreground">{entry.customerName || "Walk-in customer"}{entry.customerPhone ? " · " + entry.customerPhone : ""}</p></td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{Number(entry.quantity).toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatKES(cents(entry.unitPriceCents))}</td>
                  <td className="px-3 py-3"><span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + (entry.paymentMethod === "cash" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : entry.paymentMethod === "mpesa" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300")}>{entry.paymentMethod === "mpesa" ? "M-Pesa" : entry.paymentMethod === "credit" ? "Credit" : "Cash"}</span></td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{formatKES(cents(entry.totalAmountCents))}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          <p className="mt-3 text-xs text-muted-foreground">Showing up to 300 individual entries for the selected date range. Use the report date filters to narrow the list.</p>
        </CardContent>
      </Card>

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
                <tbody>{reportRows.map((row, index) => <tr key={`${row.businessDate}-${row.varietyId}-${row.unitPriceCents}-${row.paymentMethod}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/30"><td className="whitespace-nowrap px-3 py-3">{row.businessDate}</td><td className="px-3 py-3 font-medium">{row.varietyName}</td><td className="px-3 py-3 text-right tabular-nums">{Number(row.quantity).toLocaleString()}</td><td className="px-3 py-3 text-right tabular-nums">{formatKES(cents(row.unitPriceCents))}</td><td className="px-3 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.paymentMethod === "cash" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : row.paymentMethod === "mpesa" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300"}`}>{row.paymentMethod === "mpesa" ? "M-Pesa" : row.paymentMethod === "credit" ? "Credit" : "Cash"}</span></td><td className="px-3 py-3 text-right font-semibold tabular-nums">{formatKES(cents(row.totalAmountCents))}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Shop/date/variety/payment totals are aggregated in D1. Named customer purchases are also summarized by customer and variety; credit sales create a linked customer debt.</p>
        </CardContent>
      </Card>
    </div>
  );
}
