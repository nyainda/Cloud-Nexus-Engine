import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import { CustomerAutocomplete, type SelectedCustomer } from "@/components/customer-autocomplete";
import { Sprout, Plus, CalendarDays, Banknote, Smartphone, Leaf, RefreshCw, Archive, CheckCircle2, CreditCard, Users, TrendingUp, ClipboardList, PackagePlus, ArrowUpRight, Pencil, Save, X, Trash2, Search, SlidersHorizontal, ReceiptText, CircleDollarSign, ChevronDown, ShoppingCart, BarChart3, Boxes, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";

type Variety = { id: string; name: string; category: string; defaultPrice: number; isActive: number | boolean };
type VarietyListData = { rows: Variety[]; total: number; page: number; pageSize: number; categories: string[] };
type ReportRow = {
  varietyId: string; varietyName: string; quantity: number; totalAmountCents: number;
  cashCents: number; mpesaCents: number; creditCents: number;
};
type ReportData = {
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: { totalSeedlings: number; totalRevenueCents: number; cashCents: number; mpesaCents: number; creditCents: number };
  dailySummary: { totalSeedlings: number; totalRevenueCents: number; cashCents: number; mpesaCents: number; creditCents: number };
};
type EntriesData = { rows: IndividualSaleEntry[]; total: number; page: number; pageSize: number; summary: { quantity: number; totalCents: number; creditCents: number } };
type MonthlyCategory = { category: string; seedlingsSold: number; totalRevenueCents: number; varietyCount: number; cashCents: number; mpesaCents: number; creditCents: number };
type MonthlySummaryData = { month: string; from: string; to: string; categories: MonthlyCategory[]; summary: { seedlingsSold: number; totalRevenueCents: number } };
type NurseryTab = "overview" | "record" | "catalogue" | "insights" | "sales" | "reports";

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
type IndividualSaleEntry = { id: string; requestId: string; businessDate: string; varietyId: string; varietyName: string; customerName: string; customerPhone: string; quantity: number; unitPriceCents: number; totalAmountCents: number; paymentMethod: "cash" | "mpesa" | "credit"; debtId: string | null; createdAt: string };

function useDebouncedValue<T>(value: T, delayMs = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);
  return debounced;
}

function varietyListUrl({ status, search, category, page, pageSize }: { status: "active" | "archived" | "all"; search: string; category?: string; page: number; pageSize: number }) {
  const params = new URLSearchParams({ status, page: String(page), pageSize: String(pageSize) });
  if (search.trim()) params.set("search", search.trim());
  if (category) params.set("category", category);
  return `/api/nursery/varieties?${params.toString()}`;
}

