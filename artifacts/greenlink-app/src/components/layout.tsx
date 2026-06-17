import { Link, useRoute, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { OfflineBanner } from "@/components/offline-banner";
import {
  ShoppingCart, Package, Users, Bell, BarChart3,
  ScanLine, Settings, Leaf, LogOut, LayoutDashboard, Receipt,
  Sun, Moon, Download, RotateCcw, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen,
  MoreHorizontal, X, Truck, ArrowLeftRight, FileText,
} from "lucide-react";
import { useListNotifications, useLogout } from "@workspace/api-client-react";
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

function SidebarNavItem({ href, icon: Icon, label, badge, collapsed }: NavItemProps) {
  const [isActive] = useRoute(href);
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative",
        collapsed ? "justify-center px-2" : "",
        isActive
          ? "bg-primary text-primary-foreground font-semibold"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="text-sm font-medium">{label}</span>}
      {!!badge && badge > 0 && !collapsed && (
        <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {!!badge && badge > 0 && collapsed && (
        <span className="absolute top-1 right-1 bg-destructive text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </Link>
  );
}

function BottomNavItem({ href, icon: Icon, label, badge }: NavItemProps) {
  const [isActive] = useRoute(href === "/" ? "/" : href);
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 transition-colors relative",
        isActive ? "text-primary" : "text-muted-foreground"
      )}
    >
      <div className="relative">
        <Icon className="h-5 w-5" />
        {!!badge && badge > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-destructive text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </div>
      <span className={cn("text-[9px] font-semibold uppercase tracking-wide", isActive ? "text-primary" : "text-muted-foreground/60")}>
        {label}
      </span>
    </Link>
  );
}

function MobileThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

function ThemeToggle({ collapsed, className }: { collapsed?: boolean; className?: string }) {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };
  return (
    <button
      onClick={toggle}
      title={collapsed ? (theme === "dark" ? "Light mode" : "Dark mode") : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all text-sm font-medium w-full",
        collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
        className
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
      {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
    </button>
  );
}

function MobileBottomNav({ isOwner, unreadCount }: { isOwner: boolean; unreadCount: number }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [location] = useLocation();

  // Close the "More" sheet whenever the user navigates
  useEffect(() => { setMoreOpen(false); }, [location]);

  return (
    <>
      {/* Bottom bar */}
      <nav
        className="lg:hidden flex items-stretch bg-sidebar border-t border-border shrink-0 z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <BottomNavItem href="/pos" icon={ShoppingCart} label="POS" />
        <BottomNavItem href="/stock" icon={Package} label="Stock" />
        <BottomNavItem href="/debts" icon={Users} label="Debts" />
        <BottomNavItem href="/alerts" icon={Bell} label="Alerts" badge={unreadCount} />
        <BottomNavItem href="/sales-history" icon={Receipt} label="History" />
        {/* "More" button — opens a sheet with the rest of the navigation */}
        <button
          onClick={() => setMoreOpen(v => !v)}
          className={cn(
            "flex flex-col items-center justify-center flex-1 py-2 gap-0.5 transition-colors relative",
            moreOpen ? "text-primary" : "text-muted-foreground"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span className={cn("text-[9px] font-semibold uppercase tracking-wide", moreOpen ? "text-primary" : "text-muted-foreground/60")}>
            More
          </span>
        </button>
      </nav>

      {/* "More" bottom sheet overlay */}
      {moreOpen && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          {/* Sheet */}
          <div
            className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-border rounded-t-2xl shadow-2xl"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
              <p className="text-sm font-bold text-foreground">Navigation</p>
              <button onClick={() => setMoreOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
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
        "flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-semibold transition-all",
        isActive
          ? "bg-primary/10 text-primary border border-primary/20"
          : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border border-transparent"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const shopName = localStorage.getItem("greenlink_shopName") || "Retail Shop";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const isOwner = role === "owner";
  const { canInstall, install } = usePwaInstall();

  // Collapsible sidebar state — persisted in localStorage
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

  const { data: notifications } = useListNotifications(
    { shopId },
    { query: { enabled: !!shopId } as any }
  );
  const unreadCount = (notifications || []).filter((n: any) => !n.isRead).length;

  const logout = useLogout();
  const [, setLocation] = useLocation();

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
      <aside className={cn(
        "hidden lg:flex flex-col border-r border-sidebar-border bg-sidebar shrink-0 transition-all duration-200",
        collapsed ? "w-14" : "w-56"
      )}>
        {/* Logo / header */}
        <div className={cn(
          "border-b border-sidebar-border flex items-center",
          collapsed ? "p-2 justify-center" : "p-4 justify-between"
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <Leaf className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-sidebar-foreground leading-tight font-display">GreenLink OS</p>
                <p className="text-[10px] text-sidebar-foreground/50 truncate">{shopName}</p>
              </div>
            </div>
          )}
          {collapsed && (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Leaf className="h-4 w-4 text-primary-foreground" />
            </div>
          )}
          {/* Collapse toggle always visible */}
          <button
            onClick={toggleCollapsed}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "flex items-center justify-center rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors",
              collapsed ? "mt-2 w-8 h-8" : "w-7 h-7 shrink-0"
            )}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>

        {/* Role indicator — hidden when collapsed */}
        {!collapsed && (
          <div className="px-3 py-2 border-b border-sidebar-border/60">
            <div className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-sidebar-foreground/60 font-medium">
                {userName || (isOwner ? "Owner" : "Cashier")} · <span className="capitalize">{role}</span>
              </span>
            </div>
          </div>
        )}

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto overflow-x-hidden">
          <SidebarNavItem href="/pos" icon={ShoppingCart} label="Point of Sale" collapsed={collapsed} />
          <SidebarNavItem href="/stock" icon={Package} label="Inventory" collapsed={collapsed} />
          <SidebarNavItem href="/debts" icon={Users} label="Customer Debts" collapsed={collapsed} />
          <SidebarNavItem href="/alerts" icon={Bell} label="Alerts" badge={unreadCount} collapsed={collapsed} />

          {!collapsed && (
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-bold text-sidebar-foreground/30 uppercase tracking-wider">History</p>
            </div>
          )}
          {collapsed && <div className="pt-2 pb-1"><div className="border-t border-sidebar-border/40" /></div>}
          <SidebarNavItem href="/sales-history" icon={Receipt} label="Sales History" collapsed={collapsed} />
          <SidebarNavItem href="/returns" icon={RotateCcw} label="Process Return" collapsed={collapsed} />
          <SidebarNavItem href="/transfers" icon={ArrowLeftRight} label="Transfers" collapsed={collapsed} />

          {!collapsed && (
            <div className="pt-3 pb-1 px-3">
              <p className="text-[10px] font-bold text-sidebar-foreground/30 uppercase tracking-wider">Sales Tools</p>
            </div>
          )}
          {collapsed && <div className="pt-2 pb-1"><div className="border-t border-sidebar-border/40" /></div>}
          <SidebarNavItem href="/quotations" icon={FileText} label="Quotations" collapsed={collapsed} />

          {isOwner && (
            <>
              {!collapsed && (
                <div className="pt-3 pb-1 px-3">
                  <p className="text-[10px] font-bold text-sidebar-foreground/30 uppercase tracking-wider">Management</p>
                </div>
              )}
              {collapsed && <div className="pt-2 pb-1"><div className="border-t border-sidebar-border/40" /></div>}
              <SidebarNavItem href="/owner-dashboard" icon={LayoutDashboard} label="Owner Dashboard" collapsed={collapsed} />
              <SidebarNavItem href="/reports" icon={BarChart3} label="Analytics" collapsed={collapsed} />
              <SidebarNavItem href="/invoices" icon={Truck} label="Purchase History" collapsed={collapsed} />
              <SidebarNavItem href="/ocr" icon={ScanLine} label="Smart Scanner" collapsed={collapsed} />
            </>
          )}
        </nav>

        <div className={cn("p-2 border-t border-sidebar-border space-y-0.5")}>
          <SidebarNavItem href="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
          <ThemeToggle collapsed={collapsed} />
          {canInstall && (
            <button
              onClick={install}
              title={collapsed ? "Install App" : undefined}
              className={cn(
                "w-full flex items-center gap-3 rounded-lg text-primary hover:bg-primary/10 transition-all text-sm font-medium",
                collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
              )}
            >
              <Download className="h-4 w-4" />
              {!collapsed && "Install App"}
            </button>
          )}
          <button
            onClick={handleLogout}
            title={collapsed ? "Sign Out" : undefined}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all text-sm font-medium",
              collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
            )}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && "Sign Out"}
          </button>
        </div>
      </aside>

      {/* ── Mobile/Tablet column ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile Topbar */}
        <div className="lg:hidden flex items-center justify-between px-4 py-2.5 border-b border-border bg-sidebar shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Leaf className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground leading-tight font-display">{shopName}</p>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <p className="text-[10px] text-muted-foreground capitalize">{role}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <MobileThemeToggle />
            {canInstall && (
              <button
                onClick={install}
                title="Install App"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-primary hover:bg-primary/10 transition-colors"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            <Link href="/settings" className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
              <Settings className="h-4 w-4" />
            </Link>
            <button
              onClick={handleLogout}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Offline banner — shows when device loses connectivity */}
        <OfflineBanner shopId={shopId} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto min-h-0" style={{ WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)' }}>
          {children}
        </main>

        {/* Mobile Bottom Nav */}
        <MobileBottomNav isOwner={isOwner} unreadCount={unreadCount} />
      </div>
    </div>
  );
}
