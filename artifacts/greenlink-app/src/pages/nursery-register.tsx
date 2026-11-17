import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatKES } from "@/lib/format";
import { downloadNurseryReceipt, downloadNurseryStatement } from "@/lib/nursery-pdf";
import { CustomerAutocomplete, type SelectedCustomer } from "@/components/customer-autocomplete";
import {
  Sprout, Plus, Minus, CalendarDays, Banknote, Smartphone, Leaf, RefreshCw, Archive,
  CheckCircle2, CreditCard, Users, TrendingUp, ClipboardList, PackagePlus, ArrowUpRight,
  Pencil, Save, X, Trash2, Search, SlidersHorizontal, ReceiptText, CircleDollarSign,
  ChevronDown, ShoppingCart, BarChart3, Boxes, LayoutDashboard, Truck, Sparkles, User2, Phone,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Variety = { id: string; name: string; category: string; defaultPrice: number; isActive: number | boolean };
type VarietyListData = { rows: Variety[]; total: number; page: number; pageSize: number; categories: string[] };
type ReportRow = {
  varietyKey?: string; varietyId?: string; varietyName: string; quantity: number; totalAmountCents: number;
  cashCents?: number | string | null; mpesaCents?: number | string | null; creditCents?: number | string | null;
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
type SupplierRow = { id: string; name: string; phone?: string | null; notes?: string | null; customerId?: string | null; customerName?: string | null; customerPhone?: string | null; receivedPlants: number; onHandPlants: number; supplierCreditCents: number; customerDebtCents: number };
type SupplierCustomer = { id: string; name: string; phone?: string | null; outstandingDebtCents: number };
type SupplierRecord = { id: string; recordType: string; recordedAt: string; varietyName: string; quantity: number; amountCents: number; note: string };
type SaleSource = { varietyId: string; supplierId: string; supplierName: string; availableQuantity: number };
type NurseryTab = "overview" | "record" | "catalogue" | "insights" | "sales" | "reports" | "suppliers";

const nurseryQueryOptions = {
  staleTime: 10_000,
  refetchInterval: 30_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

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
function formatBusinessDate(date: string) {
  if (!date) return "—";
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function cents(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

type CustomerInsightRow = { customerKey: string; customerName: string; customerPhone: string; varietyName: string; quantity: number; totalAmountCents: number; lastPurchase: string };
type IndividualSaleEntry = { id: string; requestId: string; transactionId?: string | null; businessDate: string; varietyId: string; varietyName: string; customerName: string; customerPhone: string; quantity: number; unitPriceCents: number; totalAmountCents: number; paymentMethod: "cash" | "mpesa" | "credit"; debtId: string | null; sourceSupplierId?: string | null; sourceSupplierName?: string | null; createdAt: string };

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
  const [isOnline, setIsOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
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
  const [saleEditSelectedVariety, setSaleEditSelectedVariety] = useState<{ id: string; name: string } | null>(null);
  const [busySaleId, setBusySaleId] = useState<string | null>(null);
  const [catalogueExpanded, setCatalogueExpanded] = useState(true);
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [catalogueStatus, setCatalogueStatus] = useState<"active" | "archived" | "all">("active");
  const [catalogueCategory, setCatalogueCategory] = useState("");
  const [cataloguePage, setCataloguePage] = useState(1);
  const [productSearch, setProductSearch] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [cart, setCart] = useState<Array<{ requestId: string; varietyId: string; name: string; quantity: string; unitPrice: string; sourceSupplierId: string }>>([]);
  const [saleSearch, setSaleSearch] = useState("");
  const [salePaymentFilter, setSalePaymentFilter] = useState<"all" | "cash" | "mpesa" | "credit">("all");
  const [salesPage, setSalesPage] = useState(1);
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [statementCustomer, setStatementCustomer] = useState("");
  const [statementPhone, setStatementPhone] = useState("");
  const [statementBusy, setStatementBusy] = useState(false);
  const [pendingTransactionId, setPendingTransactionId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierNotes, setSupplierNotes] = useState("");
  const [supplierCustomerSearch, setSupplierCustomerSearch] = useState("");
  const [supplierCustomerId, setSupplierCustomerId] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [receiveSupplierId, setReceiveSupplierId] = useState("");
  const [receiveVarietySearch, setReceiveVarietySearch] = useState("");
  const [receiveVarietyId, setReceiveVarietyId] = useState("");
  const [receiveQuantity, setReceiveQuantity] = useState("1");
  const [receiveDate, setReceiveDate] = useState(localDate());
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiptRequestId, setReceiptRequestId] = useState(() => crypto.randomUUID());
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const salesPageSize = 25;
  const reportPageSize = 20;
  const debouncedCatalogueSearch = useDebouncedValue(catalogueSearch);
  const debouncedProductSearch = useDebouncedValue(productSearch);
  const debouncedSaleSearch = useDebouncedValue(saleSearch);
  const debouncedSaleEditSearch = useDebouncedValue(saleEditSearch);
  const debouncedSupplierCustomerSearch = useDebouncedValue(supplierCustomerSearch);
  const debouncedReceiveVarietySearch = useDebouncedValue(receiveVarietySearch);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  const catalogueQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId, "catalogue", catalogueStatus, catalogueCategory, debouncedCatalogueSearch, cataloguePage],
    queryFn: () => customFetch(varietyListUrl({ status: catalogueStatus, category: catalogueCategory, search: debouncedCatalogueSearch, page: cataloguePage, pageSize: 30 })) as Promise<VarietyListData>,
    enabled: !!shopId && activeTab === "catalogue",
    placeholderData: previous => previous,
    ...nurseryQueryOptions,
  });
  const saleVarietiesQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId, "sale", productCategory, debouncedProductSearch],
    queryFn: () => customFetch(varietyListUrl({ status: "active", category: productCategory, search: debouncedProductSearch, page: 1, pageSize: 24 })) as Promise<VarietyListData>,
    enabled: !!shopId && activeTab === "record",
    placeholderData: previous => previous,
    ...nurseryQueryOptions,
  });
  const saleEditVarietiesQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId, "sale-edit", debouncedSaleEditSearch],
    queryFn: () => customFetch(varietyListUrl({ status: "all", search: debouncedSaleEditSearch, page: 1, pageSize: 100 })) as Promise<VarietyListData>,
    enabled: !!shopId && activeTab === "sales" && !!editingSaleId,
    placeholderData: previous => previous,
    ...nurseryQueryOptions,
  });
  const individualEntriesQuery = useQuery({
    queryKey: ["/api/nursery/entries", shopId, from, to, salesPage, salesPageSize, debouncedSaleSearch, salePaymentFilter],
    queryFn: () => customFetch("/api/nursery/entries?from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to) + "&page=" + salesPage + "&pageSize=" + salesPageSize + "&search=" + encodeURIComponent(debouncedSaleSearch.trim()) + "&payment=" + salePaymentFilter) as Promise<EntriesData>,
    enabled: !!shopId && activeTab === "sales" && !!from && !!to && from <= to,
    placeholderData: previous => previous,
    ...nurseryQueryOptions,
  });
  const customerInsightsQuery = useQuery({
    queryKey: ["/api/nursery/customer-insights", shopId, from, to],
    queryFn: () => customFetch(`/api/nursery/customer-insights?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) as Promise<{ rows: CustomerInsightRow[] }>,
    enabled: !!shopId && activeTab === "insights" && !!from && !!to && from <= to,
    ...nurseryQueryOptions,
  });
  const reportQuery = useQuery({
    queryKey: ["/api/nursery/report", shopId, from, to, businessDate, reportPage, reportPageSize],
    queryFn: () => customFetch(`/api/nursery/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&businessDate=${encodeURIComponent(businessDate)}&page=${reportPage}&pageSize=${reportPageSize}`) as Promise<ReportData>,
    enabled: !!shopId && activeTab === "reports" && !!from && !!to && from <= to,
    placeholderData: previous => previous,
    ...nurseryQueryOptions,
  });
  const monthlySummaryQuery = useQuery({
    queryKey: ["/api/nursery/monthly-summary", shopId, selectedMonth],
    queryFn: () => customFetch(`/api/nursery/monthly-summary?month=${encodeURIComponent(selectedMonth)}`) as Promise<MonthlySummaryData>,
    enabled: !!shopId && activeTab === "overview" && /^\d{4}-\d{2}$/.test(selectedMonth),
    ...nurseryQueryOptions,
  });
  const suppliersQuery = useQuery({
    queryKey: ["/api/nursery/suppliers", shopId],
    queryFn: () => customFetch("/api/nursery/suppliers") as Promise<{ rows: SupplierRow[] }>,
    enabled: !!shopId && activeTab === "suppliers",
    ...nurseryQueryOptions,
  });
  const supplierCustomersQuery = useQuery({
    queryKey: ["/api/nursery/supplier-customers", shopId, debouncedSupplierCustomerSearch],
    queryFn: () => customFetch(`/api/nursery/supplier-customers?q=${encodeURIComponent(debouncedSupplierCustomerSearch)}`) as Promise<{ rows: SupplierCustomer[] }>,
    enabled: !!shopId && activeTab === "suppliers" && debouncedSupplierCustomerSearch.trim().length >= 2,
    ...nurseryQueryOptions,
  });
  const receiveVarietiesQuery = useQuery({
    queryKey: ["/api/nursery/varieties", shopId, "supplier-receive", debouncedReceiveVarietySearch],
    queryFn: () => customFetch(varietyListUrl({ status: "active", search: debouncedReceiveVarietySearch, page: 1, pageSize: 20 })) as Promise<VarietyListData>,
    enabled: !!shopId && activeTab === "suppliers" && debouncedReceiveVarietySearch.trim().length >= 2,
    ...nurseryQueryOptions,
  });
  const supplierRecordsQuery = useQuery({
    queryKey: ["/api/nursery/suppliers", shopId, selectedSupplierId, "records"],
    queryFn: () => customFetch(`/api/nursery/suppliers/${encodeURIComponent(selectedSupplierId)}/records?limit=100`) as Promise<{ rows: SupplierRecord[] }>,
    enabled: !!shopId && activeTab === "suppliers" && !!selectedSupplierId,
    ...nurseryQueryOptions,
  });
  const sourceVarietyIds = [...new Set(cart.map(item => item.varietyId))].sort();
  const sourceVarietyKey = sourceVarietyIds.join(",");
  const saleSourcesQuery = useQuery({
    queryKey: ["/api/nursery/sale-sources", shopId, sourceVarietyKey],
    queryFn: () => customFetch(`/api/nursery/sale-sources?varietyIds=${encodeURIComponent(sourceVarietyKey)}`) as Promise<{ rows: SaleSource[] }>,
    enabled: !!shopId && activeTab === "record" && sourceVarietyIds.length > 0,
    staleTime: 5_000,
    refetchInterval: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const supplierRows = suppliersQuery.data?.rows ?? [];
  const supplierCustomers = supplierCustomersQuery.data?.rows ?? [];
  const receiveVarieties = receiveVarietiesQuery.data?.rows ?? [];
  const supplierRecords = supplierRecordsQuery.data?.rows ?? [];
  const selectedSupplier = supplierRows.find(supplier => supplier.id === selectedSupplierId) ?? null;
  const saleSources = saleSourcesQuery.data?.rows ?? [];
  const varieties = saleVarietiesQuery.data?.rows ?? [];
  const matchingSaleVarieties = varieties;
  const catalogueRows = catalogueQuery.data?.rows ?? [];
  const catalogueTotal = catalogueQuery.data?.total ?? 0;
  const cataloguePageCount = Math.max(1, Math.ceil(catalogueTotal / 30));
  const catalogueStart = catalogueTotal === 0 ? 0 : (cataloguePage - 1) * 30 + 1;
  const catalogueEnd = Math.min(cataloguePage * 30, catalogueTotal);
  const catalogueCategories = catalogueQuery.data?.categories ?? [];
  const saleCategories = saleVarietiesQuery.data?.categories ?? [];
  const cartTotalCents = cart.reduce((sum, item) => {
    const quantity = Number(item.quantity);
    const unitPriceCents = Math.round(Number(item.unitPrice) * 100);
    return sum + (Number.isSafeInteger(quantity) && quantity > 0 && Number.isSafeInteger(unitPriceCents) && unitPriceCents >= 0 ? quantity * unitPriceCents : 0);
  }, 0);
  const cartTotal = cartTotalCents / 100;

  function addToCart(variety: Variety) {
    setCart(current => {
      const existing = current.find(item => item.varietyId === variety.id);
      if (existing) return current.map(item => item.varietyId === variety.id ? { ...item, quantity: String((Number(item.quantity) || 0) + 1) } : item);
      return [...current, { requestId: crypto.randomUUID(), varietyId: variety.id, name: variety.name, quantity: "1", unitPrice: String(variety.defaultPrice), sourceSupplierId: "" }];
    });
    if (productSearch.trim()) setProductSearch("");
  }

  const report = reportQuery.data;
  const reportRows = report?.rows ?? [];
  const reportTotal = report?.total ?? 0;
  const reportPageCount = Math.max(1, Math.ceil(reportTotal / reportPageSize));
  const individualEntries = individualEntriesQuery.data?.rows ?? [];
  const editVarietyRows = saleEditVarietiesQuery.data?.rows ?? [];
  const saleEditVarietyOptions = saleEditSelectedVariety && !editVarietyRows.some(variety => variety.id === saleEditSelectedVariety.id)
    ? [{ id: saleEditSelectedVariety.id, name: saleEditSelectedVariety.name, category: "", defaultPrice: 0, isActive: 0 }, ...editVarietyRows]
    : editVarietyRows;
  const individualTotal = individualEntriesQuery.data?.total ?? 0;
  const individualPageCount = Math.max(1, Math.ceil(individualTotal / salesPageSize));
  const filteredIndividualEntries = individualEntries;

  useEffect(() => {
    if (individualEntriesQuery.isSuccess && !individualEntriesQuery.isFetching && salesPage > individualPageCount) {
      setSalesPage(individualPageCount);
    }
  }, [individualEntriesQuery.isFetching, individualEntriesQuery.isSuccess, individualPageCount, salesPage]);

  const individualSaleSummary = individualEntriesQuery.data?.summary ?? { quantity: 0, totalCents: 0, creditCents: 0 };
  const monthSummary = monthlySummaryQuery.data?.summary ?? { seedlingsSold: 0, totalRevenueCents: 0 };
  const monthCategories = monthlySummaryQuery.data?.categories ?? [];
  const monthPaymentTotals = monthCategories.reduce((totals, category) => ({
    cash: totals.cash + Number(category.cashCents || 0),
    mpesa: totals.mpesa + Number(category.mpesaCents || 0),
    credit: totals.credit + Number(category.creditCents || 0),
  }), { cash: 0, mpesa: 0, credit: 0 });
  const topMonthCategory = monthCategories[0];

  async function getNurseryPdfBrand() {
    const shopName = localStorage.getItem("greenlink_shopName") || "Nursery";
    let logoDataUrl = [
      localStorage.getItem("greenlink_shopLogo"),
      localStorage.getItem("greenlink_shop_logo"),
      localStorage.getItem("greenlink_logo"),
    ].find(value => value?.startsWith("data:image/")) || null;

    if (!logoDataUrl) {
      const normalizedName = shopName.toLocaleLowerCase();
      const logoPath = normalizedName.includes("sunrise")
        ? "/logo-sunrise.jpg"
        : normalizedName.includes("greenlink") ? "/logo-greenlink.jpg" : null;
      if (logoPath) {
        try {
          const response = await fetch(logoPath);
          if (response.ok) {
            const blob = await response.blob();
            logoDataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result || ""));
              reader.onerror = () => reject(new Error("Could not load the shop logo."));
              reader.readAsDataURL(blob);
            });
          }
        } catch {}
      }
    }
    return { shopName, logoDataUrl };
  }

  async function createCustomerStatement() {
    const name = statementCustomer.trim();
    const phone = statementPhone.trim();
    if (!name && !phone) { toast.error("Enter a customer name or phone number to create a statement."); return; }
    if (!from || !to || from > to) { toast.error("Choose a valid statement date range."); return; }
    if (!isOnline) { toast.error("Connect to the internet to retrieve saved customer purchases."); return; }

    setStatementBusy(true);
    try {
      const search = name || phone;
      const makeUrl = (page: number) => "/api/nursery/entries?from=" + encodeURIComponent(from)
        + "&to=" + encodeURIComponent(to) + "&page=" + page + "&pageSize=50&search="
        + encodeURIComponent(search) + "&payment=all";
      const first = await customFetch(makeUrl(1)) as EntriesData;
      const entries: IndividualSaleEntry[] = [...(first.rows ?? [])];
      const pageCount = Math.ceil(Number(first.total ?? entries.length) / 50);
      if (pageCount > 1) {
        for (let page = 2; page <= pageCount; page++) {
          const result = await customFetch(makeUrl(page)) as EntriesData;
          entries.push(...(result.rows ?? []));
        }
      }
      const normalizedName = name.toLocaleLowerCase().replace(/\s+/g, " ");
      const normalizedPhone = phone.replace(/[\s()-]/g, "");
      const matching = entries.filter(entry => {
        const entryName = (entry.customerName || "").toLocaleLowerCase().replace(/\s+/g, " ");
        const entryPhone = (entry.customerPhone || "").replace(/[\s()-]/g, "");
        if (normalizedPhone && entryPhone !== normalizedPhone) return false;
        if (normalizedName && entryName !== normalizedName) return false;
        return Boolean(entry.customerName || entry.customerPhone);
      }).sort((a, b) => a.businessDate.localeCompare(b.businessDate) || a.createdAt.localeCompare(b.createdAt));

      if (!matching.length) {
        toast.error("No saved purchases matched that customer in the selected dates.");
        return;
      }
      const brand = await getNurseryPdfBrand();
      downloadNurseryStatement(matching, brand, matching[0].customerName || name || "Customer", matching[0].customerPhone || phone, from, to);
      toast.success("Customer statement generated from " + matching.length + " saved sale entries.");
    } catch (error: any) {
      toast.error(error?.message || "Could not create the customer statement. Please try again.");
    } finally {
      setStatementBusy(false);
    }
  }

  function toggleSaleSelection(id: string) { setSelectedSaleIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]); }

  async function downloadSelectedSalesPdf() {
    const selected = filteredIndividualEntries.filter(entry => selectedSaleIds.includes(entry.id));
    if (!selected.length) { toast.info("Select at least one sale first."); return; }
    const first = selected[0];
    const sameCheckoutContext = selected.every(entry => entry.businessDate === first.businessDate && (entry.customerName || "").trim().toLowerCase() === (first.customerName || "").trim().toLowerCase() && (entry.customerPhone || "").replace(/\s+/g, "") === (first.customerPhone || "").replace(/\s+/g, "") && entry.paymentMethod === first.paymentMethod);
    if (!sameCheckoutContext) { toast.error("For one combined receipt, select sales from the same date, customer, and payment method. Use the customer statement for purchases across dates."); return; }
    const brand = await getNurseryPdfBrand();
    try { downloadNurseryReceipt(selected, brand); toast.success(`Combined PDF created for ${selected.length} selected sale lines.`); }
    catch (error: any) { toast.error(error?.message || "Could not create the combined PDF."); }
  }

  async function downloadReceipt(entry: IndividualSaleEntry) {
    const brand = await getNurseryPdfBrand();
    try {
      if (entry.transactionId) {
        const transaction = await customFetch("/api/nursery/transactions/" + encodeURIComponent(entry.transactionId)) as { rows?: IndividualSaleEntry[] };
        const rows = transaction.rows ?? [];
        if (rows.length) {
          downloadNurseryReceipt(rows, brand);
          return;
        }
      }
      downloadNurseryReceipt([entry], brand);
      if (!entry.transactionId) toast.info("This older record has no saved checkout grouping, so the PDF contains this sale line only.");
    } catch (error: any) {
      toast.error(error?.message || "Could not retrieve the full receipt. Try again.");
    }
  }

  async function saveEntry(event: FormEvent) {
    event.preventDefault();
    if (!cart.length) { toast.error("Search and add at least one seedling variety."); return; }
    if (paymentMethod === "credit" && !customerName.trim()) { toast.error("Choose or enter the customer for a credit sale."); return; }
    if (customerName.trim().length > 120 || customerPhone.trim().length > 40) { toast.error("Customer name must be 120 characters or fewer and phone number 40 characters or fewer."); return; }
    if (!isOnline) { toast.error("Connect to the internet before saving. Nursery entries are not queued offline yet."); return; }
    const prepared = cart.map(item => ({ ...item, qty: Number(item.quantity), price: Number(item.unitPrice) }));
    if (prepared.some(item => !Number.isSafeInteger(item.qty) || item.qty <= 0 || !Number.isFinite(item.price) || item.price < 0 || (paymentMethod === "credit" && item.price <= 0))) {
      toast.error("Check every cart line: quantity must be a positive whole number and each price must be valid."); return;
    }
    const sourceOverage = prepared.find(item => {
      if (!item.sourceSupplierId) return false;
      const available = saleSources.find(source => source.varietyId === item.varietyId && source.supplierId === item.sourceSupplierId)?.availableQuantity ?? 0;
      return item.qty > Number(available);
    });
    if (sourceOverage) {
      toast.error(`Recorded source stock is too low for ${sourceOverage.name}. Refresh stock or lower the quantity.`);
      return;
    }
    setSaving(true);
    const savedRequestIds = new Set<string>();
    const transactionId = pendingTransactionId || crypto.randomUUID();
    setPendingTransactionId(transactionId);
    try {
      for (let start = 0; start < prepared.length; start += 18) {
        const batch = prepared.slice(start, start + 18);
        await customFetch("/api/nursery/entries/batch", {
          method: "POST",
          body: JSON.stringify({
            businessDate,
            transactionId,
            paymentMethod,
            customerName: customerName.trim() || undefined,
            customerPhone: customerPhone.trim() || undefined,
            items: batch.map(item => ({ requestId: item.requestId, varietyId: item.varietyId, quantity: item.qty, unitPrice: item.price, sourceSupplierId: item.sourceSupplierId || null })),
          }),
        });
        const completed = new Set(batch.map(item => item.requestId));
        completed.forEach(id => savedRequestIds.add(id));
        setCart(current => current.filter(item => !completed.has(item.requestId)));
      }
      toast.success(`Saved ${prepared.length} item types (${prepared.reduce((sum, item) => sum + item.qty, 0).toLocaleString()} seedlings)`);
      setCart([]); setCustomerName(""); setCustomerPhone(""); setPendingTransactionId(null);
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/customer-insights", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/entries", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/monthly-summary", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/sale-sources", shopId] }),
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
          qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] }),
          qc.invalidateQueries({ queryKey: ["/api/nursery/sale-sources", shopId] }),
          qc.invalidateQueries({ queryKey: ["/api/debts"] }),
        ]);
      } else toast.error(error?.message || "Could not save the sale. Your cart is unchanged.");
    } finally { setSaving(false); }
  }

  async function createNurserySupplier(event: FormEvent) {
    event.preventDefault();
    const name = supplierName.trim().replace(/\s+/g, " ");
    if (!name || name.length > 120 || supplierPhone.trim().length > 40 || supplierNotes.trim().length > 500) {
      toast.error("Check the supplier name, phone and notes.");
      return;
    }
    setSavingSupplier(true);
    try {
      const supplier = await customFetch("/api/nursery/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name, phone: supplierPhone.trim() || undefined, notes: supplierNotes.trim() || undefined,
          customerId: supplierCustomerId || null,
        }),
      }) as { id: string };
      setSupplierName(""); setSupplierPhone(""); setSupplierNotes(""); setSupplierCustomerId("");
      setSelectedSupplierId(supplier.id);
      if (!receiveSupplierId) setReceiveSupplierId(supplier.id);
      await qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] });
      toast.success("Nursery supplier added.");
    } catch (error: any) {
      toast.error(error?.message || "Could not add this supplier.");
    } finally { setSavingSupplier(false); }
  }

  async function saveNurseryReceipt(event: FormEvent) {
    event.preventDefault();
    const quantity = Number(receiveQuantity);
    if (!receiveSupplierId || !receiveVarietyId || !Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10000000 || !receiveDate) {
      toast.error("Choose a supplier, variety, quantity and received date.");
      return;
    }
    setSavingReceipt(true);
    try {
      await customFetch("/api/nursery/receipts", {
        method: "POST",
        body: JSON.stringify({
          requestId: receiptRequestId, supplierId: receiveSupplierId, varietyId: receiveVarietyId,
          quantity, receivedAt: receiveDate, notes: receiveNotes.trim(),
        }),
      });
      setReceiveQuantity("1"); setReceiveNotes(""); setReceiptRequestId(crypto.randomUUID());
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] }),
        qc.invalidateQueries({ queryKey: ["/api/nursery/sale-sources", shopId] }),
      ]);
      toast.success("Plant receipt recorded against this supplier.");
    } catch (error: any) {
      toast.error(error?.message || "Could not record the plant receipt. Your details are still available to retry.");
    } finally { setSavingReceipt(false); }
  }

  async function linkSupplierCustomer() {
    if (!selectedSupplierId || !supplierCustomerId) {
      toast.error("Search for and choose the existing customer to link.");
      return;
    }
    try {
      await customFetch(`/api/nursery/suppliers/${encodeURIComponent(selectedSupplierId)}`, {
        method: "PATCH",
        body: JSON.stringify({ customerId: supplierCustomerId }),
      });
      setSupplierCustomerId(""); setSupplierCustomerSearch("");
      await qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] });
      toast.success("Supplier linked to the existing customer. Future source sales will reduce their debt first.");
    } catch (error: any) {
      toast.error(error?.message || "Could not link this customer.");
    }
  }

  async function createVariety(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim().replace(/\s+/g, " ");
    const category = newCategory.trim().replace(/\s+/g, " ") || "Uncategorized";
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
      setNewName(""); setNewPrice("0"); setCataloguePage(1);
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
    const name = editingName.trim().replace(/\s+/g, " ");
    const category = editingCategory.trim().replace(/\s+/g, " ") || "Uncategorized";
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
    setSaleEditSearch("");
    setSaleEditSelectedVariety({ id: entry.varietyId, name: entry.varietyName });
    setSaleEdit({ businessDate: entry.businessDate, varietyId: entry.varietyId, quantity: String(entry.quantity), unitPrice: String(cents(entry.unitPriceCents)), paymentMethod: entry.paymentMethod, customerName: entry.customerName || "", customerPhone: entry.customerPhone || "" });
  }

  async function saveSaleEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingSaleId) return;
    const quantity = Number(saleEdit.quantity);
    const unitPrice = Number(saleEdit.unitPrice);
    const variety = saleEditVarietyOptions.find(v => v.id === saleEdit.varietyId);
    if (!saleEdit.businessDate || !variety || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) { toast.error("Check the date, variety, quantity and price."); return; }
    if (saleEdit.paymentMethod === "credit" && (!saleEdit.customerName.trim() || unitPrice <= 0)) { toast.error("Credit sales need a customer name and a price above zero."); return; }
    if (saleEdit.customerName.trim().length > 120 || saleEdit.customerPhone.trim().length > 40) { toast.error("Customer name must be 120 characters or fewer and phone number 40 characters or fewer."); return; }
    const entry = individualEntries.find(row => row.id === editingSaleId);
    if (!entry) { toast.error("Refresh the sales list and try again."); return; }
    setBusySaleId(entry.id);
    try {
      await customFetch(`/api/nursery/entries/${encodeURIComponent(entry.id)}`, { method: "PATCH", body: JSON.stringify({ ...saleEdit, quantity, unitPrice, customerName: saleEdit.customerName.trim(), customerPhone: saleEdit.customerPhone.trim() }) });
      setEditingSaleId(null);
      setSaleEditSelectedVariety(null);
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
      toast.error(error?.message || "Could not update sale. Your changes are still available to retry.");
    } finally { setBusySaleId(null); }
  }

  async function deleteSale(entry: IndividualSaleEntry) {
    setBusySaleId(entry.id);
    try {
      await customFetch(`/api/nursery/entries/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      if (editingSaleId === entry.id) {
        setEditingSaleId(null);
        setSaleEditSelectedVariety(null);
      }
      if (filteredIndividualEntries.length === 1 && salesPage > 1) setSalesPage(page => Math.max(1, page - 1));
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
      toast.error(error?.message || "Could not delete sale. The entry is still in the register.");
    } finally { setBusySaleId(null); }
  }

  function choosePeriod(period: "day" | "week" | "month") {
    const end = businessDate;
    const start = period === "day" ? end : period === "week"
      ? addDays(end, -((new Date(end + "T12:00:00").getDay() + 6) % 7))
      : end.slice(0, 7) + "-01";
    setFrom(start); setTo(end);
  }

  const totalSeedlingsInCart = cart.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return (
    <Tabs value={activeTab} onValueChange={value => setActiveTab(value as NurseryTab)}>
      <div className="nursery-page mx-auto w-full max-w-[1480px] space-y-4 p-3.5 pb-12 sm:p-5 lg:p-6">

        {/* ── Sleek Botanical Workspace Header ── */}
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-primary/12 blur-3xl" />
            <div className="absolute -left-10 bottom-0 h-32 w-72 rounded-full bg-emerald-500/8 blur-2xl" />
          </div>

          <div className="relative flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start sm:items-center gap-3.5 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Sprout className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-xl sm:text-2xl font-bold tracking-tight">
                    Seedling Nursery <span className="text-primary">Register</span>
                  </h1>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    Separate from POS stock
                  </span>
                </div>
                <p className="mt-0.5 text-xs sm:text-sm text-muted-foreground">
                  Manage seedling sales, varieties, supplier stock, and customer statements in one dedicated ledger.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-2.5 rounded-2xl border border-border/80 bg-muted/40 px-3.5 py-2">
                <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Working Date</p>
                  <p className="text-xs font-bold font-mono">{formatBusinessDate(businessDate)}</p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => setActiveTab("record")}
                className="h-11 rounded-2xl px-4 font-bold gap-2 shadow-md shadow-primary/20 cursor-pointer"
              >
                <PackagePlus className="h-4 w-4" />
                New Seedling Sale
                {cart.length > 0 && (
                  <span className="ml-1 rounded-full bg-black/20 px-2 py-0.5 text-[11px] font-mono">
                    {cart.length}
                  </span>
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* ── Unified Navigation Rail ── */}
        <TabsList className="flex h-auto w-full items-center gap-1 overflow-x-auto scrollbar-hide justify-start rounded-2xl border border-border bg-card p-1.5 shadow-sm">
          {[
            { value: "overview", icon: LayoutDashboard, label: "Overview" },
            { value: "record", icon: PackagePlus, label: "Record Sale", badge: cart.length },
            { value: "catalogue", icon: Sprout, label: "Varieties" },
            { value: "insights", icon: Users, label: "Customers" },
            { value: "sales", icon: ReceiptText, label: "Sales History" },
            { value: "reports", icon: BarChart3, label: "Reports" },
            { value: "suppliers", icon: Truck, label: "Sources & Stock" },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="shrink-0 gap-2 rounded-xl px-3.5 py-2 text-xs font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all cursor-pointer"
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                {!!tab.badge && tab.badge > 0 && (
                  <span className="rounded-full bg-background/25 px-1.5 py-0.5 text-[10px] font-mono">
                    {tab.badge}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* ── Slim Date & Period Toolbar ── */}
        <section
          aria-label="Date controls"
          className="grid gap-2.5 rounded-2xl border border-border bg-card px-4 py-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(150px,0.75fr))_auto] lg:items-end"
        >
          <div className="nursery-date-field">
            <Label htmlFor="nursery-range-from" className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
              Period Starts
            </Label>
            <Input
              data-testid="input-nursery-period-from"
              id="nursery-range-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={event => { setFrom(event.target.value); setReportPage(1); setSalesPage(1); }}
              className="h-9 rounded-xl bg-muted/40 text-xs"
            />
          </div>
          <div className="nursery-date-field">
            <Label htmlFor="nursery-range-to" className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
              Period Ends
            </Label>
            <Input
              data-testid="input-nursery-period-to"
              id="nursery-range-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={event => { setTo(event.target.value); setReportPage(1); setSalesPage(1); }}
              className="h-9 rounded-xl bg-muted/40 text-xs"
            />
          </div>
          <div className="nursery-date-field">
            <Label htmlFor="business-date" className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-bold">
              Sale Date
            </Label>
            <Input
              data-testid="input-nursery-sale-date"
              id="business-date"
              type="date"
              value={businessDate}
              onChange={event => { if (event.target.value) setBusinessDate(event.target.value); }}
              className="h-9 rounded-xl bg-muted/40 text-xs"
            />
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 lg:justify-end">
            {(["day", "week", "month"] as const).map(period => (
              <Button
                key={period}
                data-testid={`button-period-${period}`}
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl text-xs font-semibold flex-1 sm:flex-none cursor-pointer"
                onClick={() => { choosePeriod(period); setReportPage(1); setSalesPage(1); }}
              >
                {period === "day" ? "Today" : period === "week" ? "This Week" : "This Month"}
              </Button>
            ))}
          </div>
          {from && to && from > to && (
            <p role="alert" className="text-xs font-medium text-destructive sm:col-span-2 lg:col-span-4">
              Start date must be on or before the end date.
            </p>
          )}
        </section>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* OVERVIEW TAB                                                        */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="overview" className="mt-4 space-y-5 focus-visible:outline-none">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr_1fr_auto]">
            <Card className="rounded-2xl border-primary/25 bg-primary/[0.06] overflow-hidden">
              <CardContent className="flex h-full min-h-[112px] flex-col justify-center gap-2 p-4">
                <Label htmlFor="nursery-month" className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                  Active Month
                </Label>
                <Input
                  data-testid="input-nursery-month"
                  id="nursery-month"
                  type="month"
                  value={selectedMonth}
                  onChange={event => setSelectedMonth(event.target.value)}
                  className="h-10 rounded-xl bg-card text-sm font-bold"
                />
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="flex h-full min-h-[112px] items-center gap-3.5 p-4">
                <div className="rounded-2xl bg-primary/12 border border-primary/25 p-3 text-primary">
                  <Leaf className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Seedlings Sold</p>
                  <p data-testid="text-month-seedlings" className="mt-1 text-2xl font-bold font-mono tabular-nums">
                    {Number(monthSummary.seedlingsSold).toLocaleString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">selected month</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="flex h-full min-h-[112px] items-center gap-3.5 p-4">
                <div className="rounded-2xl bg-emerald-500/12 border border-emerald-500/25 p-3 text-emerald-400">
                  <Banknote className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Sales Revenue</p>
                  <p data-testid="text-month-revenue" className="mt-1 text-2xl font-bold font-mono tabular-nums text-primary">
                    {formatKES(cents(Number(monthSummary.totalRevenueCents)))}
                  </p>
                  <p className="text-[11px] text-muted-foreground">recorded value</p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardContent className="flex h-full min-h-[112px] items-center gap-3.5 p-4">
                <div className="rounded-2xl bg-sky-500/12 border border-sky-500/25 p-3 text-sky-400">
                  <Boxes className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Categories</p>
                  <p className="mt-1 text-2xl font-bold font-mono tabular-nums">{monthCategories.length}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {topMonthCategory ? `Top · ${topMonthCategory.category}` : "No sales yet"}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Button
              data-testid="button-refresh-month-summary"
              type="button"
              variant="outline"
              className="h-auto min-h-14 rounded-2xl gap-2 self-stretch sm:col-span-2 xl:col-span-1 cursor-pointer"
              onClick={() => void monthlySummaryQuery.refetch()}
              disabled={monthlySummaryQuery.isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${monthlySummaryQuery.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* Payment Mix Visual Card */}
          <Card className="rounded-3xl overflow-hidden">
            <CardHeader className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Payment Breakdown</p>
                <CardTitle className="mt-1 text-lg">Where sales landed</CardTitle>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Cash <b className="font-mono">{formatKES(cents(monthPaymentTotals.cash))}</b></span>
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-sky-400" />M-Pesa <b className="font-mono">{formatKES(cents(monthPaymentTotals.mpesa))}</b></span>
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-violet-400" />Credit <b className="font-mono">{formatKES(cents(monthPaymentTotals.credit))}</b></span>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 space-y-4">
              {/* Stacked mix bar */}
              {(() => {
                const revenue = Number(monthSummary.totalRevenueCents) || 0;
                const cashPct = revenue > 0 ? (monthPaymentTotals.cash / revenue) * 100 : 0;
                const mpesaPct = revenue > 0 ? (monthPaymentTotals.mpesa / revenue) * 100 : 0;
                const creditPct = revenue > 0 ? (monthPaymentTotals.credit / revenue) * 100 : 0;
                return (
                  <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
                    {cashPct > 0 && <div className="bg-amber-400 h-full transition-all" style={{ width: `${cashPct}%` }} />}
                    {mpesaPct > 0 && <div className="bg-sky-400 h-full transition-all" style={{ width: `${mpesaPct}%` }} />}
                    {creditPct > 0 && <div className="bg-violet-400 h-full transition-all" style={{ width: `${creditPct}%` }} />}
                  </div>
                );
              })()}
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Cash", amount: monthPaymentTotals.cash, tone: "bg-amber-400", text: "text-amber-400" },
                  { label: "M-Pesa", amount: monthPaymentTotals.mpesa, tone: "bg-sky-400", text: "text-sky-400" },
                  { label: "Credit", amount: monthPaymentTotals.credit, tone: "bg-violet-400", text: "text-violet-400" },
                ].map(item => {
                  const revenue = Number(monthSummary.totalRevenueCents) || 0;
                  const share = revenue > 0 ? Math.min(100, Math.round((item.amount / revenue) * 100)) : 0;
                  return (
                    <div key={item.label} className="rounded-2xl border border-border/70 bg-muted/25 p-3.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-foreground">{item.label}</span>
                        <span className={cn("font-mono font-bold", item.text)}>{share}%</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full rounded-full ${item.tone} transition-[width] duration-300`} style={{ width: `${share}%` }} />
                      </div>
                      <p className="mt-2.5 text-base font-bold font-mono tabular-nums">{formatKES(cents(item.amount))}</p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Monthly Categories Table */}
          <Card className="rounded-3xl overflow-hidden">
            <CardHeader className="flex flex-col gap-3 border-b border-border/70 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Monthly sales by category
                </CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">Totals reflect each variety&apos;s current category.</p>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2 rounded-xl cursor-pointer" onClick={() => setActiveTab("catalogue")}>
                <Boxes className="h-4 w-4" />
                Manage categories
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {monthlySummaryQuery.isLoading ? (
                <p className="p-8 text-center text-sm text-muted-foreground">Loading this month&apos;s nursery totals…</p>
              ) : monthlySummaryQuery.isError ? (
                <div className="p-8 text-center">
                  <p className="font-medium text-destructive">Could not load monthly totals</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void monthlySummaryQuery.refetch()}>Try again</Button>
                </div>
              ) : !(monthlySummaryQuery.data?.categories.length) ? (
                <p className="p-8 text-center text-sm text-muted-foreground">No nursery sales have been recorded for this month.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                        <th className="px-5 py-3">Category</th>
                        <th className="px-4 py-3 text-right">Varieties</th>
                        <th className="px-4 py-3 text-right">Plants Sold</th>
                        <th className="px-4 py-3 text-right">Sales Value</th>
                        <th className="px-5 py-3">Payment Mix</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummaryQuery.data.categories.map(category => (
                        <tr key={category.category} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                          <td className="px-5 py-3.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold">{category.category}</span>
                              {category.category.trim().toLowerCase() === "uncategorized" && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1.5 px-2 text-[11px] rounded-lg"
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
                          <td className="px-4 py-3.5 text-right font-mono tabular-nums">{Number(category.varietyCount).toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right font-bold font-mono tabular-nums">{Number(category.seedlingsSold).toLocaleString()}</td>
                          <td className="px-4 py-3.5 text-right font-bold font-mono tabular-nums text-primary">{formatKES(cents(Number(category.totalRevenueCents)))}</td>
                          <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono">
                            Cash {formatKES(cents(Number(category.cashCents)))} · M-Pesa {formatKES(cents(Number(category.mpesaCents)))} · Credit {formatKES(cents(Number(category.creditCents)))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* RECORD SALE TAB — Split-Screen Seedling POS                         */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="record" className="mt-4 focus-visible:outline-none">
          <form onSubmit={saveEntry} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_480px] items-start">
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
                      onChange={e => setProductSearch(e.target.value)}
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
                    onChange={e => setProductCategory(e.target.value)}
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
                      onClick={() => setProductCategory("")}
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
                        onClick={() => setProductCategory(productCategory === cat ? "" : cat)}
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
                {(productSearch.trim() || productCategory) && saleVarietiesQuery.isFetching && (
                  <p data-testid="status-nursery-variety-search" role="status" className="rounded-2xl border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Finding matching seedlings…
                  </p>
                )}

                {(productSearch.trim() || productCategory) && saleVarietiesQuery.isError && (
                  <div data-testid="status-nursery-variety-error" role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm">
                    <p className="font-medium text-destructive">Could not load seedling varieties.</p>
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void saleVarietiesQuery.refetch()}>Try again</Button>
                  </div>
                )}

                {!productSearch.trim() && !productCategory && saleVarietiesQuery.isSuccess && varieties.length === 0 ? (
                  <p data-testid="status-nursery-varieties-empty" className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    There are no active varieties yet. Add one in the Varieties tab before recording a sale.
                  </p>
                ) : matchingSaleVarieties.length === 0 && !saleVarietiesQuery.isFetching ? (
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
                      onClick={() => setPaymentMethod("cash")}
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
                      onClick={() => setPaymentMethod("mpesa")}
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
                      onClick={() => setPaymentMethod("credit")}
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
                      onChange={setCustomerName}
                      onSelect={(customer: SelectedCustomer) => { setCustomerName(customer.name); setCustomerPhone(customer.phone); }}
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
                        onChange={e => setCustomerPhone(e.target.value)}
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

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* VARIETIES TAB                                                       */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="catalogue" className="mt-4 space-y-4 focus-visible:outline-none">
          <Card className="rounded-3xl overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-muted/20 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-sky-500/15 border border-sky-500/25 p-2.5 text-sky-400">
                    <Sprout className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Seedling Catalogue</CardTitle>
                    <p className="text-xs text-muted-foreground">Set up seedling varieties, categories, and default prices.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-xs font-bold font-mono text-sky-400">
                    {catalogueTotal.toLocaleString()} {catalogueStatus === "active" ? "active" : catalogueStatus === "archived" ? "archived" : "total"}
                  </span>
                  <Button type="button" variant="outline" size="sm" className="rounded-xl gap-1.5 cursor-pointer" onClick={() => setCatalogueExpanded(value => !value)}>
                    {catalogueExpanded ? "Collapse" : "Expand"}
                    <ChevronDown className={`h-4 w-4 transition-transform ${catalogueExpanded ? "rotate-180" : ""}`} />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 p-4 sm:p-5">
              {catalogueExpanded && (
                <>
                  {/* Add Variety Form */}
                  <form onSubmit={createVariety} className="rounded-2xl border border-dashed border-primary/35 bg-primary/[0.04] p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-primary">
                      <Plus className="h-4 w-4" />
                      Add New Variety
                    </div>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_140px_auto]">
                      <div className="space-y-1">
                        <Label htmlFor="new-name" className="text-xs">Variety Name</Label>
                        <Input id="new-name" placeholder="e.g. Cabbage Copenhagen" value={newName} onChange={e => setNewName(e.target.value)} maxLength={80} required className="h-10 rounded-xl bg-background" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="new-category" className="text-xs">Category</Label>
                        <Input id="new-category" placeholder="e.g. Vegetables" value={newCategory} onChange={e => setNewCategory(e.target.value)} maxLength={60} className="h-10 rounded-xl bg-background" />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="new-price" className="text-xs">Default Price (KES)</Label>
                        <Input id="new-price" type="number" min="0" step="0.01" value={newPrice} onChange={e => setNewPrice(e.target.value)} required className="h-10 rounded-xl bg-background font-mono" />
                      </div>
                      <div className="flex items-end">
                        <Button type="submit" disabled={addingVariety} className="w-full h-10 rounded-xl gap-1.5 font-bold cursor-pointer">
                          <Plus className="h-4 w-4" />
                          Add Variety
                        </Button>
                      </div>
                    </div>
                  </form>

                  {/* Search & Filters */}
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-3 space-y-2.5">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
                      <div className="relative min-w-0 flex-1">
                        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input value={catalogueSearch} onChange={e => { setCatalogueSearch(e.target.value); setCataloguePage(1); }} placeholder="Find a seedling variety…" aria-label="Search seedling catalogue" className="h-10 rounded-xl bg-background pl-10" />
                      </div>
                      <div className="relative sm:w-44">
                        <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <select aria-label="Filter seedling varieties" value={catalogueStatus} onChange={e => { setCatalogueStatus(e.target.value as typeof catalogueStatus); setCataloguePage(1); }} className="h-10 w-full appearance-none rounded-xl border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                          <option value="active">Active varieties</option>
                          <option value="archived">Archived varieties</option>
                          <option value="all">All varieties</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                      <div className="relative sm:w-44">
                        <select aria-label="Filter varieties by category" value={catalogueCategory} onChange={e => { setCatalogueCategory(e.target.value); setCataloguePage(1); }} className="h-10 w-full appearance-none rounded-xl border border-input bg-background px-3 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                          <option value="">All categories</option>
                          {catalogueCategories.map(category => <option key={category} value={category}>{category}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <p>Showing <span className="font-semibold text-foreground">{catalogueStart}–{catalogueEnd}</span> of <span className="font-semibold text-foreground">{catalogueTotal}</span></p>
                      {(catalogueSearch || catalogueCategory || catalogueStatus !== "active") && (
                        <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={() => { setCatalogueSearch(""); setCatalogueCategory(""); setCatalogueStatus("active"); setCataloguePage(1); }}>
                          Reset filters
                        </Button>
                      )}
                    </div>
                  </div>

                  {catalogueQuery.isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading seedling varieties…</p>}
                  {catalogueQuery.isError && (
                    <div role="alert" className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center text-sm">
                      <p className="font-medium text-destructive">Could not load seedling varieties.</p>
                      <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void catalogueQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
                    </div>
                  )}
                  {catalogueQuery.isSuccess && catalogueTotal === 0 && !catalogueSearch && catalogueStatus === "active" && (
                    <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Add cabbage, spinach or any seedling varieties sold by this shop.</p>
                  )}
                  {catalogueQuery.isSuccess && catalogueTotal === 0 && (catalogueSearch || catalogueStatus !== "active") && (
                    <div className="rounded-2xl border border-dashed p-6 text-center">
                      <Sprout className="mx-auto h-6 w-6 text-muted-foreground/60" />
                      <p className="mt-2 text-sm font-medium">No varieties match this view</p>
                      <p className="mt-1 text-xs text-muted-foreground">Try another search or switch the status filter.</p>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catalogueRows.map(v => (
                      <div key={v.id} className="rounded-2xl border border-border bg-muted/15 p-4 transition-colors hover:border-primary/35">
                        {editingVarietyId === v.id ? (
                          <div className="space-y-3">
                            <div className="space-y-1"><Label htmlFor={`edit-name-${v.id}`} className="text-xs">Variety name</Label><Input id={`edit-name-${v.id}`} value={editingName} onChange={e => setEditingName(e.target.value)} maxLength={80} autoFocus className="h-9 rounded-xl" /></div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1"><Label htmlFor={`edit-category-${v.id}`} className="text-xs">Category</Label><Input id={`edit-category-${v.id}`} value={editingCategory} onChange={e => setEditingCategory(e.target.value)} maxLength={60} className="h-9 rounded-xl" /></div>
                              <div className="space-y-1"><Label htmlFor={`edit-price-${v.id}`} className="text-xs">Price (KES)</Label><Input id={`edit-price-${v.id}`} type="number" min="0" step="0.01" value={editingPrice} onChange={e => setEditingPrice(e.target.value)} className="h-9 rounded-xl font-mono" /></div>
                            </div>
                            <div className="flex items-center gap-2 pt-1">
                              <Button type="button" size="sm" disabled={busyVarietyId === v.id} onClick={() => saveVarietyEdit(v)} className="flex-1 gap-1 rounded-xl"><Save className="h-3.5 w-3.5" /> Save</Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => setEditingVarietyId(null)} className="rounded-xl">Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col h-full justify-between gap-3">
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                  {v.category || "Uncategorized"}
                                </span>
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", Boolean(v.isActive) ? "bg-emerald-500/12 text-emerald-400" : "bg-muted text-muted-foreground")}>
                                  {Boolean(v.isActive) ? "Active" : "Archived"}
                                </span>
                              </div>
                              <p className="font-bold text-sm text-foreground">{v.name}</p>
                              <p className="text-base font-bold font-mono text-primary mt-1">{formatKES(v.defaultPrice)} <span className="text-[11px] font-sans font-normal text-muted-foreground">each</span></p>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60">
                              <Button type="button" variant="outline" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => beginEditVariety(v)} className="gap-1 rounded-xl h-8 text-xs"><Pencil className="h-3 w-3" /> Edit</Button>
                              <Button type="button" variant="outline" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => toggleVariety(v)} className="gap-1 rounded-xl h-8 text-xs"><Archive className="h-3 w-3" />{Boolean(v.isActive) ? "Archive" : "Restore"}</Button>
                              <Button type="button" variant="ghost" size="sm" disabled={busyVarietyId === v.id || v.id.startsWith("local-")} onClick={() => { if (window.confirm(`Delete ${v.name}? Varieties with sales history will be archived instead.`)) void deleteVariety(v); }} className="ml-auto gap-1 rounded-xl h-8 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {cataloguePageCount > 1 && (
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={cataloguePage <= 1 || catalogueQuery.isFetching} onClick={() => setCataloguePage(page => Math.max(1, page - 1))}>Previous</Button>
                      <span className="text-xs text-muted-foreground">Page {cataloguePage} of {cataloguePageCount}</span>
                      <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={cataloguePage >= cataloguePageCount || catalogueQuery.isFetching} onClick={() => setCataloguePage(page => Math.min(cataloguePageCount, page + 1))}>Next</Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* CUSTOMERS INSIGHTS TAB                                              */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="insights" className="mt-4 space-y-4 focus-visible:outline-none">
          <Card className="rounded-3xl overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-lg"><Users className="h-5 w-5 text-primary" /> Customer Buying Insights</CardTitle>
              <p className="text-xs text-muted-foreground">Named customers ranked by seedling spend for the selected period.</p>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {customerInsightsQuery.isLoading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Loading customer insights…</p>
              ) : customerInsightsQuery.isError ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-destructive">Could not load customer insights.</p>
                  <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void customerInsightsQuery.refetch()}>Try again</Button>
                </div>
              ) : !customerInsightsQuery.data?.rows?.length ? (
                <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No named customer purchases in this date range yet. Attach a customer when recording a sale to see buying patterns.</p>
              ) : (() => {
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
                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-muted/30 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customers Buying</p><p className="mt-1 text-2xl font-bold font-mono">{customers.length}</p></div>
                      <div className="rounded-2xl border border-border bg-muted/30 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Named Seedlings Sold</p><p className="mt-1 text-2xl font-bold font-mono">{customers.reduce((sum, customer) => sum + customer.quantity, 0).toLocaleString()}</p></div>
                      <div className="rounded-2xl border border-primary/25 bg-primary/[0.06] p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-primary">Named Sales Value</p><p className="mt-1 text-2xl font-bold font-mono text-primary">{formatKES(customers.reduce((sum, customer) => sum + customer.totalCents, 0) / 100)}</p></div>
                    </div>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {customers.map((customer) => {
                        const favorite = [...customer.varieties.entries()].sort((a, b) => b[1] - a[1])[0];
                        return (
                          <div key={customer.name.toLowerCase()} className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="h-10 w-10 rounded-xl bg-primary/12 text-primary font-bold flex items-center justify-center shrink-0">
                                {customer.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-sm truncate">{customer.name}</p>
                                <p className="text-xs text-muted-foreground">{customer.phone || "No phone"} · {formatBusinessDate(customer.lastPurchase)}</p>
                                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  <TrendingUp className="h-3 w-3 text-primary" />
                                  Top: {favorite?.[0] ?? "—"} ({favorite?.[1].toLocaleString() ?? "0"})
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-base font-bold font-mono tabular-nums text-primary">{formatKES(customer.totalCents / 100)}</p>
                              <p className="text-[11px] font-mono text-muted-foreground">{customer.quantity.toLocaleString()} plants</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SALES HISTORY TAB                                                   */}
        {/* ════════════════════════════════════════════════════════════════════ */}
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
                    <Input id="nursery-statement-customer" value={statementCustomer} onChange={e => setStatementCustomer(e.target.value)} maxLength={120} placeholder="Enter saved customer name" className="h-10 rounded-xl bg-background" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nursery-statement-phone" className="text-xs">Phone number (optional)</Label>
                    <Input id="nursery-statement-phone" value={statementPhone} onChange={e => setStatementPhone(e.target.value)} maxLength={40} inputMode="tel" placeholder="Phone number" className="h-10 rounded-xl bg-background" />
                  </div>
                  <Button type="button" onClick={() => void createCustomerStatement()} disabled={statementBusy || (!statementCustomer.trim() && !statementPhone.trim()) || !from || !to || from > to} className="h-10 rounded-xl gap-2 cursor-pointer">
                    {statementBusy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                    {statementBusy ? "Preparing…" : "Generate Statement"}
                  </Button>
                </div>
              </section>

              {/* Search & Filter */}
              <div className="grid gap-2.5 rounded-2xl border border-border/70 bg-muted/20 p-3 sm:grid-cols-[minmax(0,1fr)_190px_auto] sm:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={saleSearch} onChange={e => { setSaleSearch(e.target.value); setSalesPage(1); }} placeholder="Search customer, phone, seedling or date…" aria-label="Search individual sales" className="h-10 rounded-xl bg-background pl-10" />
                </div>
                <div className="relative">
                  <SlidersHorizontal className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select aria-label="Filter by payment method" value={salePaymentFilter} onChange={e => { setSalePaymentFilter(e.target.value as typeof salePaymentFilter); setSalesPage(1); }} className="h-10 w-full appearance-none rounded-xl border border-input bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring">
                    <option value="all">All payment methods</option>
                    <option value="cash">Cash</option>
                    <option value="mpesa">M-Pesa</option>
                    <option value="credit">Credit</option>
                  </select>
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => { setSaleSearch(""); setSalePaymentFilter("all"); setSalesPage(1); }} disabled={!saleSearch && salePaymentFilter === "all"} className="h-10 rounded-xl">Clear</Button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <p>Showing <span className="font-semibold text-foreground">{individualTotal ? ((salesPage - 1) * salesPageSize + 1).toLocaleString() : "0"}–{Math.min(salesPage * salesPageSize, individualTotal).toLocaleString()}</span> of {individualTotal.toLocaleString()}</p>
                <p className="inline-flex items-center gap-1.5"><CircleDollarSign className="h-3.5 w-3.5" /> Credit total: <span className="font-semibold font-mono text-foreground">{formatKES(cents(individualSaleSummary.creditCents))}</span></p>
              </div>

              {editingSaleId && (
                <form onSubmit={saveSaleEdit} className="rounded-2xl border border-primary/35 bg-primary/[0.05] p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-primary/15 p-2 text-primary"><Pencil className="h-4 w-4" /></div>
                      <div>
                        <p className="font-bold">Edit Sale Entry</p>
                        <p className="text-xs text-muted-foreground">Save corrections to refresh reports and balances.</p>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label="Cancel sale edit" onClick={() => { setEditingSaleId(null); setSaleEditSelectedVariety(null); }}><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="space-y-1.5"><Label htmlFor="sale-edit-date">Sale date</Label><Input id="sale-edit-date" data-testid="input-nursery-edit-date" type="date" value={saleEdit.businessDate} onChange={e => setSaleEdit(s => ({ ...s, businessDate: e.target.value }))} required /></div>
                    <div className="space-y-1.5">
                      <Label htmlFor="sale-edit-variety-search">Find a variety</Label>
                      <Input id="sale-edit-variety-search" data-testid="input-nursery-edit-variety-search" value={saleEditSearch} onChange={e => setSaleEditSearch(e.target.value)} placeholder="Type the start of a name…" autoComplete="off" />
                      <select
                        id="sale-edit-variety"
                        data-testid="select-nursery-edit-variety"
                        aria-label="Selected seedling variety"
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                        value={saleEdit.varietyId}
                        onChange={e => {
                          const selected = saleEditVarietyOptions.find(variety => variety.id === e.target.value);
                          setSaleEdit(s => ({ ...s, varietyId: e.target.value }));
                          if (selected) setSaleEditSelectedVariety({ id: selected.id, name: selected.name });
                        }}
                        required
                      >
                        {saleEditVarietyOptions.map(v => <option key={v.id} value={v.id}>{v.name}{Boolean(v.isActive) ? "" : " (archived)"}</option>)}
                      </select>
                      <p className="text-xs text-muted-foreground">{saleEditVarietiesQuery.isFetching ? "Searching varieties…" : "Search and pick variety."}</p>
                    </div>
                    <div className="space-y-1.5"><Label htmlFor="sale-edit-qty">Quantity</Label><Input id="sale-edit-qty" data-testid="input-nursery-edit-quantity" type="number" min="1" max="10000000" step="1" inputMode="numeric" value={saleEdit.quantity} onChange={e => setSaleEdit(s => ({ ...s, quantity: e.target.value }))} required /></div>
                    <div className="space-y-1.5"><Label htmlFor="sale-edit-price">Unit price (KES)</Label><Input id="sale-edit-price" data-testid="input-nursery-edit-price" type="number" min="0" max="1000000" step="0.01" inputMode="decimal" value={saleEdit.unitPrice} onChange={e => setSaleEdit(s => ({ ...s, unitPrice: e.target.value }))} required /></div>
                    <div className="space-y-1.5"><Label htmlFor="sale-edit-payment">Payment method</Label><select id="sale-edit-payment" data-testid="select-nursery-edit-payment" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground" value={saleEdit.paymentMethod} onChange={e => setSaleEdit(s => ({ ...s, paymentMethod: e.target.value as "cash" | "mpesa" | "credit" }))}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="credit">Credit</option></select></div>
                    <div className="space-y-1.5"><Label htmlFor="sale-edit-customer">Customer name</Label><Input id="sale-edit-customer" data-testid="input-nursery-edit-customer" value={saleEdit.customerName} onChange={e => setSaleEdit(s => ({ ...s, customerName: e.target.value }))} maxLength={120} placeholder="Walk-in customer if blank" /></div>
                    <div className="space-y-1.5"><Label htmlFor="sale-edit-phone">Customer phone</Label><Input id="sale-edit-phone" data-testid="input-nursery-edit-phone" type="tel" value={saleEdit.customerPhone} onChange={e => setSaleEdit(s => ({ ...s, customerPhone: e.target.value }))} maxLength={40} /></div>
                  </div>
                  {saleEdit.paymentMethod === "credit" && (
                    <p data-testid="status-nursery-edit-credit" className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
                      Credit entries require a customer and positive price. Sales with payments already recorded must be reconciled in Debts before editing or deleting.
                    </p>
                  )}
                  <div className="mt-4 flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
                    <Button data-testid="button-cancel-nursery-edit" type="button" variant="outline" onClick={() => { setEditingSaleId(null); setSaleEditSelectedVariety(null); }}>Cancel</Button>
                    <Button data-testid="button-save-nursery-edit" type="submit" disabled={busySaleId === editingSaleId} className="gap-2"><Save className="h-4 w-4" /> Save changes</Button>
                  </div>
                </form>
              )}

              {individualEntriesQuery.isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(item => <div key={item} className="h-36 animate-pulse rounded-2xl border bg-muted/40" />)}</div>
              ) : individualEntriesQuery.isError ? (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center">
                  <p className="font-medium text-destructive">Could not load individual sales</p>
                  <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void individualEntriesQuery.refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
                </div>
              ) : !filteredIndividualEntries.length ? (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                  <ClipboardList className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-3 font-semibold">{saleSearch || salePaymentFilter !== "all" ? "No matching sales found" : "No individual entries in this period"}</p>
                  {(saleSearch || salePaymentFilter !== "all") && (
                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { setSaleSearch(""); setSalePaymentFilter("all"); setSalesPage(1); }}>Clear filters</Button>
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
                      <Button type="button" size="sm" disabled={!filteredIndividualEntries.some(entry => selectedSaleIds.includes(entry.id))} onClick={() => void downloadSelectedSalesPdf()} className="gap-1.5 rounded-xl"><ReceiptText className="h-4 w-4" /> Download combined PDF</Button>
                      <Button type="button" variant="ghost" size="sm" disabled={!selectedSaleIds.length} onClick={() => setSelectedSaleIds([])} className="rounded-xl">Clear</Button>
                    </div>
                  </div>

                  {/* Mobile / Tablet Cards */}
                  <div className="grid gap-3 sm:grid-cols-2 xl:hidden">
                    {filteredIndividualEntries.map(entry => (
                      <div key={entry.id} className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4">
                        <div className={"absolute inset-x-0 top-0 h-1 " + (entry.paymentMethod === "cash" ? "bg-amber-400" : entry.paymentMethod === "mpesa" ? "bg-sky-400" : "bg-violet-400")} />
                        <div className="flex items-start justify-between gap-3 pt-1">
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input type="checkbox" aria-label={`Select ${entry.varietyName} sale`} checked={selectedSaleIds.includes(entry.id)} onChange={() => toggleSaleSelection(entry.id)} className="h-4 w-4 rounded border-border accent-primary" />
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
                          <Button type="button" variant="outline" size="sm" onClick={() => downloadReceipt(entry)} className="gap-1 rounded-xl h-8 text-xs"><ReceiptText className="h-3.5 w-3.5" /> PDF</Button>
                          <Button type="button" variant="outline" size="sm" disabled={busySaleId === entry.id || !!entry.sourceSupplierId} title={entry.sourceSupplierId ? "Supplier-linked sales are locked to preserve stock and debt records." : undefined} onClick={() => beginEditSale(entry)} className="flex-1 gap-1 rounded-xl h-8 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                          <Button type="button" variant="ghost" size="sm" disabled={busySaleId === entry.id || !!entry.sourceSupplierId} title={entry.sourceSupplierId ? "Supplier-linked sales are locked to preserve stock and debt records." : undefined} onClick={() => { if (window.confirm("Delete this " + entry.varietyName + " sale for " + formatKES(cents(entry.totalAmountCents)) + "? The linked totals will be adjusted.")) void deleteSale(entry); }} className="gap-1 rounded-xl h-8 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></Button>
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
                            <td className="w-10 px-3 py-3.5"><input type="checkbox" aria-label={`Select ${entry.varietyName} sale`} checked={selectedSaleIds.includes(entry.id)} onChange={() => toggleSaleSelection(entry.id)} className="h-4 w-4 rounded border-border accent-primary" /></td>
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
                                <Button type="button" variant="outline" size="sm" onClick={() => downloadReceipt(entry)} className="gap-1 rounded-xl h-8 text-xs"><ReceiptText className="h-3.5 w-3.5" /> PDF</Button>
                                <Button type="button" variant="outline" size="sm" disabled={busySaleId === entry.id || !!entry.sourceSupplierId} title={entry.sourceSupplierId ? "Supplier-linked sales are locked to preserve stock and debt records." : undefined} onClick={() => beginEditSale(entry)} className="gap-1 rounded-xl h-8 text-xs"><Pencil className="h-3.5 w-3.5" /> Edit</Button>
                                <Button type="button" variant="ghost" size="sm" disabled={busySaleId === entry.id || !!entry.sourceSupplierId} title={entry.sourceSupplierId ? "Supplier-linked sales are locked to preserve stock and debt records." : undefined} onClick={() => { if (window.confirm("Delete this " + entry.varietyName + " sale for " + formatKES(cents(entry.totalAmountCents)) + "? The linked totals will be adjusted.")) void deleteSale(entry); }} className="gap-1 rounded-xl h-8 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></Button>
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
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={salesPage <= 1 || individualEntriesQuery.isFetching} onClick={() => setSalesPage(page => Math.max(1, page - 1))}>Previous</Button>
                    <Button type="button" variant="outline" size="sm" className="rounded-xl" disabled={salesPage >= individualPageCount || individualEntriesQuery.isFetching} onClick={() => setSalesPage(page => Math.min(individualPageCount, page + 1))}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* REPORTS TAB                                                         */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="reports" className="mt-4 space-y-4 focus-visible:outline-none">
          <Card className="rounded-3xl overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-muted/20">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-lg">Nursery Sales Report</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">Compare the selected working day with the full reporting period.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  <span className="rounded-xl border border-border bg-background/70 px-3 py-1.5 text-xs font-semibold font-mono tabular-nums">
                    {formatBusinessDate(from)} <span className="px-1 text-muted-foreground">to</span> {formatBusinessDate(to)}
                  </span>
                  <Button data-testid="button-refresh-nursery-report" type="button" size="icon" variant="outline" aria-label="Refresh report" className="rounded-xl" disabled={reportQuery.isFetching} onClick={() => qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] })}>
                    <RefreshCw className={"h-4 w-4 " + (reportQuery.isFetching ? "animate-spin" : "")} />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
              {reportQuery.isLoading && !report ? (
                <div className="space-y-3 py-3"><div className="h-24 animate-pulse rounded-2xl bg-muted/60" /><div className="h-12 animate-pulse rounded-2xl bg-muted/40" /><div className="h-40 animate-pulse rounded-2xl bg-muted/30" /></div>
              ) : reportQuery.isError && !report ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-destructive">Could not load report. Check your connection and try refreshing.</p>
                  <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void reportQuery.refetch()}>Try again</Button>
                </div>
              ) : report ? (
                <div className="space-y-5">
                  <section aria-label="Selected sale date summary" className="rounded-2xl border border-primary/35 bg-gradient-to-br from-primary/15 via-primary/[0.06] to-card p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Selected Sale Date</p>
                        <p className="mt-1 text-base font-bold">{formatBusinessDate(businessDate)}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Seedlings Sold</p>
                          <p data-testid="text-report-daily-seedlings" className="mt-0.5 text-2xl font-bold font-mono tabular-nums">
                            {Number(report.dailySummary?.totalSeedlings ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground">Sales Value</p>
                          <p data-testid="text-report-daily-revenue" className="mt-0.5 text-2xl font-bold font-mono tabular-nums text-primary">
                            {formatKES(cents(report.dailySummary?.totalRevenueCents))}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs sm:max-w-[520px]">
                      <p><span className="block text-muted-foreground">Cash</span><span className="mt-0.5 block font-bold font-mono">{formatKES(cents(report.dailySummary?.cashCents))}</span></p>
                      <p><span className="block text-muted-foreground">M-Pesa</span><span className="mt-0.5 block font-bold font-mono">{formatKES(cents(report.dailySummary?.mpesaCents))}</span></p>
                      <p><span className="block text-muted-foreground">Credit</span><span className="mt-0.5 block font-bold font-mono">{formatKES(cents(report.dailySummary?.creditCents))}</span></p>
                    </div>
                  </section>

                  <section aria-label="Reporting period summary" className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-muted/25 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Selected Period · Seedlings Sold</p>
                      <p data-testid="text-report-range-seedlings" className="mt-1 text-2xl font-bold font-mono tabular-nums">{Number(report.summary?.totalSeedlings ?? 0).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatBusinessDate(from)} to {formatBusinessDate(to)}</p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/25 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Selected Period · Sales Value</p>
                      <p data-testid="text-report-range-revenue" className="mt-1 text-2xl font-bold font-mono tabular-nums text-primary">{formatKES(cents(report.summary?.totalRevenueCents))}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
                        <span>Cash {formatKES(cents(report.summary?.cashCents))}</span>
                        <span>M-Pesa {formatKES(cents(report.summary?.mpesaCents))}</span>
                        <span>Credit {formatKES(cents(report.summary?.creditCents))}</span>
                      </div>
                    </div>
                  </section>

                  {reportQuery.isFetching && <p role="status" className="text-xs text-muted-foreground">Updating report…</p>}
                  {reportRows.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No seedling sales found for this date range.</p>
                  ) : (
                    <>
                      <div className="hidden overflow-x-auto rounded-2xl border border-border/70 md:block">
                        <table className="w-full min-w-[680px] text-left text-sm">
                          <thead>
                            <tr className="border-b border-border bg-muted/30 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                              <th className="px-4 py-3">Variety</th>
                              <th className="px-4 py-3 text-right">Plants Sold</th>
                              <th className="px-4 py-3 text-right">Sales Value</th>
                              <th className="px-4 py-3">Payment Mix</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportRows.map((row, index) => (
                              <tr key={row.varietyKey ?? `${row.varietyId ?? row.varietyName.trim().toLowerCase()}-${index}`} className="border-b border-border/60 last:border-0 hover:bg-muted/25">
                                <td className="px-4 py-3 font-bold">{row.varietyName}</td>
                                <td className="px-4 py-3 text-right font-bold font-mono tabular-nums">{Number(row.quantity).toLocaleString()}</td>
                                <td className="px-4 py-3 text-right font-bold font-mono tabular-nums text-primary">{formatKES(cents(Number(row.totalAmountCents)))}</td>
                                <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    <span>Cash {formatKES(cents(Number(row.cashCents)))}</span>
                                    <span>M-Pesa {formatKES(cents(Number(row.mpesaCents)))}</span>
                                    <span>Credit {formatKES(cents(Number(row.creditCents)))}</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2.5 md:hidden">
                        {reportRows.map((row, index) => (
                          <article key={row.varietyKey ?? `${row.varietyId ?? row.varietyName.trim().toLowerCase()}-${index}`} data-testid={`card-report-variety-${index}`} className="rounded-2xl border border-border bg-card p-3.5">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="truncate text-sm font-bold">{row.varietyName}</h3>
                                <p className="mt-0.5 text-xs text-muted-foreground">{Number(row.quantity).toLocaleString()} seedlings sold</p>
                              </div>
                              <p className="shrink-0 text-sm font-bold font-mono text-primary">{formatKES(cents(Number(row.totalAmountCents)))}</p>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-border/60 pt-2 text-xs font-mono">
                              <p className="text-muted-foreground">Cash<span className="mt-0.5 block font-bold text-foreground">{formatKES(cents(Number(row.cashCents)))}</span></p>
                              <p className="text-muted-foreground">M-Pesa<span className="mt-0.5 block font-bold text-foreground">{formatKES(cents(Number(row.mpesaCents)))}</span></p>
                              <p className="text-muted-foreground">Credit<span className="mt-0.5 block font-bold text-foreground">{formatKES(cents(Number(row.creditCents)))}</span></p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {reportTotal > 0 && (
                <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">Showing {((reportPage - 1) * reportPageSize + 1).toLocaleString()}–{Math.min(reportPage * reportPageSize, reportTotal).toLocaleString()} of {reportTotal.toLocaleString()} · Page {reportPage} of {reportPageCount}</p>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={reportPage <= 1 || reportQuery.isFetching} onClick={() => setReportPage(page => Math.max(1, page - 1))}>Previous</Button>
                    <Button type="button" size="sm" variant="outline" className="rounded-xl" disabled={reportPage >= reportPageCount || reportQuery.isFetching} onClick={() => setReportPage(page => Math.min(reportPageCount, page + 1))}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SOURCES & SUPPLIERS TAB                                             */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="suppliers" className="mt-4 space-y-4 focus-visible:outline-none">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="rounded-3xl overflow-hidden">
              <CardHeader className="border-b border-border/70 bg-muted/20">
                <CardTitle className="text-base">Add Plant Supplier</CardTitle>
                <p className="text-xs text-muted-foreground">Link an existing shop customer if sales from this supplier reduce their debt.</p>
              </CardHeader>
              <CardContent className="p-4 sm:p-5">
                <form onSubmit={createNurserySupplier} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="nursery-supplier-name" className="text-xs">Supplier name</Label>
                      <Input id="nursery-supplier-name" value={supplierName} onChange={event => setSupplierName(event.target.value)} maxLength={120} placeholder="e.g. Greenhouse supplier" required className="rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nursery-supplier-phone" className="text-xs">Supplier phone</Label>
                      <Input id="nursery-supplier-phone" type="tel" value={supplierPhone} onChange={event => setSupplierPhone(event.target.value)} maxLength={40} placeholder="Optional phone" className="rounded-xl" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nursery-supplier-customer-search" className="text-xs">Link existing customer <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input id="nursery-supplier-customer-search" value={supplierCustomerSearch} onChange={event => { setSupplierCustomerSearch(event.target.value); setSupplierCustomerId(""); }} placeholder="Search customer name or phone" autoComplete="off" className="rounded-xl" />
                    {debouncedSupplierCustomerSearch.trim().length >= 2 && supplierCustomersQuery.isLoading && <p role="status" className="text-xs text-muted-foreground">Searching shop customers…</p>}
                    {debouncedSupplierCustomerSearch.trim().length >= 2 && supplierCustomersQuery.isError && <p role="alert" className="text-xs text-destructive">Could not find customers. Try again.</p>}
                    {!!supplierCustomers.length && !supplierCustomerId && (
                      <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-background">
                        {supplierCustomers.map(customer => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => { setSupplierCustomerId(customer.id); if (!supplierName.trim()) setSupplierName(customer.name); if (!supplierPhone.trim()) setSupplierPhone(customer.phone ?? ""); }}
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
                    <Input id="nursery-supplier-notes" value={supplierNotes} onChange={event => setSupplierNotes(event.target.value)} maxLength={500} placeholder="Optional delivery notes" className="rounded-xl" />
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
                <form onSubmit={saveNurseryReceipt} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="nursery-receipt-supplier" className="text-xs">Supplier</Label>
                      <select id="nursery-receipt-supplier" value={receiveSupplierId} onChange={event => setReceiveSupplierId(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" required>
                        <option value="">Choose a supplier</option>
                        {supplierRows.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nursery-receipt-date" className="text-xs">Date received</Label>
                      <Input id="nursery-receipt-date" type="date" value={receiveDate} onChange={event => setReceiveDate(event.target.value)} required className="rounded-xl" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nursery-receipt-variety-search" className="text-xs">Find a plant variety</Label>
                    <Input id="nursery-receipt-variety-search" value={receiveVarietySearch} onChange={event => { setReceiveVarietySearch(event.target.value); setReceiveVarietyId(""); }} placeholder="Type at least two letters to search" autoComplete="off" className="rounded-xl" />
                    {receiveVarietySearch.trim().length >= 2 && receiveVarietiesQuery.isLoading && <p role="status" className="text-xs text-muted-foreground">Searching varieties…</p>}
                    {receiveVarietySearch.trim().length >= 2 && receiveVarietiesQuery.isError && <p role="alert" className="text-xs text-destructive">Could not load varieties.</p>}
                    {!!receiveVarieties.length && (
                      <select id="nursery-receipt-variety" value={receiveVarietyId} onChange={event => setReceiveVarietyId(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground" required>
                        <option value="">Choose a variety</option>
                        {receiveVarieties.map(variety => <option key={variety.id} value={variety.id}>{variety.name} · {variety.category}</option>)}
                      </select>
                    )}
                    {receiveVarietySearch.trim().length >= 2 && !receiveVarietiesQuery.isFetching && receiveVarieties.length === 0 && (
                      <p className="text-xs text-muted-foreground">No active variety matched. Add it in the Varieties tab first.</p>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="nursery-receipt-quantity" className="text-xs">Plants received</Label>
                      <Input id="nursery-receipt-quantity" type="number" min="1" max="10000000" step="1" inputMode="numeric" value={receiveQuantity} onChange={event => setReceiveQuantity(event.target.value)} required className="rounded-xl font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="nursery-receipt-notes" className="text-xs">Delivery notes</Label>
                      <Input id="nursery-receipt-notes" value={receiveNotes} onChange={event => setReceiveNotes(event.target.value)} maxLength={500} placeholder="Optional" className="rounded-xl" />
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
                <Button type="button" variant="outline" size="sm" disabled={suppliersQuery.isFetching} onClick={() => void suppliersQuery.refetch()} className="gap-2 rounded-xl cursor-pointer">
                  <RefreshCw className={`h-3.5 w-3.5 ${suppliersQuery.isFetching ? "animate-spin" : ""}`} />Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {suppliersQuery.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading suppliers…</p>
              ) : suppliersQuery.isError ? (
                <div role="alert" className="py-6 text-center"><p className="font-medium text-destructive">Could not load suppliers.</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void suppliersQuery.refetch()}>Try again</Button></div>
              ) : !supplierRows.length ? (
                <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No nursery suppliers yet. Add one above, then record each plant delivery.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {supplierRows.map(supplier => (
                    <button
                      key={supplier.id}
                      type="button"
                      onClick={() => setSelectedSupplierId(supplier.id)}
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
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedSupplierId("")}>Close</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 p-4 sm:p-5">
                <section className="rounded-2xl border border-border/70 bg-muted/20 p-3.5">
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor="nursery-link-customer-search" className="text-xs">Link existing shop customer</Label>
                      <Input id="nursery-link-customer-search" value={supplierCustomerSearch} onChange={event => { setSupplierCustomerSearch(event.target.value); setSupplierCustomerId(""); }} placeholder="Search by customer name or phone" autoComplete="off" className="rounded-xl bg-background" />
                    </div>
                    <Button type="button" onClick={() => void linkSupplierCustomer()} disabled={!supplierCustomerId} className="gap-2 rounded-xl cursor-pointer">
                      <Users className="h-4 w-4" />{selectedSupplier.customerId ? "Update link" : "Link customer"}
                    </Button>
                  </div>
                  {!!supplierCustomers.length && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {supplierCustomers.map(customer => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => setSupplierCustomerId(customer.id)}
                          className={`rounded-full border px-3 py-1 text-xs cursor-pointer ${supplierCustomerId === customer.id ? "border-primary bg-primary/15 text-primary font-semibold" : "border-border bg-background hover:bg-muted"}`}
                        >
                          {customer.name}{customer.phone ? ` · ${customer.phone}` : ""} · owes {formatKES(cents(customer.outstandingDebtCents))}
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                {supplierRecordsQuery.isLoading ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">Loading supplier activity…</p>
                ) : supplierRecordsQuery.isError ? (
                  <div role="alert" className="py-6 text-center"><p className="font-medium text-destructive">Could not load supplier activity.</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void supplierRecordsQuery.refetch()}>Try again</Button></div>
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
      </div>
    </Tabs>
  );
}
