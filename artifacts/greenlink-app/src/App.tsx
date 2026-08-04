import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setBaseUrl, setAuthTokenGetter, getListProductsQueryOptions, getListProductsQueryKey } from "@workspace/api-client-react";
import { mergeWithMutationResults } from "@/lib/product-version-guard";
import { loadCachedProducts, saveProductsToCache } from "@/lib/product-db";
import { useEffect, useRef, useState, lazy, Suspense, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useGetSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedSession, setCachedSession } from "@/lib/session-cache";

// ── Global auth-expiry handler ─────────────────────────────────────────────────
// Called whenever ANY query or mutation returns a 401/403. Clears credentials
// and hard-navigates to /login so the user re-authenticates automatically
// instead of seeing a wall of "failed" toasts.
function handleAuthExpiry() {
  localStorage.removeItem("greenlink_token");
  setCachedSession(null);
  // Only redirect when not already on the login page to avoid loops.
  if (!window.location.pathname.startsWith("/login")) {
    window.location.replace("/login");
  }
}

// Login and POS are EAGERLY imported — they are the two critical first screens
import Login from "@/pages/login";
import POS from "@/pages/pos";
import Layout from "@/components/layout";
const Stock = lazy(() => import("@/pages/stock"));
const Debts = lazy(() => import("@/pages/debts"));
const Alerts = lazy(() => import("@/pages/alerts"));
const Reports = lazy(() => import("@/pages/reports"));
const OCR = lazy(() => import("@/pages/ocr"));
const Settings = lazy(() => import("@/pages/settings"));
const OwnerDashboard = lazy(() => import("@/pages/owner-dashboard"));
const SalesHistory = lazy(() => import("@/pages/sales-history"));
const Returns = lazy(() => import("@/pages/returns"));
const Transfers = lazy(() => import("@/pages/transfers"));
const InvoiceHistory = lazy(() => import("@/pages/invoice-history"));
const SupplierDetail = lazy(() => import("@/pages/supplier-detail"));
const Quotations = lazy(() => import("@/pages/quotations"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  // ── Global 401/403 interceptor ───────────────────────────────────────────
  // Any query or mutation that returns an auth error automatically clears
  // credentials and sends the user back to /login. This handles the case
  // where the 24 h KV session expires while the app is open (e.g. overnight)
  // so the user is re-authenticated without having to manually log out.
  queryCache: new QueryCache({
    onError: (error: any) => {
      if (error?.status === 401 || error?.status === 403) handleAuthExpiry();
    },
  }),
  mutationCache: new MutationCache({
    onError: (error: any) => {
      if (error?.status === 401 || error?.status === 403) handleAuthExpiry();
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,  // POS: tab switches must never fire background requests
      refetchOnReconnect: false,    // reconnect refetch disabled — mutations invalidate cache explicitly
      refetchOnMount: true,
      staleTime: 5 * 60_000,        // 5 min — matches KV cache TTL; mutations invalidate immediately
      gcTime: 30 * 60_000,          // 30 min in memory
    },
  },
});

// ── Version guard + IndexedDB write-through ────────────────────────────────────
// Subscribe to every successful products-list fetch.
//
// Two things happen on every successful /api/products response:
//   1. Version guard: if the server returned a product whose updatedAt is older
//      than a recent local mutation result (stale KV hit), silently replace it
//      with the mutation-confirmed version so the UI never flickers.
//   2. IndexedDB write-through: persist the (possibly merged) product list to
//      Dexie so the next app startup can render products instantly before the
//      network response arrives.
//
// Guard flag prevents the setQueryData call below from triggering an infinite loop:
//   fetch success → setQueryData(merged) → 'setData' action → subscribe → guard returns early
let _applyingVersionGuard = false;
queryClient.getQueryCache().subscribe((event) => {
  if (_applyingVersionGuard) return;
  if (event.type !== "updated") return;
  const action = (event as any).action;
  if (action?.type !== "success") return;

  const key = event.query.queryKey;
  if (!Array.isArray(key) || key[0] !== "/api/products") return;

  // 1. Version guard merge
  const merged = mergeWithMutationResults(action.data);
  if (merged !== action.data) {
    _applyingVersionGuard = true;
    queryClient.setQueryData(key, merged);
    _applyingVersionGuard = false;
  }

  // 2. Write-through to IndexedDB — use the merged data (authoritative)
  const finalData = merged !== action.data ? merged : action.data;
  const products: any[] | undefined = finalData?.products;
  if (products && products.length > 0) {
    const shopId: string | undefined = products[0]?.shopId;
    if (shopId) {
      // Fire-and-forget — IndexedDB write is non-blocking
      saveProductsToCache(shopId, products).catch(() => {});
    }
  }
});

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? null;
setBaseUrl(API_BASE);
setAuthTokenGetter(() => localStorage.getItem("greenlink_token"));

// ── Error boundary ─────────────────────────────────────────────────────────────
// Catches any JS crash inside the app and shows a plain recovery screen
// instead of leaving the user on a black page.
interface ErrorBoundaryState { hasError: boolean; message: string }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: unknown): ErrorBoundaryState {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("[GreenLink] Render error:", err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A0A0A", color: "#C8FF00", fontFamily: "sans-serif", gap: 16, padding: 24 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>
          </svg>
          <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Something went wrong</p>
          <p style={{ fontSize: 13, color: "#888", margin: 0, maxWidth: 320, textAlign: "center" }}>{this.state.message}</p>
          <button
            onClick={() => { this.setState({ hasError: false, message: "" }); window.location.reload(); }}
            style={{ marginTop: 8, padding: "10px 24px", background: "#C8FF00", color: "#0A0A0A", border: "none", borderRadius: 8, fontWeight: 700, cursor: "pointer", fontSize: 14 }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Shared loading spinner ─────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0A0A0A", gap: 20 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: "#C8FF00", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/>
          <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>
        </svg>
      </div>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#fff", fontWeight: 700, fontSize: 18, margin: 0, letterSpacing: "-0.02em" }}>GreenLink OS</p>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: "4px 0 0" }}>Loading…</p>
      </div>
      <div style={{ width: 36, height: 36, borderRadius: "50%", border: "2px solid rgba(200,255,0,0.2)", borderTop: "2px solid #C8FF00", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Auth guard ─────────────────────────────────────────────────────────────────
function AuthGuard({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const token = localStorage.getItem("greenlink_token");
  const cachedSession = getCachedSession();

  // ── Reactive online detection ──────────────────────────────────────────────
  // navigator.onLine can be stale after JS engine pause (mobile background).
  // Track it via events so we always have the current state.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const onOnline  = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online",  onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online",  onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── ready: can we paint the app shell now? ─────────────────────────────────
  // true when we have token + cached session (instant render from local state),
  // OR when we are offline (trust the token — can't validate anyway, OfflineBanner
  // communicates the connectivity status to the user).
  const [ready, setReady] = useState(
    () => !!token && (!!cachedSession || !navigator.onLine)
  );

  const redirectedRef = useRef(false);
  const prefetchedRef = useRef(false);
  const qc = useQueryClient();

  // ── INSTANT product seed ───────────────────────────────────────────────────
  // Seed React Query cache from IndexedDB on first render when we already have
  // a cached session. Runs BEFORE the network session check — products visible
  // at 0 ms instead of 500ms–2s. Background prefetch overwrites with fresh data.
  useEffect(() => {
    if (prefetchedRef.current) return;
    const shopId = cachedSession?.shopId as string | undefined;
    if (!shopId || !token) return;
    prefetchedRef.current = true;
    const opts = getListProductsQueryOptions({ shopId, limit: 3000 });
    loadCachedProducts(shopId).then((cached) => {
      if (cached.length > 0 && !qc.getQueryData(opts.queryKey)) {
        qc.setQueryData(opts.queryKey, { products: cached });
      }
      qc.prefetchQuery(opts);
    }).catch(() => {
      qc.prefetchQuery(opts);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount only

  // ── Session validation — online only ───────────────────────────────────────
  // When the device is offline there is no point hitting the network:
  //  • We can't reach the CF Worker anyway → guaranteed TypeError
  //  • The 5-second NetworkFirst SW timeout causes a visible hang
  //  • The retry/error path can incorrectly land in the "no session" branch
  //    if the error object shape is unexpected, logging the user out.
  // Solution: disable the query while offline and re-enable when back online.
  const { data: session, isLoading, error } = useGetSession({
    // queryKey is defaulted by the generated hook at runtime; cast silences the RQ v5 strict type
    query: { enabled: !!token && isOnline, retry: false } as any,
  });

  useEffect(() => {
    if (redirectedRef.current) return;

    // ── No token at all → go to login ─────────────────────────────────────
    if (!token) {
      redirectedRef.current = true;
      setCachedSession(null);
      setLocation("/login");
      return;
    }

    // ── Offline path: trust the token, never redirect ──────────────────────
    // The OfflineBanner shows the offline state to the user. Cached products
    // (IndexedDB) and cached session (localStorage) keep the app functional.
    // When connectivity returns the query re-enables and re-validates.
    if (!isOnline) {
      if (!ready) setReady(true);
      return;
    }

    // ── Online path: wait for session query result ─────────────────────────
    if (!isLoading) {
      if (error) {
        // Only log out on definitive auth rejections (401 / 403).
        // Network errors (TypeError), 5xx, and CF Worker cold-starts must NOT
        // kick the user out — the OfflineBanner handles the connectivity UX.
        const status = (error as any)?.status as number | undefined;
        const isAuthFailure = status === 401 || status === 403;
        if (isAuthFailure) {
          redirectedRef.current = true;
          localStorage.removeItem("greenlink_token");
          setCachedSession(null);
          setLocation("/login");
        } else {
          // Network / 5xx: stay in app. If we have a cached session, render it.
          if (!ready && cachedSession) setReady(true);
        }

      } else if (session) {
        // Fresh session from server — update the localStorage cache and render.
        setCachedSession(session);
        // Reset redirect flag so a future session expiry can redirect again.
        // Without this reset, once the flag fires once it stays true for the
        // component's lifetime, silently swallowing subsequent expirations.
        redirectedRef.current = false;
        if (!ready) setReady(true);

        // Fallback seed: if there was no cached session on mount we couldn't
        // seed products earlier. Do it now with the confirmed shopId.
        if (!prefetchedRef.current && session.shopId) {
          prefetchedRef.current = true;
          const opts = getListProductsQueryOptions({ shopId: session.shopId, limit: 3000 });
          loadCachedProducts(session.shopId).then((cached) => {
            if (cached.length > 0 && !qc.getQueryData(opts.queryKey)) {
              qc.setQueryData(opts.queryKey, { products: cached });
            }
            qc.prefetchQuery(opts);
          }).catch(() => {
            qc.prefetchQuery(opts);
          });
        }

      } else if (!cachedSession) {
        // Online + no error + no session + no cache → genuinely not logged in.
        redirectedRef.current = true;
        setLocation("/login");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session, isLoading, error, isOnline, ready, setLocation, qc]);

  if (!token) return <Login />;
  if (!ready) return <PageLoader />;
  return <>{children}</>;
}

// ── Routes ─────────────────────────────────────────────────────────────────────
function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        <AuthGuard>
          <Layout>
            <Suspense fallback={<PageLoader />}>
              <Switch>
                <Route path="/" component={POS} />
                <Route path="/pos" component={POS} />
                <Route path="/stock" component={Stock} />
                <Route path="/debts" component={Debts} />
                <Route path="/alerts" component={Alerts} />
                <Route path="/reports" component={Reports} />
                <Route path="/ocr" component={OCR} />
                <Route path="/settings" component={Settings} />
                <Route path="/owner-dashboard" component={OwnerDashboard} />
                <Route path="/sales-history" component={SalesHistory} />
                <Route path="/returns" component={Returns} />
                <Route path="/transfers" component={Transfers} />
                <Route path="/invoices" component={InvoiceHistory} />
                <Route path="/suppliers/:supplierId" component={SupplierDetail} />
                <Route path="/quotations" component={Quotations} />
                <Route component={NotFound} />
              </Switch>
            </Suspense>
          </Layout>
        </AuthGuard>
      </Route>
    </Switch>
  );
}

// ── App root ───────────────────────────────────────────────────────────────────
function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                color: "hsl(var(--foreground))",
              },
            }}
          />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
