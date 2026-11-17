import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListShops, useLogin, customFetch } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import PinKeypad from "@/components/pin-keypad";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import {
  Store, Shield, KeyRound, ChevronLeft, CheckCircle2, Eye, EyeOff,
  Sprout, Boxes, TrendingUp, MapPin, LockKeyhole, Sun, Moon,
  ShoppingCart, UserCheck, ShieldCheck, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SHOPS_CACHE_KEY = "greenlink_shops_cache";
const LAST_SHOP_KEY = "greenlink_last_shop";

function getCachedShops() {
  try {
    const raw = localStorage.getItem(SHOPS_CACHE_KEY);
    if (!raw) return undefined;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > 10 * 60 * 1000) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

function setCachedShops(data: unknown) {
  try {
    localStorage.setItem(SHOPS_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

function getShopLogoPath(shopId: string, shopName = "") {
  const isSunrise =
    shopId.toLowerCase().includes("sunrise") ||
    shopName.toLowerCase().includes("sunrise");
  return isSunrise ? "/logo-sunrise.jpg" : "/logo-greenlink.jpg";
}

// ─── Forgot PIN modal ─────────────────────────────────────────────────────────
type ResetStep = "form" | "done";

function ForgotPinModal({ shops, onClose }: {
  shops: any[];
  onClose: () => void;
}) {
  const [step, setStep] = useState<ResetStep>("form");
  const [shopId, setShopId] = useState(shops.length === 1 ? shops[0].id : "");
  const [role, setRole] = useState<"owner" | "cashier">("owner");
  const [shopName, setShopName] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = shopId && shopName.trim().length > 1 && newPin.length >= 4 && newPin === confirmPin;

  const handleReset = async () => {
    setLoading(true);
    try {
      await customFetch("/api/auth/reset-pin", {
        method: "POST",
        body: JSON.stringify({ shopId, role, shopName: shopName.trim(), newPin }),
        headers: { "Content-Type": "application/json" },
      });
      setStep("done");
    } catch (err: any) {
      const msg = err?.error ?? err?.message ?? "Reset failed — check the shop name and try again";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/70 bg-muted/20">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl hover:bg-muted flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
              <KeyRound className="h-3.5 w-3.5" />
            </div>
            <h2 className="text-sm font-bold text-foreground">Reset Terminal PIN</h2>
          </div>
        </div>

        <div className="p-5">
          {step === "done" ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-foreground text-base">PIN Updated</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your new {role} PIN is active. You can sign in now.
                </p>
              </div>
              <Button className="w-full h-11 rounded-xl font-bold" onClick={onClose}>
                Back to Sign In
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your <span className="text-foreground font-semibold">exact shop name</span> to verify ownership, then set a new PIN.
              </p>

              {shops.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Shop</label>
                  <Select value={shopId} onValueChange={setShopId}>
                    <SelectTrigger className="h-11 rounded-xl bg-muted/40">
                      <SelectValue placeholder="Select shop" />
                    </SelectTrigger>
                    <SelectContent>
                      {shops.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-primary" />
                            {s.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Access Role</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["owner", "cashier"] as const).map(r => (
                    <button
                      type="button"
                      key={r}
                      onClick={() => setRole(r)}
                      className={cn(
                        "h-10 rounded-xl text-sm font-semibold border transition-all capitalize",
                        role === r
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Shop Name <span className="text-muted-foreground/60 normal-case font-normal">(exact spelling)</span>
                </label>
                <Input
                  value={shopName}
                  onChange={e => setShopName(e.target.value)}
                  placeholder="e.g. GreenLink Farm Supplies"
                  className="h-11 rounded-xl bg-muted/40"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">New PIN (4–8 digits)</label>
                <div className="relative">
                  <Input
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    className="h-11 rounded-xl bg-muted/40 pr-10 font-mono tracking-widest text-lg"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPin(v => !v)}
                  >
                    {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Confirm New PIN</label>
                <Input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="••••"
                  className={cn(
                    "h-11 rounded-xl bg-muted/40 font-mono tracking-widest text-lg",
                    confirmPin && newPin !== confirmPin && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                {confirmPin && newPin !== confirmPin && (
                  <p className="text-xs text-destructive">PINs don't match</p>
                )}
              </div>

              <Button
                className="w-full h-11 rounded-xl font-bold mt-2"
                disabled={!canSubmit || loading}
                onClick={handleReset}
              >
                {loading ? "Resetting…" : "Save New PIN"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Login page ──────────────────────────────────────────────────────────
export default function Login() {
  const [, setLocation] = useLocation();
  const [theme, setThemeState] = useState<Theme>(getTheme);
  const { data: shops, isLoading: shopsLoading } = useListShops({
    query: {
      staleTime: 5 * 60_000,
      placeholderData: getCachedShops,
      select: (data: any) => {
        if (data) setCachedShops(data);
        return data;
      },
    } as any,
  });
  const loginMutation = useLogin();

  const [lastShopId] = useState<string>(
    () => localStorage.getItem(LAST_SHOP_KEY) ?? ""
  );
  const [shopId, setShopId] = useState<string>("");
  const [role, setRole] = useState<"owner" | "cashier">("cashier");
  const [pin, setPin] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  useEffect(() => {
    if (!shopId && shops?.length === 1) {
      setShopId(shops[0].id);
    }
  }, [shops, shopId]);

  const handleLogin = () => {
    if (!shopId) { toast.error("Please select a shop"); return; }
    if (!pin) { toast.error("Please enter PIN"); return; }

    loginMutation.mutate(
      { data: { shopId, role, pin } },
      {
        onSuccess: (data) => {
          localStorage.setItem("greenlink_token", data.token);
          localStorage.setItem("greenlink_shopId", data.shopId);
          localStorage.setItem("greenlink_role", data.role);
          localStorage.setItem("greenlink_shopName", data.shopName);
          localStorage.setItem(LAST_SHOP_KEY, data.shopId);
          setLocation("/pos");
        },
        onError: (err: any) => {
          toast.error(err?.error || "Login failed");
          setPin("");
        },
      }
    );
  };

  const selectedShop = shops?.find((shop) => shop.id === shopId);
  const shopCount = shops?.length ?? 0;
  const showVisualShopCards = shopCount > 0 && shopCount <= 4;

  return (
    <main className="relative min-h-[100dvh] bg-background text-foreground flex flex-col xl:grid xl:grid-cols-[minmax(420px,0.92fr)_minmax(520px,1.08fr)] overflow-x-hidden">
      {showForgot && (
        <ForgotPinModal shops={shops ?? []} onClose={() => setShowForgot(false)} />
      )}

      {/* ── Left Architectural Showcase (Desktop xl+) ── */}
      <section className="relative isolate hidden min-h-[100dvh] overflow-hidden border-r border-border bg-sidebar p-10 xl:flex xl:flex-col xl:justify-between xl:p-12">
        {/* Subtle technical grid + ambient glow */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-grid-subtle opacity-45" />
          <div className="absolute -left-24 top-28 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute -bottom-12 right-0 h-96 w-96 rounded-full bg-emerald-500/12 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background/80 to-transparent" />
        </div>

        {/* Brand header */}
        <div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 shadow-md ring-1 ring-black/5">
                <img src="/logo-greenlink.jpg" alt="GreenLink logo" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="font-display text-xl font-bold tracking-tight">
                  GreenLink <span className="text-primary">OS</span>
                </p>
                <p className="text-xs font-medium text-muted-foreground">Agrovet Retail Terminal</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Cloud Sync Ready
            </span>
          </div>

          <div className="mt-16 max-w-lg">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
              <Sprout className="h-3.5 w-3.5" />
              Precision Counter Experience
            </div>
            <h1 className="font-display text-4xl font-bold leading-[1.06] tracking-tight 2xl:text-5xl">
              Every sale, weigh-in, and debt
              <span className="mt-1.5 block text-primary">balanced in seconds.</span>
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground 2xl:text-base">
              Built for high-volume Kenyan agrovet counters. Instant offline-first catalog search, precision weighed sales, M-Pesa & cash reconciliation, and live stock alerts.
            </p>
          </div>

          <div className="mt-10 grid max-w-lg grid-cols-2 gap-3">
            {[
              { icon: ShoppingCart, title: "1-Tap POS", detail: "2,600+ SKUs ready offline" },
              { icon: Boxes, title: "Live Inventory", detail: "Auto-deduct & low-stock alerts" },
              { icon: TrendingUp, title: "Margin Guard", detail: "Instant profit & cost checks" },
              { icon: Shield, title: "Shop Isolation", detail: "Branch-locked receipts & ledgers" },
            ].map(({ icon: Icon, title, detail }) => (
              <div key={title} className="rounded-2xl border border-border/80 bg-card/60 backdrop-blur-sm p-4">
                <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-sm font-bold text-foreground">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Footer trust note */}
        <div className="mt-10 flex items-center gap-3 rounded-2xl border border-border/80 bg-card/50 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-400">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-foreground">Multi-Branch Safety Lock</p>
            <p className="text-[11px] text-muted-foreground">
              Verify the selected shop branch before entering your PIN.
            </p>
          </div>
        </div>
      </section>

      {/* ── Right Terminal Sign-In Surface ── */}
      <section className="relative flex flex-1 min-h-[100dvh] flex-col items-center justify-center px-4 py-4 sm:px-8 lg:px-10">
        {/* Top bar for theme toggle + mobile brand */}
        <div className="w-full max-w-[460px] flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2.5 xl:hidden">
            <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white p-1 shadow-sm">
              <img src="/logo-greenlink.jpg" alt="GreenLink logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="font-display text-base font-bold leading-tight">
                GreenLink <span className="text-primary">OS</span>
              </p>
              <p className="text-[11px] text-muted-foreground">Retail Terminal</p>
            </div>
          </div>
          <div className="hidden xl:flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Terminal Sign In</span>
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors cursor-pointer"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-primary" />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </div>

        {/* Main Card */}
        <div className="w-full max-w-[460px] rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
          {/* Card Header */}
          <div className="px-5 py-3.5 border-b border-border/70 bg-muted/20 flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 text-primary">
              <LockKeyhole className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold tracking-normal">Unlock Register</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose your branch, role, and enter your PIN
              </p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Step 1: Shop Selection */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  1. Select Branch
                </span>
                {selectedShop ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmed
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-amber-500">
                    Required
                  </span>
                )}
              </div>

              {shopsLoading && !shops ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {[0, 1].map(i => (
                    <div key={i} className="h-20 rounded-2xl border border-border bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : showVisualShopCards ? (
                <div className={cn("grid gap-2.5", shopCount === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
                  {shops!.map((shop) => {
                    const active = shop.id === shopId;
                    const isLastUsed = shop.id === lastShopId;
                    return (
                      <button
                        type="button"
                        key={shop.id}
                        onClick={() => { setShopId(shop.id); setPin(""); }}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-150 cursor-pointer",
                          active
                            ? "border-primary bg-primary/10 ring-2 ring-primary/20 shadow-sm"
                            : "border-border bg-muted/30 hover:bg-muted/60 hover:border-primary/40"
                        )}
                      >
                        <div className="h-10 w-10 shrink-0 rounded-xl bg-white p-1 border border-black/5 overflow-hidden flex items-center justify-center">
                          <img
                            src={getShopLogoPath(shop.id, shop.name)}
                            alt={shop.name}
                            className="h-full w-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground leading-snug line-clamp-2">
                            {shop.name}
                          </p>
                          <div className="mt-1 flex items-center gap-1.5">
                            {isLastUsed && (
                              <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                                Last used
                              </span>
                            )}
                            {!isLastUsed && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                <MapPin className="h-2.5 w-2.5" /> Branch
                              </span>
                            )}
                          </div>
                        </div>
                        {active && (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <Select value={shopId} onValueChange={(value) => { setShopId(value); setPin(""); }}>
                  <SelectTrigger className="h-12 rounded-2xl border-border bg-muted/30 text-left text-sm">
                    <SelectValue placeholder="Select the shop branch to open" />
                  </SelectTrigger>
                  <SelectContent>
                    {shops?.map((shop) => (
                      <SelectItem key={shop.id} value={shop.id} className="cursor-pointer py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Store className="h-4 w-4 text-primary" />
                          <span>{shop.name}</span>
                          {shop.id === lastShopId && (
                            <span className="ml-1 text-[10px] font-bold text-primary">Last used</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Step 2: Role + PIN Keypad */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  2. Access Role & PIN
                </span>
                <span className="text-[11px] text-muted-foreground capitalize">
                  {role} mode
                </span>
              </div>

              {/* Segmented role switch */}
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => { setRole("cashier"); setPin(""); }}
                  className={cn(
                    "flex items-center justify-center gap-2 h-9 rounded-xl text-sm font-bold transition-all cursor-pointer",
                    role === "cashier"
                      ? "bg-card text-foreground shadow-sm border border-border/80"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <UserCheck className="h-4 w-4 text-primary" />
                  Cashier
                </button>
                <button
                  type="button"
                  onClick={() => { setRole("owner"); setPin(""); }}
                  className={cn(
                    "flex items-center justify-center gap-2 h-9 rounded-xl text-sm font-bold transition-all cursor-pointer",
                    role === "owner"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Owner
                </button>
              </div>

              <PinKeypad
                pin={pin}
                onChange={setPin}
                onSubmit={handleLogin}
                loading={loginMutation.isPending}
                disableKeyboard={showForgot}
              />

              <div className="flex items-center justify-between pt-2.5 border-t border-border/70 text-xs">
                <button
                  type="button"
                  onClick={() => setShowForgot(true)}
                  className="inline-flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  Forgot PIN?
                </button>
                <span className="inline-flex items-center gap-1.5 text-muted-foreground/80">
                  <Shield className="h-3.5 w-3.5 text-emerald-500" />
                  Shop-scoped session
                </span>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3.5 text-center text-[11px] text-muted-foreground/70">
          GreenLink OS · Secure Agrovet Counter Platform
        </p>
      </section>
    </main>
  );
}
