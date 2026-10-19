import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListShops, useLogin, customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import PinKeypad from "@/components/pin-keypad";
import { Store, Shield, KeyRound, ChevronLeft, CheckCircle2, Eye, EyeOff, Sprout, Boxes, TrendingUp, MapPin, ArrowRight, LockKeyhole, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const SHOPS_CACHE_KEY = "greenlink_shops_cache";
const LAST_SHOP_KEY = "greenlink_last_shop";
const LOGIN_THEME_KEY = "greenlink_login_theme";

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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/60">
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">Reset PIN</h2>
          </div>
        </div>

        <div className="p-5">
          {step === "done" ? (
            /* ── Success ── */
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-foreground text-base">PIN Reset!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your new {role} PIN is set. You can now log in.
                </p>
              </div>
              <Button className="w-full" onClick={onClose}>
                Back to Login
              </Button>
            </div>
          ) : (
            /* ── Form ── */
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Enter your <span className="text-foreground font-semibold">exact shop name</span> to verify ownership, then choose a new PIN.
              </p>

              {/* Shop selector */}
              {shops.length > 1 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shop</label>
                  <Select value={shopId} onValueChange={setShopId}>
                    <SelectTrigger className="h-11 bg-muted/40">
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

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Which PIN to reset?</label>
                <div className="grid grid-cols-2 gap-2">
                  {(["owner", "cashier"] as const).map(r => (
                    <button
                      key={r}
                      onClick={() => setRole(r)}
                      className={cn(
                        "h-10 rounded-xl text-sm font-semibold border transition-all capitalize",
                        role === r
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                      )}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shop name verification */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Shop Name <span className="text-muted-foreground/50 normal-case">(exact spelling)</span>
                </label>
                <Input
                  value={shopName}
                  onChange={e => setShopName(e.target.value)}
                  placeholder="e.g. GreenLink Agrovet"
                  className="h-11 bg-muted/40"
                  autoComplete="off"
                />
              </div>

              {/* New PIN */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New PIN (4–8 digits)</label>
                <div className="relative">
                  <Input
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    value={newPin}
                    onChange={e => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    placeholder="••••"
                    className="h-11 bg-muted/40 pr-10 font-mono tracking-widest text-lg"
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

              {/* Confirm PIN */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confirm New PIN</label>
                <Input
                  type={showPin ? "text" : "password"}
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={e => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="••••"
                  className={cn(
                    "h-11 bg-muted/40 font-mono tracking-widest text-lg",
                    confirmPin && newPin !== confirmPin && "border-destructive focus-visible:ring-destructive"
                  )}
                />
                {confirmPin && newPin !== confirmPin && (
                  <p className="text-xs text-destructive">PINs don't match</p>
                )}
              </div>

              <Button
                className="w-full h-12 font-bold mt-2"
                disabled={!canSubmit || loading}
                onClick={handleReset}
              >
                {loading ? "Resetting…" : "Reset PIN"}
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
  const { data: shops } = useListShops({
    query: {
      staleTime: 5 * 60_000,
      placeholderData: getCachedShops,
      select: (data) => {
        if (data) setCachedShops(data);
        return data;
      },
    },
  });
  const loginMutation = useLogin();

  // Do not silently preselect the last shop when multiple shops exist. Suggest it,
  // but require the user to deliberately confirm which shop they are entering.
  const [lastShopId] = useState<string>(
    () => localStorage.getItem(LAST_SHOP_KEY) ?? ""
  );
  const [shopId, setShopId] = useState<string>("");
  const [role, setRole] = useState<"owner" | "cashier">("cashier");
  const [pin, setPin] = useState("");
  const [showForgot, setShowForgot] = useState(false);

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
  const recommendedShop = shops?.find((shop) => shop.id === lastShopId);
  const needsExplicitShopChoice = (shops?.length ?? 0) > 1 && !shopId;

  return (
    <main className="min-h-[100dvh] bg-[#07130f] text-white lg:grid lg:grid-cols-[minmax(340px,0.88fr)_minmax(580px,1.12fr)]">
      {showForgot && (
        <ForgotPinModal shops={shops ?? []} onClose={() => setShowForgot(false)} />
      )}

      {/* Brand story panel */}
      <section className="relative isolate hidden min-h-[100dvh] overflow-hidden border-r border-emerald-900/50 bg-gradient-to-br from-[#062c20] via-[#071b15] to-[#07130f] p-10 xl:flex xl:flex-col xl:justify-between xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -left-24 top-36 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute bottom-10 right-0 h-96 w-96 rounded-full bg-lime-400/10 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-emerald-950/60 to-transparent" />
        </div>

        <div>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-lg shadow-black/20">
              <img src="/logo-greenlink.jpg" alt="GreenLink logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-2xl font-extrabold tracking-tight">GreenLink <span className="text-lime-400">OS</span></p>
              <p className="mt-1 text-sm text-emerald-100/65">Multi-shop business platform</p>
            </div>
          </div>

          <div className="mt-20 max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-emerald-200">
              <Sprout className="h-4 w-4 text-lime-300" />
              BUILT FOR AGROVET BUSINESSES
            </div>
            <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight 2xl:text-6xl">
              Run your business.
              <span className="mt-2 block text-primary">Grow with confidence.</span>
            </h1>
            <p className={cn("mt-6 max-w-lg text-lg leading-8", isLight ? "text-slate-600" : "text-emerald-50/70")}>
              Manage sales, stock, customer debts, and business performance from one dependable workspace.
            </p>
          </div>

          <div className="mt-12 grid max-w-xl grid-cols-2 gap-3">
            {[
              { icon: Store, title: "Point of sale", detail: "Fast checkout" },
              { icon: Boxes, title: "Stock control", detail: "Know your inventory" },
              { icon: TrendingUp, title: "Reports & insights", detail: "Make informed decisions" },
              { icon: Shield, title: "Shop-specific access", detail: "Keep work in context" },
            ].map(({ icon: Icon, title, detail }) => (
              <div key={title} className={cn("rounded-2xl border p-4 backdrop-blur-sm", isLight ? "border-border bg-white shadow-sm" : "border-white/[0.08] bg-white/[0.035]")}>
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-lime-300">
                  <Icon className="h-5 w-5" />
                </div>
                <p className={cn("font-semibold", isLight ? "text-slate-900" : "text-white")}>{title}</p>
                <p className={cn("mt-1 text-sm", isLight ? "text-muted-foreground" : "text-emerald-100/55")}>{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className={cn("mt-12 flex items-center gap-3 rounded-2xl border px-4 py-4", isLight ? "border-border bg-white shadow-sm" : "border-emerald-300/15 bg-black/20")}>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className={cn("text-sm font-semibold", isLight ? "text-slate-900" : "text-white")}>Your work, in the right shop</p>
            <p className={cn("mt-1 text-xs", isLight ? "text-muted-foreground" : "text-emerald-100/60")}>Check the selected location before signing in.</p>
          </div>
        </div>
      </section>

      {/* Login experience */}
      <section className={cn("relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8 transition-colors duration-300 sm:px-8 lg:px-10", isLight ? "bg-stone-100" : "bg-[#091510]")}>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/[0.08] blur-3xl" />
        <div className="relative w-full max-w-xl">
          <div className="mb-7 flex items-center justify-between xl:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white p-1.5">
                <img src="/logo-greenlink.jpg" alt="GreenLink logo" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-lg font-extrabold">GreenLink <span className="text-lime-400">OS</span></p>
                <p className={cn("text-xs", isLight ? "text-muted-foreground" : "text-emerald-100/60")}>Multi-shop business platform</p>
              </div>
            </div>
            <div className="flex items-center gap-2"><button type="button" onClick={toggleLoginTheme} aria-label={isLight ? "Switch login to dark theme" : "Switch login to light theme"} className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted">{isLight ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}{isLight ? "Light" : "Dark"}</button><div className={cn("rounded-full border px-3 py-1.5 text-xs", isLight ? "border-border text-muted-foreground" : "border-white/10 text-emerald-100/65")}>Secure sign in</div></div>
          </div>

          <Card className={cn("overflow-hidden rounded-[1.75rem] border shadow-2xl transition-colors duration-300", isLight ? "border-border bg-white text-slate-900 shadow-slate-900/5" : "border-emerald-900/70 bg-[#101d17] text-white shadow-black/30")}>
            <CardHeader className={cn("border-b px-6 py-6 sm:px-8 sm:py-7", isLight ? "border-border" : "border-white/[0.07]")}>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-lime-300">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <CardTitle className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome back</CardTitle>
                  <CardDescription className={cn("mt-1.5 text-sm sm:text-base", isLight ? "text-muted-foreground" : "text-emerald-100/60")}>Sign in to your GreenLink OS terminal</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-7 px-6 py-6 sm:px-8 sm:py-8">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className={cn("text-xs font-bold uppercase tracking-[0.16em]", isLight ? "text-muted-foreground" : "text-emerald-100/60")}>1. Select your shop</label>
                  <span className={cn("text-xs", isLight ? "text-muted-foreground" : "text-emerald-100/40")}>Choose carefully</span>
                </div>
                {recommendedShop && (shops?.length ?? 0) > 1 && (
                  <div className="rounded-2xl border border-lime-300/25 bg-lime-300/[0.06] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-lime-300/10 text-lime-300">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-bold text-lime-200">Suggested shop</p>
                          <span className="rounded-full bg-lime-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-lime-200/80">Last used</span>
                        </div>
                        <p className="mt-1 break-words text-sm font-semibold text-white">{recommendedShop.name}</p>
                        <p className="mt-1 text-xs leading-5 text-emerald-100/55">Suggested from your previous visit. Only choose it if this is the shop you intend to access today.</p>
                        <button
                          type="button"
                          onClick={() => { setShopId(recommendedShop.id); setPin(""); }}
                          className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-lime-300/25 bg-lime-300/10 px-3 text-xs font-bold text-lime-200 transition-colors hover:bg-lime-300/20"
                        >
                          Choose suggested shop <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <Select value={shopId} onValueChange={(value) => { setShopId(value); setPin(""); }}>
                  <SelectTrigger className={cn("h-14 rounded-xl text-left text-sm transition-colors sm:text-base", isLight ? "border-border bg-background text-foreground hover:border-primary/50" : "border-white/10 bg-[#17261f] text-white hover:border-emerald-500/50 focus:ring-emerald-500/30")}>
                    <SelectValue placeholder="Select the exact shop you intend to use" />
                  </SelectTrigger>
                  <SelectContent>
                    {shops?.map((shop) => (
                      <SelectItem key={shop.id} value={shop.id} className="cursor-pointer py-3">
                        <div className="flex items-center gap-3">
                          <Store className="h-4 w-4 text-emerald-500" />
                          <span>{shop.name}</span>
                          {shop.id === lastShopId && <span className="ml-2 text-xs text-emerald-600">Last used</span>}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedShop ? (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/10 text-lime-300">
                      <Store className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate text-sm font-semibold", isLight ? "text-foreground" : "text-white")}>{selectedShop.name}</p>
                      <p className={cn("mt-0.5 flex items-center gap-1.5 text-xs", isLight ? "text-muted-foreground" : "text-emerald-100/55")}>
                        <MapPin className="h-3 w-3" />
                        Selected shop · verify before continuing
                      </p>
                    </div>
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                  </div>
                ) : (
                  <p className={cn("text-xs leading-5", needsExplicitShopChoice ? "font-semibold text-amber-200" : "text-emerald-100/45")}>{needsExplicitShopChoice ? "Choose a shop above before entering your PIN. The previous shop is only a suggestion, not an automatic selection." : "Select the correct shop before entering your PIN."}</p>
                )}
              </div>

              <div className="space-y-4">
                <label className={cn("block text-xs font-bold uppercase tracking-[0.16em]", isLight ? "text-muted-foreground" : "text-emerald-100/60")}>2. Choose your access</label>
                <Tabs value={role} onValueChange={(value) => { setRole(value as "owner" | "cashier"); setPin(""); }} className="w-full">
                  <TabsList className={cn("grid h-12 w-full grid-cols-2 rounded-xl border p-1", isLight ? "border-border bg-muted/60" : "border-white/[0.06] bg-[#0a1510]")}>
                    <TabsTrigger value="cashier" className={cn("rounded-lg text-sm font-semibold data-[state=active]:shadow-sm", isLight ? "text-muted-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" : "text-emerald-100/55 data-[state=active]:bg-emerald-400 data-[state=active]:text-[#062016]")}>Cashier</TabsTrigger>
                    <TabsTrigger value="owner" className="rounded-lg text-sm font-semibold text-emerald-100/55 data-[state=active]:bg-emerald-400 data-[state=active]:text-[#062016] data-[state=active]:shadow-sm">Owner</TabsTrigger>
                  </TabsList>
                  <TabsContent value="cashier" className="mt-5 focus-visible:outline-none">
                    <PinKeypad pin={pin} onChange={setPin} onSubmit={handleLogin} loading={loginMutation.isPending} />
                  </TabsContent>
                  <TabsContent value="owner" className="mt-5 focus-visible:outline-none">
                    <PinKeypad pin={pin} onChange={setPin} onSubmit={handleLogin} loading={loginMutation.isPending} />
                  </TabsContent>
                </Tabs>

                <div className={cn("flex flex-col items-center justify-between gap-3 border-t pt-4 sm:flex-row", isLight ? "border-border" : "border-white/[0.07]")}>
                  <button type="button" onClick={() => setShowForgot(true)} className={cn("inline-flex items-center gap-2 text-sm font-medium transition-colors", isLight ? "text-muted-foreground hover:text-primary" : "text-emerald-100/55 hover:text-lime-300")}>
                    <KeyRound className="h-4 w-4" />
                    Forgot PIN?
                  </button>
                  <p className={cn("inline-flex items-center gap-2 text-xs", isLight ? "text-muted-foreground" : "text-emerald-100/40")}>
                    <Shield className="h-3.5 w-3.5" />
                    Your session is shop-specific
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <p className={cn("mt-5 text-center text-xs leading-5", isLight ? "text-muted-foreground" : "text-emerald-100/35")}>
            GreenLink OS · Secure access for your business
          </p>
        </div>
      </section>
    </main>

  );
}
