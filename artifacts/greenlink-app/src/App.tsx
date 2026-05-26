import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setBaseUrl, setAuthTokenGetter, getListProductsQueryOptions } from "@workspace/api-client-react";
import { useEffect, useRef, useState, lazy, Suspense, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useGetSession } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getCachedSession, setCachedSession } from "@/lib/session-cache";

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
const InvoiceHistory = lazy(() => import("@/pages/invoice-history"));
const SupplierDetail = lazy(() => import("@/pages/supplier-detail"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
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

  const [ready, setReady] = useState(!!token && !!cachedSession);
  const redirectedRef = useRef(false);
  const prefetchedRef = useRef(false);
  const qc = useQueryClient();

  const { data: session, isLoading, error } = useGetSession({
    query: { enabled: !!token },
  });

  useEffect(() => {
    if (redirectedRef.current) return;
    if (!token) {
      redirectedRef.current = true;
      setCachedSession(null);
      setLocation("/login");
      return;
    }
    if (!isLoading) {
      if (error || !session) {
        redirectedRef.current = true;
        localStorage.removeItem("greenlink_token");
        setCachedSession(null);
        setLocation("/login");
      } else {
        setCachedSession(session);
        setReady(true);
        // Pre-warm the product cache so POS loads instantly on first click
        if (!prefetchedRef.current && session.shopId) {
          prefetchedRef.current = true;
          const opts = getListProductsQueryOptions({ shopId: session.shopId, limit: 3000 });
          qc.prefetchQuery(opts);
        }
      }
    }
  }, [token, session, isLoading, error, setLocation, qc]);

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
                <Route path="/invoices" component={InvoiceHistory} />
                <Route path="/suppliers/:supplierId" component={SupplierDetail} />
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
