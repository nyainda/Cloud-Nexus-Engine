import { Link, useRoute, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { OfflineBanner } from "@/components/offline-banner";
import { OfflineSyncProvider, useOfflineSyncCtx } from "@/lib/offline-context";
import {
  ShoppingCart, Package, Users, Bell, BarChart3, Store, MapPin,
  ScanLine, Settings, LogOut, LayoutDashboard, Receipt,
  Sun, Moon, Download, RotateCcw, PanelLeftClose, PanelLeftOpen,
  MoreHorizontal, X, Truck, ArrowLeftRight, FileText, BookUser, Sprout,
  WifiOff, RefreshCw,
} from "lucide-react";
import { useLogout } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { setCachedSession } from "@/lib/session-cache";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { usePwaInstall } from "@/hooks/use-pwa-install";

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  collapsed?: boolean;
}

const PAGE_TITLES: Record<string, string> = {
  "/": "Point of Sale",
  "/pos": "Point of Sale",
  "/stock": "Inventory",
  "/customers": "Customers",
  "/debts": "Customer Debts",
  "/alerts": "Alerts",
  "/sales-history": "Sales History",
  "/returns": "Process Return",
  "/transfers": "Stock Transfers",
  "/quotations": "Quotations",
  "/nursery": "Nursery Register",
  "/owner-dashboard": "Owner Overview",
  "/reports": "Analytics",
  "/invoices": "Purchase History",
  "/ocr": "Smart Scanner",
  "/settings": "Settings",
};

function getPageTitle(path: string): string {
  if (PAGE_TITLES[path]) return PAGE_TITLES[path];
  if (path.startsWith("/suppliers/")) return "Supplier Detail";
  return "GreenLink OS";
}

function SidebarNavItem({ href, icon: Icon, label, badge, collapsed }: NavItemProps) {
  const [matchHref] = useRoute(href);
  const [matchRoot] = useRoute("/");
  const isActive = matchHref || (href === "/pos" && matchRoot);

  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-xl transition-all duration-150 group relative",
        collapsed ? "justify-center h-10 w-10 mx-auto" : "px-3 py-2",
        isActive
          ? "bg-primary text-primary-foreground font-semibold shadow-sm"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary-foreground" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground")} />
      {!collapsed && <span className="text-[13px] font-medium truncate">{label}</span>}
      {!!badge && badge > 0 && !collapsed && (
        <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {!!badge && badge > 0 && collapsed && (
        <span className="absolute -top-0.5 -right-0.5 bg-destructive text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function BottomNavItem({ href, icon: Icon, label, badge }: NavItemProps) {
  const [matchHref] = useRoute(href);
  const [matchRoot] = useRoute("/");
  const isActive = matchHref || (href === "/pos" && matchRoot);

  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 transition-colors relative",
        isActive ? "text-primary" : "text-muted-foreground"
      )}
    >
      {isActive && (
        <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />
      )}
      <div className="relative">
        <Icon className="h-[18px] w-[18px]" />
        {!!badge && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-destructive text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      <span className={cn("text-[9px] font-bold uppercase tracking-wider", isActive ? "text-primary" : "text-muted-foreground/70")}>
        {label}
      </span>
    </Link>
  );
}

function MobileThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className="h-8 w-8 flex items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
    >
      {theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-primary" />}
    </button>
  );
}

function ThemeToggle({ collapsed, theme, onToggle }: { collapsed?: boolean; theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-xl text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all text-[13px] font-medium cursor-pointer",
        collapsed ? "justify-center h-10 w-10 mx-auto" : "w-full px-3 py-2"
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4 shrink-0 text-amber-400" /> : <Moon className="h-4 w-4 shrink-0 text-primary" />}
      {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
    </button>
  );
}

function MobileBottomNav({ isOwner }: { isOwner: boolean }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => { setMoreOpen(false); }, [location]);

  return (
    <>
      <nav
        className="lg:hidden flex items-stretch bg-sidebar/95 backdrop-blur-md border-t border-border shrink-0 z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <BottomNavItem href="/pos" icon={ShoppingCart} label="POS" />
        <BottomNavItem href="/stock" icon={Package} label="Stock" />
        <BottomNavItem href="/debts" icon={Users} label="Debts" />
        <BottomNavItem href="/alerts" icon={Bell} label="Alerts" />
        <BottomNavItem href="/sales-history" icon={Receipt} label="History" />
        <button
          type="button"
          onClick={() => setMoreOpen(v => !v)}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 transition-colors relative",
            moreOpen ? "text-primary" : "text-muted-foreground"
          )}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
          <span className={cn("text-[9px] font-bold uppercase tracking-wider", moreOpen ? "text-primary" : "text-muted-foreground/70")}>
            More
          </span>
        </button>
      </nav>

      {moreOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-border rounded-t-3xl shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <p className="font-display text-sm font-bold text-foreground">All Modules</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              <MoreSheetItem href="/customers" icon={BookUser} label="Customers" />
              <MoreSheetItem href="/nursery" icon={Sprout} label="Nursery Register" />
              <MoreSheetItem href="/returns" icon={RotateCcw} label="Process Return" />
              <MoreSheetItem href="/transfers" icon={ArrowLeftRight} label="Transfers" />
              <MoreSheetItem href="/quotations" icon={FileText} label="Quotations" />
              {isOwner && (
                <>
                  <MoreSheetItem href="/reports" icon={BarChart3} label="Analytics" />
                  <MoreSheetItem href="/owner-dashboard" icon={LayoutDashboard} label="Overview" />
                  <MoreSheetItem href="/invoices" icon={Truck} label="Purchase History" />
                  <MoreSheetItem href="/ocr" icon={ScanLine} label="Smart Scanner" />
                </>
              )}
              <MoreSheetItem href="/settings" icon={Settings} label="Settings" />
            </div>
          </div>
        </>
      )}
    </>
  );
}

