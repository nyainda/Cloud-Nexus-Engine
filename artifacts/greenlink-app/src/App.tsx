import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { useEffect, useRef, useState, lazy, Suspense, Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { useGetSession } from "@workspace/api-client-react";
import { getCachedSession, setCachedSession } from "@/lib/session-cache";

// Login is EAGERLY imported — it's the critical first screen, must never flash black
import Login from "@/pages/login";
import Layout from "@/components/layout";

// All other pages are lazy — loaded only when navigated to
const POS = lazy(() => import("@/pages/pos"));
const Stock = lazy(() => import("@/pages/stock"));
const Debts = lazy(() => import("@/pages/debts"));
const Alerts = lazy(() => import("@/pages/alerts"));
const Reports = lazy(() => import("@/pages/reports"));
const OCR = lazy(() => import("@/pages/ocr"));
const Settings = lazy(() => import("@/pages/settings"));
const OwnerDashboard = lazy(() => import("@/pages/owner-dashboard"));
const SalesHistory = lazy(() => import("@/pages/sales-history"));
const NotFound = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
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
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0A]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-2 border-[#C8FF00]/30 border-t-[#C8FF00] animate-spin" />
        <p className="text-sm text-white/40 font-medium">Loading…</p>
      </div>
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
      }
    }
  }, [token, session, isLoading, error, setLocation]);

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
