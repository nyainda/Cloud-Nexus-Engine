import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useListShops, useLogin } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import PinKeypad from "@/components/pin-keypad";
import { Leaf, Store, Shield } from "lucide-react";

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

  // Auto-select the only shop when data arrives
  useEffect(() => {
    if (!shopId && shops?.length === 1) {
      setShopId(shops[0].id);
    }
  }, [shops, shopId]);

  const handleLogin = () => {
    if (!shopId) {
      toast.error("Please select a shop");
      return;
    }
    if (!pin) {
      toast.error("Please enter PIN");
      return;
    }

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
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