function MoreSheetItem({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  const [isActive] = useRoute(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3.5 py-3 rounded-2xl text-sm font-semibold transition-all border",
        isActive
          ? "bg-primary/12 text-primary border-primary/30"
          : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border-border/40"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function ShopLogo({ shopId, className }: { shopId: string; className?: string }) {
  const src = shopId.includes("sunrise") ? "/logo-sunrise.jpg" : "/logo-greenlink.jpg";
  return <img src={src} alt="shop logo" className={className} style={{ objectFit: "contain" }} />;
}

function WorkspaceTopBar({
  currentPath,
  shopName,
  role,
  userName,
  theme,
  onToggleTheme,
}: {
  currentPath: string;
  shopName: string;
  role: string;
  userName: string;
  theme: Theme;
  onToggleTheme: () => void;
}) {
  const { isOnline, pendingCount, syncing } = useOfflineSyncCtx();
  const isPos = currentPath === "/" || currentPath === "/pos";
  const pageTitle = getPageTitle(currentPath);

  return (
    <header className="hidden lg:flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/75 backdrop-blur-md px-5 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="font-display text-sm font-bold tracking-tight text-foreground shrink-0">
          {pageTitle}
        </h1>
        <span className="h-4 w-px bg-border shrink-0" />

        {/* Active Shop Verification Chip */}
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 pl-2 pr-3 py-1 min-w-0">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
            <Store className="h-3 w-3" />
          </span>
          <span className="truncate text-xs font-bold text-foreground max-w-[240px]" title={shopName}>
            {shopName}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-500 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {role}
          </span>
        </div>

        {isPos && (
          <div className="hidden xl:inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-500 shrink-0">
            <MapPin className="h-3 w-3" />
            Verify branch before checkout
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {userName && (
          <span className="text-xs font-medium text-muted-foreground hidden xl:inline">
            Operator: <span className="font-semibold text-foreground">{userName}</span>
          </span>
        )}

        {/* Network / Sync Pill */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
            syncing
              ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
              : !isOnline
              ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
              : pendingCount > 0
              ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
              : "border-border bg-muted/40 text-muted-foreground"
          )}
        >
          {syncing ? (
            <RefreshCw className="h-3 w-3 animate-spin" />
          ) : !isOnline ? (
            <WifiOff className="h-3 w-3" />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
          <span>
            {syncing
              ? `Syncing ${pendingCount}`
              : !isOnline
              ? "Offline"
              : pendingCount > 0
              ? `${pendingCount} queued`
              : "Synced"}
          </span>
        </div>

        {/* Quick theme switch */}
        <button
          type="button"
          onClick={onToggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="h-8 w-8 flex items-center justify-center rounded-full border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer"
        >
          {theme === "dark" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-primary" />}
        </button>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const shopName = localStorage.getItem("greenlink_shopName") || "Retail Shop";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const isOwner = role === "owner";
  const { canInstall, install } = usePwaInstall();

  const [theme, setThemeState] = useState<Theme>(getTheme);
  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("greenlink_sidebar_collapsed") === "1"; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem("greenlink_sidebar_collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };

  const logout = useLogout();
  const [currentPath, setLocation] = useLocation();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSettled: () => {
        ["greenlink_token", "greenlink_role", "greenlink_shopId", "greenlink_shopName", "greenlink_userName"].forEach(
          k => localStorage.removeItem(k)
        );
        setCachedSession(null);
        setLocation("/login");
      },
    });
  };

  return (
    <div className="fixed inset-0 flex flex-col lg:flex-row bg-background font-sans">
      {/* ── Desktop Sidebar ── */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar shrink-0 transition-[width] duration-200",
          collapsed ? "w-[68px]" : "w-[232px]"
        )}
      >
        {/* Brand Header */}
        <div
          className={cn(
            "h-12 border-b border-sidebar-border flex items-center shrink-0",
            collapsed ? "px-2 justify-center" : "px-3.5 justify-between gap-2"
          )}
        >
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-white p-0.5 border border-black/10 shrink-0 overflow-hidden flex items-center justify-center">
                <ShopLogo shopId={shopId} className="h-full w-full" />
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold tracking-tight leading-none">
                  GreenLink <span className="text-primary">OS</span>
                </p>
                <p className="text-[10px] text-sidebar-foreground/50 truncate mt-0.5">
                  {userName || (isOwner ? "Owner" : "Cashier")}
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex items-center justify-center rounded-lg w-8 h-8 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors shrink-0 cursor-pointer"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {!collapsed && (
            <p className="px-3 pb-1 text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-[0.14em]">
              Register
            </p>
          )}
          <SidebarNavItem href="/pos" icon={ShoppingCart} label="Point of Sale" collapsed={collapsed} />
          <SidebarNavItem href="/stock" icon={Package} label="Inventory" collapsed={collapsed} />
          <SidebarNavItem href="/customers" icon={BookUser} label="Customers" collapsed={collapsed} />
          <SidebarNavItem href="/debts" icon={Users} label="Customer Debts" collapsed={collapsed} />
          <SidebarNavItem href="/alerts" icon={Bell} label="Alerts" collapsed={collapsed} />

          {!collapsed ? (
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-[0.14em]">History</p>
            </div>
          ) : (
            <div className="py-1.5"><div className="border-t border-sidebar-border/60" /></div>
          )}
          <SidebarNavItem href="/sales-history" icon={Receipt} label="Sales History" collapsed={collapsed} />
          <SidebarNavItem href="/returns" icon={RotateCcw} label="Process Return" collapsed={collapsed} />
          <SidebarNavItem href="/transfers" icon={ArrowLeftRight} label="Transfers" collapsed={collapsed} />

          {!collapsed ? (
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-[0.14em]">Sales Tools</p>
            </div>
          ) : (
            <div className="py-1.5"><div className="border-t border-sidebar-border/60" /></div>
          )}
          <SidebarNavItem href="/quotations" icon={FileText} label="Quotations" collapsed={collapsed} />
          <SidebarNavItem href="/nursery" icon={Sprout} label="Nursery Register" collapsed={collapsed} />

          {isOwner && (
            <>
              {!collapsed ? (
                <div className="pt-3 pb-1 px-3">
                  <p className="text-[10px] font-bold text-sidebar-foreground/40 uppercase tracking-[0.14em]">Management</p>
                </div>
              ) : (
                <div className="py-1.5"><div className="border-t border-sidebar-border/60" /></div>
              )}
              <SidebarNavItem href="/owner-dashboard" icon={LayoutDashboard} label="Owner Dashboard" collapsed={collapsed} />
              <SidebarNavItem href="/reports" icon={BarChart3} label="Analytics" collapsed={collapsed} />
              <SidebarNavItem href="/invoices" icon={Truck} label="Purchase History" collapsed={collapsed} />
              <SidebarNavItem href="/ocr" icon={ScanLine} label="Smart Scanner" collapsed={collapsed} />
            </>
          )}
        </nav>

        {/* Footer Controls */}
        <div className="p-2.5 border-t border-sidebar-border space-y-1 shrink-0">
          <SidebarNavItem href="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
          <ThemeToggle collapsed={collapsed} theme={theme} onToggle={toggleTheme} />
          {canInstall && (
            <button
              type="button"
              onClick={install}
              title={collapsed ? "Install App" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-xl text-primary hover:bg-primary/10 transition-all text-[13px] font-medium cursor-pointer",
                collapsed ? "justify-center h-10 w-10 mx-auto" : "w-full px-3 py-2"
              )}
            >
              <Download className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Install App</span>}
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            title={collapsed ? "Sign Out" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl text-sidebar-foreground/65 hover:bg-destructive/12 hover:text-destructive transition-all text-[13px] font-medium cursor-pointer",
              collapsed ? "justify-center h-10 w-10 mx-auto" : "w-full px-3 py-2"
            )}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Column ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Topbar */}
        <div className="lg:hidden flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border bg-sidebar shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-white p-0.5 border border-black/10 shrink-0 overflow-hidden flex items-center justify-center">
              <ShopLogo shopId={shopId} className="h-full w-full" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate leading-tight">{shopName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-semibold text-muted-foreground capitalize">{role}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <MobileThemeToggle theme={theme} onToggle={toggleTheme} />
            {canInstall && (
              <button
                type="button"
                onClick={install}
                title="Install App"
                className="h-8 w-8 flex items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            <Link
              href="/settings"
              className="h-8 w-8 flex items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Settings className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              title="Sign Out"
              className="h-8 w-8 flex items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <OfflineSyncProvider shopId={shopId}>
          <WorkspaceTopBar
            currentPath={currentPath}
            shopName={shopName}
            role={role}
            userName={userName}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
          <OfflineBanner />
          <main className="flex-1 overflow-y-auto min-h-0">
            {children}
          </main>
        </OfflineSyncProvider>

        <MobileBottomNav isOwner={isOwner} />
      </div>
    </div>
  );
}
