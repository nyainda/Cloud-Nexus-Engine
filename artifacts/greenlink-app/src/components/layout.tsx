import { Link, useRoute, useLocation } from "wouter";
import { useState } from "react";
import {
  ShoppingCart, Package, Users, Bell, BarChart3,
  ScanLine, Settings, Leaf, LogOut, Store, LayoutDashboard, Receipt,
  Sun, Moon, Download, RotateCcw
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
}

function SidebarNavItem({ href, icon: Icon, label, badge }: NavItemProps) {
  const [isActive] = useRoute(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 group relative",
        isActive
          ? "bg-primary text-primary-foreground font-semibold"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-sm font-medium">{label}</span>
      {!!badge && badge > 0 && (
        <span className="ml-auto bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
          {badge > 99 ? "99+" : badge}
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

function ThemeToggle({ className }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all text-sm font-medium w-full",
        className
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
      <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
    </button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const shopName = localStorage.getItem("greenlink_shopName") || "Retail Shop";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const isOwner = role === "owner";
  const { canInstall, install } = usePwaInstall();

  const { data: notifications } = useListNotifications(
    { shopId },
    { query: { enabled: !!shopId } }
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
      <aside className="hidden lg:flex flex-col w-56 border-r border-sidebar-border bg-sidebar shrink-0">
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
              <Leaf className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-sidebar-foreground leading-tight font-display">GreenLink OS</p>
              <p className="text-[10px] text-sidebar-foreground/50 truncate">{shopName}</p>
            </div>
          </div>
        </div>

        <div className="px-3 py-2 border-b border-sidebar-border/60">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-sidebar-foreground/60 font-medium">
              {userName || (isOwner ? "Owner" : "Cashier")} · <span className="capitalize">{role}</span>
            </span>
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          <SidebarNavItem href="/pos" icon={ShoppingCart} label="Point of Sale" />
          <SidebarNavItem href="/stock" icon={Package} label="Inventory" />
          <SidebarNavItem href="/debts" icon={Users} label="Customer Debts" />
          <SidebarNavItem href="/alerts" icon={Bell} label="Alerts" badge={unreadCount} />

          <div className="pt-3 pb-1 px-3">
            <p className="text-[10px] font-bold text-sidebar-foreground/30 uppercase tracking-wider">History</p>
          </div>
          <SidebarNavItem href="/sales-history" icon={Receipt} label="Sales History" />
          <SidebarNavItem href="/returns" icon={RotateCcw} label="Process Return" />

          {isOwner && (
            <>
              <div className="pt-3 pb-1 px-3">
                <p className="text-[10px] font-bold text-sidebar-foreground/30 uppercase tracking-wider">Management</p>
              </div>
              <SidebarNavItem href="/owner-dashboard" icon={LayoutDashboard} label="Owner Dashboard" />
              <SidebarNavItem href="/reports" icon={BarChart3} label="Analytics" />
              <SidebarNavItem href="/ocr" icon={ScanLine} label="Smart Scanner" />
            </>
          )}
        </nav>

        <div className="p-2 border-t border-sidebar-border space-y-0.5">
          <SidebarNavItem href="/settings" icon={Settings} label="Settings" />
          <ThemeToggle />
          {canInstall && (
            <button
              onClick={install}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-primary hover:bg-primary/10 transition-all text-sm font-medium"
            >
              <Download className="h-4 w-4" />
              Install App
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all text-sm font-medium"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile/Tablet column ── fills the remaining width, scrolling inside */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile Topbar — never scrolls */}
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

        {/* Page content — only this scrolls */}
        {/* transform: translateZ(0) forces a GPU composite layer, bypassing Chrome Android's
            tile rasterizer which produces horizontal scan-line artifacts on near-black backgrounds */}
        <main className="flex-1 overflow-y-auto min-h-0" style={{ WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)' }}>
          {children}
        </main>

        {/* Mobile Bottom Nav — sits below the scroll area, never fixed */}
        <nav
          className="lg:hidden flex items-stretch bg-sidebar border-t border-border shrink-0"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <BottomNavItem href="/pos" icon={ShoppingCart} label="POS" />
          <BottomNavItem href="/stock" icon={Package} label="Stock" />
          <BottomNavItem href="/debts" icon={Users} label="Debts" />
          <BottomNavItem href="/alerts" icon={Bell} label="Alerts" badge={unreadCount} />
          <BottomNavItem href="/sales-history" icon={Receipt} label="History" />
          <BottomNavItem href="/returns" icon={RotateCcw} label="Returns" />
          {isOwner && (
            <BottomNavItem href="/reports" icon={BarChart3} label="Reports" />
          )}
        </nav>
      </div>
    </div>
  );
}
