import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useListDebts, getListDebtsQueryKey } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKES } from "@/lib/format";
import { toTitleCase } from "@/components/customer-autocomplete";
import {
  addShopNurseryPayout,
  applyPlantSalesToCustomerDebts,
  buildOldestFirstPreview,
  computeNurseryProjection,
  findMatchingSupplier,
  linkCustomerToNurserySupplier,
  loadNurserySettlementState,
  normalizeCustomerKey,
  removeShopNurseryPayout,
  roundMoney,
  saveNurseryAutoSync,
  saveShopNurseryConfig,
  triggerNurseryAutoSyncSweep,
  type NurseryPoolMode,
  type NurserySettlementMetrics,
  type NurserySupplierSummary,
} from "@/lib/nursery-settlement";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Coins,
  History,
  Link2,
  RefreshCw,
  Sprout,
  Trash2,
  UserCheck,
  Wallet,
  Zap,
} from "lucide-react";

type SettlementModalTab = "settle" | "history";

export interface NurseryDebtSettlementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shopId: string;
  shopName?: string;
  customerName?: string;
  customerPhone?: string;
  externalDebts?: any[];
  suppliers?: NurserySupplierSummary[];
  initialTab?: SettlementModalTab;
  onSettled?: () => void;
}

const FEE_PRESETS = [0, 10, 15, 20, 25, 30];

