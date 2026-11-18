import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { downloadNurseryReceipt, downloadNurseryStatement } from "@/lib/nursery-pdf";
import { loadPdfStampLogo, tryGetPdfShopLogoAssets } from "@/lib/pdf-stamp";
import { NurseryDebtSettlementDialog } from "@/components/NurseryDebtSettlementDialog";
import { fetchNurseryAutoSync } from "@/lib/nursery-settlement";
import {
  Sprout, CalendarDays, CheckCircle2, PackagePlus, LayoutDashboard,
  Users, ReceiptText, BarChart3, Truck, Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  type Variety,
  type VarietyListData,
  type ReportRow,
  type ReportData,
  type IndividualSaleEntry,
  type EntriesData,
  type MonthlyCategory,
  type MonthlySummaryData,
  type SupplierRow,
  type SupplierCustomer,
  type SupplierRecord,
  type SaleSource,
  type NurseryTab,
  type CustomerInsightRow,
  nurseryQueryOptions,
  localDate,
  addDays,
  formatBusinessDate,
  cents,
  useDebouncedValue,
  varietyListUrl,
} from "@/features/nursery/nursery-utils";
import { NurseryOverviewTab } from "@/features/nursery/NurseryOverviewTab";
import { NurseryRecordSaleTab } from "@/features/nursery/NurseryRecordSaleTab";
import { NurseryCatalogueTab } from "@/features/nursery/NurseryCatalogueTab";
import { NurseryInsightsTab } from "@/features/nursery/NurseryInsightsTab";
import { NurserySalesLedgerTab } from "@/features/nursery/NurserySalesLedgerTab";
import { NurseryReportsTab } from "@/features/nursery/NurseryReportsTab";
import { NurserySuppliersTab } from "@/features/nursery/NurserySuppliersTab";

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
  const [plantSettleOpen, setPlantSettleOpen] = useState(false);
  const [plantSettleTab, setPlantSettleTab] = useState<"settle" | "history">("settle");
  const [plantSettleCustomer, setPlantSettleCustomer] = useState<{ customerName: string; customerPhone?: string }>({ customerName: "" });
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
  const autoSyncQuery = useQuery({
    queryKey: ["nursery-auto-sync", shopId],
    queryFn: fetchNurseryAutoSync,
    enabled: !!shopId,
    staleTime: 60_000,
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
    const shopAssets = tryGetPdfShopLogoAssets(shopId, shopName);
    let sealLogoDataUrl: string | null = null;
    if (shopAssets) {
      try {
        sealLogoDataUrl = await loadPdfStampLogo(shopAssets.seal);
      } catch {}
    }
    return { shopId, shopName, logoDataUrl, sealLogoDataUrl };
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
        qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] }),
        qc.invalidateQueries({ queryKey: ["nursery-auto-sync", shopId] }),
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
        qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] }),
        qc.invalidateQueries({ queryKey: ["nursery-auto-sync", shopId] }),
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
        qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] }),
        qc.invalidateQueries({ queryKey: ["nursery-auto-sync", shopId] }),
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
                  {autoSyncQuery.data?.config?.enabled && (
                    <button
                      type="button"
                      onClick={() => {
                        setPlantSettleCustomer({
                          customerName: autoSyncQuery.data!.config.ownerCustomerName,
                          customerPhone: autoSyncQuery.data!.config.ownerCustomerPhone,
                        });
                        setPlantSettleTab("settle");
                        setPlantSettleOpen(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                    >
                      <Zap className="h-3 w-3" />
                      Auto-Sync → {autoSyncQuery.data.config.ownerCustomerName}
                    </button>
                  )}
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
        <NurseryOverviewTab
          selectedMonth={selectedMonth}
          onSelectedMonthChange={setSelectedMonth}
          monthSummary={monthSummary}
          monthCategories={monthCategories}
          monthPaymentTotals={monthPaymentTotals}
          topMonthCategory={topMonthCategory}
          monthlySummaryData={monthlySummaryQuery.data}
          monthlySummaryLoading={monthlySummaryQuery.isLoading}
          monthlySummaryError={monthlySummaryQuery.isError}
          monthlySummaryFetching={monthlySummaryQuery.isFetching}
          onRefreshMonthSummary={() => void monthlySummaryQuery.refetch()}
          onManageCategories={() => setActiveTab("catalogue")}
          onAssignUncategorized={() => {
            setCatalogueStatus("all");
            setCatalogueCategory("Uncategorized");
            setCatalogueSearch("");
            setCataloguePage(1);
            setCatalogueExpanded(true);
            setActiveTab("catalogue");
          }}
        />

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* RECORD SALE TAB — Split-Screen Seedling POS                         */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <NurseryRecordSaleTab
          shopId={shopId}
          businessDate={businessDate}
          varieties={varieties}
          matchingSaleVarieties={matchingSaleVarieties}
          saleCategories={saleCategories}
          productSearch={productSearch}
          onProductSearchChange={setProductSearch}
          productCategory={productCategory}
          onProductCategoryChange={setProductCategory}
          saleVarietiesFetching={saleVarietiesQuery.isFetching}
          saleVarietiesError={saleVarietiesQuery.isError}
          saleVarietiesSuccess={saleVarietiesQuery.isSuccess}
          onRetrySaleVarieties={() => void saleVarietiesQuery.refetch()}
          cart={cart}
          setCart={setCart}
          addToCart={addToCart}
          saleSources={saleSources}
          paymentMethod={paymentMethod}
          onPaymentMethodChange={setPaymentMethod}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          customerPhone={customerPhone}
          onCustomerPhoneChange={setCustomerPhone}
          totalSeedlingsInCart={totalSeedlingsInCart}
          cartTotal={cartTotal}
          saving={saving}
          isOnline={isOnline}
          onSubmitSale={saveEntry}
        />

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* VARIETIES TAB                                                       */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <NurseryCatalogueTab
          catalogueExpanded={catalogueExpanded}
          onToggleExpanded={() => setCatalogueExpanded(value => !value)}
          catalogueTotal={catalogueTotal}
          catalogueStatus={catalogueStatus}
          onCatalogueStatusChange={setCatalogueStatus}
          catalogueCategory={catalogueCategory}
          onCatalogueCategoryChange={setCatalogueCategory}
          catalogueSearch={catalogueSearch}
          onCatalogueSearchChange={setCatalogueSearch}
          cataloguePage={cataloguePage}
          cataloguePageCount={cataloguePageCount}
          onCataloguePageChange={setCataloguePage}
          catalogueStart={catalogueStart}
          catalogueEnd={catalogueEnd}
          catalogueCategories={catalogueCategories}
          catalogueRows={catalogueRows}
          catalogueLoading={catalogueQuery.isLoading}
          catalogueError={catalogueQuery.isError}
          catalogueSuccess={catalogueQuery.isSuccess}
          catalogueFetching={catalogueQuery.isFetching}
          onRetryCatalogue={() => void catalogueQuery.refetch()}
          newName={newName}
          onNewNameChange={setNewName}
          newCategory={newCategory}
          onNewCategoryChange={setNewCategory}
          newPrice={newPrice}
          onNewPriceChange={setNewPrice}
          addingVariety={addingVariety}
          onCreateVariety={createVariety}
          editingVarietyId={editingVarietyId}
          editingName={editingName}
          onEditingNameChange={setEditingName}
          editingCategory={editingCategory}
          onEditingCategoryChange={setEditingCategory}
          editingPrice={editingPrice}
          onEditingPriceChange={setEditingPrice}
          busyVarietyId={busyVarietyId}
          onCancelVarietyEdit={() => setEditingVarietyId(null)}
          onBeginEditVariety={beginEditVariety}
          onSaveVarietyEdit={(v) => void saveVarietyEdit(v)}
          onToggleVariety={(v) => void toggleVariety(v)}
          onDeleteVariety={(v) => void deleteVariety(v)}
        />

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* CUSTOMERS INSIGHTS TAB                                              */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <NurseryInsightsTab
          isLoading={customerInsightsQuery.isLoading}
          isError={customerInsightsQuery.isError}
          rows={customerInsightsQuery.data?.rows}
          onRetry={() => void customerInsightsQuery.refetch()}
        />

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SALES HISTORY TAB                                                   */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <NurserySalesLedgerTab
          from={from}
          to={to}
          individualTotal={individualTotal}
          individualSaleSummary={individualSaleSummary}
          statementCustomer={statementCustomer}
          onStatementCustomerChange={setStatementCustomer}
          statementPhone={statementPhone}
          onStatementPhoneChange={setStatementPhone}
          statementBusy={statementBusy}
          onCreateCustomerStatement={() => void createCustomerStatement()}
          saleSearch={saleSearch}
          onSaleSearchChange={setSaleSearch}
          salePaymentFilter={salePaymentFilter}
          onSalePaymentFilterChange={setSalePaymentFilter}
          salesPage={salesPage}
          salesPageSize={salesPageSize}
          individualPageCount={individualPageCount}
          onSalesPageChange={setSalesPage}
          editingSaleId={editingSaleId}
          onCancelSaleEdit={() => { setEditingSaleId(null); setSaleEditSelectedVariety(null); }}
          saleEdit={saleEdit}
          onSaleEditChange={setSaleEdit}
          saleEditSearch={saleEditSearch}
          onSaleEditSearchChange={setSaleEditSearch}
          saleEditVarietyOptions={saleEditVarietyOptions}
          saleEditVarietiesFetching={saleEditVarietiesQuery.isFetching}
          onSelectEditVariety={setSaleEditSelectedVariety}
          onSaveSaleEdit={saveSaleEdit}
          busySaleId={busySaleId}
          entriesLoading={individualEntriesQuery.isLoading}
          entriesError={individualEntriesQuery.isError}
          entriesFetching={individualEntriesQuery.isFetching}
          onRetryEntries={() => void individualEntriesQuery.refetch()}
          filteredIndividualEntries={filteredIndividualEntries}
          selectedSaleIds={selectedSaleIds}
          onToggleSaleSelection={toggleSaleSelection}
          onDownloadSelectedSalesPdf={() => void downloadSelectedSalesPdf()}
          onClearSelectedSales={() => setSelectedSaleIds([])}
          onDownloadReceipt={downloadReceipt}
          onBeginEditSale={beginEditSale}
          onDeleteSale={(entry) => void deleteSale(entry)}
        />

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* REPORTS TAB                                                         */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <NurseryReportsTab
          from={from}
          to={to}
          businessDate={businessDate}
          report={report}
          reportRows={reportRows}
          reportTotal={reportTotal}
          reportPage={reportPage}
          reportPageSize={reportPageSize}
          reportPageCount={reportPageCount}
          reportLoading={reportQuery.isLoading}
          reportError={reportQuery.isError}
          reportFetching={reportQuery.isFetching}
          onRefreshReport={() => { void qc.invalidateQueries({ queryKey: ["/api/nursery/report", shopId] }); }}
          onReportPageChange={setReportPage}
        />

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SOURCES & SUPPLIERS TAB                                             */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <NurserySuppliersTab
          supplierName={supplierName}
          onSupplierNameChange={setSupplierName}
          supplierPhone={supplierPhone}
          onSupplierPhoneChange={setSupplierPhone}
          supplierNotes={supplierNotes}
          onSupplierNotesChange={setSupplierNotes}
          supplierCustomerSearch={supplierCustomerSearch}
          onSupplierCustomerSearchChange={setSupplierCustomerSearch}
          supplierCustomerId={supplierCustomerId}
          onSupplierCustomerIdChange={setSupplierCustomerId}
          debouncedSupplierCustomerSearch={debouncedSupplierCustomerSearch}
          supplierCustomers={supplierCustomers}
          supplierCustomersLoading={supplierCustomersQuery.isLoading}
          supplierCustomersError={supplierCustomersQuery.isError}
          savingSupplier={savingSupplier}
          onCreateNurserySupplier={createNurserySupplier}
          receiveSupplierId={receiveSupplierId}
          onReceiveSupplierIdChange={setReceiveSupplierId}
          receiveDate={receiveDate}
          onReceiveDateChange={setReceiveDate}
          receiveVarietySearch={receiveVarietySearch}
          onReceiveVarietySearchChange={setReceiveVarietySearch}
          receiveVarietyId={receiveVarietyId}
          onReceiveVarietyIdChange={setReceiveVarietyId}
          receiveVarieties={receiveVarieties}
          receiveVarietiesLoading={receiveVarietiesQuery.isLoading}
          receiveVarietiesError={receiveVarietiesQuery.isError}
          receiveVarietiesFetching={receiveVarietiesQuery.isFetching}
          receiveQuantity={receiveQuantity}
          onReceiveQuantityChange={setReceiveQuantity}
          receiveNotes={receiveNotes}
          onReceiveNotesChange={setReceiveNotes}
          savingReceipt={savingReceipt}
          onSaveNurseryReceipt={saveNurseryReceipt}
          supplierRows={supplierRows}
          suppliersLoading={suppliersQuery.isLoading}
          suppliersError={suppliersQuery.isError}
          suppliersFetching={suppliersQuery.isFetching}
          onRefreshSuppliers={() => void suppliersQuery.refetch()}
          selectedSupplierId={selectedSupplierId}
          onSelectSupplierId={setSelectedSupplierId}
          selectedSupplier={selectedSupplier}
          supplierRecords={supplierRecords}
          supplierRecordsLoading={supplierRecordsQuery.isLoading}
          supplierRecordsError={supplierRecordsQuery.isError}
          onRefreshSupplierRecords={() => void supplierRecordsQuery.refetch()}
          onLinkSupplierCustomer={() => void linkSupplierCustomer()}
          onOpenSettlementModal={(tab, target) => {
            setPlantSettleCustomer(target);
            setPlantSettleTab(tab);
            setPlantSettleOpen(true);
          }}
        />
      </div>

      <NurseryDebtSettlementDialog
        open={plantSettleOpen}
        onOpenChange={setPlantSettleOpen}
        shopId={shopId}
        customerName={plantSettleCustomer.customerName}
        customerPhone={plantSettleCustomer.customerPhone}
        initialTab={plantSettleTab}
        suppliers={supplierRows}
        onSettled={() => {
          void suppliersQuery.refetch();
          if (selectedSupplierId) void supplierRecordsQuery.refetch();
        }}
      />
    </Tabs>
  );
}