export default function NurseryRegister() {
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [activeTab, setActiveTab] = useState<NurseryTab>("overview");
  const [businessDate, setBusinessDate] = useState(localDate());
  const [from, setFrom] = useState(localDate());
  const [to, setTo] = useState(localDate());
  const [selectedMonth, setSelectedMonth] = useState(localDate().slice(0, 7));
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "credit">("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("0");
  const [newCategory, setNewCategory] = useState("Uncategorized");
  const [saving, setSaving] = useState(false);
  const [addingVariety, setAddingVariety] = useState(false);
  const [editingVarietyId, setEditingVarietyId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPrice, setEditingPrice] = useState("");
  const [editingCategory, setEditingCategory] = useState("");
  const [busyVarietyId, setBusyVarietyId] = useState<string | null>(null);
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [saleEdit, setSaleEdit] = useState({ businessDate: "", varietyId: "", quantity: "", unitPrice: "", paymentMethod: "cash" as "cash" | "mpesa" | "credit", customerName: "", customerPhone: "" });
  const [saleEditSearch, setSaleEditSearch] = useState("");
  const [busySaleId, setBusySaleId] = useState<string | null>(null);
  const [catalogueExpanded, setCatalogueExpanded] = useState(false);
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueStatus, setCatalogueStatus] = useState<"active" | "archived" | "all">("active");
  const [catalogueCategory, setCatalogueCategory] = useState("");
  const [cataloguePage, setCataloguePage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [cart, setCart] = useState<Array<{ requestId: string; varietyId: string; name: string; quantity: string; unitPrice: string }>>([]);
  const [saleSearch, setSaleSearch] = useState("");
  const [salePaymentFilter, setSalePaymentFilter] = useState<"all" | "cash" | "mpesa" | "credit">("all");
  const [salesPage, setSalesPage] = useState(1);
  const [reportPage, setReportPage] = useState(1);
  const salesPageSize = 25;
  const reportPageSize = 20;
  const debouncedCatalogueSearch = useDebouncedValue(catalogueSearch);
  const debouncedProductSearch = useDebouncedValue(productSearch);
  const debouncedSaleSearch = useDebouncedValue(saleSearch);
  const debouncedSaleEditSearch = useDebouncedValue(saleEditSearch);

  const catalogueQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId, "catalogue", catalogueStatus, catalogueCategory, debouncedCatalogueSearch, cataloguePage],
    queryFn: () => customFetch(varietyListUrl({ status: catalogueStatus, category: catalogueCategory, search: debouncedCatalogueSearch, page: cataloguePage, pageSize: 30 })) as Promise<VarietyListData>,
    enabled: !!shopId && activeTab === "catalogue",
    placeholderData: previous => previous,
  });
  const saleVarietiesQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId, "sale", productCategory, debouncedProductSearch],
    queryFn: () => customFetch(varietyListUrl({ status: "active", category: productCategory, search: debouncedProductSearch, page: 1, pageSize: 10 })) as Promise<VarietyListData>,
    enabled: !!shopId && activeTab === "record",
    placeholderData: previous => previous,
  });
  const saleEditVarietiesQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId, "sale-edit", debouncedSaleEditSearch],
    queryFn: () => customFetch(varietyListUrl({ status: "all", search: debouncedSaleEditSearch, page: 1, pageSize: 100 })) as Promise<VarietyListData>,
    enabled: !!shopId && activeTab === "sales" && !!editingSaleId,
    placeholderData: previous => previous,
  });
  const individualEntriesQuery = useQuery({
    queryKey: ["/api/nursery/entries", shopId, from, to, salesPage, salesPageSize, debouncedSaleSearch, salePaymentFilter],
    queryFn: () => customFetch("/api/nursery/entries?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&page=" + salesPage + "&pageSize=" + salesPageSize + "&search=" + encodeURIComponent(debouncedSaleSearch.trim()) + "&payment=" + salePaymentFilter) as Promise<EntriesData>,
    enabled: !!shopId && activeTab === "sales" && !!from && !!to && from <= to,
    placeholderData: previous => previous,
  });
  const customerInsightsQuery = useQuery({
    queryKey: ["/api/nursery/customer-insights", shopId, from, to],
    queryFn: () => customFetch(`/api/nursery/customer-insights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) as Promise<{ rows: CustomerInsightRow[] }>,
    enabled: !!shopId && activeTab === "insights" && !!from && !!to && from <= to,
  });
  const reportQuery = useQuery({
    queryKey: ["/api/nursery/report", shopId, from, to, businessDate, reportPage, reportPageSize],
    queryFn: () => customFetch(`/api/nursery/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&businessDate=${encodeURIComponent(businessDate)}&page=${reportPage}&pageSize=${reportPageSize}`) as Promise<ReportData>,
    enabled: !!shopId && activeTab === "reports" && !!from && !!to && from <= to,
    placeholderData: previous => previous,
  });
  const monthlySummaryQuery = useQuery({
    queryKey: ["/api/nursery/monthly-summary", shopId, selectedMonth],
    queryFn: () => customFetch(`/api/nursery/monthly-summary?month=${encodeURIComponent(selectedMonth)}`) as Promise<MonthlySummaryData>,
    enabled: !!shopId && activeTab === "overview" && /^\d{4}-\d{2}$/.test(selectedMonth),
  });

  const varieties = saleVarietiesQuery.data?.rows ?? [];
  const matchingSaleVarieties = varieties;
  const catalogueRows = catalogueQuery.data?.rows ?? [];
  const catalogueTotal = catalogueQuery.data?.total ?? 0;
  const cataloguePageCount = Math.max(1, Math.ceil(catalogueTotal / 30));
  const catalogueStart = catalogueTotal === 0 ? 0 : (cataloguePage - 1) * 30 + 1;
  const catalogueEnd = Math.min(cataloguePage * 30, catalogueTotal);
  const catalogueCategories = catalogueQuery.data?.categories ?? [];
  const saleCategories = saleVarietiesQuery.data?.categories ?? [];
  const cartTotal = cart.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitPrice) || 0), 0);
  function addToCart(variety: Variety) {
    setCart(current => {
      const existing = current.find(item => item.varietyId === variety.id);
      if (existing) return current.map(item => item.varietyId === variety.id ? { ...item, quantity: String((Number(item.quantity) || 0) + 1) } : item);
      return [...current, { requestId: crypto.randomUUID(), varietyId: variety.id, name: variety.name, quantity: "1", unitPrice: String(variety.defaultPrice) }];
    });
    setProductSearch("");
  }
  const report = reportQuery.data;
  const reportRows = report?.rows ?? [];
  const reportTotal = report?.total ?? 0;
  const reportPageCount = Math.max(1, Math.ceil(reportTotal / reportPageSize));
  const individualEntries = individualEntriesQuery.data?.rows ?? [];
  const individualTotal = individualEntriesQuery.data?.total ?? 0;
  const individualPageCount = Math.max(1, Math.ceil(individualTotal / salesPageSize));
  const filteredIndividualEntries = individualEntries;
  const individualSaleSummary = individualEntriesQuery.data?.summary ?? { quantity: 0, totalCents: 0, creditCents: 0 };
  const monthSummary = monthlySummaryQuery.data?.summary ?? { seedlingsSold: 0, totalRevenueCents: 0 };

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!cart.length) { toast.error("Search and add at least one seedling variety."); return; }
    if (paymentMethod === "credit" && !customerName.trim()) { toast.error("Choose or enter the customer for a credit sale."); return; }
    if (!navigator.onLine) { toast.error("Connect to the internet before saving. Nursery entries are not queued offline yet."); return; }
    const prepared = cart.map(item => ({ ...item, qty: Number(item.quantity), price: Number(item.unitPrice) }));
    if (prepared.some(item => !Number.isSafeInteger(item.qty) || item.qty <= 0 || !Number.isFinite(item.price) || item.price < 0 || (paymentMethod === "credit" && item.price <= 0))) {
      toast.error("Check every cart line: quantity must be a positive whole number and each price must be valid."); return;
    }
    setSaving(true);
    const savedRequestIds = new Set<string>();
    try {
      for (let start = 0; start < prepared.length; start += 18) {
        const batch = prepared.slice(start, start + 18);
        await customFetch("/api/nursery/entries/batch", { method: "POST", body: JSON.stringify({
          businessDate,
          paymentMethod,
          customerName: customerName.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          items: batch.map(item => ({ requestId: item.requestId, varietyId: item.varietyId, quantity: item.qty, unitPrice: item.price })),
        }) });
        const completed = new Set(batch.map(item => item.requestId));
        completed.forEach(id => savedRequestIds.add(id));
        setCart(current => current.filter(item => !completed.has(item.requestId)));
      }
      toast.success(`Saved ${prepared.length} item types (${prepared.reduce((sum, item) => sum + item.qty, 0).toLocaleString()} seedlings)`);
      setCart([]); setCustomerName(""); setCustomerPhone("");
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/customer-insights", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/entries", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/monthly-summary", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/debts"] }),
        qc.invalidateQueries({ queryKey: ["/api/crm"] }),
      ]);
    } catch (error: any) {
      if (savedRequestIds.size > 0) {
        toast.error(`Saved ${savedRequestIds.size} of ${prepared.length} varieties. The unsaved lines remain in the cart and are safe to retry.`);
        await Promise.allSettled([
          qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] }),
          qc.invalidateQueries({ queryKey: ["/api/nursery/customer-insights", shopId] }),
          qc.invalidateQueries({ queryKey: ["/api/nursery/entries", shopId] }),
          qc.invalidateQueries({ queryKey: ["/api/nursery/monthly-summary", shopId] }),
          qc.invalidateQueries({ queryKey: ["/api/debts"] }),
        ]);
      } else toast.error(error?.message || "Could not save the sale. Your cart is unchanged.");
    } finally { setSaving(false); }
  }

  async function createVariety(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim().replace(/\\s+/g, " ");
    const category = newCategory.trim().replace(/\\s+/g, " ") || "Uncategorized";
    const price = Number(newPrice);
    if (!name || name.length > 80) { toast.error("Enter a variety name up to 80 characters."); return; }
    if (category.length > 60) { toast.error("Category names must be 60 characters or fewer."); return; }
    if (!Number.isFinite(price) || price < 0 || price > 1000000) { toast.error("Enter a valid price."); return; }
    setAddingVariety(true);
    try {
      await customFetch("/api/nursery/varieties", {
        method: "POST",
        body: JSON.stringify({ name, category, defaultPrice: price }),
      });
      setNewName("");
      setNewPrice("0");
      setCataloguePage(1);
      await qc.invalidateQueries({ queryKey: ["/api/nursery/varieties", shopId] });
      toast.success("Seedling variety added.");
    } catch (error: any) {
      toast.error(error?.message || "Could not add variety.");
    } finally { setAddingVariety(false); }
  }

  function beginEditVariety(variety: Variety) {
    setEditingVarietyId(variety.id);
    setEditingName(variety.name);
    setEditingPrice(String(variety.defaultPrice));
    setEditingCategory(variety.category || "Uncategorized");
  }

  async function saveVarietyEdit(variety: Variety) {
    const name = editingName.trim().replace(/\\s+/g, " ");
    const category = editingCategory.trim().replace(/\\s+/g, " ") || "Uncategorized";
    const price = Number(editingPrice);
    if (!name || name.length > 80) { toast.error("Variety name must be 1–80 characters."); return; }
    if (category.length > 60) { toast.error("Category names must be 60 characters or fewer."); return; }
    if (!Number.isFinite(price) || price < 0 || price > 1000000) { toast.error("Enter a valid price."); return; }
    setBusyVarietyId(variety.id);
    try {
      await customFetch(`/api/nursery/varieties/${encodeURIComponent(variety.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name, category, defaultPrice: price }),
      });
      setEditingVarietyId(null);
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["/api/nursery/varieties", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/monthly-summary", shopId] }),
      ]);
      toast.success("Variety updated.");
    } catch (error: any) {
      toast.error(error?.message || "Could not update variety.");
    } finally { setBusyVarietyId(null); }
  }

  async function toggleVariety(variety: Variety) {
    const isActive = !Boolean(variety.isActive);
    setBusyVarietyId(variety.id);
    try {
      await customFetch(`/api/nursery/varieties/${encodeURIComponent(variety.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      await qc.invalidateQueries({ queryKey: ["/api/nursery/varieties", shopId] });
      toast.success(isActive ? "Variety restored." : "Variety archived.");
    } catch (error: any) {
      toast.error(error?.message || "Could not update variety.");
    } finally { setBusyVarietyId(null); }
  }

  async function deleteVariety(variety: Variety) {
    setBusyVarietyId(variety.id);
    try {
      const result = await customFetch(`/api/nursery/varieties/${encodeURIComponent(variety.id)}`, { method: "DELETE" }) as { deleted?: boolean; archived?: boolean };
      await qc.invalidateQueries({ queryKey: ["/api/nursery/varieties", shopId] });
      toast.success(result.archived ? "This variety has sales history, so it was archived to preserve reports." : "Variety deleted.");
    } catch (error: any) {
      toast.error(error?.message || "Could not delete variety.");
    } finally { setBusyVarietyId(null); }
  }

  function beginEditSale(entry: IndividualSaleEntry) {
    setEditingSaleId(entry.id);
    setSaleEditSearch(entry.varietyName);
    setSaleEdit({ businessDate: entry.businessDate, varietyId: entry.varietyId, quantity: String(entry.quantity), unitPrice: String(cents(entry.unitPriceCents)), paymentMethod: entry.paymentMethod, customerName: entry.customerName || "", customerPhone: entry.customerPhone || "" });
  }

  async function saveSaleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingSaleId) return;
    const quantity = Number(saleEdit.quantity);
    const unitPrice = Number(saleEdit.unitPrice);
    const variety = (saleEditVarietiesQuery.data?.rows ?? []).find(v => v.id === saleEdit.varietyId);
    if (!saleEdit.businessDate || !variety || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) { toast.error("Check the date, variety, quantity and price."); return; }
    if (saleEdit.paymentMethod === "credit" && (!saleEdit.customerName.trim() || unitPrice <= 0)) { toast.error("Credit sales need a customer name and a price above zero."); return; }
    const key = ["/api/nursery/entries", shopId, from, to] as const;
    const previous = qc.getQueryData<{ rows: IndividualSaleEntry[] }>(key);
    const entry = previous?.rows.find(row => row.id === editingSaleId);
    if (!entry) { toast.error("Refresh the sales list and try again."); return; }
    const optimistic: IndividualSaleEntry = { ...entry, businessDate: saleEdit.businessDate, varietyId: variety.id, varietyName: variety.name, quantity, unitPriceCents: Math.round(unitPrice * 100), totalAmountCents: quantity * Math.round(unitPrice * 100), paymentMethod: saleEdit.paymentMethod, customerName: saleEdit.customerName.trim(), customerPhone: saleEdit.customerPhone.trim() };
    if (previous) qc.setQueryData(key, { ...previous, rows: previous.rows.map(row => row.id === editingSaleId ? optimistic : row) });
    setEditingSaleId(null);
    setBusySaleId(entry.id);
    try {
      await customFetch(`/api/nursery/entries/${encodeURIComponent(entry.id)}`, { method: "PATCH", body: JSON.stringify({ ...saleEdit, quantity, unitPrice, customerName: saleEdit.customerName.trim(), customerPhone: saleEdit.customerPhone.trim() }) });
      toast.success("Sale updated. Reports and customer summaries are being refreshed.");
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/customer-insights", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/entries", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/monthly-summary", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/debts"] }),
        qc.invalidateQueries({ queryKey: ["/api/crm"] }),
      ]);
    } catch (error: any) {
      if (previous) qc.setQueryData(key, previous);
      toast.error(error?.message || "Could not update sale. The previous entry was restored.");
    } finally { setBusySaleId(null); }
  }

  async function deleteSale(entry: IndividualSaleEntry) {
    const key = ["/api/nursery/entries", shopId, from, to] as const;
    const previous = qc.getQueryData<{ rows: IndividualSaleEntry[] }>(key);
    if (previous) qc.setQueryData(key, { ...previous, rows: previous.rows.filter(row => row.id !== entry.id) });
    setBusySaleId(entry.id);
    try {
      await customFetch(`/api/nursery/entries/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      if (editingSaleId === entry.id) setEditingSaleId(null);
      toast.success("Sale deleted. Totals and customer summaries are being refreshed.");
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/customer-insights", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/entries", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/monthly-summary", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/debts"] }),
        qc.invalidateQueries({ queryKey: ["/api/crm"] }),
      ]);
    } catch (error: any) {
      if (previous) qc.setQueryData(key, previous);
      toast.error(error?.message || "Could not delete sale. The previous entry was restored.");
    } finally { setBusySaleId(null); }
  }

  function choosePeriod(period: "day" | "week" | "month") {
    const end = businessDate;
    const start = period === "day" ? end : period === "week"
      ? addDays(end, -((new Date(end + "T12:00:00").getDay() + 6) % 7))
      : end.slice(0, 7) + "-01";
    setFrom(start); setTo(end);
  }

  return (
    <Tabs value={activeTab} onValueChange={value => setActiveTab(value as NurseryTab)}>
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

      <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/70 bg-muted/30 p-1 sm:grid-cols-3 lg:grid-cols-6">
        <TabsTrigger value="overview" className="gap-2 py-2.5"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
        <TabsTrigger value="record" className="gap-2 py-2.5"><PackagePlus className="h-4 w-4" />Record sale</TabsTrigger>
        <TabsTrigger value="catalogue" className="gap-2 py-2.5"><Boxes className="h-4 w-4" />Varieties</TabsTrigger>
        <TabsTrigger value="insights" className="gap-2 py-2.5"><Users className="h-4 w-4" />Customers</TabsTrigger>
        <TabsTrigger value="sales" className="gap-2 py-2.5"><ReceiptText className="h-4 w-4" />Sales history</TabsTrigger>
        <TabsTrigger value="reports" className="gap-2 py-2.5"><BarChart3 className="h-4 w-4" />Reports</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-5 space-y-5 focus-visible:outline-none">
        <div className="grid gap-3 sm:grid-cols-[minmax(180px,0.7fr)_1fr_1fr_auto]">
          <Card><CardContent className="flex h-full flex-col justify-center gap-2 p-4">
            <Label htmlFor="nursery-month" className="text-xs text-muted-foreground">Monthly view</Label>
            <Input id="nursery-month" type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} className="h-10" />
          </CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Leaf className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Seedlings sold</p><p className="text-2xl font-bold tabular-nums">{Number(monthSummary.seedlingsSold).toLocaleString()}</p></div>
          </CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-xl bg-emerald-500/10 p-2.5 text-emerald-600"><Banknote className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Sales value</p><p className="text-2xl font-bold tabular-nums">{formatKES(cents(Number(monthSummary.totalRevenueCents)))}</p></div>
          </CardContent></Card>
          <Button type="button" variant="outline" className="h-auto min-h-14 gap-2 self-stretch" onClick={() => void monthlySummaryQuery.refetch()} disabled={monthlySummaryQuery.isFetching}>
            <RefreshCw className={`h-4 w-4 ${monthlySummaryQuery.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-border/70">
            <div><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />Monthly sales by category</CardTitle><p className="mt-1 text-sm text-muted-foreground">Totals use each variety’s current shop-defined category.</p></div>
            <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => setActiveTab("catalogue")}><Boxes className="h-4 w-4" /> Manage categories</Button>
          </CardHeader>
          <CardContent className="p-0">
            {monthlySummaryQuery.isLoading ? <p className="p-8 text-center text-sm text-muted-foreground">Loading this month’s nursery totals…</p>
              : monthlySummaryQuery.isError ? <div className="p-8 text-center"><p className="font-medium text-destructive">Could not load monthly totals</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void monthlySummaryQuery.refetch()}>Try again</Button></div>
              : !(monthlySummaryQuery.data?.categories.length) ? <p className="p-8 text-center text-sm text-muted-foreground">No nursery sales have been recorded for this month.</p>
              : <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead><tr className="border-b border-border bg-muted/20 text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-right">Varieties</th><th className="px-4 py-3 text-right">Plants sold</th><th className="px-4 py-3 text-right">Sales value</th><th className="px-4 py-3">Payment mix</th></tr></thead>
                  <tbody>{monthlySummaryQuery.data.categories.map(category => <tr key={category.category} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{category.category}</span>
                        {category.category.trim().toLowerCase() === "uncategorized" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-[11px]"
                            onClick={() => {
                              setCatalogueStatus("all");
                              setCatalogueCategory("Uncategorized");
                              setCatalogueSearch("");
                              setCataloguePage(1);
                              setCatalogueExpanded(true);
                              setActiveTab("catalogue");
                            }}
                          >
                            <Pencil className="h-3 w-3" /> Assign categories
                          </Button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{Number(category.varietyCount).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{Number(category.seedlingsSold).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{formatKES(cents(Number(category.totalRevenueCents)))}</td>
                    <td className="px-4 py-3.5 text-xs text-muted-foreground">Cash {formatKES(cents(Number(category.cashCents)))} · M-Pesa {formatKES(cents(Number(category.mpesaCents)))} · Credit {formatKES(cents(Number(category.creditCents)))}</td>
                  </tr>)}</tbody>
                </table>
              </div>}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="record" className="mt-5 space-y-4 focus-visible:outline-none">
        <Card>
          <CardHeader className="rounded-t-xl border-b border-emerald-500/15 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent pb-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-emerald-600 p-2.5 text-white shadow-sm"><PackagePlus className="h-5 w-5" /></div><div className="min-w-0 flex-1"><CardTitle className="text-lg">New seedling sale</CardTitle><p className="mt-1 text-sm font-normal text-muted-foreground">Enter the quantity, price and how the customer paid.</p></div><span className="rounded-full border border-emerald-600/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Sales entry</span></div></CardHeader>
          <CardContent className="space-y-4 pt-5">
            <form className="space-y-4" onSubmit={saveEntry}>
              <div className="space-y-3">
                <Label htmlFor="seedling-search">Add seedlings to this sale</Label>
                <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="seedling-search" value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search cabbage, tomato, kale…" className="h-11 bg-background pl-9" autoComplete="off" /></div>
                {productSearch.trim() && <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                  {matchingSaleVarieties.length ? matchingSaleVarieties.map(v => <button key={v.id} type="button" onClick={() => addToCart(v)} className="flex w-full items-center justify-between gap-3 border-b border-border/70 px-3 py-3 text-left last:border-0 hover:bg-muted/50"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{v.name}</span><span className="text-xs text-muted-foreground">Default price · {formatKES(v.defaultPrice)} each</span></span><span className="flex shrink-0 items-center gap-1 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><Plus className="h-3.5 w-3.5" /> Add</span></button>) : <p className="p-3 text-sm text-muted-foreground">No active varieties found. Add this variety in the catalogue first.</p>}
                  {matchingSaleVarieties.length === 8 && <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Showing first 8 matches. Type more letters to narrow results.</p>}
                </div>}
                <div className="rounded-xl border border-border bg-muted/20 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="h-4 w-4 text-emerald-600" /> Sale items</p><span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold text-muted-foreground">{cart.length} varieties</span></div>
                  {!cart.length ? <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">Search above and add each seedling type the customer wants.</p> : <div className="space-y-2">
                    {cart.map(item => <div key={item.varietyId} className="rounded-lg border border-border bg-card p-3">
                      <div className="mb-2 flex items-start justify-between gap-2"><p className="min-w-0 truncate text-sm font-semibold">{item.name}</p><button type="button" aria-label={`Remove ${item.name}`} onClick={() => setCart(current => current.filter(line => line.varietyId !== item.varietyId))} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-4 w-4" /></button></div>
                      <div className="grid grid-cols-2 gap-2"><div className="space-y-1"><Label className="text-xs">Quantity</Label><Input aria-label={`${item.name} quantity`} type="number" min="1" step="1" inputMode="numeric" value={item.quantity} onChange={e => setCart(current => current.map(line => line.varietyId === item.varietyId ? { ...line, quantity: e.target.value } : line))} className="h-9" /></div><div className="space-y-1"><Label className="text-xs">Price each (KES)</Label><Input aria-label={`${item.name} price per seedling`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => setCart(current => current.map(line => line.varietyId === item.varietyId ? { ...line, unitPrice: e.target.value } : line))} className="h-9" /></div></div>
                      <p className="mt-2 text-right text-sm font-semibold tabular-nums">{formatKES((Number(item.quantity) || 0) * (Number(item.unitPrice) || 0))}</p>
                    </div>)}
                  </div>}
                </div>
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
                <div><p className="text-sm text-muted-foreground">Sale total</p><p className="text-2xl font-bold tabular-nums">{formatKES(cartTotal)}</p><p className="text-xs text-muted-foreground">{cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0).toLocaleString()} seedlings in {cart.length} varieties</p></div>
                <Button type="submit" disabled={saving || varieties.length === 0 || cart.length === 0 || !navigator.onLine} className="h-11 gap-2 px-5 shadow-sm"><CheckCircle2 className="h-4 w-4" />{saving ? "Saving sale…" : "Record sale"}<ArrowUpRight className="h-4 w-4" /></Button>
              </div>
              {!navigator.onLine && <p className="text-xs text-amber-600">Offline: connect before saving. This register does not queue offline entries yet.</p>}
            </form>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="catalogue" className="mt-5 space-y-4 focus-visible:outline-none">
        <Card>
          <CardHeader className="rounded-t-xl border-b border-sky-500/15 bg-gradient-to-r from-sky-500/10 via-sky-500/5 to-transparent pb-4"><div className="flex items-start gap-3"><div className="rounded-xl bg-sky-600 p-2.5 text-white shadow-sm"><Sprout className="h-5 w-5" /></div><div className="min-w-0 flex-1"><CardTitle className="text-lg">Seedling catalogue</CardTitle><p className="mt-1 text-sm font-normal text-muted-foreground">Set up varieties and their usual selling prices.</p></div><span className="rounded-full border border-sky-600/20 bg-sky-500/10 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">{catalogueTotal.toLocaleString()} {catalogueStatus === "active" ? "active" : catalogueStatus === "archived" ? "archived" : "total"}</span></div></CardHeader>
          <CardContent className="space-y-3 pt-4">
             <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3"><div className="min-w-0"><p className="text-sm font-semibold">{catalogueTotal.toLocaleString()} {catalogueStatus === "active" ? "active" : catalogueStatus === "archived" ? "archived" : "total"} varieties</p><p className="text-xs text-muted-foreground">Manage variety names, categories, and default prices.</p></div><Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => setCatalogueExpanded(value => !value)}>{catalogueExpanded ? "Hide catalogue" : "Manage catalogue"} <ChevronDown className={`h-4 w-4 transition-transform ${catalogueExpanded ? "rotate-180" : ""}`} /></Button></div>
            {catalogueExpanded && <>
             <form onSubmit={createVariety} className="rounded-xl border border-dashed border-sky-600/30 bg-sky-500/[0.04] p-3"><div className="mb-3 flex items-center gap-2 text-sm font-semibold"><Plus className="h-4 w-4 text-sky-600" /> Add a seedling variety</div><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_130px_auto]">
              <div className="space-y-1"><Label htmlFor="new-name">Variety name</Label><Input id="new-name" placeholder="e.g. Cabbage" value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} required /></div>
               <div className="space-y-1"><Label htmlFor="new-category">Category</Label><Input id="new-category" placeholder="e.g. Vegetables" value={newCategory} onChange={e => setNewCategory(e.target.value)} maxLength={60} /></div>
              <div className="space-y-1"><Label htmlFor="new-price">Default price (KES)</Label><Input id="new-price" type="number" min="0" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} required /></div>
              <div className="flex items-end"><Button type="submit" disabled={addingVariety} className="w-full gap-1 bg-sky-600 text-white hover:bg-sky-700"><Plus className="h-4 w-4" /> Add</Button></div>
            </div></form>
            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                 <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={catalogueSearch} onChange={e => { setCatalogueSearch(e.target.value); setCataloguePage(1); }} placeholder="Find a seedling variety…" aria-label="Search seedling catalogue" className="h-10 bg-background pl-9" />
                  </div>
                  <div className="relative sm:w-44">
                    <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <select aria-label="Filter seedling varieties" value={catalogueStatus} onChange={e => { setCatalogueStatus(e.target.value as typeof catalogueStatus); setCataloguePage(1); }} className="h-10 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                      <option value="active">Active varieties</option><option value="archived">Archived varieties</option><option value="all">All varieties</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                   <div className="relative sm:w-44">
                     <select aria-label="Filter varieties by category" value={catalogueCategory} onChange={e => { setCatalogueCategory(e.target.value); setCataloguePage(1); }} className="h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                       <option value="">All categories</option>
                       {catalogueCategories.map(category => <option key={category} value={category}>{category}</option>)}
                     </select>
                     <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                   </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p>Showing <span className="font-semibold text-foreground">{catalogueStart}–{catalogueEnd}</span> of <span className="font-semibold text-foreground">{catalogueTotal}</span> {catalogueStatus === "all" ? "varieties" : catalogueStatus + " varieties"}</p>
                   {(catalogueSearch || catalogueCategory || catalogueStatus !== "active") && <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setCatalogueSearch(""); setCatalogueCategory(""); setCatalogueStatus("active"); setCataloguePage(1); }}>Reset filters</Button>}
                </div>
              </div>
              {catalogueQuery.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading seedling varieties…</p>}
              {catalogueQuery.isError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center text-sm"><p className="font-medium text-destructive">Could not load seedling varieties.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void catalogueQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button></div>}
              {catalogueQuery.isSuccess && catalogueTotal === 0 && !catalogueSearch && catalogueStatus === "active" && <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add cabbage, spinach or any seedling varieties sold by this shop.</p>}
              {catalogueQuery.isSuccess && catalogueTotal === 0 && (catalogueSearch || catalogueStatus !== "active") && <div className="rounded-xl border border-dashed p-6 text-center"><Sprout className="mx-auto h-6 w-6 text-muted-foreground/60" /><p className="mt-2 text-sm font-medium">No varieties match this view</p><p className="mt-1 text-xs text-muted-foreground">Try another search or switch the status filter.</p></div>}
              <div className="max-h-[min(55vh,520px)] overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-muted/10 p-2">
              <div className="grid gap-2 sm:grid-cols-2">
              {catalogueRows.map(v => <div key={v.id} className="group rounded-xl border border-border bg-card p-3 transition-colors hover:border-sky-600/30 hover:bg-sky-500/[0.03]">
                {editingVarietyId === v.id ? (
                   <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,.8fr)_140px_auto]">
                    <div className="space-y-1"><Label htmlFor={`edit-name-${v.id}`}>Variety name</Label><Input id={`edit-name-${v.id}`} value={editingName} onChange={e => setEditingName(e.target.value)} maxLength={80} autoFocus /></div>
                     <div className="space-y-1"><Label htmlFor={`edit-category-${v.id}`}>Category</Label><Input id={`edit-category-${v.id}`} value={editingCategory} onChange={e => setEditingCategory(e.target.value)} maxLength={60} /></div>
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
              </div>
              {cataloguePageCount > 1 && <div className="flex items-center justify-between gap-3"><Button type="button" variant="outline" size="sm" disabled={cataloguePage <= 1 || catalogueQuery.isFetching} onClick={() => setCataloguePage(page => Math.max(1, page - 1))}>Previous</Button><span className="text-xs text-muted-foreground">Page {cataloguePage} of {cataloguePageCount}</span><Button type="button" variant="outline" size="sm" disabled={cataloguePage >= cataloguePageCount || catalogueQuery.isFetching} onClick={() => setCataloguePage(page => Math.min(cataloguePageCount, page + 1))}>Next</Button></div>}
            </div>
            </>}
          </CardContent>
        </Card>
      </TabsContent>


      <TabsContent value="insights" className="mt-5 space-y-4 focus-visible:outline-none">
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
      </TabsContent>


      <TabsContent value="sales" className="mt-5 space-y-4 focus-visible:outline-none">
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardHeader className="border-b border-border/70 bg-gradient-to-br from-primary/[0.07] via-background to-sky-500/[0.06] pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-primary/15 bg-primary/10 p-3 text-primary shadow-sm"><ReceiptText className="h-5 w-5" /></div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><CardTitle className="text-xl tracking-tight">Individual sales</CardTitle><span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">SALE LEDGER</span></div>
                <p className="mt-1 max-w-2xl text-sm font-normal leading-relaxed text-muted-foreground">Review every seedling transaction, correct mistakes, and keep reports and customer balances in sync.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-xl border border-border/80 bg-background/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Transactions</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">{individualTotal.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-border/80 bg-background/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Seedlings sold</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">{individualSaleSummary.quantity.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-border/80 bg-background/80 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Recorded value</p>
                <p className="mt-0.5 text-lg font-bold tabular-nums">{formatKES(cents(individualSaleSummary.totalCents))}</p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={saleSearch} onChange={e => { setSaleSearch(e.target.value); setSalesPage(1); }} placeholder="Search customer, phone, seedling or date…" aria-label="Search individual sales" className="h-10 border-border/80 bg-background pl-9" />
            </div>
            <div className="relative">
              <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select aria-label="Filter by payment method" value={salePaymentFilter} onChange={e => { setSalePaymentFilter(e.target.value as typeof salePaymentFilter); setSalesPage(1); }} className="h-10 w-full appearance-none rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                <option value="all">All payment methods</option><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="credit">Credit</option>
              </select>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setSaleSearch(""); setSalePaymentFilter("all"); setSalesPage(1); }} disabled={!saleSearch && salePaymentFilter === "all"} className="h-10">Clear filters</Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>Showing <span className="font-semibold text-foreground">{individualTotal ? ((salesPage - 1) * salesPageSize + 1).toLocaleString() : "0"}–{Math.min(salesPage * salesPageSize, individualTotal).toLocaleString()}</span> of {individualTotal.toLocaleString()} matching transactions</p>
            <p className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5" /> Credit sales value: <span className="font-semibold text-foreground">{formatKES(cents(individualSaleSummary.creditCents))}</span></p>
          </div>
          {editingSaleId && <form onSubmit={saveSaleEdit} className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><Pencil className="h-4 w-4" /></div><div><p className="font-semibold">Edit sale entry</p><p className="mt-0.5 text-sm text-muted-foreground">Save corrections to update the related summaries.</p></div></div>
              <Button type="button" variant="ghost" size="icon" aria-label="Cancel sale edit" onClick={() => setEditingSaleId(null)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5"><Label htmlFor="sale-edit-date">Sale date</Label><Input id="sale-edit-date" type="date" value={saleEdit.businessDate} onChange={e => setSaleEdit(s => ({ ...s, businessDate: e.target.value }))} required /></div>
              <div className="space-y-1.5"><Label htmlFor="sale-edit-variety">Seedling variety</Label><select id="sale-edit-variety" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={saleEdit.varietyId} onChange={e => setSaleEdit(s => ({ ...s, varietyId: e.target.value }))} required>{(saleEditVarietiesQuery.data?.rows ?? []).map(v => <option key={v.id} value={v.id}>{v.name}{Boolean(v.isActive) ? "" : " (archived)"}</option>)}</select></div>
              <div className="space-y-1.5"><Label htmlFor="sale-edit-qty">Quantity</Label><Input id="sale-edit-qty" type="number" min="1" step="1" value={saleEdit.quantity} onChange={e => setSaleEdit(s => ({ ...s, quantity: e.target.value }))} required /></div>
              <div className="space-y-1.5"><Label htmlFor="sale-edit-price">Unit price (KES)</Label><Input id="sale-edit-price" type="number" min="0" step="0.01" value={saleEdit.unitPrice} onChange={e => setSaleEdit(s => ({ ...s, unitPrice: e.target.value }))} required /></div>
              <div className="space-y-1.5"><Label htmlFor="sale-edit-payment">Payment method</Label><select id="sale-edit-payment" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={saleEdit.paymentMethod} onChange={e => setSaleEdit(s => ({ ...s, paymentMethod: e.target.value as "cash" | "mpesa" | "credit" }))}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="credit">Credit</option></select></div>
              <div className="space-y-1.5"><Label htmlFor="sale-edit-customer">Customer name</Label><Input id="sale-edit-customer" value={saleEdit.customerName} onChange={e => setSaleEdit(s => ({ ...s, customerName: e.target.value }))} maxLength={120} placeholder="Walk-in customer if blank" /></div>
              <div className="space-y-1.5"><Label htmlFor="sale-edit-phone">Customer phone</Label><Input id="sale-edit-phone" type="tel" value={saleEdit.customerPhone} onChange={e => setSaleEdit(s => ({ ...s, customerPhone: e.target.value }))} maxLength={40} /></div>
            </div>
            {saleEdit.paymentMethod === "credit" && <p className="mt-3 rounded-xl bg-violet-500/10 px-3 py-2.5 text-sm text-violet-800 dark:text-violet-200">Credit entries require a customer and positive price. Sales with payments already recorded must be reconciled in Debts before editing or deleting.</p>}
            <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={() => setEditingSaleId(null)}>Cancel</Button><Button type="submit" disabled={busySaleId === editingSaleId} className="gap-2"><Save className="h-4 w-4" /> Save changes</Button></div>
          </form>}
          {individualEntriesQuery.isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl border bg-muted/40" />)}</div>
            : individualEntriesQuery.isError ? <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center"><p className="font-medium text-destructive">Could not load individual sales</p><p className="mt-1 text-sm text-muted-foreground">Check your connection and try refreshing.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void individualEntriesQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button></div>
            : !filteredIndividualEntries.length ? <div className="rounded-2xl border border-dashed border-border p-8 text-center sm:p-12"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><ClipboardList className="h-6 w-6" /></div><p className="mt-3 font-semibold">{saleSearch || salePaymentFilter !== "all" ? "No matching sales found" : "No individual entries in this period"}</p><p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{saleSearch || salePaymentFilter !== "all" ? "Try another search term or clear the payment filter." : "New sales will appear here once recorded. Older records remain available in the aggregated sales report."}</p>{(saleSearch || salePaymentFilter !== "all") && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { setSaleSearch(""); setSalePaymentFilter("all"); setSalesPage(1); }}>Clear filters</Button>}</div>
            : <>
              <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
                {filteredIndividualEntries.map(entry => <div key={entry.id} className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                  <div className={"absolute inset-x-0 top-0 h-1 " + (entry.paymentMethod === "cash" ? "bg-amber-500" : entry.paymentMethod === "mpesa" ? "bg-sky-500" : "bg-violet-500")} />
                  <div className="flex items-start justify-between gap-3 pt-1">
                    <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sprout className="h-5 w-5" /></div><div className="min-w-0"><p className="truncate font-semibold">{entry.varietyName}</p><p className="mt-0.5 text-xs text-muted-foreground">{entry.businessDate} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></div></div>
                    <span className={"shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold " + (entry.paymentMethod === "cash" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : entry.paymentMethod === "mpesa" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300")}>{entry.paymentMethod === "mpesa" ? "M-Pesa" : entry.paymentMethod === "credit" ? "Credit" : "Cash"}</span>
                  </div>
                  <div className="mt-4 rounded-xl bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Sale total</p><p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{formatKES(cents(entry.totalAmountCents))}</p><div className="mt-2 flex items-center justify-between gap-2 border-t border-border/70 pt-2 text-sm"><span className="text-muted-foreground">Quantity</span><span className="font-semibold tabular-nums">{Number(entry.quantity).toLocaleString()} seedlings</span></div><div className="mt-1 flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Unit price</span><span className="font-medium tabular-nums">{formatKES(cents(entry.unitPriceCents))}</span></div></div>
                  <div className="mt-3 min-w-0"><p className="truncate text-sm font-medium">{entry.customerName || "Walk-in customer"}</p><p className="truncate text-xs text-muted-foreground">{entry.customerPhone || "No phone recorded"}</p></div>
                  <div className="mt-4 flex gap-2 border-t border-border/70 pt-3"><Button type="button" variant="outline" size="sm" disabled={busySaleId === entry.id} onClick={() => beginEditSale(entry)} className="flex-1 gap-1.5"><Pencil className="h-3.5 w-3.5" /> Edit sale</Button><Button type="button" variant="outline" size="sm" disabled={busySaleId === entry.id} onClick={() => { if (window.confirm("Delete this " + entry.varietyName + " sale for " + formatKES(cents(entry.totalAmountCents)) + "? The linked totals will be adjusted.")) void deleteSale(entry); }} className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">Delete</span></Button></div>
                </div>)}
              </div>
              <div className="hidden overflow-x-auto rounded-xl border border-border/70 xl:block">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-muted/40"><tr className="border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground"><th className="px-4 py-3">Date / time</th><th className="px-4 py-3">Seedlings / customer</th><th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3">Payment</th><th className="px-4 py-3 text-right">Sale total</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
                  <tbody>{filteredIndividualEntries.map(entry => <tr key={entry.id} className="border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30">
                    <td className="whitespace-nowrap px-4 py-3.5"><p className="font-medium">{entry.businessDate}</p><p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p></td>
                    <td className="px-4 py-3.5"><p className="font-semibold">{entry.varietyName}</p><p className="text-xs text-muted-foreground">{entry.customerName || "Walk-in customer"}{entry.customerPhone ? " · " + entry.customerPhone : ""}</p></td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums">{Number(entry.quantity).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right tabular-nums">{formatKES(cents(entry.unitPriceCents))}</td>
                    <td className="px-4 py-3.5"><span className={"inline-flex rounded-full px-2.5 py-1 text-xs font-semibold " + (entry.paymentMethod === "cash" ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : entry.paymentMethod === "mpesa" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-violet-500/10 text-violet-700 dark:text-violet-300")}>{entry.paymentMethod === "mpesa" ? "M-Pesa" : entry.paymentMethod === "credit" ? "Credit" : "Cash"}</span></td>
                    <td className="px-4 py-3.5 text-right font-bold tabular-nums">{formatKES(cents(entry.totalAmountCents))}</td>
                    <td className="px-4 py-3.5"><div className="flex justify-end gap-1.5"><Button type="button" variant="outline" size="sm" disabled={busySaleId === entry.id} onClick={() => beginEditSale(entry)} className="gap-1"><Pencil className="h-3.5 w-3.5" /> Edit</Button><Button type="button" variant="ghost" size="sm" disabled={busySaleId === entry.id} onClick={() => { if (window.confirm("Delete this " + entry.varietyName + " sale for " + formatKES(cents(entry.totalAmountCents)) + "? The linked totals will be adjusted.")) void deleteSale(entry); }} className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /> Delete</Button></div></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>}
          {individualTotal > 0 && <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Page {salesPage} of {individualPageCount} · 25 transactions per page</p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={salesPage <= 1 || individualEntriesQuery.isFetching} onClick={() => setSalesPage(page => Math.max(1, page - 1))}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={salesPage >= individualPageCount || individualEntriesQuery.isFetching} onClick={() => setSalesPage(page => Math.min(individualPageCount, page + 1))}>Next</Button>
            </div>
          </div>}
          <p className="border-t border-border/70 pt-3 text-xs leading-relaxed text-muted-foreground">Only 25 individual transactions are fetched per page. Search and payment filters run in D1, while saved edits and deletions refresh the sales report, customer insights, and debt records. Nursery sales remain separate from normal POS inventory deductions.</p>
        </CardContent>
      </Card>
      </TabsContent>

      <TabsContent value="reports" className="mt-5 space-y-4 focus-visible:outline-none">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Sales report</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => { choosePeriod("day"); setReportPage(1); setSalesPage(1); }}>Day</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { choosePeriod("week"); setReportPage(1); setSalesPage(1); }}>This week</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { choosePeriod("month"); setReportPage(1); setSalesPage(1); }}>This month</Button>
              <div className="flex items-center gap-2"><Label htmlFor="report-from" className="text-xs">From</Label><Input id="report-from" type="date" className="w-auto" value={from} onChange={e => { setFrom(e.target.value); setReportPage(1); setSalesPage(1); }} /></div>
              <div className="flex items-center gap-2"><Label htmlFor="report-to" className="text-xs">To</Label><Input id="report-to" type="date" className="w-auto" value={to} min={from} onChange={e => { setTo(e.target.value); setReportPage(1); setSalesPage(1); }} /></div>
              <Button type="button" size="icon" variant="ghost" aria-label="Refresh report" onClick={() => qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] })}><RefreshCw className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {reportQuery.isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">Loading report…</p> : reportQuery.isError ? <p className="py-8 text-center text-sm text-destructive">Could not load report. Check your connection and try refreshing.</p> : reportRows.length === 0 ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No seedling sales found for this date range.</p> : (
            <>
              {report?.summary && (
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Plants sold in this period</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{Number(report.summary.totalSeedlings).toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Sales value in this period</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{formatKES(cents(Number(report.summary.totalRevenueCents)))}</p>
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead><tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground"><th className="px-3 py-3">Variety</th><th className="px-3 py-3 text-right">Plants sold</th><th className="px-3 py-3 text-right">Sales value</th><th className="px-3 py-3">Payment mix</th></tr></thead>
                  <tbody>{reportRows.map(row => <tr key={row.varietyId} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-3 font-medium">{row.varietyName}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{Number(row.quantity).toLocaleString()}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatKES(cents(Number(row.totalAmountCents)))}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span>Cash {formatKES(cents(Number(row.cashCents)))}</span>
                        <span>M-Pesa {formatKES(cents(Number(row.mpesaCents)))}</span>
                        <span>Credit {formatKES(cents(Number(row.creditCents)))}</span>
                      </div>
                    </td>
                  </tr>)}</tbody>
                </table>
              </div>
            </>
          )}
          {reportTotal > 0 && <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">Showing varieties {((reportPage - 1) * reportPageSize + 1).toLocaleString()}–{Math.min(reportPage * reportPageSize, reportTotal).toLocaleString()} of {reportTotal.toLocaleString()} · Page {reportPage} of {reportPageCount}</p>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={reportPage <= 1 || reportQuery.isFetching} onClick={() => setReportPage(page => Math.max(1, page - 1))}>Previous</Button>
              <Button type="button" size="sm" variant="outline" disabled={reportPage >= reportPageCount || reportQuery.isFetching} onClick={() => setReportPage(page => Math.min(reportPageCount, page + 1))}>Next</Button>
            </div>
          </div>}
          <p className="mt-3 text-xs text-muted-foreground">Each variety is totaled once across the selected date range, including its payment mix. Individual sale dates remain available in Sales history. Credit sales create a linked customer debt.</p>
        </CardContent>
      </Card>
      </TabsContent>
    </div>
    </Tabs>
  );
}