export function NurseryDebtSettlementDialog({
  open,
  onOpenChange,
  shopId,
  shopName = localStorage.getItem("greenlink_shopName") || "Active Shop",
  customerName: initialCustomerName = "",
  customerPhone: initialCustomerPhone = "",
  externalDebts,
  suppliers: externalSuppliers,
  initialTab = "settle",
  onSettled,
}: NurseryDebtSettlementDialogProps) {
  const qc = useQueryClient();
  const userName = localStorage.getItem("greenlink_userName") || "Owner";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";

  const [activeTab, setActiveTab] = useState<SettlementModalTab>(initialTab);
  const [selectedCustomerKey, setSelectedCustomerKey] = useState(
    normalizeCustomerKey(initialCustomerName),
  );
  const [poolMode, setPoolMode] = useState<NurseryPoolMode>("collected");
  const [feePctInput, setFeePctInput] = useState<string>("0");
  const [applyAmountInput, setApplyAmountInput] = useState<string>("");
  const [convertSurplusToCredit, setConvertSurplusToCredit] = useState(false);
  const [surplusAction, setSurplusAction] = useState<"credit" | "payout">("payout");
  const [payoutMethod, setPayoutMethod] = useState<"mpesa" | "cash">("mpesa");
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [savingAutoSync, setSavingAutoSync] = useState(false);
  const [sweeping, setSweeping] = useState(false);

  const fetchedDebtsQuery = useListDebts(
    { shopId },
    {
      query: {
        queryKey: getListDebtsQueryKey({ shopId }),
        enabled: open && !!shopId && !externalDebts,
        staleTime: 15_000,
      },
    },
  );

  const allDebts: any[] = externalDebts ?? ((fetchedDebtsQuery.data as any[]) || []);

  const customerOptions = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        name: string;
        phone: string;
        openBalance: number;
        totalIssued: number;
        totalCredit: number;
        debtCount: number;
        hasPaidOrActiveDebt: boolean;
      }
    >();

    for (const d of allDebts) {
      if (!d || d.status === "cancelled") continue;
      const key = normalizeCustomerKey(d.customerName);
      if (!key) continue;
      const cur = map.get(key) ?? {
        key,
        name: String(d.customerName).trim(),
        phone: String(d.customerPhone ?? "").trim(),
        openBalance: 0,
        totalIssued: 0,
        totalCredit: 0,
        debtCount: 0,
        hasPaidOrActiveDebt: false,
      };
      cur.debtCount += 1;
      cur.totalIssued = roundMoney(cur.totalIssued + Number(d.totalAmount || 0));
      cur.openBalance = roundMoney(cur.openBalance + Math.max(0, Number(d.balance || 0)));
      cur.totalCredit = roundMoney(cur.totalCredit + Math.max(0, -Number(d.balance || 0)));
      cur.hasPaidOrActiveDebt = true;
      if (!cur.phone && d.customerPhone) cur.phone = String(d.customerPhone).trim();
      map.set(key, cur);
    }

    return Array.from(map.values()).sort(
      (a, b) => b.openBalance - a.openBalance || a.name.localeCompare(b.name),
    );
  }, [allDebts]);

  const activeCustomer = useMemo(() => {
    if (selectedCustomerKey) {
      const exact = customerOptions.find((c) => c.key === selectedCustomerKey);
      if (exact) return exact;
    }
    if (initialCustomerName) {
      return {
        key: normalizeCustomerKey(initialCustomerName),
        name: initialCustomerName,
        phone: initialCustomerPhone,
        openBalance: 0,
        totalIssued: 0,
        totalCredit: 0,
        debtCount: 0,
        hasPaidOrActiveDebt: false,
      };
    }
    if (externalSuppliers?.length) {
      const linked = externalSuppliers.find((s) => !!s.customerName);
      if (linked?.customerName) {
        const match = customerOptions.find(
          (c) => c.key === normalizeCustomerKey(linked.customerName),
        );
        if (match) return match;
      }
    }
    return customerOptions[0] ?? null;
  }, [selectedCustomerKey, customerOptions, initialCustomerName, initialCustomerPhone, externalSuppliers]);

  useEffect(() => {
    if (!open) return;
    setActiveTab(initialTab);
    if (initialCustomerName) {
      setSelectedCustomerKey(normalizeCustomerKey(initialCustomerName));
    }
  }, [open, initialCustomerName, initialTab]);

  const stateQuery = useQuery<NurserySettlementMetrics>({
    queryKey: [
      "nursery-settlement-state",
      shopId,
      activeCustomer?.name ?? "",
      allDebts.length,
      allDebts.reduce((s, d) => s + Number(d.balance || 0), 0),
    ],
    queryFn: () =>
      loadNurserySettlementState({
        qc,
        shopId,
        shopName,
        customerName: activeCustomer?.name ?? "",
        customerPhone: activeCustomer?.phone ?? "",
        allDebts,
        suppliers: externalSuppliers,
      }),
    enabled: open && !!shopId,
    staleTime: 10_000,
  });

  const metrics = stateQuery.data;

  useEffect(() => {
    if (!metrics) return;
    setPoolMode(metrics.shopConfig.poolMode);
    setFeePctInput(String(metrics.shopConfig.commissionPct));
  }, [metrics?.shopId, metrics?.shopConfig.commissionPct, metrics?.shopConfig.poolMode]);

  useEffect(() => {
    if (!open || initialCustomerName || selectedCustomerKey) return;
    if (metrics?.autoSyncConfig?.ownerCustomerName) {
      const targetKey = normalizeCustomerKey(metrics.autoSyncConfig.ownerCustomerName);
      const match = customerOptions.find((c) => c.key === targetKey);
      if (match) {
        setSelectedCustomerKey(match.key);
        return;
      }
    }
    if (!metrics?.suppliers?.length) return;
    const linkedSupplier = metrics.suppliers.find((s) => s.customerName || s.name);
    if (!linkedSupplier) return;
    const match = customerOptions.find(
      (c) =>
        c.key === normalizeCustomerKey(linkedSupplier.customerName) ||
        c.key === normalizeCustomerKey(linkedSupplier.name),
    );
    if (match) setSelectedCustomerKey(match.key);
  }, [open, initialCustomerName, selectedCustomerKey, metrics?.autoSyncConfig?.ownerCustomerName, metrics?.suppliers, customerOptions]);

  const feePct = useMemo(() => {
    const num = Number(feePctInput);
    if (!Number.isFinite(num)) return 0;
    return Math.min(95, Math.max(0, roundMoney(num)));
  }, [feePctInput]);

  useEffect(() => {
    if (!open || !metrics) return;
    saveShopNurseryConfig(shopId, { commissionPct: feePct, poolMode });
  }, [open, metrics, shopId, feePct, poolMode]);

  const projection = useMemo(() => {
    if (!metrics) return null;
    return computeNurseryProjection({
      metrics,
      poolMode,
      shopCommissionPct: feePct,
    });
  }, [metrics, poolMode, feePct]);

  const customerDebts = useMemo(() => {
    if (!activeCustomer) return [];
    return allDebts.filter(
      (d) =>
        d &&
        d.status !== "cancelled" &&
        normalizeCustomerKey(d.customerName) === activeCustomer.key,
    );
  }, [allDebts, activeCustomer]);

  const customerOpenBalance = activeCustomer?.openBalance ?? 0;

  useEffect(() => {
    if (!projection) return;
    if (customerOpenBalance > 0) {
      const autoAmount = convertSurplusToCredit
        ? projection.availableNetProceeds
        : roundMoney(Math.min(customerOpenBalance, projection.availableNetProceeds));
      setApplyAmountInput(autoAmount > 0 ? String(autoAmount) : "");
    } else {
      setApplyAmountInput(
        projection.availableNetProceeds > 0
          ? String(projection.availableNetProceeds)
          : "",
      );
    }
  }, [projection?.availableNetProceeds, customerOpenBalance, convertSurplusToCredit, activeCustomer?.key]);

  const enteredAmount = useMemo(() => {
    const val = Number(applyAmountInput);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return roundMoney(val);
  }, [applyAmountInput]);

  const maxSpendable = projection?.availableNetProceeds ?? 0;
  const effectiveApplyAmount = roundMoney(Math.min(enteredAmount, maxSpendable));

  const payoffPreview = useMemo(() => {
    if (customerOpenBalance <= 0) return null;
    return buildOldestFirstPreview(customerDebts, effectiveApplyAmount);
  }, [customerDebts, customerOpenBalance, effectiveApplyAmount]);

  const matchedSupplier = useMemo(() => {
    if (!metrics || !activeCustomer) return null;
    return findMatchingSupplier(
      metrics.suppliers,
      activeCustomer.name,
      activeCustomer.phone,
    );
  }, [metrics, activeCustomer]);

  const handleLinkCustomer = async () => {
    if (!metrics || !activeCustomer || linking) return;
    setLinking(true);
    try {
      await linkCustomerToNurserySupplier({
        qc,
        shopId,
        customerName: activeCustomer.name,
        customerPhone: activeCustomer.phone,
        suppliers: metrics.suppliers,
      });
      toast.success(`${toTitleCase(activeCustomer.name)} linked as nursery supplier!`);
      await stateQuery.refetch();
      await qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] });
    } catch (err: any) {
      toast.error(err?.message || "Could not link customer to nursery supplier");
    } finally {
      setLinking(false);
    }
  };

  const invalidateFinancialViews = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListDebtsQueryKey({ shopId }) }),
      qc.invalidateQueries({ queryKey: getListDebtsQueryKey() }),
      qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] }),
      qc.invalidateQueries({ queryKey: ["/api/crm"] }),
      qc.invalidateQueries({ queryKey: ["/api/crm/profile", shopId] }),
      qc.invalidateQueries({ queryKey: ["/api/nursery/suppliers", shopId] }),
    ]);
  };

  const handleToggleAutoSync = async (nextEnabled: boolean, overrideFeePct?: number) => {
    if (!isOwner || savingAutoSync) return;
    if (!navigator.onLine) {
      toast.error("Reconnect to the internet before changing automatic sync settings.");
      return;
    }
    const targetName =
      activeCustomer?.name ||
      metrics?.autoSyncConfig?.ownerCustomerName ||
      "Nursery";
    const targetPhone =
      activeCustomer?.phone ||
      metrics?.autoSyncConfig?.ownerCustomerPhone ||
      "";
    setSavingAutoSync(true);
    try {
      const res = await saveNurseryAutoSync({
        enabled: nextEnabled,
        ownerCustomerName: targetName,
        ownerCustomerPhone: targetPhone,
        commissionPct: overrideFeePct ?? feePct,
        sweepRemaining: true,
      });
      await invalidateFinancialViews();
      await stateQuery.refetch();
      onSettled?.();
      const sweptAmt = roundMoney(Number(res?.sweep?.sweptNetCents ?? 0) / 100);
      if (nextEnabled) {
        toast.success(
          sweptAmt > 0
            ? `Auto-Sync ON for ${toTitleCase(targetName)} · Synced ${formatKES(sweptAmt)} remaining proceeds!`
            : `Auto-Sync ON — future collected plant sales will credit ${toTitleCase(targetName)} automatically.`,
        );
      } else {
        toast.success("Automatic plant sync paused (manual settlements still available).");
      }
    } catch (err: any) {
      toast.error(err?.message || "Could not update automatic plant sync settings");
    } finally {
      setSavingAutoSync(false);
    }
  };

  const handleManualSweep = async () => {
    if (sweeping) return;
    if (!navigator.onLine) {
      toast.error("Reconnect to the internet to sync collected plant proceeds.");
      return;
    }
    setSweeping(true);
    try {
      const res = await triggerNurseryAutoSyncSweep("manual");
      await invalidateFinancialViews();
      await stateQuery.refetch();
      onSettled?.();
      const net = roundMoney(Number(res?.sweep?.sweptNetCents ?? 0) / 100);
      toast.success(
        net > 0
          ? `Synced ${formatKES(net)} of collected plant proceeds to ${toTitleCase(res.config.ownerCustomerName)}!`
          : "All collected plant proceeds are already synced.",
      );
    } catch (err: any) {
      toast.error(err?.message || "Could not sync remaining plant balance");
    } finally {
      setSweeping(false);
    }
  };

  const handleSettle = async () => {
    if (!metrics || !projection || !activeCustomer || submitting) return;
    if (!navigator.onLine) {
      toast.error("Reconnect to the internet before applying plant-sales settlements.");
      return;
    }
    if (effectiveApplyAmount <= 0) {
      toast.error("Enter an amount within the available plant proceeds.");
      return;
    }

    setSubmitting(true);
    try {
      if (customerOpenBalance > 0) {
        await applyPlantSalesToCustomerDebts({
          qc,
          shopId,
          customerName: activeCustomer.name,
          customerPhone: activeCustomer.phone,
          customerDebts,
          netAmount: effectiveApplyAmount,
          feePct,
          poolMode,
          recordedBy: userName,
          mode: "pay_debts",
        });
        toast.success(
          `Applied ${formatKES(effectiveApplyAmount)} from plant sales to ${toTitleCase(activeCustomer.name)}'s debts!`,
        );
      } else if (surplusAction === "credit") {
        if (!activeCustomer.hasPaidOrActiveDebt) {
          toast.error("Store credit needs at least one existing debt record for this customer.");
          return;
        }
        await applyPlantSalesToCustomerDebts({
          qc,
          shopId,
          customerName: activeCustomer.name,
          customerPhone: activeCustomer.phone,
          customerDebts,
          netAmount: effectiveApplyAmount,
          feePct,
          poolMode,
          recordedBy: userName,
          mode: "add_credit",
        });
        toast.success(
          `Added ${formatKES(effectiveApplyAmount)} plant surplus to ${toTitleCase(activeCustomer.name)}'s store credit!`,
        );
      } else {
        const rate = (100 - feePct) / 100;
        const grossConsumed = rate > 0 ? roundMoney(effectiveApplyAmount / rate) : effectiveApplyAmount;
        const shopProfitTaken = Math.max(0, roundMoney(grossConsumed - effectiveApplyAmount));
        addShopNurseryPayout(shopId, {
          id:
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `payout-${Date.now()}`,
          shopId,
          customerKey: activeCustomer.key,
          amount: effectiveApplyAmount,
          grossConsumed,
          shopProfitTaken,
          feePct,
          method: payoutMethod,
          reference: payoutRef.trim(),
          note: payoutNote.trim() || `Plant profit payout to ${toTitleCase(activeCustomer.name)}`,
          recordedAt: new Date().toISOString(),
          recordedBy: userName,
        });
        setPayoutRef("");
        setPayoutNote("");
        await qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] });
        toast.success(
          `Recorded ${payoutMethod === "mpesa" ? "M-Pesa" : "Cash"} payout of ${formatKES(effectiveApplyAmount)} to ${toTitleCase(activeCustomer.name)}.`,
        );
      }

      await stateQuery.refetch();
      onSettled?.();
    } catch (err: any) {
      toast.error(err?.message || "Could not complete plant proceeds settlement");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePayout = async (payoutId: string) => {
    removeShopNurseryPayout(shopId, payoutId);
    toast.success("Payout entry removed — available plant balance restored.");
    await qc.invalidateQueries({ queryKey: ["nursery-settlement-state", shopId] });
    await stateQuery.refetch();
    onSettled?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92dvh] flex flex-col overflow-hidden rounded-3xl p-0 gap-0">
        <DialogHeader className="border-b border-border/70 bg-muted/20 px-5 py-4 shrink-0">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center shrink-0">
                <Sprout className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-bold leading-tight">
                  Plant Sales ↔ Debt Settlement
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {shopName} · Clear nursery debts &amp; track shop profit share
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-xl shrink-0"
              onClick={() => void stateQuery.refetch()}
              disabled={stateQuery.isFetching}
              title="Refresh live plant & debt balances"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", stateQuery.isFetching && "animate-spin")} />
            </Button>
          </div>

          <div className="mt-3 flex gap-1.5 rounded-xl bg-background/70 border border-border/60 p-1">
            {[
              { id: "settle" as SettlementModalTab, label: "Settle Debt & Split", Icon: Coins },
              {
                id: "history" as SettlementModalTab,
                label: `Used on Debts & Ledger (${(metrics?.settledPayments.length ?? 0) + (metrics?.payouts.length ?? 0)})`,
                Icon: History,
              },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                  activeTab === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {stateQuery.isLoading ? (
            <div className="space-y-3 animate-pulse py-6">
              <div className="h-20 rounded-2xl bg-muted/50" />
              <div className="h-28 rounded-2xl bg-muted/40" />
              <div className="h-36 rounded-2xl bg-muted/40" />
            </div>
          ) : stateQuery.isError || !metrics || !projection ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center space-y-2">
              <p className="text-sm font-semibold text-destructive">
                Could not load live nursery &amp; debt balances.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => void stateQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              {/* ── TAB 1: SETTLE DEBT & SPLIT ─────────────────────────── */}
              {activeTab === "settle" && (
                <>
                  {/* Automatic Sync Banner */}
                  <div
                    className={cn(
                      "rounded-2xl border p-3.5 space-y-2.5",
                      metrics.autoSyncConfig?.enabled
                        ? "border-emerald-500/35 bg-emerald-500/[0.06]"
                        : "border-border/80 bg-muted/20",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "w-7 h-7 rounded-xl border flex items-center justify-center shrink-0",
                            metrics.autoSyncConfig?.enabled
                              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-500"
                              : "bg-muted border-border text-muted-foreground",
                          )}
                        >
                          <Zap className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-xs font-bold text-foreground">
                              Automatic Plant → Mum&apos;s Account Sync
                            </p>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border",
                                metrics.autoSyncConfig?.enabled
                                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                  : "bg-muted text-muted-foreground border-border",
                              )}
                            >
                              {metrics.autoSyncConfig?.enabled ? "Auto ON" : "Manual"}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {metrics.autoSyncConfig?.enabled
                              ? `Every Cash/M-Pesa plant sale & paid seedling credit debt automatically credits ${toTitleCase(metrics.autoSyncConfig.ownerCustomerName)}${metrics.autoSyncConfig.ownerCustomerPhone ? ` (${metrics.autoSyncConfig.ownerCustomerPhone})` : ""} and auto-cuts any debt taken.`
                              : "Turn on Auto-Sync so collected plant sales automatically pay open debts and add to Mum's credit."}
                          </p>
                        </div>
                      </div>
                      {isOwner && (
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          {metrics.autoSyncConfig?.enabled &&
                            (metrics.autoSyncTotals?.remainingCollectedCents ?? 0) > 0 && (
                              <Button
                                type="button"
                                size="sm"
                                disabled={sweeping}
                                onClick={() => void handleManualSweep()}
                                className="h-8 rounded-xl text-xs bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                              >
                                {sweeping
                                  ? "Syncing…"
                                  : `Sync ${formatKES((metrics.autoSyncTotals?.remainingCollectedCents ?? 0) / 100)} Now`}
                              </Button>
                            )}
                          <Button
                            type="button"
                            size="sm"
                            variant={metrics.autoSyncConfig?.enabled ? "outline" : "default"}
                            disabled={savingAutoSync}
                            onClick={() =>
                              void handleToggleAutoSync(!metrics.autoSyncConfig?.enabled)
                            }
                            className="h-8 rounded-xl text-xs cursor-pointer"
                          >
                            {savingAutoSync
                              ? "Saving…"
                              : metrics.autoSyncConfig?.enabled
                              ? feePct !== metrics.autoSyncConfig.commissionPct
                                ? "Update Rule"
                                : "Pause Auto-Sync"
                              : "Turn On Auto-Sync"}
                          </Button>
                        </div>
                      )}
                    </div>
                    {isOwner &&
                      metrics.autoSyncConfig?.enabled &&
                      feePct !== metrics.autoSyncConfig.commissionPct && (
                        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                          <span>
                            You changed Shop Split to <strong>{feePct}%</strong> (D1 currently uses{" "}
                            <strong>{metrics.autoSyncConfig.commissionPct}%</strong>).
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={savingAutoSync}
                            onClick={() => void handleToggleAutoSync(true, feePct)}
                            className="h-7 rounded-lg text-[11px] cursor-pointer"
                          >
                            Save Split to D1
                          </Button>
                        </div>
                      )}
                  </div>

                  <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Nursery Owner / Customer Account
                        </Label>
                        {customerOptions.length > 1 && !initialCustomerName ? (
                          <select
                            value={activeCustomer?.key ?? ""}
                            onChange={(e) => setSelectedCustomerKey(e.target.value)}
                            className="mt-1 h-9 w-full rounded-xl border border-input bg-background px-3 text-sm font-semibold"
                          >
                            {customerOptions.map((c) => (
                              <option key={c.key} value={c.key}>
                                {toTitleCase(c.name)} {c.phone ? `(${c.phone})` : ""} — Owes{" "}
                                {formatKES(c.openBalance)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="mt-1 flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-foreground">
                              {activeCustomer ? toTitleCase(activeCustomer.name) : "No customer selected"}
                            </span>
                            {activeCustomer?.phone && (
                              <span className="text-xs font-mono text-muted-foreground">
                                {activeCustomer.phone}
                              </span>
                            )}
                            {matchedSupplier ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                <UserCheck className="h-3 w-3" />
                                Linked Supplier
                              </span>
                            ) : activeCustomer ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={linking}
                                onClick={() => void handleLinkCustomer()}
                                className="h-6 px-2.5 rounded-full text-[11px] gap-1 border-emerald-500/35 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                              >
                                <Link2 className="h-3 w-3" />
                                {linking ? "Linking…" : "Link as Nursery Supplier"}
                              </Button>
                            ) : null}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3 shrink-0 rounded-xl bg-background/80 border border-border/70 px-3 py-2">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            Open Debt
                          </p>
                          <p
                            className={cn(
                              "text-sm font-bold font-mono tabular-nums",
                              customerOpenBalance > 0 ? "text-destructive" : "text-emerald-500",
                            )}
                          >
                            {formatKES(customerOpenBalance)}
                          </p>
                        </div>
                        {(activeCustomer?.totalCredit ?? 0) > 0 && (
                          <div className="border-l border-border pl-3">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">
                              Store Credit
                            </p>
                            <p className="text-sm font-bold font-mono tabular-nums text-emerald-500">
                              {formatKES(activeCustomer?.totalCredit ?? 0)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Plant Pool Selection */}
                  <div className="rounded-2xl border border-border/80 bg-card p-3.5 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        1. Plant Sales Pool ({metrics.totalSeedlings.toLocaleString()} seedlings sold)
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Cash {formatKES(metrics.cashTotal)} + M-Pesa {formatKES(metrics.mpesaTotal)} till
                        {metrics.paidCreditDebtAmount > 0
                          ? ` + ${formatKES(metrics.paidCreditDebtAmount)} paid seedling credit`
                          : ""}
                        {" "}· Unpaid credit{" "}
                        {formatKES(Math.max(0, roundMoney(metrics.creditSales - metrics.paidCreditDebtAmount)))}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPoolMode("collected")}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-all cursor-pointer",
                          poolMode === "collected"
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">Cash + M-Pesa Collected</span>
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                            Recommended
                          </span>
                        </div>
                        <p className="mt-1 text-base font-bold font-mono tabular-nums text-foreground">
                          {formatKES(metrics.collectedCashMpesa)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Actual money received in till
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPoolMode("all")}
                        className={cn(
                          "rounded-xl border p-3 text-left transition-all cursor-pointer",
                          poolMode === "all"
                            ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30"
                            : "border-border hover:bg-muted/40",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold">All Plant Sales Value</span>
                          {metrics.creditSales > 0 && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-500">
                              Incl. Credit
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-base font-bold font-mono tabular-nums text-foreground">
                          {formatKES(metrics.grossTotal)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Includes {formatKES(metrics.creditSales)} unpaid credit sales
                        </p>
                      </button>
                    </div>

                    {poolMode === "all" && metrics.creditSales > 0 && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          Credit plant sales ({formatKES(metrics.creditSales)}) have not been paid in cash yet. Switch to{" "}
                          <strong>Cash + M-Pesa Collected</strong> if you only want to offset collected money.
                        </span>
                      </div>
                    )}

                    {projection.excessAboveSelectedPool > 0 && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/8 px-3 py-2 text-[11px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>
                          Previous settlements exceeded the Cash + M-Pesa collected pool by{" "}
                          <strong>{formatKES(projection.excessAboveSelectedPool)}</strong> (drawn from credit sales).
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Shop Profit Split & Real-Time Metrics */}
                  <div className="rounded-2xl border border-border/80 bg-card p-3.5 space-y-3">
                    <div>
                      <p className="text-xs font-bold text-foreground">
                        2. Profit Split ({shopName} vs Mum)
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Choose what % this shop keeps as profit on remaining plant proceeds (0% = 100% goes to Mum)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {FEE_PRESETS.map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setFeePctInput(String(pct))}
                          className={cn(
                            "h-7 rounded-lg px-2.5 text-xs font-semibold border transition-colors cursor-pointer",
                            feePct === pct
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-muted/40 border-border/70 text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {pct === 0 ? "0% (Full Pass-Through)" : `${pct}% Shop`}
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <Label htmlFor="shop-commission-input" className="text-[11px] text-muted-foreground">
                          Custom %
                        </Label>
                        <Input
                          id="shop-commission-input"
                          type="number"
                          min="0"
                          max="95"
                          step="1"
                          value={feePctInput}
                          onChange={(e) => setFeePctInput(e.target.value)}
                          className="h-7 w-20 rounded-lg px-2 text-xs font-mono text-right"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="rounded-xl border border-border/60 bg-muted/25 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Shop Profit Kept
                        </p>
                        <p className="mt-1 text-sm font-bold font-mono tabular-nums text-foreground">
                          {formatKES(projection.totalShopProfit)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{feePct}% split</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-muted/25 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Mum Total Net
                        </p>
                        <p className="mt-1 text-sm font-bold font-mono tabular-nums text-primary">
                          {formatKES(projection.totalNurseryNetEarned)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">After shop profit</p>
                      </div>
                      <div className="rounded-xl border border-border/60 bg-muted/25 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Used on Debts
                        </p>
                        <p className="mt-1 text-sm font-bold font-mono tabular-nums text-amber-500">
                          {formatKES(metrics.d1SettledNetTotal)}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {metrics.payoutNetTotal > 0 ? `+${formatKES(metrics.payoutNetTotal)} paid out` : "D1 cleared"}
                        </p>
                      </div>
                      <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Available Now
                        </p>
                        <p className="mt-1 text-sm font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                          {formatKES(projection.availableNetProceeds)}
                        </p>
                        <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                          Ready to apply
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Step 3: Action Form */}
                  {activeCustomer && (
                    <div className="rounded-2xl border border-border/80 bg-card p-3.5 space-y-3">
                      <p className="text-xs font-bold text-foreground">
                        3. {customerOpenBalance > 0 ? "Apply Plant Proceeds to Open Debts" : "All Debts Cleared — Handle Plant Surplus"}
                      </p>

                      {projection.availableNetProceeds <= 0 ? (
                        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                          All available plant sales proceeds in this selected pool have already been applied or paid out.
                        </div>
                      ) : customerOpenBalance > 0 ? (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2.5 items-end">
                            <div>
                              <Label htmlFor="plant-settle-amount" className="text-xs">
                                Amount to apply toward debt (max {formatKES(projection.availableNetProceeds)})
                              </Label>
                              <Input
                                id="plant-settle-amount"
                                type="number"
                                min="0.01"
                                max={projection.availableNetProceeds}
                                step="0.01"
                                value={applyAmountInput}
                                onChange={(e) => setApplyAmountInput(e.target.value)}
                                className="mt-1 h-10 rounded-xl font-mono text-sm font-bold"
                              />
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-10 rounded-xl text-xs"
                                onClick={() => {
                                  setConvertSurplusToCredit(false);
                                  setApplyAmountInput(
                                    String(roundMoney(Math.min(customerOpenBalance, projection.availableNetProceeds))),
                                  );
                                }}
                              >
                                Exact Debt ({formatKES(Math.min(customerOpenBalance, projection.availableNetProceeds))})
                              </Button>
                            </div>
                          </div>

                          {projection.availableNetProceeds > customerOpenBalance && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={convertSurplusToCredit}
                                onChange={(e) => setConvertSurplusToCredit(e.target.checked)}
                                className="rounded border-border"
                              />
                              <span>
                                Apply full {formatKES(projection.availableNetProceeds)} (clears all debts + parks{" "}
                                <strong>{formatKES(roundMoney(projection.availableNetProceeds - customerOpenBalance))}</strong> as
                                customer store credit)
                              </span>
                            </label>
                          )}

                          {payoffPreview && payoffPreview.allocations.length > 0 && (
                            <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Allocation Preview (Oldest Debt First)
                              </p>
                              <div className="space-y-1 max-h-36 overflow-y-auto">
                                {payoffPreview.allocations.map(({ debt: d, applied }) => {
                                  const newBal = Math.max(0, roundMoney(Number(d.balance || 0) - applied));
                                  return (
                                    <div
                                      key={d.id}
                                      className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0"
                                    >
                                      <span className="font-mono text-muted-foreground">
                                        #{String(d.id).slice(0, 8).toUpperCase()} ·{" "}
                                        {format(new Date(d.createdAt), "d MMM yyyy")}
                                      </span>
                                      <span className="flex items-center gap-2 font-mono">
                                        <span className="text-emerald-500 font-semibold">
                                          -{formatKES(applied)}
                                        </span>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                        <span
                                          className={cn(
                                            "font-bold",
                                            newBal <= 0.005 ? "text-emerald-500" : "text-amber-500",
                                          )}
                                        >
                                          {newBal <= 0.005 ? "PAID" : `${formatKES(newBal)} left`}
                                        </span>
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2 text-xs">
                                <span className="text-muted-foreground">
                                  Remaining Debt:{" "}
                                  <strong className="font-mono text-foreground">
                                    {formatKES(Math.max(0, roundMoney(customerOpenBalance - payoffPreview.totalAppliedToDebts)))}
                                  </strong>
                                </span>
                                <span className="text-emerald-600 dark:text-emerald-400">
                                  Remaining Plant Balance for Mum:{" "}
                                  <strong className="font-mono">
                                    {formatKES(Math.max(0, roundMoney(projection.availableNetProceeds - effectiveApplyAmount)))}
                                  </strong>
                                </span>
                              </div>
                            </div>
                          )}

                          <Button
                            type="button"
                            disabled={submitting || effectiveApplyAmount <= 0}
                            onClick={() => void handleSettle()}
                            className="w-full h-11 rounded-xl font-bold gap-2 cursor-pointer"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {submitting
                              ? "Settling Debts…"
                              : `Clear ${formatKES(effectiveApplyAmount)} of Debt Using Plant Sales`}
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setSurplusAction("payout")}
                              className={cn(
                                "rounded-xl border p-2.5 text-left text-xs transition-all cursor-pointer",
                                surplusAction === "payout"
                                  ? "border-primary bg-primary/10 font-semibold"
                                  : "border-border hover:bg-muted/40",
                              )}
                            >
                              <Banknote className="h-4 w-4 mb-1 text-primary" />
                              Record Cash / M-Pesa Payout
                            </button>
                            <button
                              type="button"
                              disabled={!activeCustomer.hasPaidOrActiveDebt}
                              onClick={() => setSurplusAction("credit")}
                              className={cn(
                                "rounded-xl border p-2.5 text-left text-xs transition-all cursor-pointer disabled:opacity-50",
                                surplusAction === "credit"
                                  ? "border-emerald-500/60 bg-emerald-500/10 font-semibold"
                                  : "border-border hover:bg-muted/40",
                              )}
                            >
                              <Wallet className="h-4 w-4 mb-1 text-emerald-500" />
                              Add to Store Credit (D1)
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <Label htmlFor="surplus-amount" className="text-xs">
                                Amount (max {formatKES(projection.availableNetProceeds)})
                              </Label>
                              <Input
                                id="surplus-amount"
                                type="number"
                                min="0.01"
                                max={projection.availableNetProceeds}
                                step="0.01"
                                value={applyAmountInput}
                                onChange={(e) => setApplyAmountInput(e.target.value)}
                                className="mt-1 h-9 rounded-xl font-mono text-sm font-bold"
                              />
                            </div>
                            {surplusAction === "payout" && (
                              <div>
                                <Label className="text-xs">Payout Channel</Label>
                                <div className="mt-1 flex gap-2">
                                  {(["mpesa", "cash"] as const).map((m) => (
                                    <button
                                      key={m}
                                      type="button"
                                      onClick={() => setPayoutMethod(m)}
                                      className={cn(
                                        "flex-1 h-9 rounded-xl border text-xs font-semibold uppercase cursor-pointer",
                                        payoutMethod === m
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-input bg-background",
                                      )}
                                    >
                                      {m === "mpesa" ? "M-Pesa" : "Cash"}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {surplusAction === "payout" && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              <Input
                                placeholder="M-Pesa Ref / Receipt No. (optional)"
                                value={payoutRef}
                                onChange={(e) => setPayoutRef(e.target.value)}
                                className="h-9 rounded-xl text-xs"
                              />
                              <Input
                                placeholder="Payout note (optional)"
                                value={payoutNote}
                                onChange={(e) => setPayoutNote(e.target.value)}
                                className="h-9 rounded-xl text-xs"
                              />
                            </div>
                          )}

                          <Button
                            type="button"
                            disabled={submitting || effectiveApplyAmount <= 0}
                            onClick={() => void handleSettle()}
                            className="w-full h-11 rounded-xl font-bold gap-2 cursor-pointer"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {submitting
                              ? "Saving…"
                              : surplusAction === "credit"
                              ? `Add ${formatKES(effectiveApplyAmount)} to Customer Store Credit`
                              : `Record ${payoutMethod.toUpperCase()} Payout of ${formatKES(effectiveApplyAmount)}`}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── TAB 2: USED ON DEBTS & LEDGER ─────────────────────── */}
              {activeTab === "history" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Used for Debts (D1)</p>
                      <p className="mt-1 text-sm font-bold font-mono text-amber-500">
                        {formatKES(metrics.d1SettledNetTotal)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
                      <p className="text-[10px] font-bold uppercase text-muted-foreground">Cash/M-Pesa Paid Out</p>
                      <p className="mt-1 text-sm font-bold font-mono text-primary">
                        {formatKES(metrics.payoutNetTotal)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <p className="text-[10px] font-bold uppercase text-emerald-500">Remaining Available</p>
                      <p className="mt-1 text-sm font-bold font-mono text-emerald-500">
                        {formatKES(projection.availableNetProceeds)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-foreground mb-2">
                      Debt &amp; Credit Settlements Paid From Plants ({metrics.settledPayments.length})
                    </p>
                    {metrics.settledPayments.length === 0 ? (
                      <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                        No plant proceeds have been applied to debts in D1 yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {metrics.settledPayments.map((entry) => (
                          <div
                            key={`${entry.debtId}-${entry.paymentId}`}
                            className="rounded-xl border border-border/70 bg-muted/15 p-3 flex items-start justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold">
                                {toTitleCase(entry.customerName)} · Debt #{entry.debtId.slice(0, 8).toUpperCase()}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {format(new Date(entry.paidAt), "d MMM yyyy, HH:mm")} · By {entry.recordedBy} ·{" "}
                                {entry.source === "supplier_auto_offset" ? "Auto Supplier Offset" : "Plant Proceeds Settlement"}
                              </p>
                              {entry.note && (
                                <p className="text-[11px] text-muted-foreground/80 mt-1 break-words">
                                  {entry.note}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-bold font-mono text-emerald-500">
                                {formatKES(entry.amount)}
                              </p>
                              {entry.shopProfitTaken > 0 && (
                                <p className="text-[10px] font-mono text-muted-foreground">
                                  +{formatKES(entry.shopProfitTaken)} shop
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {isOwner && metrics.settledPayments.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Tip: Need to undo a debt settlement? Open that debt&apos;s <strong>Payments</strong> tab in Customer Debts and click{" "}
                        <strong>Reverse</strong> — the available plant balance restores automatically.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-foreground mb-2">
                      Cash / M-Pesa Surplus Payouts ({metrics.payouts.length})
                    </p>
                    {metrics.payouts.length === 0 ? (
                      <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                        No cash/M-Pesa surplus payouts recorded in {shopName} yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {metrics.payouts.map((p) => (
                          <div
                            key={p.id}
                            className="rounded-xl border border-border/70 bg-muted/15 p-3 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold uppercase">
                                {p.method === "mpesa" ? "M-Pesa Payout" : "Cash Payout"}
                                {p.reference ? ` · Ref ${p.reference}` : ""}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {format(new Date(p.recordedAt), "d MMM yyyy, HH:mm")} · {p.note}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right">
                                <p className="text-xs font-bold font-mono text-primary">
                                  {formatKES(p.amount)}
                                </p>
                                {p.shopProfitTaken > 0 && (
                                  <p className="text-[10px] font-mono text-muted-foreground">
                                    +{formatKES(p.shopProfitTaken)} shop
                                  </p>
                                )}
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => void handleDeletePayout(p.id)}
                                title="Remove payout record"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
