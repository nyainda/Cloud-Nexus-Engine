import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  customFetch,
  useListProducts,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  Package,
  Phone,
  Plus,
  Search,
  StickyNote,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import { KES, type Quotation, type QuotationItem } from "@/lib/quotation-utils";
import { QuoteCustomerAutocomplete } from "./QuoteCustomerAutocomplete";

export function QuotationBuilder({
  shopId,
  editQuotation,
  onSave,
  onCancel,
}: {
  shopId: string;
  editQuotation: Quotation | null;
  onSave: (q: Quotation) => void;
  onCancel: () => void;
}) {
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const userName = localStorage.getItem("greenlink_userName") || "";

  const [customerName, setCustomerName] = useState(
    editQuotation?.customerName ?? "",
  );
  const [customerPhone, setCustomerPhone] = useState(
    editQuotation?.customerPhone ?? "",
  );
  const [customerEmail, setCustomerEmail] = useState(
    editQuotation?.customerEmail ?? "",
  );
  const [validUntil, setValidUntil] = useState(
    editQuotation?.validUntil?.split("T")[0] ?? "",
  );
  const [notes, setNotes] = useState(editQuotation?.notes ?? "");
  const [items, setItems] = useState<QuotationItem[]>(
    editQuotation?.items ?? [],
  );
  const [discount, setDiscount] = useState(
    String(editQuotation?.discountAmount ?? 0),
  );
  const [saving, setSaving] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [manualItemOpen, setManualItemOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualUnit, setManualUnit] = useState("unit");
  const [manualQty, setManualQty] = useState("1");
  const [manualPrice, setManualPrice] = useState("");
  const [importPreview, setImportPreview] = useState<QuotationItem[]>([]);
  const [importFileName, setImportFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const productParams = { shopId, limit: 3000 };
  const { data: productsData } = useListProducts(productParams, {
    query: {
      enabled: !!shopId,
      queryKey: getListProductsQueryKey(productParams),
      staleTime: 15_000,
      refetchInterval: 60_000,
      refetchIntervalInBackground: false,
    },
  });
  const allProducts = useMemo(
    () => (productsData as any)?.products ?? [],
    [productsData],
  );

  const addedProductIds = useMemo(
    () => new Set(items.map((i) => i.productId).filter(Boolean)),
    [items],
  );

  const productMatches = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return allProducts
      .filter(
        (p: any) =>
          p.isActive !== false &&
          (p.canonicalName?.toLowerCase().includes(q) ||
            p.normalizedName?.toLowerCase().includes(q) ||
            p.sku?.toLowerCase().includes(q) ||
            p.category?.toLowerCase().includes(q)),
      )
      .slice(0, 10);
  }, [allProducts, productSearch]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const addProduct = useCallback((p: any) => {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === p.id);
      if (existing >= 0) {
        return prev.map((item, idx) =>
          idx === existing
            ? {
                ...item,
                qty: item.qty + 1,
                total: (item.qty + 1) * item.unitPrice,
              }
            : item,
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.canonicalName,
          unit: p.unit ?? "unit",
          qty: 1,
          unitPrice: p.sellingPrice ?? 0,
          total: p.sellingPrice ?? 0,
        },
      ];
    });
    setProductSearch("");
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
  }, []);

  const addManualItem = () => {
    const name = manualName.trim();
    const qty = Number(manualQty);
    const unitPrice = Number(manualPrice);
    if (!name) {
      toast.error("Enter an item description");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error("Enter a valid unit price");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        productName: name,
        unit: manualUnit.trim() || "unit",
        qty,
        unitPrice,
        total: qty * unitPrice,
      },
    ]);
    setManualName("");
    setManualUnit("unit");
    setManualQty("1");
    setManualPrice("");
    setManualItemOpen(false);
    toast.success("Manual item added to quotation");
  };

  const handleExcelImport = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error("The selected file has no worksheet");
      const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as unknown[][];
      const clean = (value: unknown) => String(value ?? "").trim();
      const key = (value: unknown) =>
        clean(value).toLowerCase().replace(/[^a-z0-9]/g, "");
      const descriptionKeys = new Set([
        "description",
        "item",
        "itemname",
        "product",
        "productname",
        "name",
        "details",
      ]);
      const qtyKeys = new Set(["qty", "quantity", "count"]);
      const priceKeys = new Set([
        "unitprice",
        "price",
        "rate",
        "unitcost",
        "sellingprice",
      ]);
      const unitKeys = new Set(["unit", "uom", "measure", "unitofmeasure"]);
      const nonEmptyRows = rows.filter((row) =>
        row.some((cell) => clean(cell) !== ""),
      );
      if (nonEmptyRows.length === 0)
        throw new Error("The selected file is empty");

      const headerIndex = nonEmptyRows.findIndex((row) => {
        const keys = row.map(key);
        return (
          keys.some((v) => descriptionKeys.has(v)) &&
          keys.some((v) => qtyKeys.has(v)) &&
          keys.some((v) => priceKeys.has(v))
        );
      });
      let descriptionCol = 0,
        qtyCol = 1,
        priceCol = 2,
        unitCol = 3;
      let dataRows = nonEmptyRows;
      if (headerIndex >= 0) {
        const headers = nonEmptyRows[headerIndex].map(key);
        descriptionCol = headers.findIndex((v) => descriptionKeys.has(v));
        qtyCol = headers.findIndex((v) => qtyKeys.has(v));
        priceCol = headers.findIndex((v) => priceKeys.has(v));
        const foundUnit = headers.findIndex((v) => unitKeys.has(v));
        if (foundUnit >= 0) unitCol = foundUnit;
        dataRows = nonEmptyRows.slice(headerIndex + 1);
      }

      const parsed: QuotationItem[] = [];
      let skipped = 0;
      for (const row of dataRows) {
        const productName = clean(row[descriptionCol]);
        if (!productName) {
          skipped++;
          continue;
        }
        const qtyText = clean(row[qtyCol]).replace(/,/g, "");
        const priceText = clean(row[priceCol])
          .replace(/,/g, "")
          .replace(/^KES\s*/i, "");
        const qty = Number(qtyText);
        const unitPrice = Number(priceText);
        if (
          !Number.isFinite(qty) ||
          qty <= 0 ||
          !Number.isFinite(unitPrice) ||
          unitPrice < 0
        ) {
          skipped++;
          continue;
        }
        parsed.push({
          productName,
          unit: clean(row[unitCol]) || "unit",
          qty,
          unitPrice,
          total: qty * unitPrice,
        });
      }
      if (parsed.length === 0) {
        throw new Error(
          "No valid rows found. Use columns for Description, Quantity and Unit Price.",
        );
      }
      setImportPreview(parsed);
      setImportFileName(file.name);
      toast.success(
        `Prepared ${parsed.length} item(s) for review${skipped ? `; skipped ${skipped} invalid row(s)` : ""}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not read this spreadsheet",
      );
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const confirmImport = () => {
    if (importPreview.length === 0) return;
    setItems((prev) => [...prev, ...importPreview]);
    const count = importPreview.length;
    setImportPreview([]);
    setImportFileName("");
    toast.success(`Added ${count} item(s) to the quotation`);
  };

  const updateItem = (
    idx: number,
    field: keyof QuotationItem,
    val: number | string,
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: val };
        if (field === "qty" || field === "unitPrice") {
          updated.total = Number(updated.qty) * Number(updated.unitPrice);
        }
        return updated;
      }),
    );
  };

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discountAmount = Math.max(0, parseFloat(discount) || 0);
  const total = Math.max(0, subtotal - discountAmount);

  const handleSave = async () => {
    if (!customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one product");
      return;
    }
    setSaving(true);
    try {
      const body = {
        shopId,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim() || undefined,
        notes: notes.trim() || undefined,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        discountAmount,
        items,
        createdBy: userName || role,
      };
      let result: Quotation;
      if (editQuotation) {
        result = (await customFetch(`/api/quotations/${editQuotation.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        })) as Quotation;
      } else {
        result = (await customFetch(`/api/quotations`, {
          method: "POST",
          body: JSON.stringify(body),
        })) as Quotation;
      }
      onSave(result);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save quotation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Sticky Builder Header */}
      <div className="sticky top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur-md shrink-0">
        <div className="max-w-6xl mx-auto flex items-center gap-3 px-4 sm:px-6 py-3.5">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-border/80 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title="Back to quotations"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="w-9 h-9 rounded-2xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
            <ClipboardList className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-foreground font-display truncate">
              {editQuotation
                ? `Edit ${editQuotation.quoteNumber}`
                : "New Quotation"}
            </h2>
            <p className="text-xs text-muted-foreground truncate">
              {items.length} line{items.length === 1 ? "" : "s"} · Live total{" "}
              <span className="font-mono font-semibold text-foreground">
                {KES(total)}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="hidden sm:inline-flex h-9 items-center px-3.5 rounded-xl border border-border bg-muted/30 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex h-9 items-center gap-1.5 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {saving
                ? "Saving…"
                : editQuotation
                  ? "Update Quote"
                  : "Save Quote"}
            </button>
          </div>
        </div>
      </div>

      {/* Responsive 2-Column Workspace */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-4 sm:p-6 pb-20 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left / Main: Catalog Search & Line Items */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-4">
            <section className="bg-card border border-border/80 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/60 bg-muted/25">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Products &amp; Line Items
                  </h3>
                </div>
                {items.length > 0 && (
                  <span className="text-[11px] font-bold font-mono bg-primary/12 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full tabular-nums">
                    {items.length} item{items.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Search + Manual + Excel Import */}
              <div className="p-4 space-y-3 border-b border-border/60">
                <div ref={searchContainerRef}>
                  <div className="relative">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      ref={searchInputRef}
                      value={productSearch}
                      onChange={(e) => {
                        setProductSearch(e.target.value);
                        setSearchOpen(true);
                      }}
                      onFocus={() => setSearchOpen(true)}
                      placeholder="Search stock products by name, category, or SKU…"
                      className="w-full h-10 pl-10 pr-9 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
                    />
                    {productSearch && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setProductSearch("");
                          searchInputRef.current?.focus();
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {searchOpen && productMatches.length > 0 && (
                    <div className="mt-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-border/40">
                      {productMatches.map((p: any) => {
                        const isAdded = addedProductIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              addProduct(p);
                            }}
                            className={cn(
                              "w-full text-left px-3.5 py-2.5 flex items-center gap-3 transition-colors",
                              isAdded
                                ? "bg-primary/8 hover:bg-primary/12"
                                : "hover:bg-muted/50",
                            )}
                          >
                            {isAdded ? (
                              <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-lg border border-border flex items-center justify-center shrink-0">
                                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p
                                className={cn(
                                  "text-xs sm:text-sm font-semibold truncate",
                                  isAdded ? "text-primary" : "text-foreground",
                                )}
                              >
                                {p.canonicalName}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {p.category} · {p.stockQty} {p.unit} in stock
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold text-primary font-mono tabular-nums">
                                {KES(p.sellingPrice ?? 0)}
                              </p>
                              {isAdded && (
                                <p className="text-[10px] text-muted-foreground">
                                  tap to +1
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {searchOpen &&
                    productSearch.trim() &&
                    productMatches.length === 0 && (
                      <div className="mt-2 rounded-xl px-3.5 py-3 text-center bg-muted/25 border border-border">
                        <p className="text-xs text-muted-foreground">
                          No catalog items match &ldquo;
                          <span className="font-semibold text-foreground">
                            {productSearch}
                          </span>
                          &rdquo; — add a manual line below.
                        </p>
                      </div>
                    )}
                </div>

                {/* Secondary Actions: Manual / Excel Import */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setManualItemOpen((open) => !open)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors",
                      manualItemOpen
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-primary/30 bg-primary/8 text-primary hover:bg-primary/15",
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add manual item
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    disabled={importing}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
                  >
                    {importing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    )}
                    {importing ? "Reading file…" : "Import Excel / CSV"}
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={(event) =>
                      void handleExcelImport(event.target.files?.[0])
                    }
                  />
                  <span className="text-[11px] text-muted-foreground ml-auto hidden sm:inline">
                    Manual &amp; imported lines don&apos;t alter stock
                  </span>
                </div>
              </div>

              {/* Manual Item Drawer */}
              {manualItemOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-4 border-b border-border/60 bg-primary/[0.04]">
                  <label className="sm:col-span-5 text-[11px] font-semibold text-muted-foreground space-y-1">
                    <span>Description *</span>
                    <input
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="e.g. HDPE PIPE 32MM"
                      className="w-full h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </label>
                  <label className="sm:col-span-2 text-[11px] font-semibold text-muted-foreground space-y-1">
                    <span>Unit</span>
                    <input
                      value={manualUnit}
                      onChange={(e) => setManualUnit(e.target.value)}
                      placeholder="pcs, m, kg"
                      className="w-full h-9 rounded-xl border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </label>
                  <label className="sm:col-span-2 text-[11px] font-semibold text-muted-foreground space-y-1">
                    <span>Qty</span>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={manualQty}
                      onChange={(e) => setManualQty(e.target.value)}
                      className="w-full h-9 rounded-xl border border-border bg-card px-3 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </label>
                  <label className="sm:col-span-3 text-[11px] font-semibold text-muted-foreground space-y-1">
                    <span>Unit price (KES)</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                      placeholder="0"
                      className="w-full h-9 rounded-xl border border-border bg-card px-3 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </label>
                  <div className="sm:col-span-12 flex items-center justify-between gap-3 pt-1">
                    <p className="text-xs text-muted-foreground">
                      Line amount:{" "}
                      <strong className="font-mono text-foreground">
                        {KES(
                          (Number(manualQty) || 0) * (Number(manualPrice) || 0),
                        )}
                      </strong>
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setManualItemOpen(false)}
                        className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={addManualItem}
                        className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add item
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Excel Import Review */}
              {importPreview.length > 0 && (
                <div className="p-4 border-b border-border/60 bg-muted/15 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-foreground">
                        Review spreadsheet import
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {importFileName} · {importPreview.length} valid line(s)
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setImportPreview([]);
                          setImportFileName("");
                        }}
                        className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                      >
                        Cancel import
                      </button>
                      <button
                        type="button"
                        onClick={confirmImport}
                        className="rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Add{" "}
                        {importPreview.length} lines
                      </button>
                    </div>
                  </div>
                  <div className="max-h-56 overflow-auto rounded-xl border border-border bg-card">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted text-muted-foreground">
                        <tr>
                          <th className="p-2.5 text-left">Description</th>
                          <th className="p-2.5 text-right">Qty</th>
                          <th className="p-2.5 text-right">Unit price</th>
                          <th className="p-2.5 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.map((item, index) => (
                          <tr key={index} className="border-t border-border/50">
                            <td className="p-2.5 text-foreground">
                              {item.productName}{" "}
                              <span className="text-muted-foreground">
                                ({item.unit})
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums">
                              {item.qty}
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums">
                              {KES(item.unitPrice)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-semibold tabular-nums">
                              {KES(item.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Line Items List */}
              {items.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-2">
                  <Package className="h-9 w-9 text-muted-foreground/25 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">
                    No items in this quote yet
                  </p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Search products from your catalog above, add custom items
                    manually, or import from an Excel/CSV file.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-4 space-y-2.5 hover:bg-muted/15 transition-colors"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="w-5 h-5 rounded-md bg-muted text-[10px] font-bold text-muted-foreground flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground leading-snug break-words">
                            {item.productName}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Unit: {item.unit}
                          </p>
                        </div>
                        <p className="text-sm font-bold text-primary font-mono tabular-nums shrink-0">
                          {KES(item.total)}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                          title="Remove line"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5 pl-7 flex-wrap">
                        <div className="grid grid-cols-[34px_56px_34px] items-center bg-muted/40 border border-border rounded-xl overflow-hidden h-9 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(
                                idx,
                                "qty",
                                Math.max(
                                  0.25,
                                  item.qty -
                                    (item.unit === "kg" || item.unit === "litre"
                                      ? 0.25
                                      : 1),
                                ),
                              )
                            }
                            className="h-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-base font-bold transition-colors"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            value={item.qty}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "qty",
                                Math.max(0, parseFloat(e.target.value) || 0),
                              )
                            }
                            className="w-full min-w-0 h-full text-center text-xs font-bold font-mono bg-transparent text-foreground focus:outline-none border-x border-border tabular-nums"
                            min={0}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateItem(
                                idx,
                                "qty",
                                item.qty +
                                  (item.unit === "kg" || item.unit === "litre"
                                    ? 0.25
                                    : 1),
                              )
                            }
                            className="h-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted text-base font-bold transition-colors"
                          >
                            +
                          </button>
                        </div>

                        <span className="text-xs text-muted-foreground font-medium">
                          {item.unit} ×
                        </span>

                        <div className="relative flex-1 min-w-[120px] max-w-[190px]">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground pointer-events-none">
                            KES
                          </span>
                          <input
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) =>
                              updateItem(
                                idx,
                                "unitPrice",
                                Math.max(0, parseFloat(e.target.value) || 0),
                              )
                            }
                            className="w-full h-9 pl-10 pr-2.5 bg-muted/40 border border-border rounded-xl text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35 tabular-nums"
                            min={0}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Right Sticky Column: Customer, Quote Summary & Terms */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-4 lg:sticky lg:top-20">
            {/* Customer Card */}
            <section className="bg-card border border-border/80 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/25">
                <User className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Customer Details
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Customer Name *
                  </label>
                  <QuoteCustomerAutocomplete
                    value={customerName}
                    onChange={(name, phone) => {
                      setCustomerName(name);
                      if (phone) setCustomerPhone(phone);
                    }}
                    shopId={shopId}
                    placeholder="Search existing or type name"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Phone Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="+254 700 000 000"
                        className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/35"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                      Email{" "}
                      <span className="normal-case font-normal">(optional)</span>
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="customer@email.com"
                        type="email"
                        className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/35"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Totals & Primary Save Card */}
            <section className="bg-card border border-border/80 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/25">
                <TrendingUp className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Quote Summary
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Subtotal ({items.length} items)</span>
                  <span className="font-mono font-semibold text-foreground tabular-nums">
                    {KES(subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground shrink-0">
                    Discount (KES)
                  </span>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    min={0}
                    className="w-32 h-8 px-2.5 bg-muted/40 border border-border rounded-xl text-xs font-mono text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/35 tabular-nums"
                  />
                </div>
                <div className="flex items-center justify-between border-t border-border/70 pt-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Quote Total
                  </span>
                  <span className="text-xl font-bold font-mono text-primary tabular-nums">
                    {KES(total)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {saving
                    ? "Saving…"
                    : editQuotation
                      ? "Update Quotation"
                      : "Create Quotation"}
                </button>
              </div>
            </section>

            {/* Validity & Notes Card */}
            <section className="bg-card border border-border/80 rounded-2xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60 bg-muted/25">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Terms &amp; Validity
                </h3>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Valid Until{" "}
                    <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                      type="date"
                      value={validUntil}
                      onChange={(e) => setValidUntil(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1.5">
                    Notes / Terms{" "}
                    <span className="normal-case font-normal">(optional)</span>
                  </label>
                  <div className="relative">
                    <StickyNote className="absolute left-3 top-3 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Payment terms, delivery conditions, special instructions…"
                      rows={3}
                      className="w-full pl-9 pr-3 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-2 focus:ring-primary/35"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
