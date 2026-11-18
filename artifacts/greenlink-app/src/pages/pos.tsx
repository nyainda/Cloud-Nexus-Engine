import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  useListProducts,
  useCreateSale,
  getListProductsQueryKey,
  getListDebtsQueryKey,
  getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
import { recordMutationResult } from "@/lib/product-version-guard";
import { syncProductsDelta } from "@/lib/product-sync";
import { logInventory, newMutationId } from "@/lib/inventory-logger";
import { enqueueMutation } from "@/lib/offline-queue";
import { useOfflineSyncCtx } from "@/lib/offline-context";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { formatKES, formatQty, roundQty } from "@/lib/format";
import {
  Search, ShoppingCart,
  X, ChevronRight, ArrowUpDown,
  ReceiptText, LayoutGrid, LayoutList, WifiOff, RefreshCw,
  Tag, PanelRightOpen,
} from "lucide-react";
import { printSaleReceipt } from "@/lib/print-receipt";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { toTitleCase } from "@/components/customer-autocomplete";
import { isWeighedUnit, getCategoryTone } from "@/lib/product-utils";
import {
  CART_DRAFT_KEY,
  AUTO_PRINT_KEY,
  FILTERS,
  type CartItem,
  type StockFilter,
} from "@/features/pos/pos-types";
import { QuickAddSheet } from "@/features/pos/QuickAddSheet";
import { SaleCompleteOverlay } from "@/features/pos/SaleCompleteOverlay";
import { CartPanel, type CartPanelProps } from "@/features/pos/CartPanel";
import { RecentSalesDrawer } from "@/features/pos/RecentSalesDrawer";
import { PosProductCatalog } from "@/features/pos/PosProductCatalog";

