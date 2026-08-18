import type { QueryClient } from "@tanstack/react-query";
import {
  getGetDebtQueryKey,
  getListDebtsQueryKey,
} from "@workspace/api-client-react";

type DebtUpdater = (debt: any) => any;
type CustomerUpdater = (customer: any) => any;

const crmListKey = ["/api/crm"];
const crmProfileKey = ["/api/crm/profile"];

function sameCustomerName(left: unknown, right: string) {
  return String(left ?? "").trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Keep every active debt-list query in sync immediately. Generated list keys
 * include filters, so using the base key updates all debt list variants.
 */
export function patchDebtCaches(
  qc: QueryClient,
  shopId: string,
  debtId: string,
  updater: DebtUpdater,
) {
  qc.setQueriesData(
    { queryKey: getListDebtsQueryKey() },
    (old: unknown) =>
      Array.isArray(old)
        ? old.map((debt: any) => (debt.id === debtId ? updater(debt) : debt))
        : old,
  );
  qc.setQueryData(getGetDebtQueryKey(debtId), (old: any) =>
    old && typeof old === "object" ? updater(old) : old,
  );
}

export function patchCustomerListCaches(
  qc: QueryClient,
  customerName: string,
  updater: CustomerUpdater,
) {
  qc.setQueriesData({ queryKey: crmListKey }, (old: unknown) =>
    Array.isArray(old)
      ? old.map((customer: any) =>
          sameCustomerName(customer.name, customerName)
            ? updater(customer)
            : customer,
        )
      : old,
  );
}

/**
 * Update the debt inside any open customer profile and recalculate its
 * aggregate stats. This makes the Customers detail panel change immediately,
 * without waiting for the CRM endpoint to scan all customer debts again.
 */
export function patchCustomerProfileCaches(
  qc: QueryClient,
  shopId: string,
  debtId: string,
  updater: DebtUpdater,
) {
  qc.setQueriesData(
    { queryKey: [...crmProfileKey, shopId] },
    (old: any) => {
      if (!old || typeof old !== "object" || !Array.isArray(old.debts)) {
        return old;
      }

      const debts = old.debts.map((debt: any) =>
        debt.id === debtId ? updater(debt) : debt,
      );
      const totalBalance = debts.reduce(
        (sum: number, debt: any) =>
          sum + (debt.status === "cancelled" ? 0 : Number(debt.balance || 0)),
        0,
      );
      const totalOwed = debts.reduce(
        (sum: number, debt: any) => sum + Number(debt.totalAmount || 0),
        0,
      );

      return {
        ...old,
        debts,
        stats: {
          ...old.stats,
          totalBalance,
          totalOwed,
          totalPaid: totalOwed - totalBalance,
          debtCount: debts.length,
          activeCount: debts.filter(
            (debt: any) =>
              debt.status !== "paid" && debt.status !== "cancelled",
          ).length,
        },
      };
    },
  );
}

export function applyDebtPayment(debt: any, amount: number, paidAt: string) {
  const newBalance = Math.max(0, Number(debt.balance || 0) - amount);
  const newAmountPaid = Math.min(
    Number(debt.totalAmount || 0),
    Number(debt.amountPaid ?? Number(debt.totalAmount || 0) - Number(debt.balance || 0)) + amount,
  );

  return {
    ...debt,
    amountPaid: newAmountPaid,
    balance: newBalance,
    status:
      newBalance === 0
        ? "paid"
        : newAmountPaid > 0
          ? "partial"
          : debt.status,
    ...(newBalance === 0 ? { paidAt } : {}),
  };
}

export function addDebtToCustomerListCaches(
  qc: QueryClient,
  shopId: string,
  debt: {
    id: string;
    customerName: string;
    customerPhone: string;
    totalAmount: number;
    balance: number;
    status: string;
    createdAt: string;
  },
) {
  qc.setQueryData(["/api/crm", shopId], (old: any) => {
    if (!Array.isArray(old)) return old;
    const index = old.findIndex((customer: any) =>
      sameCustomerName(customer.name, debt.customerName),
    );

    if (index >= 0) {
      return old.map((customer: any, i: number) =>
        i === index
          ? {
              ...customer,
              totalBalance: Number(customer.totalBalance || 0) + debt.balance,
              totalOwed: Number(customer.totalOwed || 0) + debt.totalAmount,
              debtCount: Number(customer.debtCount || 0) + 1,
              activeCount: Number(customer.activeCount || 0) + 1,
              lastActivity: debt.createdAt,
              latestDebtAmount: debt.totalAmount,
              latestDebtBalance: debt.balance,
              latestDebtStatus: debt.status,
            }
          : customer,
      );
    }

    return [
      {
        id: null,
        name: debt.customerName,
        phone: debt.customerPhone,
        email: null,
        notes: null,
        creditLimit: null,
        registered: false,
        totalBalance: debt.balance,
        totalOwed: debt.totalAmount,
        debtCount: 1,
        activeCount: 1,
        lastActivity: debt.createdAt,
        latestDebtAmount: debt.totalAmount,
        latestDebtBalance: debt.balance,
        latestDebtStatus: debt.status,
        createdAt: debt.createdAt,
      },
      ...old,
    ];
  });
}
