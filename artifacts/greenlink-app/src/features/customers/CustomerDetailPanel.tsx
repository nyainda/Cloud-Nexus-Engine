import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { customFetch } from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { formatKES } from "@/lib/format";
import {
  Phone,
  Mail,
  FileText,
  Edit3,
  CheckCircle2,
  Clock,
  CreditCard,
  MessageCircle,
  Star,
  X,
  Wallet,
  ArrowUpRight,
  ShieldAlert,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import {
  formatWhatsAppNumber,
  avatarColor,
  crmKey,
  profileKey,
  type CustomerEntry,
  type CustomerProfile,
} from "./customer-utils";
import { DeleteDialog, DeleteIndividualDebtButton, EditDebtItemsButton } from "./CustomerDebtActions";

export function CustomerDetailPanel({
  customer: initialCustomer,
  shopId,
  onClose,
  onEdit,
  isOwner,
}: {
  customer: CustomerEntry;
  shopId: string;
  onClose: () => void;
  onEdit: () => void;
  isOwner: boolean;
}) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [tab, setTab] = useState<"overview" | "debts">("overview");
  const qc = useQueryClient();
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    setCustomer(initialCustomer);
    setTab("overview");
  }, [initialCustomer.id, initialCustomer.name]);

  const { data: profile, isLoading } = useQuery<CustomerProfile>({
    queryKey: profileKey(shopId, customer.name),
    queryFn: () =>
      customFetch<CustomerProfile>(
        `/api/crm/profile?shopId=${encodeURIComponent(shopId)}&name=${encodeURIComponent(customer.name)}`
      ),
    enabled: !!shopId && !!customer.name,
  });

  const stats = profile?.stats;
  const debts = profile?.debts ?? [];
  const reg = profile?.customer;

  const displayedBalance = stats?.totalBalance ?? customer.totalBalance;
  const displayedCredit = stats?.totalCredit ?? customer.totalCredit ?? 0;
  const effectivePhone = reg?.phone || customer.phone || "";
  const effectiveCreditLimit = reg?.creditLimit ?? customer.creditLimit;

  const limitUtilizationPct =
    effectiveCreditLimit && effectiveCreditLimit > 0
      ? Math.min(100, Math.round((displayedBalance / effectiveCreditLimit) * 100))
      : null;
  const isOverLimit =
    effectiveCreditLimit != null && effectiveCreditLimit > 0 && displayedBalance > effectiveCreditLimit;

  const handleRegister = async () => {
    setRegistering(true);
    try {
      await customFetch("/api/crm", {
        method: "POST",
        body: JSON.stringify({
          shopId,
          name: customer.name,
          phone: customer.phone,
          email: null,
          notes: null,
          creditLimit: null,
        }),
      });
      toast.success("Profile saved");
      qc.invalidateQueries({ queryKey: crmKey(shopId) });
      qc.invalidateQueries({ queryKey: profileKey(shopId, customer.name) });
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setRegistering(false);
    }
  };

  const waMsg = effectivePhone
    ? displayedBalance > 0
      ? `Hi ${customer.name}, you have an outstanding balance of ${formatKES(displayedBalance)} at our shop.${displayedCredit > 0 ? ` You also have ${formatKES(displayedCredit)} customer credit available.` : ""} Please settle at your earliest convenience. Thank you!`
      : displayedCredit > 0
      ? `Hi ${customer.name}, you have ${formatKES(displayedCredit)} customer credit available at our shop. Thank you!`
      : `Hi ${customer.name}, your account has no outstanding balance at our shop. Thank you!`
    : "";
  const waNumber = formatWhatsAppNumber(effectivePhone);
  const waUrl = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}` : "#";

  const TABS = [
    { id: "overview" as const, label: "Overview" },
    { id: "debts" as const, label: `Debts (${isLoading ? "…" : debts.length})` },
  ];

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Panel Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-border/80 bg-muted/20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-11 h-11 rounded-2xl flex items-center justify-center text-base font-bold shrink-0",
              avatarColor(customer.name, displayedBalance > 0)
            )}
          >
            {customer.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="font-bold text-sm sm:text-base text-foreground truncate">{customer.name}</h2>
              {customer.registered || profile?.registered ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/12 text-primary border border-primary/20 shrink-0">
                  <Star className="h-2.5 w-2.5 fill-primary" />
                  Registered
                </span>
              ) : (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/70 shrink-0">
                  Debt-Only
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {effectivePhone || reg?.email || customer.email || "No contact info on file"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isOwner && (
            <button
              onClick={onEdit}
              className="flex items-center justify-center w-8 h-8 rounded-xl bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Edit customer"
            >
              <Edit3 className="h-3.5 w-3.5" />
            </button>
          )}
          {isOwner && customer.registered && customer.id && (
            <DeleteDialog customer={customer} shopId={shopId} onDeleted={onClose} />
          )}
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-xl bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Close details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Segmented Tabs */}
      <div className="px-4 pt-3 pb-2 border-b border-border/60 shrink-0">
        <div className="grid grid-cols-2 p-1 rounded-xl bg-muted/60 border border-border/60 gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "py-1.5 rounded-lg text-xs font-semibold transition-all",
                tab === t.id
                  ? "bg-card text-foreground shadow-sm border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === "overview" && (
          <div className="p-4 space-y-4">
            {/* 4-Card KPI Breakdown */}
            {isLoading ? (
              <div className="grid grid-cols-2 gap-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-2 gap-2.5">
                <div
                  className={cn(
                    "rounded-2xl border p-3.5",
                    stats.totalBalance > 0
                      ? "bg-rose-500/8 border-rose-500/20"
                      : "bg-muted/30 border-border/60"
                  )}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Outstanding
                  </p>
                  <p
                    className={cn(
                      "text-base font-bold font-mono tabular-nums mt-1 truncate",
                      stats.totalBalance > 0 ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                    )}
                  >
                    {formatKES(stats.totalBalance)}
                  </p>
                </div>

                <div className="rounded-2xl bg-emerald-500/8 border border-emerald-500/20 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Total Paid
                  </p>
                  <p className="text-base font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1 truncate">
                    {formatKES(stats.totalPaid)}
                  </p>
                </div>

                <div className="rounded-2xl bg-sky-500/8 border border-sky-500/20 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Store Credit
                  </p>
                  <p className="text-base font-bold font-mono tabular-nums text-sky-700 dark:text-sky-400 mt-1 truncate">
                    {formatKES(stats.totalCredit)}
                  </p>
                </div>

                <div className="rounded-2xl bg-muted/35 border border-border/60 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Debt Records
                  </p>
                  <p className="text-base font-bold font-mono tabular-nums text-foreground mt-1">
                    {stats.debtCount}{" "}
                    <span className="text-[11px] font-sans font-medium text-muted-foreground">
                      ({stats.activeCount} open)
                    </span>
                  </p>
                </div>
              </div>
            ) : null}

            {/* Credit Limit Meter */}
            {effectiveCreditLimit != null && effectiveCreditLimit > 0 && limitUtilizationPct != null && (
              <div
                className={cn(
                  "rounded-2xl border p-3.5 space-y-2",
                  isOverLimit
                    ? "border-rose-500/30 bg-rose-500/8"
                    : "border-border/70 bg-muted/20"
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {isOverLimit && <ShieldAlert className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />}
                    Credit Limit Usage
                  </span>
                  <span className="font-mono font-bold tabular-nums text-muted-foreground">
                    {formatKES(displayedBalance)} / {formatKES(effectiveCreditLimit)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      isOverLimit
                        ? "bg-rose-500"
                        : limitUtilizationPct >= 75
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                    )}
                    style={{ width: `${limitUtilizationPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {isOverLimit
                    ? "Balance exceeds configured credit limit"
                    : `${limitUtilizationPct}% of credit allowance used`}
                </p>
              </div>
            )}

            {/* Contact & Profile Details */}
            {(() => {
              const rows = [
                effectivePhone
                  ? {
                      Icon: Phone,
                      label: "Phone",
                      value: effectivePhone,
                      href: `tel:${effectivePhone}`,
                    }
                  : null,
                reg?.email || customer.email
                  ? {
                      Icon: Mail,
                      label: "Email",
                      value: reg?.email || customer.email || "",
                      href: `mailto:${reg?.email || customer.email}`,
                    }
                  : null,
                effectiveCreditLimit != null
                  ? {
                      Icon: CreditCard,
                      label: "Credit Limit",
                      value: formatKES(effectiveCreditLimit),
                      href: undefined,
                    }
                  : null,
                reg?.notes || customer.notes
                  ? {
                      Icon: FileText,
                      label: "Notes",
                      value: reg?.notes || customer.notes || "",
                      href: undefined,
                    }
                  : null,
              ].filter(Boolean) as Array<{
                Icon: React.ComponentType<{ className?: string }>;
                label: string;
                value: string;
                href?: string;
              }>;

              if (rows.length === 0) {
                return (
                  <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center space-y-2">
                    <p className="text-xs text-muted-foreground">No contact details saved yet</p>
                    {isOwner && (
                      <Button variant="outline" size="sm" onClick={onEdit} className="rounded-xl h-7 text-xs">
                        Add contact details
                      </Button>
                    )}
                  </div>
                );
              }

              return (
                <div className="rounded-2xl border border-border/80 bg-background/40 overflow-hidden divide-y divide-border/60">
                  {rows.map((row) => (
                    <div key={row.label} className="flex items-start gap-3 px-3.5 py-2.5">
                      <row.Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {row.label}
                        </p>
                        {row.href ? (
                          <a
                            href={row.href}
                            className="text-xs font-medium text-primary hover:underline mt-0.5 block break-words"
                          >
                            {row.value}
                          </a>
                        ) : (
                          <p className="text-xs text-foreground mt-0.5 break-words">{row.value}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              {!customer.registered && !profile?.registered && (
                <button
                  onClick={handleRegister}
                  disabled={registering}
                  className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Star className="h-3.5 w-3.5" />
                  {registering ? "Saving…" : "Save Profile"}
                </button>
              )}

              {effectivePhone && displayedBalance > 0 && (
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  <button className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-emerald-500/35 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 text-xs font-semibold transition-colors">
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp Reminder
                  </button>
                </a>
              )}

              <Link
                href="/debts"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-border bg-muted/40 hover:bg-muted text-foreground text-xs font-semibold transition-colors"
              >
                <Wallet className="w-3.5 h-3.5 text-primary" />
                Debt Ledger
                <ArrowUpRight className="w-3 h-3 text-muted-foreground" />
              </Link>
            </div>

            {/* Activity timestamps */}
            {(customer.lastActivity || customer.createdAt) && (
              <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                {customer.lastActivity && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Last activity {format(new Date(customer.lastActivity), "d MMM yyyy")}
                  </span>
                )}
                {customer.createdAt && (
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    Added {format(new Date(customer.createdAt), "d MMM yyyy")}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "debts" && (
          <div className="p-4 space-y-2.5">
            {isLoading ? (
              <div className="space-y-2.5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 rounded-2xl bg-muted/40 animate-pulse" />
                ))}
              </div>
            ) : debts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 text-emerald-500/30" />
                <p className="text-sm font-semibold text-foreground">No debt records</p>
                <p className="text-xs text-muted-foreground">This customer has no credit invoices on file.</p>
              </div>
            ) : (
              debts.map((debt: any) => {
                const isPaid = debt.status === "paid";
                const isCancelled = debt.status === "cancelled";
                const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
                const isOverdue = !isPaid && !isCancelled && daysAgo > 30;
                const paidPct =
                  debt.totalAmount > 0
                    ? Math.round(((debt.totalAmount - debt.balance) / debt.totalAmount) * 100)
                    : 0;

                return (
                  <div
                    key={debt.id}
                    className={cn(
                      "rounded-2xl border bg-background/50 p-3.5 transition-colors",
                      isOverdue
                        ? "border-rose-500/30"
                        : isPaid
                        ? "border-emerald-500/25"
                        : isCancelled
                        ? "border-border/50 opacity-75"
                        : "border-border/80"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full leading-none",
                              isCancelled
                                ? "bg-muted text-muted-foreground"
                                : isPaid
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                : isOverdue
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                                : debt.status === "partial"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                            )}
                          >
                            {isCancelled ? "Voided" : isOverdue ? `${daysAgo}d overdue` : debt.status}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {format(new Date(debt.createdAt), "d MMM yyyy")}
                          </span>
                        </div>
                        <p
                          className={cn(
                            "text-xs font-semibold",
                            isCancelled
                              ? "text-muted-foreground"
                              : isPaid
                              ? "text-emerald-700 dark:text-emerald-400"
                              : isOverdue
                              ? "text-rose-600 dark:text-rose-400"
                              : "text-foreground"
                          )}
                        >
                          {isCancelled
                            ? "Sale voided"
                            : isPaid
                            ? `Settled ${formatKES(debt.totalAmount)}`
                            : `${formatKES(debt.balance)} remaining`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold font-mono tabular-nums">{formatKES(debt.totalAmount)}</p>
                        <p className="text-[10px] text-muted-foreground">total</p>
                      </div>
                    </div>

                    {!isPaid && !isCancelled && debt.totalAmount > 0 && (
                      <div className="mt-2.5">
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              isOverdue
                                ? "bg-rose-500"
                                : debt.status === "partial"
                                ? "bg-amber-500"
                                : "bg-primary"
                            )}
                            style={{ width: `${paidPct}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">{paidPct}% paid</p>
                      </div>
                    )}

                    <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between gap-3">
                      <EditDebtItemsButton
                        debt={debt}
                        shopId={shopId}
                        isOwner={isOwner}
                        onSaved={() => {
                          qc.invalidateQueries({ queryKey: profileKey(shopId, customer.name) });
                          qc.invalidateQueries({ queryKey: crmKey(shopId) });
                        }}
                      />
                      <DeleteIndividualDebtButton
                        debt={debt}
                        shopId={shopId}
                        customerName={customer.name}
                        onDeleted={() => {
                          qc.invalidateQueries({ queryKey: profileKey(shopId, customer.name) });
                          qc.invalidateQueries({ queryKey: crmKey(shopId) });
                        }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
