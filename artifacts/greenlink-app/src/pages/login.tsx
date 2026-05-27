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
import { Leaf, Store, Shield, KeyRound, ChevronLeft, CheckCircle2, Eye, EyeOff } from "lucide-react";
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

  const [shopId, setShopId] = useState<string>(
    () => localStorage.getItem(LAST_SHOP_KEY) ?? ""
  );
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

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background" style={{ WebkitTransform: 'translateZ(0)', transform: 'translateZ(0)' }}>
      {/* Forgot PIN overlay */}
      {showForgot && (
        <ForgotPinModal
          shops={shops ?? []}
          onClose={() => setShowForgot(false)}
        />
      )}

      {/* Brand Panel */}
      <div className="hidden md:flex md:w-1/2 bg-sidebar flex-col justify-between p-12 text-sidebar-foreground">
        <div>
          <div className="w-16 h-16 rounded-xl bg-sidebar-primary flex items-center justify-center shadow-lg mb-8">
            <Leaf className="h-8 w-8 text-sidebar-primary-foreground" />
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold font-display tracking-tight text-white mb-4">
            GreenLink OS
          </h1>
          <p className="text-sidebar-foreground/80 text-lg max-w-md font-sans">
            The professional operating system for agrovet businesses. Manage your inventory, track debts, and process sales with confidence.
          </p>
        </div>
        <div className="flex items-center gap-4 text-sidebar-foreground/60 text-sm">
          <Shield className="h-5 w-5" />
          <span>Secure, fast, and reliable</span>
        </div>
      </div>

      {/* Login Panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-muted/20">
        <div className="w-full max-w-md">
          {/* Mobile Header */}
          <div className="md:hidden flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 rounded-xl bg-primary flex items-center justify-center shadow-lg mb-4">
              <Leaf className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-3xl font-bold font-display tracking-tight text-foreground">GreenLink</h1>
          </div>

          <Card className="border-none shadow-2xl bg-card">
            <CardHeader className="text-center pb-6 border-b border-border/40">
              <CardTitle className="text-2xl font-bold tracking-tight">Welcome back</CardTitle>
              <CardDescription className="text-base">Sign in to your terminal</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              <div className="space-y-3">
                <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Location</label>
                <Select value={shopId} onValueChange={setShopId}>
                  <SelectTrigger className="w-full h-14 text-lg bg-muted/50 border-transparent focus:bg-background transition-colors">
                    <SelectValue placeholder="Select your shop" />
                  </SelectTrigger>
                  <SelectContent>
                    {shops?.map((shop) => (
                      <SelectItem key={shop.id} value={shop.id} className="text-lg py-3 cursor-pointer">
                        <div className="flex items-center gap-3">
                          <Store className="h-5 w-5 text-primary" />
                          {shop.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground block">Authentication</label>
                <Tabs value={role} onValueChange={(v) => { setRole(v as any); setPin(""); }} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-14 mb-8 bg-muted/50 p-1">
                    <TabsTrigger value="cashier" className="text-base font-medium rounded-md data-[state=active]:shadow-sm">Cashier</TabsTrigger>
                    <TabsTrigger value="owner" className="text-base font-medium rounded-md data-[state=active]:shadow-sm">Owner</TabsTrigger>
                  </TabsList>
                  <TabsContent value="cashier" className="mt-0 focus-visible:outline-none">
                    <PinKeypad pin={pin} onChange={setPin} onSubmit={handleLogin} loading={loginMutation.isPending} />
                  </TabsContent>
                  <TabsContent value="owner" className="mt-0 focus-visible:outline-none">
                    <PinKeypad pin={pin} onChange={setPin} onSubmit={handleLogin} loading={loginMutation.isPending} />
                  </TabsContent>
                </Tabs>

                {/* Forgot PIN link */}
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowForgot(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <KeyRound className="h-3 w-3" />
                    Forgot PIN?
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
