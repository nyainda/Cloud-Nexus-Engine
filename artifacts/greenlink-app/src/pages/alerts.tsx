import { useEffect, useState } from "react";
import { isPushSupported, subscribeToPush, unsubscribeFromPush, sendTestPush, getActiveSubscription } from "@/lib/push-notifications";
import {
  useListNotifications, useMarkAllNotificationsRead,
  useMarkNotificationRead, useListProducts, useGetShop,
  useListDebts, customFetch
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Bell, PackageX, Users, CheckCheck, Info, AlertTriangle,
  CheckCircle2, BellOff, Package, Scale, Calendar, RefreshCw,
  ShieldAlert, MessageCircle, Send, Clock
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { formatKES } from "@/lib/format";

type AlertType = "low_stock" | "out_of_stock" | "debt_reminder" | "expiry_soon" | "expired" | string;

const WEIGHT_UNITS = new Set(["kg", "g", "gram", "grams", "litre", "liter", "l", "ml", "ton", "tonne"]);
function isWeighedUnit(unit: string) {
  return WEIGHT_UNITS.has((unit || "").trim().toLowerCase());
}

function getAlertConfig(type: AlertType) {
  switch (type) {
    case "low_stock":
      return { icon: PackageX, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/20", dot: "bg-orange-400", label: "Low Stock" };
    case "out_of_stock":
      return { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20", dot: "bg-destructive", label: "Out of Stock" };
    case "debt_reminder":
      return { icon: Users, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20", dot: "bg-blue-400", label: "Debt Reminder" };
    case "expiry_soon":
      return { icon: Calendar, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20", dot: "bg-amber-400", label: "Expiring Soon" };
    case "expired":
      return { icon: ShieldAlert, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/20", dot: "bg-red-400", label: "Expired" };
    case "expiry_warning":
      return { icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/20", dot: "bg-yellow-400", label: "Expiry Warning" };
    default:
      return { icon: Info, color: "text-primary", bg: "bg-primary/10", border: "border-primary/20", dot: "bg-primary", label: "Notice" };
  }
}

async function generateAlerts() {
  try {
    await customFetch(`/api/notifications/generate`, { method: "POST" });
  } catch {
    // silent — generation is best-effort
  }
}

function buildStockWhatsAppUrl(ownerPhone: string, shopName: string, outOfStock: any[], lowStock: any[]) {
  const lines: string[] = [];
  lines.push(`*📦 Stock Alert — ${shopName}*`);
  lines.push(`_${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}_`);
  lines.push("");

  if (outOfStock.length > 0) {
    lines.push(`*🔴 Out of Stock (${outOfStock.length})*`);
    outOfStock.slice(0, 15).forEach(p => {
      lines.push(`• ${p.canonicalName}`);
    });
    if (outOfStock.length > 15) lines.push(`  _...and ${outOfStock.length - 15} more_`);
    lines.push("");
  }

  if (lowStock.length > 0) {
    lines.push(`*🟠 Low Stock (${lowStock.length})*`);
    lowStock.slice(0, 15).forEach(p => {
      lines.push(`• ${p.canonicalName} — ${p.stockQty} ${p.unit || "units"} left`);
    });
    if (lowStock.length > 15) lines.push(`  _...and ${lowStock.length - 15} more_`);
    lines.push("");
  }

  lines.push(`_Sent from GreenLink OS_`);

  const phone = ownerPhone.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function buildExpiryWhatsAppUrl(ownerPhone: string, shopName: string, expired: any[], soon: any[], warning: any[]) {
  const lines: string[] = [];
  lines.push(`*🗓️ Expiry Alert — ${shopName}*`);
  lines.push(`_${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}_`);
  lines.push("");

  if (expired.length > 0) {
    lines.push(`*🔴 Expired (${expired.length})*`);
    expired.slice(0, 10).forEach(p => {
      lines.push(`• ${p.canonicalName} — expired ${p.expiryDate}`);
    });
    if (expired.length > 10) lines.push(`  _...and ${expired.length - 10} more_`);
    lines.push("");
  }

  if (soon.length > 0) {
    lines.push(`*🟠 Expiring ≤ 30 Days (${soon.length})*`);
    soon.slice(0, 10).forEach(p => {
      const days = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
      lines.push(`• ${p.canonicalName} — ${days}d left (${p.expiryDate})`);
    });
    if (soon.length > 10) lines.push(`  _...and ${soon.length - 10} more_`);
    lines.push("");
  }

  if (warning.length > 0) {
    lines.push(`*🟡 Expiring 31–90 Days (${warning.length})*`);
    warning.slice(0, 8).forEach(p => {
      const days = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
      lines.push(`• ${p.canonicalName} — ${days}d left (${p.expiryDate})`);
    });
    if (warning.length > 8) lines.push(`  _...and ${warning.length - 8} more_`);
    lines.push("");
  }

  lines.push(`_Sent from GreenLink OS_`);
  const phone = ownerPhone.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function buildDebtWhatsAppUrl(ownerPhone: string, shopName: string, debts: any[]) {
  const activeDebts = debts.filter(d => d.status === "active" || d.status === "overdue");
  const total = activeDebts.reduce((sum, d) => sum + (d.balance || 0), 0);
  const overdue = activeDebts.filter(d => d.status === "overdue");

  const lines: string[] = [];
  lines.push(`*💳 Debt Summary — ${shopName}*`);
  lines.push(`_${new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "short" })}_`);
  lines.push("");
  lines.push(`*Total Outstanding: ${formatKES(total)}*`);
  lines.push(`Active Debtors: ${activeDebts.length}`);
  if (overdue.length > 0) lines.push(`⚠️ Overdue: ${overdue.length}`);
  lines.push("");

  if (overdue.length > 0) {
    lines.push(`*🔴 Overdue Accounts*`);
    overdue.slice(0, 10).forEach(d => {
      lines.push(`• ${d.customerName} — ${formatKES(d.balance)}`);
    });
    if (overdue.length > 10) lines.push(`  _...and ${overdue.length - 10} more_`);
    lines.push("");
  }

  const nonOverdue = activeDebts.filter(d => d.status !== "overdue");
  if (nonOverdue.length > 0) {
    lines.push(`*🟡 Active Debts*`);
    nonOverdue
      .sort((a, b) => (b.balance || 0) - (a.balance || 0))
      .slice(0, 8).forEach(d => {
        lines.push(`• ${d.customerName} — ${formatKES(d.balance)}`);
      });
    if (nonOverdue.length > 8) lines.push(`  _...and ${nonOverdue.length - 8} more_`);
    lines.push("");
  }

  lines.push(`_Sent from GreenLink OS_`);

  const phone = ownerPhone.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export default function Alerts() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "cashier";
  const isOwner = role === "owner";

  // ── Push notification state ────────────────────────────────────────────────
  const [pushActive, setPushActive] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const pushSupported = isPushSupported();

  useEffect(() => {
    if (!pushSupported) return;
    getActiveSubscription().then((sub) => setPushActive(!!sub));
  }, [pushSupported]);

  const handleEnablePush = async () => {
    setPushLoading(true);
    const ok = await subscribeToPush();
    setPushActive(ok);
    if (ok) toast.success("Push notifications enabled! You'll get alerts even when the app is closed.");
    else toast.error("Couldn't enable notifications. Check browser permissions and try again.");
    setPushLoading(false);
  };

  const handleDisablePush = async () => {
    await unsubscribeFromPush();
    setPushActive(false);
    toast.success("Push notifications disabled");
  };

  const handleTestPush = async () => {
    try {
      await sendTestPush();
      toast.success("Test notification sent to all subscribed devices!");
    } catch {
      toast.error("Test failed — make sure the app is deployed to Cloudflare with VAPID keys set");
    }
  };

  const { data: notifications, isLoading: notifsLoading, refetch } = useListNotifications(
    { shopId }, { query: { enabled: !!shopId } }
  );

  const { data: productsData, isLoading: productsLoading } = useListProducts(
    { shopId, limit: 3000 }, { query: { enabled: !!shopId, staleTime: 60_000 } }
  );

  const { data: shop } = useGetShop(shopId, { query: { enabled: !!shopId } });

  const { data: debtsData } = useListDebts(
    { shopId, limit: 500 }, { query: { enabled: !!shopId && isOwner } }
  );

  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!shopId) return;
    generateAlerts().then(() => refetch());
  }, [shopId]);

  const handleMarkRead = (id: string) => {
    markRead.mutate({ notificationId: id }, {
      onSuccess: () => refetch(),
      onError: () => toast.error("Failed to mark as read"),
    });
  };

  const handleMarkAllRead = () => {
    // Confirm immediately — don't wait for the network
    toast.success("All alerts marked as read");
    markAllRead.mutate(
      { params: { shopId } },
      {
        onSuccess: () => { refetch(); },
        onError: () => toast.error("Failed to mark all as read — please retry"),
      }
    );
  };

  const handleRefresh = async () => {
    await generateAlerts();
    await refetch();
    toast.success("Alerts refreshed");
  };

  const unreadCount = notifications?.filter(n => !n.isRead).length || 0;
  const totalCount = notifications?.length || 0;

  const stockAlerts = notifications?.filter(n => n.type === "low_stock" || n.type === "out_of_stock") || [];
  const debtAlerts = notifications?.filter(n => n.type === "debt_reminder") || [];
  const expiryAlerts = notifications?.filter(n => n.type === "expiry_soon" || n.type === "expired" || n.type === "expiry_warning") || [];
  const otherAlerts = notifications?.filter(n =>
    n.type !== "low_stock" && n.type !== "out_of_stock" &&
    n.type !== "debt_reminder" && n.type !== "expiry_soon" && n.type !== "expired" && n.type !== "expiry_warning"
  ) || [];

  const allProducts = productsData?.products || [];
  const outOfStockProducts = allProducts.filter(p => p.stockQty === 0);
  const lowStockProducts = allProducts.filter(p => p.stockQty > 0 && p.stockQty <= p.alertQty);
  const needsRestockCount = outOfStockProducts.length + lowStockProducts.length;

  const today = new Date().toISOString().split("T")[0];
  const day30Str = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const day90Str = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const expiredProducts = allProducts.filter(p => p.expiryDate && p.expiryDate < today);
  const expiringSoonProducts = allProducts.filter(p => p.expiryDate && p.expiryDate >= today && p.expiryDate <= day30Str);
  const expiryWarningProducts = allProducts.filter(p => p.expiryDate && p.expiryDate > day30Str && p.expiryDate <= day90Str);
  const expiryCount = expiredProducts.length + expiringSoonProducts.length + expiryWarningProducts.length;

  const ownerPhones = (shop?.ownerWhatsapp || "").split(",").map((p: string) => p.trim()).filter(Boolean);
  const shopName = shop?.name || "the shop";
  const allDebts = (debtsData as any)?.debts || [];
  const activeDebts = allDebts.filter((d: any) => d.status === "active" || d.status === "overdue");

  const AlertItem = ({ alert }: { alert: any }) => {
    const config = getAlertConfig(alert.type);
    const Icon = config.icon;
    return (
      <div className={cn(
        "flex gap-3 px-4 py-4 relative transition-colors border-b border-border/40",
        !alert.isRead ? "bg-muted/20" : "hover:bg-muted/10"
      )}>
        {!alert.isRead && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-r" />}
        <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center shrink-0", config.bg, config.border)}>
          <Icon className={cn("h-4.5 w-4.5", config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <p className={cn("text-sm font-bold leading-snug", !alert.isRead ? "text-foreground" : "text-muted-foreground")}>
                  {alert.title}
                </p>
                <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border shrink-0", config.bg, config.border, config.color)}>
                  {config.label}
                </span>
              </div>
              <p className={cn("text-xs leading-relaxed", !alert.isRead ? "text-foreground/70" : "text-muted-foreground/60")}>
                {alert.message}
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground/40 whitespace-nowrap shrink-0 mt-0.5">
              {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
            </span>
          </div>
          {!alert.isRead && (
            <button className="text-[10px] text-primary font-semibold mt-1.5 hover:underline" onClick={() => handleMarkRead(alert.id)} disabled={markRead.isPending}>
              Mark as read
            </button>
          )}
        </div>
      </div>
    );
  };

  const SectionHeader = ({ title, count }: { title: string; count: number }) => (
    <div className="px-4 py-2 bg-muted/30 border-b border-border">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title} · {count}</p>
    </div>
  );

  const ProductRestockCard = ({ product, urgent }: { product: any; urgent: boolean }) => {
    const weighed = isWeighedUnit(product.unit || "");
    return (
      <div className={cn(
        "flex items-center gap-3 p-3 rounded-xl border transition-colors",
        urgent ? "bg-destructive/5 border-destructive/20" : "bg-orange-500/5 border-orange-500/20"
      )}>
        <div className={cn(
          "w-9 h-9 rounded-lg flex items-center justify-center shrink-0",
          urgent ? "bg-destructive/15 text-destructive/70" : "bg-orange-500/15 text-orange-400/70"
        )}>
          {weighed ? <Scale className="h-4 w-4" /> : <Package className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight truncate">{product.canonicalName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {product.category && <span className="text-[10px] text-muted-foreground/60">{product.category}</span>}
            <span className={cn(
              "text-[10px] font-bold font-mono",
              urgent ? "text-destructive" : "text-orange-400"
            )}>
              {urgent ? "0 left" : `${product.stockQty} ${product.unit || "units"} left`}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {product.sellingPrice > 0 && (
            <p className="text-xs font-bold font-mono text-foreground">{formatKES(product.sellingPrice)}</p>
          )}
          <span className={cn(
            "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full",
            urgent ? "bg-destructive/15 text-destructive" : "bg-orange-500/15 text-orange-400"
          )}>
            {urgent ? "Out" : "Low"}
          </span>
        </div>
      </div>
    );
  };

  const ExpiryCard = ({ product, state }: { product: any; state: "expired" | "soon" | "warning" }) => {
    const daysLeft = state === "expired"
      ? null
      : Math.ceil((new Date(product.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const colors = {
      expired: { card: "bg-red-500/5 border-red-500/20", icon: "bg-red-500/15 text-red-400/70", text: "text-red-400", badge: "bg-red-500/15 text-red-400" },
      soon:    { card: "bg-amber-500/5 border-amber-500/20", icon: "bg-amber-500/15 text-amber-400/70", text: "text-amber-400", badge: "bg-amber-500/15 text-amber-400" },
      warning: { card: "bg-yellow-500/5 border-yellow-500/20", icon: "bg-yellow-500/15 text-yellow-400/70", text: "text-yellow-400", badge: "bg-yellow-500/15 text-yellow-400" },
    }[state];
    return (
      <div className={cn("flex items-center gap-3 p-3 rounded-xl border transition-colors", colors.card)}>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", colors.icon)}>
          {state === "warning" ? <Clock className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight truncate">{product.canonicalName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {product.category && <span className="text-[10px] text-muted-foreground/60">{product.category}</span>}
            <span className={cn("text-[10px] font-mono font-bold", colors.text)}>
              {state === "expired" ? `Expired ${product.expiryDate}` : `${daysLeft}d left · ${product.expiryDate}`}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          {product.stockQty > 0 && (
            <p className="text-[10px] font-mono text-muted-foreground/60">{product.stockQty} {product.unit || "units"}</p>
          )}
          <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full", colors.badge)}>
            {state === "expired" ? "Expired" : state === "soon" ? "≤30d" : "≤90d"}
          </span>
        </div>
      </div>
    );
  };

  const PREVIEW = 5;
  const [showAllOutOfStock, setShowAllOutOfStock] = useState(false);
  const [showAllLowStock, setShowAllLowStock] = useState(false);
  const [showAllExpired, setShowAllExpired] = useState(false);
  const [showAllExpiringSoon, setShowAllExpiringSoon] = useState(false);
  const [showAllExpiryWarning, setShowAllExpiryWarning] = useState(false);
  const [showAllNotifs, setShowAllNotifs] = useState(false);

  const ShowMore = ({ total, shown, onToggle }: { total: number; shown: boolean; onToggle: () => void }) => {
    const hidden = total - PREVIEW;
    if (total <= PREVIEW) return null;
    return (
      <button
        onClick={onToggle}
        className="w-full text-center text-[11px] font-semibold text-primary/70 hover:text-primary py-2 transition-colors"
      >
        {shown ? "Show fewer ↑" : `Show ${hidden} more ↓`}
      </button>
    );
  };

  const isLoading = notifsLoading;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Bell className="h-5 w-5 text-foreground" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-destructive text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-lg font-bold font-display leading-tight">Alerts</h1>
              <p className="text-xs text-muted-foreground">
                {unreadCount > 0
                  ? `${unreadCount} unread · ${needsRestockCount} restock · ${expiryCount} expiry`
                  : `${totalCount} notifications · ${needsRestockCount} restock · ${expiryCount} expiry`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={handleRefresh} title="Refresh alerts">
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            {unreadCount > 0 && (
              <Button size="sm" variant="outline" className="h-8 text-xs px-3 font-semibold" onClick={handleMarkAllRead} disabled={markAllRead.isPending}>
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                {markAllRead.isPending ? "Marking…" : "Mark all read"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground pt-12">
            <div className="w-7 h-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            <p className="text-sm">Loading alerts…</p>
          </div>
        ) : (
          <div>
            {/* ── Push Notifications Banner ── */}
            {pushSupported && !pushActive && Notification.permission !== "denied" && (
              <div className="mx-4 mt-4 flex items-start gap-3 p-3.5 rounded-xl bg-primary/10 border border-primary/25">
                <Bell className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">Get instant push alerts</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">Receive low-stock and debt reminders on this device — even when the app is closed.</p>
                </div>
                <button
                  onClick={handleEnablePush}
                  disabled={pushLoading}
                  className="shrink-0 h-8 px-3 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-60"
                >
                  {pushLoading ? "…" : "Enable"}
                </button>
              </div>
            )}
            {pushSupported && pushActive && (
              <div className="mx-4 mt-4 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-muted/20 border border-border/40">
                <Bell className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-xs text-muted-foreground flex-1">Push alerts active on this device</p>
                {isOwner && (
                  <button onClick={handleTestPush} className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded">
                    Test
                  </button>
                )}
                <button onClick={handleDisablePush} className="text-[10px] font-semibold text-muted-foreground hover:text-destructive transition-colors px-1.5 py-1 rounded">
                  Disable
                </button>
              </div>
            )}

            {/* ── WhatsApp Owner Alerts (owner only, phone required) ── */}
            {isOwner && ownerPhones.length > 0 && (needsRestockCount > 0 || activeDebts.length > 0 || expiryCount > 0) && (
              <div className="px-4 pt-4 pb-3 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-[#25D366]" />
                  <p className="text-xs font-bold text-foreground">
                    Send WhatsApp Report{ownerPhones.length > 1 ? ` · ${ownerPhones.length} owners` : ""}
                  </p>
                </div>

                {ownerPhones.map((phone, idx) => (
                  <div key={idx}>
                    {ownerPhones.length > 1 && (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
                        Owner {idx + 1} · <span className="font-mono">{phone}</span>
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {needsRestockCount > 0 && (
                        <a
                          href={buildStockWhatsAppUrl(phone, shopName, outOfStockProducts, lowStockProducts)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <button className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-orange-500/10 border border-orange-500/30 text-orange-400">
                            <Send className="h-3.5 w-3.5" />
                            Stock · {needsRestockCount}
                          </button>
                        </a>
                      )}
                      {activeDebts.length > 0 && (
                        <a
                          href={buildDebtWhatsAppUrl(phone, shopName, allDebts)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <button className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-blue-500/10 border border-blue-500/30 text-blue-400">
                            <Send className="h-3.5 w-3.5" />
                            Debts · {activeDebts.length}
                          </button>
                        </a>
                      )}
                      {expiryCount > 0 && (
                        <a
                          href={buildExpiryWhatsAppUrl(phone, shopName, expiredProducts, expiringSoonProducts, expiryWarningProducts)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <button className="flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold bg-amber-500/10 border border-amber-500/30 text-amber-400">
                            <Send className="h-3.5 w-3.5" />
                            Expiry · {expiryCount}
                          </button>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── No phone set banner (owner only) ── */}
            {isOwner && ownerPhones.length === 0 && (needsRestockCount > 0 || activeDebts.length > 0 || expiryCount > 0) && (
              <div className="mx-4 mt-4 flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/60">
                <MessageCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Add your WhatsApp number in <span className="font-semibold text-foreground">Settings → Shop Details</span> to enable one-tap alert reports.
                </p>
              </div>
            )}

            {/* ── Products to Restock Section ── */}
            {needsRestockCount > 0 && (
              <div>
                <div className="px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-orange-400" />
                    <h2 className="text-sm font-bold text-foreground">Products Needing Restock</h2>
                    <span className="text-[10px] font-bold bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full">
                      {needsRestockCount}
                    </span>
                  </div>

                  {outOfStockProducts.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-destructive/70 mb-2">
                        Out of Stock — {outOfStockProducts.length}
                      </p>
                      <div className="space-y-2">
                        {outOfStockProducts.slice(0, showAllOutOfStock ? 1000 : PREVIEW).map(p => (
                          <ProductRestockCard key={p.id} product={p} urgent={true} />
                        ))}
                        <ShowMore total={outOfStockProducts.length} shown={showAllOutOfStock} onToggle={() => setShowAllOutOfStock(v => !v)} />
                      </div>
                    </div>
                  )}

                  {lowStockProducts.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400/70 mb-2">
                        Low Stock — {lowStockProducts.length}
                      </p>
                      <div className="space-y-2">
                        {lowStockProducts.slice(0, showAllLowStock ? 1000 : PREVIEW).map(p => (
                          <ProductRestockCard key={p.id} product={p} urgent={false} />
                        ))}
                        <ShowMore total={lowStockProducts.length} shown={showAllLowStock} onToggle={() => setShowAllLowStock(v => !v)} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-b border-border/60 mx-4" />
              </div>
            )}

            {/* ── No products to restock ── */}
            {needsRestockCount === 0 && !productsLoading && allProducts.length > 0 && (
              <div className="flex items-center gap-3 mx-4 mt-4 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-400 font-medium">All products are well stocked</p>
              </div>
            )}

            {/* ── Expiry Alerts Section ── */}
            {expiryCount > 0 && (
              <div>
                <div className="px-4 pt-4 pb-2">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="h-4 w-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-foreground">Expiry Alerts</h2>
                    <span className="text-[10px] font-bold bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
                      {expiryCount}
                    </span>
                  </div>

                  {expiredProducts.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/70 mb-2">
                        Expired — {expiredProducts.length}
                      </p>
                      <div className="space-y-2">
                        {expiredProducts.slice(0, showAllExpired ? 1000 : PREVIEW).map(p => (
                          <ExpiryCard key={p.id} product={p} state="expired" />
                        ))}
                        <ShowMore total={expiredProducts.length} shown={showAllExpired} onToggle={() => setShowAllExpired(v => !v)} />
                      </div>
                    </div>
                  )}

                  {expiringSoonProducts.length > 0 && (
                    <div className={expiredProducts.length > 0 ? "mt-3" : ""}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/70 mb-2">
                        Expiring ≤ 30 Days — {expiringSoonProducts.length}
                      </p>
                      <div className="space-y-2">
                        {expiringSoonProducts
                          .sort((a, b) => (a.expiryDate || "").localeCompare(b.expiryDate || ""))
                          .slice(0, showAllExpiringSoon ? 1000 : PREVIEW).map(p => (
                            <ExpiryCard key={p.id} product={p} state="soon" />
                          ))}
                        <ShowMore total={expiringSoonProducts.length} shown={showAllExpiringSoon} onToggle={() => setShowAllExpiringSoon(v => !v)} />
                      </div>
                    </div>
                  )}

                  {expiryWarningProducts.length > 0 && (
                    <div className={(expiredProducts.length > 0 || expiringSoonProducts.length > 0) ? "mt-3" : ""}>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-400/70 mb-2">
                        Expiring 31–90 Days — {expiryWarningProducts.length}
                      </p>
                      <div className="space-y-2">
                        {expiryWarningProducts
                          .sort((a, b) => (a.expiryDate || "").localeCompare(b.expiryDate || ""))
                          .slice(0, showAllExpiryWarning ? 1000 : PREVIEW).map(p => (
                            <ExpiryCard key={p.id} product={p} state="warning" />
                          ))}
                        <ShowMore total={expiryWarningProducts.length} shown={showAllExpiryWarning} onToggle={() => setShowAllExpiryWarning(v => !v)} />
                      </div>
                    </div>
                  )}
                </div>
                <div className="border-b border-border/60 mx-4" />
              </div>
            )}

            {/* ── Notifications ── */}
            {!notifications?.length && needsRestockCount === 0 && expiryCount === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 pt-16 px-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/40 border border-border flex items-center justify-center">
                  <BellOff className="h-7 w-7 text-muted-foreground/30" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">All clear!</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">No alerts at this time. Stock, debt, and expiry alerts will appear here.</p>
                </div>
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="mt-2">
                {(() => {
                  const allAlerts = [
                    ...stockAlerts,
                    ...debtAlerts,
                    ...expiryAlerts,
                    ...otherAlerts,
                  ];
                  const visible = showAllNotifs ? allAlerts : allAlerts.slice(0, PREVIEW);
                  return (
                    <>
                      {visible.map(alert => <AlertItem key={alert.id} alert={alert} />)}
                      {allAlerts.length > PREVIEW && (
                        <div className="px-4">
                          <ShowMore total={allAlerts.length} shown={showAllNotifs} onToggle={() => setShowAllNotifs(v => !v)} />
                        </div>
                      )}
                    </>
                  );
                })()}
                {unreadCount === 0 && totalCount > 0 && (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground/50">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500/40" />
                    All notifications have been read
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
