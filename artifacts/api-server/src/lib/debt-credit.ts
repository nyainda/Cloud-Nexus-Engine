import { eq } from "drizzle-orm";
import { debts } from "@workspace/db/schema";
import type { Db } from "./db";
import { customerNameKey } from "./normalize";

export type CreditSource = typeof debts.$inferSelect;

/** Positive customer credit is stored as a negative debt balance. */
export function creditBalance(debt: Pick<CreditSource, "balance" | "status">): number {
  return debt.status === "cancelled" ? 0 : Math.max(0, -Number(debt.balance || 0));
}

export async function getCustomerCreditSources(
  db: Db,
  shopId: string,
  customerName: string,
): Promise<CreditSource[]> {
  const key = customerNameKey(customerName);
  const rows = await db.select().from(debts).where(eq(debts.shopId, shopId)).all();
  return rows
    .filter((row) => customerNameKey(row.customerName) === key && creditBalance(row) > 0)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function allocateCredit(
  sources: CreditSource[],
  requestedAmount: number,
): Array<{ source: CreditSource; amount: number }> {
  let remaining = Math.max(0, requestedAmount);
  const allocations: Array<{ source: CreditSource; amount: number }> = [];
  for (const source of sources) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, creditBalance(source));
    if (amount <= 0) continue;
    allocations.push({ source, amount });
    remaining -= amount;
  }
  return allocations;
}