// ─── Main POS Page ────────────────────────────────────────────────────────────
export default function POS() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";
  const qc = useQueryClient();
  const { pendingCount, isOnline: offlineIsOnline, syncing: offlineSyncing, refreshCount: refreshOfflineCount } = useOfflineSyncCtx();

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 100);
  const [stockFilter, setStockFilter] = useState<StockFilter>("in_stock");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"az" | "za" | "stock_asc" | "stock_desc" | "price_asc" | "price_desc" | "newest">("newest");
  const [viewMode, setViewMode] = useState<"cards" | "table">(() =>
    (localStorage.getItem("pos_view_mode") as "cards" | "table") || "cards"
  );
  const [visibleLimit, setVisibleLimit] = useState(200);
  const [showRecentSales, setShowRecentSales] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: productsData, isLoading, isRefetching, dataUpdatedAt } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId, staleTime: 5 * 60_000, refetchInterval: false, refetchOnWindowFocus: false } as any }
  );

  // Sync only products modified on other devices/tabs instead of rescanning the
  // entire active product catalog in D1 every 60 seconds.
  useEffect(() => {
    if (!shopId) return;
    const runDelta = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void syncProductsDelta(qc, shopId);
      }
    };
    const intervalId = window.setInterval(runDelta, 120_000);
    window.addEventListener("focus", runDelta);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", runDelta);
    };
  }, [shopId, qc]);

  const isStale = !isRefetching && dataUpdatedAt > 0 && (Date.now() - dataUpdatedAt) > 5 * 60_000;

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of productsData?.products || []) {
      const cat = (p.category || "").trim();
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
  }, [productsData]);

  const filteredProducts = useMemo(() => {
    let all = productsData?.products || [];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      all = all.filter(p =>
        p.canonicalName.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    if (selectedCategory !== "all") {
      all = all.filter(p => (p.category || "").trim() === selectedCategory);
    }
    if (stockFilter === "in_stock") all = all.filter(p => p.stockQty > 0);
    else if (stockFilter === "low_stock") all = all.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty);
    else if (stockFilter === "out_of_stock") all = all.filter(p => p.stockQty === 0);

    return [...all].sort((a, b) => {
      switch (sortBy) {
        case "az": return a.canonicalName.localeCompare(b.canonicalName);
        case "za": return b.canonicalName.localeCompare(a.canonicalName);
        case "stock_asc": return a.stockQty - b.stockQty;
        case "stock_desc": return b.stockQty - a.stockQty;
        case "price_asc": return (a.sellingPrice || 0) - (b.sellingPrice || 0);
        case "price_desc": return (b.sellingPrice || 0) - (a.sellingPrice || 0);
        case "newest": return new Date((b as any).updatedAt || (b as any).createdAt || 0).getTime() - new Date((a as any).updatedAt || (a as any).createdAt || 0).getTime();
        default: return a.canonicalName.localeCompare(b.canonicalName);
      }
    });
  }, [productsData, debouncedSearch, selectedCategory, stockFilter, sortBy]);

  const filterCounts = useMemo(() => {
    const all = productsData?.products || [];
    return {
      all: all.length,
      in_stock: all.filter(p => p.stockQty > 0).length,
      low_stock: all.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty).length,
      out_of_stock: all.filter(p => p.stockQty === 0).length,
    };
  }, [productsData]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [showCartMobile, setShowCartMobile] = useState(false);
  // Desktop ticket drawer auto-opens when first item enters cart, auto-retracts when empty,
  // and can also be manually retracted/expanded anytime while keeping items in the cart.
  const [ticketExpanded, setTicketExpanded] = useState(false);
  const prevCartLenRef = useRef(0);

  useEffect(() => {
    if (prevCartLenRef.current === 0 && cart.length > 0) {
      setTicketExpanded(true);
    } else if (cart.length === 0) {
      setTicketExpanded(false);
    }
    prevCartLenRef.current = cart.length;
  }, [cart.length]);

  const [debtCustomerName, setDebtCustomerName] = useState("");
  const [debtCustomerPhone, setDebtCustomerPhone] = useState("");
  const [selectedCustomerBalance, setSelectedCustomerBalance] = useState<number | null>(null);
  const [selectedCustomerCredit, setSelectedCustomerCredit] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("cash");
  const createSale = useCreateSale();
  const submittingRef = useRef(false);

  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [autoPrint, setAutoPrint] = useState(() => localStorage.getItem(AUTO_PRINT_KEY) === "true");
  const autoPrintRef = useRef(autoPrint);
  useEffect(() => { autoPrintRef.current = autoPrint; }, [autoPrint]);
  const handleAutoPrintChange = useCallback((v: boolean) => {
    setAutoPrint(v);
    localStorage.setItem(AUTO_PRINT_KEY, String(v));
  }, []);

  const [quickAddProduct, setQuickAddProduct] = useState<any | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const draftRestoredRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if ((e.key === "/" && !inInput) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      } else if (e.key === "Escape" && document.activeElement === searchInputRef.current && search) {
        setSearch("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [search]);

  useEffect(() => {
    if (cart.length === 0 && discount === 0 && !debtCustomerName) {
      if (draftRestoredRef.current) {
        sessionStorage.removeItem(CART_DRAFT_KEY);
      }
      return;
    }
    try {
      sessionStorage.setItem(CART_DRAFT_KEY, JSON.stringify({
        items: cart.map(i => ({ productId: i.product.id, qty: i.qty, unitPrice: i.unitPrice })),
        discount,
        debtCustomerName,
        debtCustomerPhone,
      }));
    } catch {}
  }, [cart, discount, debtCustomerName, debtCustomerPhone]);

  useEffect(() => {
    const products = productsData?.products;
    if (!products?.length) return;

    const quotationRaw = sessionStorage.getItem("greenlink_pending_cart");
    if (quotationRaw) {
      try {
        const pending = JSON.parse(quotationRaw);
        const cartItems: CartItem[] = [];
        for (const item of pending.items ?? []) {
          const product = products.find((p: any) => p.id === item.productId);
          if (product) {
            cartItems.push({ product, qty: item.qty, unitPrice: item.unitPrice });
          } else {
            cartItems.push({
              product: {
                id: item.productId || `stub-${Math.random()}`,
                canonicalName: item.productName,
                normalizedName: item.productName,
                sellingPrice: item.unitPrice,
                purchasePrice: 0,
                stockQty: 9999,
                unit: item.unit || "unit",
                category: "",
                sku: "",
                isActive: true,
              },
              qty: item.qty,
              unitPrice: item.unitPrice,
            });
          }
        }
        if (cartItems.length > 0) {
          setCart(cartItems);
          if (pending.discount > 0) setDiscount(pending.discount);
          if (pending.customerName) setDebtCustomerName(pending.customerName);
          toast.success(`${pending.fromQuote ?? "Quote"} loaded into ticket (${cartItems.length} item${cartItems.length !== 1 ? "s" : ""})`);
        }
      } catch {}
      sessionStorage.removeItem("greenlink_pending_cart");
      draftRestoredRef.current = true;
      return;
    }

    const draftRaw = sessionStorage.getItem(CART_DRAFT_KEY);
    if (!draftRaw) {
      draftRestoredRef.current = true;
      return;
    }
    try {
      const draft = JSON.parse(draftRaw);
      if (!draft.items?.length) {
        draftRestoredRef.current = true;
        return;
      }
      const cartItems: CartItem[] = [];
      for (const item of draft.items) {
        const product = products.find((p: any) => p.id === item.productId);
        if (!product) continue;
        const maxQty = product.stockQty;
        if (maxQty <= 0) continue;
        const restoredQty = roundQty(Math.min(item.qty, maxQty));
        cartItems.push({ product, qty: restoredQty, unitPrice: item.unitPrice });
      }
      if (cartItems.length > 0) {
        setCart(cartItems);
        if (draft.discount > 0) setDiscount(draft.discount);
        if (draft.debtCustomerName) setDebtCustomerName(draft.debtCustomerName);
        if (draft.debtCustomerPhone) setDebtCustomerPhone(draft.debtCustomerPhone);
        toast.success(`Ticket restored (${cartItems.length} item${cartItems.length !== 1 ? "s" : ""})`);
      }
    } catch {}
    draftRestoredRef.current = true;
  }, [productsData]);

  useEffect(() => {
    if (showCartMobile) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [showCartMobile]);

  const openQuickAdd = (product: any) => {
    if (product.stockQty === 0) { toast.error("Out of stock"); return; }
    setQuickAddProduct(product);
    setQuickAddOpen(true);
  };

  const handleQuickAdd = (product: any, qty: number, price: number) => {
    const cleanQty = roundQty(qty);
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, qty: roundQty(Math.min(i.qty + cleanQty, product.stockQty)), unitPrice: price }
            : i
        );
      }
      return [...prev, { product, qty: roundQty(Math.min(cleanQty, product.stockQty)), unitPrice: price }];
    });
    toast.success(`${product.canonicalName} added`);
  };

  const handleInstantAdd = (e: React.MouseEvent, product: any) => {
    e.stopPropagation();
    if (product.stockQty === 0) { toast.error("Out of stock"); return; }
    const weighed = (product as any).productType === "measured" || isWeighedUnit(product.unit || "");
    if (weighed) {
      openQuickAdd(product);
      return;
    }
    const existing = cart.find(i => i.product.id === product.id);
    if (existing && existing.qty >= product.stockQty) {
      toast.error(`Only ${formatQty(product.stockQty)} in stock`);
      return;
    }
    handleQuickAdd(product, 1, existing ? existing.unitPrice : product.sellingPrice || 0);
  };

  const updateQty = useCallback((productId: string, delta: number) => {
    setCart(prev =>
      prev.flatMap(i => {
        if (i.product.id !== productId) return [i];
        const isMeasured = i.product.productType === "measured" || isWeighedUnit(i.product.unit || "");
        const minQty = isMeasured ? 0.01 : 1;
        const newQty = roundQty(i.qty + delta);
        if (newQty < minQty) return [];
        return [{ ...i, qty: roundQty(Math.min(newQty, i.product.stockQty)) }];
      })
    );
  }, []);

  const setQtyDirect = useCallback((productId: string, qty: number) => {
    setCart(prev =>
      prev.map(i => {
        if (i.product.id !== productId) return i;
        const isMeasured = i.product.productType === "measured" || isWeighedUnit(i.product.unit || "");
        const minQty = isMeasured ? 0.01 : 1;
        return { ...i, qty: roundQty(Math.min(Math.max(minQty, qty), i.product.stockQty)) };
      }).filter(i => i.qty > 0)
    );
  }, []);

  const removeFromCart = useCallback((productId: string) => setCart(prev => prev.filter(i => i.product.id !== productId)), []);
  const updatePrice = useCallback((productId: string, price: number) => setCart(prev => prev.map(i => i.product.id === productId ? { ...i, unitPrice: price } : i)), []);

  const subtotal = useMemo(() => cart.reduce((s, i) => s + roundQty(i.qty) * i.unitPrice, 0), [cart]);
  const total = Math.max(0, Math.round(subtotal) - discount);
  const totalProfit = useMemo(() => cart.reduce((s, i) => {
    const cost = i.product.purchasePrice || 0;
    return s + roundQty(i.qty) * (i.unitPrice - cost);
  }, 0), [cart]);
  const cartCount = roundQty(cart.reduce((s, i) => s + i.qty, 0));

  const handleCheckout = useCallback(async (saleType: "cash" | "debt", method?: "cash" | "bank") => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    if (cart.length === 0) { submittingRef.current = false; toast.error("Cart is empty"); return; }
    if (saleType === "debt" && !debtCustomerName.trim()) { submittingRef.current = false; toast.error("Enter customer name for debt sale"); return; }
    const zeroPriceItems = cart.filter(i => !i.unitPrice || i.unitPrice <= 0 || !isFinite(i.unitPrice));
    if (zeroPriceItems.length > 0) {
      submittingRef.current = false;
      toast.error(`Set a price for: ${zeroPriceItems.map(i => i.product.canonicalName).join(", ")}`);
      return;
    }

    const cartSnapshot = [...cart];
    const discountSnapshot = discount;
    const debtName = toTitleCase(debtCustomerName);
    const debtPhone = debtCustomerPhone;
    const chosenMethod = saleType === "debt" ? "cash" : (method ?? paymentMethod);
    const mutationId = newMutationId();
    const ts = () => new Date().toISOString();

    logInventory({ stage: "pending_added", mutationId, source: "pos", timestamp: ts(), extra: { saleType, items: cartSnapshot.length } });

    await qc.cancelQueries({ queryKey: getListProductsQueryKey() });
    const productsSnapshot = qc.getQueriesData({ queryKey: getListProductsQueryKey() });

    const optimisticNow = ts();
    qc.setQueriesData({ queryKey: getListProductsQueryKey() }, (old: any) => {
      if (!old?.products) return old;
      return {
        ...old,
        products: old.products.map((p: any) => {
          const cartItem = cartSnapshot.find(i => i.product.id === p.id);
          if (!cartItem) return p;
          const updated = { ...p, stockQty: roundQty(Math.max(0, p.stockQty - cartItem.qty)), updatedAt: optimisticNow };
          recordMutationResult(updated);
          logInventory({ stage: "optimistic_applied", mutationId, source: "pos", timestamp: optimisticNow, productId: p.id, previousQty: p.stockQty, nextQty: updated.stockQty });
          return updated;
        }),
      };
    });

    setCart([]); setDiscount(0); setDebtCustomerName(""); setDebtCustomerPhone(""); setSelectedCustomerBalance(null); setSelectedCustomerCredit(null); setShowCartMobile(false);
    const successMsg = saleType === "debt" ? "✓ Debt recorded!" : chosenMethod === "bank" ? "✓ Bank payment complete!" : "✓ Cash sale complete!";
    toast.success(successMsg);

    logInventory({ stage: "mutation_started", mutationId, source: "pos", timestamp: ts(), extra: { saleType, paymentMethod: chosenMethod } });

    const rawSubtotal = cartSnapshot.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const safeDiscount = Math.min(Math.max(0, discountSnapshot), rawSubtotal);

    const salePayload = {
      shopId,
      saleType,
      paymentMethod: chosenMethod,
      discount: safeDiscount,
      items: cartSnapshot.map(i => ({
        productId: i.product.id,
        qty: i.qty,
        unitPrice: isFinite(i.unitPrice) && i.unitPrice > 0 ? i.unitPrice : 0,
      })),
      servedBy: userName,
      debtCustomerName: saleType === "debt" ? debtName : undefined,
      debtCustomerPhone: saleType === "debt" ? debtPhone : undefined,
    };

    if (!navigator.onLine) {
      try {
        await enqueueMutation("sale", shopId, salePayload);
        logInventory({ stage: "queued_offline", mutationId, source: "pos", timestamp: ts(), extra: { saleType } });
        await refreshOfflineCount();
      } catch (enqueueErr) {
        productsSnapshot.forEach(([key, data]) => qc.setQueryData(key, data));
        setCart(cartSnapshot); setDiscount(discountSnapshot);
        logInventory({ stage: "offline_enqueue_failed", mutationId, source: "pos", timestamp: ts(), extra: { error: String(enqueueErr) } });
        toast.error("Could not save offline sale — please retry");
      } finally {
        submittingRef.current = false;
      }
      return;
    }

    createSale.mutate(
      { data: salePayload },
      {
        onSuccess: (data: any) => {
          const snapshotTotal = rawSubtotal - safeDiscount;
          const saleForReceipt = {
            ...(data ?? {}),
            id: data?.id ?? data?.saleId ?? "",
            createdAt: data?.createdAt ?? new Date().toISOString(),
            saleType,
            paymentMethod: chosenMethod,
            totalAmount: data?.totalAmount ?? snapshotTotal,
            discount: safeDiscount,
            debtCustomerName: saleType === "debt" ? debtName : undefined,
            servedBy: userName,
            items: cartSnapshot.map(i => ({
              productId: i.product.id,
              productName: i.product.canonicalName,
              qty: i.qty,
              unitPrice: i.unitPrice,
              totalPrice: i.qty * i.unitPrice,
            })),
          };
          setCompletedSale(saleForReceipt);
          if (autoPrintRef.current) printSaleReceipt(saleForReceipt);
        },
        onError: (err: any) => {
          submittingRef.current = false;
          productsSnapshot.forEach(([key, data]) => qc.setQueryData(key, data));
          setCart(cartSnapshot); setDiscount(discountSnapshot);
          logInventory({ stage: "rollback_triggered", mutationId, source: "pos", timestamp: new Date().toISOString(), extra: { error: err?.message } });
          toast.error(err?.message || "Sale failed — please retry");
        },
        onSettled: () => {
          submittingRef.current = false;
          if (saleType === "debt") {
            qc.invalidateQueries({ queryKey: getListDebtsQueryKey() });
            qc.invalidateQueries({ queryKey: ["/api/crm"] });
            qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] });
            qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] });
          }
          void syncProductsDelta(qc, shopId);
          qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
          logInventory({ stage: "invalidate_triggered", mutationId, source: "pos", timestamp: new Date().toISOString(), extra: { pending_removed: true } });
        },
      }
    );
  }, [cart, discount, debtCustomerName, debtCustomerPhone, paymentMethod, shopId, userName, qc, createSale, refreshOfflineCount]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && filteredProducts.length > 0 && search.trim()) {
      const q = search.trim().toLowerCase();
      const exactSku = filteredProducts.find(p => p.sku && p.sku.toLowerCase() === q && p.stockQty > 0);
      const target = exactSku || (filteredProducts.length === 1 && filteredProducts[0].stockQty > 0 ? filteredProducts[0] : null);
      if (target) {
        e.preventDefault();
        openQuickAdd(target);
      }
    }
  };

  const visibleProducts = useMemo(() => {
    if (debouncedSearch || selectedCategory !== "all" || (stockFilter !== "all" && stockFilter !== "in_stock")) {
      return filteredProducts;
    }
    return filteredProducts.slice(0, visibleLimit);
  }, [filteredProducts, debouncedSearch, selectedCategory, stockFilter, visibleLimit]);

  const showDesktopDrawer = cart.length > 0 && ticketExpanded;

  const cartPanelProps: CartPanelProps = {
    cart,
    discount,
    debtCustomerName,
    debtCustomerPhone,
    isOwner,
    createSalePending: createSale.isPending,
    subtotal,
    total,
    totalProfit,
    cartCount,
    setDiscount,
    setDebtCustomerName,
    setDebtCustomerPhone,
    setCart,
    setShowCartMobile,
    onRetractDesktop: () => setTicketExpanded(false),
    updateQty,
    removeFromCart,
    updatePrice,
    handleCheckout,
    setQtyDirect,
    paymentMethod,
    setPaymentMethod,
    selectedCustomerBalance,
    setSelectedCustomerBalance,
    selectedCustomerCredit,
    setSelectedCustomerCredit,
    autoPrint,
    onAutoPrintChange: handleAutoPrintChange,
  };

  return (
    <div className="relative flex flex-col lg:flex-row h-full bg-background overflow-hidden">
      {/* ── Left Catalog Pane ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Command & Filter Header */}
        <div className="px-3.5 py-3 md:px-5 md:py-3.5 border-b border-border bg-card/85 backdrop-blur-md shrink-0 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                ref={searchInputRef}
                placeholder="Search products, SKU, or category…"
                className="pl-10 pr-20 h-10 text-sm bg-muted/45 border-border/80 rounded-2xl focus-visible:ring-primary/40"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <span className="hidden sm:inline-flex absolute right-3 top-1/2 -translate-y-1/2 items-center rounded-md border border-border bg-background/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground pointer-events-none">
                  /
                </span>
              )}
            </div>

            <div className="shrink-0 relative">
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="appearance-none h-10 pl-8 pr-3 rounded-2xl text-xs font-semibold bg-muted/50 border border-border text-muted-foreground hover:text-foreground focus:outline-none focus:border-primary/60 cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
                <option value="stock_asc">Stock ↑</option>
                <option value="stock_desc">Stock ↓</option>
                <option value="price_asc">Price ↑</option>
                <option value="price_desc">Price ↓</option>
              </select>
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>

            <div className="hidden sm:flex items-center rounded-2xl border border-border bg-muted/40 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => { setViewMode("cards"); localStorage.setItem("pos_view_mode", "cards"); }}
                title="Grid view"
                className={cn(
                  "h-8 w-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer",
                  viewMode === "cards" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setViewMode("table"); localStorage.setItem("pos_view_mode", "table"); }}
                title="Table view"
                className={cn(
                  "h-8 w-8 rounded-xl flex items-center justify-center transition-colors cursor-pointer",
                  viewMode === "table" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setViewMode(v => {
                const next = v === "cards" ? "table" : "cards";
                localStorage.setItem("pos_view_mode", next);
                return next;
              })}
              className="sm:hidden shrink-0 flex items-center justify-center h-10 w-10 rounded-2xl bg-muted/50 border border-border text-muted-foreground"
              title={viewMode === "cards" ? "Table view" : "Grid view"}
            >
              {viewMode === "cards" ? <LayoutList className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setShowRecentSales(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 h-10 rounded-2xl bg-muted/50 hover:bg-muted text-foreground text-xs font-semibold border border-border transition-colors cursor-pointer"
              title="Today's sales history"
            >
              <ReceiptText className="h-3.5 w-3.5 text-primary" />
              <span className="hidden md:inline">Sales</span>
            </button>

            {/* Desktop Retracted Ticket Quick Toggle */}
            {cart.length > 0 && !ticketExpanded && (
              <button
                type="button"
                onClick={() => setTicketExpanded(true)}
                className="hidden lg:inline-flex items-center gap-2 px-3.5 h-10 rounded-2xl bg-primary text-primary-foreground text-xs font-bold shadow-md shadow-primary/20 hover:brightness-105 transition-all cursor-pointer"
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
                <span>Ticket ({cart.length}) · {formatKES(total)}</span>
              </button>
            )}

            {(!offlineIsOnline || offlineSyncing || pendingCount > 0) && (
              <div
                className={cn(
                  "lg:hidden shrink-0 flex items-center gap-1 px-2.5 h-8 rounded-full text-[10px] font-bold border",
                  offlineSyncing
                    ? "bg-blue-500/10 border-blue-500/20 text-blue-400"
                    : !offlineIsOnline && pendingCount > 0
                    ? "bg-destructive/10 border-destructive/20 text-destructive"
                    : !offlineIsOnline
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                    : "bg-orange-500/10 border-orange-500/20 text-orange-400"
                )}
              >
                {offlineSyncing ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <WifiOff className="h-2.5 w-2.5" />}
                <span>
                  {offlineSyncing ? `Syncing ${pendingCount}` : pendingCount > 0 ? `${pendingCount} queued` : "Offline"}
                </span>
              </div>
            )}
          </div>

          {/* Filter & Category Strip */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
            <div className="flex items-center gap-1 shrink-0 pr-2 border-r border-border/70">
              {FILTERS.map(f => {
                const active = stockFilter === f.value;
                return (
                  <button
                    type="button"
                    key={f.value}
                    onClick={() => setStockFilter(f.value)}
                    className={cn(
                      "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span>{f.label}</span>
                    <span className={cn("text-[10px] font-mono font-bold", active ? "text-primary-foreground/75" : "text-muted-foreground/60")}>
                      {filterCounts[f.value]}
                    </span>
                  </button>
                );
              })}
            </div>

            {categoryOptions.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                    selectedCategory === "all"
                      ? "bg-card border-primary/40 text-foreground"
                      : "bg-transparent border-border/70 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Tag className="h-3 w-3 text-primary" />
                  All Categories
                </button>
                {categoryOptions.map(cat => {
                  const active = selectedCategory === cat.name;
                  const tone = getCategoryTone(cat.name);
                  return (
                    <button
                      type="button"
                      key={cat.name}
                      onClick={() => setSelectedCategory(active ? "all" : cat.name)}
                      className={cn(
                        "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer",
                        active
                          ? "bg-primary/15 border-primary/45 text-primary"
                          : "bg-muted/35 border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      <span className={cn("w-1.5 h-1.5 rounded-full", tone.dot)} />
                      <span>{cat.name}</span>
                      <span className="text-[10px] font-mono opacity-60">{cat.count}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="ml-auto shrink-0 flex items-center gap-1.5 pl-2" title={isStale ? "Reconnecting…" : isRefetching ? "Syncing…" : "Live"}>
              <span
                className={cn(
                  "w-2 h-2 rounded-full",
                  isStale ? "bg-muted-foreground/40" : isRefetching ? "bg-primary animate-pulse" : "bg-emerald-500"
                )}
              />
              <span className="text-[10px] font-semibold text-muted-foreground hidden xl:inline">
                {isStale ? "Stale" : isRefetching ? "Syncing" : "Live"}
              </span>
            </div>
          </div>
        </div>

        {/* Product Catalog Surface */}
        <PosProductCatalog
          isLoading={isLoading}
          showDesktopDrawer={showDesktopDrawer}
          filteredProducts={filteredProducts}
          visibleProducts={visibleProducts}
          visibleLimit={visibleLimit}
          onLoadMore={() => setVisibleLimit(l => l + 200)}
          search={search}
          debouncedSearch={debouncedSearch}
          selectedCategory={selectedCategory}
          stockFilter={stockFilter}
          onResetFilters={() => { setSearch(""); setSelectedCategory("all"); setStockFilter("in_stock"); }}
          viewMode={viewMode}
          cart={cart}
          onOpenQuickAdd={openQuickAdd}
          onUpdateQty={updateQty}
          onInstantAdd={handleInstantAdd}
        />
      </div>

      {/* ── Auto-Retracting Desktop Checkout Drawer ── */}
      <aside
        className={cn(
          "hidden lg:flex flex-col shrink-0 bg-card overflow-hidden transition-[width,opacity] duration-250 ease-out",
          showDesktopDrawer
            ? "w-[420px] xl:w-[460px] border-l border-border opacity-100"
            : "w-0 opacity-0 border-l-0 pointer-events-none"
        )}
      >
        {showDesktopDrawer && <CartPanel {...cartPanelProps} />}
      </aside>

      {/* Desktop Floating Ticket Pill when retracted with items inside */}
      {cart.length > 0 && !ticketExpanded && (
        <button
          type="button"
          onClick={() => setTicketExpanded(true)}
          className="hidden lg:flex fixed bottom-6 right-6 z-40 items-center gap-3 rounded-2xl bg-primary text-primary-foreground px-4 py-3 shadow-2xl shadow-primary/30 border border-primary/50 hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-black/15 flex items-center justify-center">
            <ShoppingCart className="h-4 w-4" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-85">
              Open Current Ticket · {cart.length} {cart.length === 1 ? "item" : "items"}
            </p>
            <p className="text-sm font-bold font-mono">{formatKES(total)}</p>
          </div>
          <PanelRightOpen className="h-4 w-4 ml-1" />
        </button>
      )}

      {/* ── Mobile Cart FAB ── */}
      <button
        type="button"
        className={cn(
          "lg:hidden fixed bottom-[4.75rem] right-4 z-40 bg-primary text-primary-foreground rounded-2xl h-14 px-4 flex items-center gap-2.5 shadow-xl shadow-primary/25 border border-primary/50",
          "transition-all duration-150",
          cartCount > 0 && !showCartMobile ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"
        )}
        onClick={() => setShowCartMobile(true)}
        aria-hidden={cartCount === 0 || showCartMobile}
      >
        <ShoppingCart className="h-5 w-5" />
        <div className="text-left">
          <p className="text-[10px] font-bold leading-none text-primary-foreground/80">
            {formatQty(cartCount)} items
          </p>
          <p className="text-sm font-bold font-mono leading-tight">{formatKES(total)}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-primary-foreground/70" />
      </button>

      {/* Mobile Offline Queue FAB */}
      {pendingCount > 0 && !showCartMobile && (
        <div
          className={cn(
            "lg:hidden fixed bottom-[4.75rem] left-4 z-40 rounded-2xl h-14 px-4 flex items-center gap-2 border",
            offlineSyncing
              ? "bg-blue-500/20 border-blue-500/30 text-blue-300"
              : !offlineIsOnline
              ? "bg-destructive/20 border-destructive/30 text-destructive"
              : "bg-orange-500/20 border-orange-500/30 text-orange-300"
          )}
        >
          {offlineSyncing ? <RefreshCw className="h-4 w-4 animate-spin shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          <div className="text-left">
            <p className="text-[10px] font-bold leading-none opacity-75">
              {offlineSyncing ? "Syncing" : !offlineIsOnline ? "Offline" : "Pending"}
            </p>
            <p className="text-sm font-bold font-mono leading-tight">
              {pendingCount} {pendingCount === 1 ? "sale" : "sales"}
            </p>
          </div>
        </div>
      )}

      {/* Mobile Cart Sheet */}
      {showCartMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col">
          <div className="flex-1 bg-black/65 backdrop-blur-sm" onClick={() => setShowCartMobile(false)} />
          <div className="bg-card h-[92svh] flex flex-col rounded-t-3xl border-t border-border overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
              <CartPanel {...cartPanelProps} />
            </div>
          </div>
        </div>
      )}

      {/* QuickAdd Sheet */}
      <QuickAddSheet
        product={quickAddProduct}
        open={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onAdd={handleQuickAdd}
        isOwner={isOwner}
        cartQty={cart.find(i => i.product.id === quickAddProduct?.id)?.qty ?? 0}
      />

      {/* Today's Sales Slide-Over */}
      {showRecentSales && (
        <RecentSalesDrawer
          shopId={shopId}
          userName={userName}
          onClose={() => setShowRecentSales(false)}
        />
      )}

      {/* Sale Complete Receipt Overlay */}
      {completedSale && (
        <SaleCompleteOverlay
          sale={completedSale}
          onDismiss={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
}
