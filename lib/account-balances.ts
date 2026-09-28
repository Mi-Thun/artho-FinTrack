import { db } from "@/lib/db";
import { monthKey, monthStart } from "@/lib/budgets";

/**
 * Account balances are counted per month, like budget limits: an account's balance in a
 * month is its newest AccountBalance row with month <= that month, so a month nobody
 * updated carries the last count forward. Account.balance mirrors the newest row.
 */
export type MonthBalance = {
  /** The balance in force for the month, or null if the account had none yet. */
  balance: number | null;
  /** The month that balance was counted for — earlier than the month asked for when carried forward. */
  countedMonth: Date | null;
};

/** Each account's balance as of `month`, keyed by account id. */
export async function accountBalancesForMonth(userId: string, month: Date): Promise<Map<string, MonthBalance>> {
  const rows = await db.accountBalance.findMany({
    where: { account: { userId }, month: { lte: monthStart(month) } },
    orderBy: { month: "desc" },
    select: { accountId: true, month: true, balance: true },
  });
  const byAccount = new Map<string, MonthBalance>();
  for (const r of rows) {
    // Newest first, so the first row seen per account is the one in force.
    if (!byAccount.has(r.accountId)) byAccount.set(r.accountId, { balance: Number(r.balance), countedMonth: r.month });
  }
  return byAccount;
}

/** Total across accounts as of `month`; an account with no balance yet counts as nothing. */
export function totalOf(balances: Map<string, MonthBalance>): number {
  let total = 0;
  for (const b of balances.values()) total += b.balance ?? 0;
  return total;
}

/**
 * Months the Accounts page offers in its month picker: everything from the earliest
 * balance or transaction through `includeMonth`, newest first.
 */
export async function accountMonthKeys(userId: string, includeMonth: Date): Promise<string[]> {
  const [earliestBalance, earliestTransaction] = await Promise.all([
    db.accountBalance.findFirst({ where: { account: { userId } }, select: { month: true }, orderBy: { month: "asc" } }),
    db.transaction.findFirst({ where: { userId, deletedAt: null }, select: { date: true }, orderBy: { date: "asc" } }),
  ]);

  const current = monthStart(includeMonth);
  let earliest = current;
  for (const d of [earliestBalance?.month, earliestTransaction?.date]) {
    if (d && monthStart(d) < earliest) earliest = monthStart(d);
  }

  const keys: string[] = [];
  for (let d = earliest; d <= current; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    keys.push(monthKey(d));
  }
  return keys.reverse();
}

/**
 * Saves an account's balance for `month`. When no later month has its own count, this is
 * the account's newest balance, so Account.balance (what "now" figures read) follows it.
 */
export async function saveAccountBalance(accountId: string, month: Date, balance: number) {
  const m = monthStart(month);
  await db.$transaction(async (tx) => {
    await tx.accountBalance.upsert({
      where: { accountId_month: { accountId, month: m } },
      create: { accountId, month: m, balance },
      update: { balance },
    });
    const later = await tx.accountBalance.findFirst({ where: { accountId, month: { gt: m } }, select: { id: true } });
    if (!later) await tx.account.update({ where: { id: accountId }, data: { balance, lastCountedAt: new Date() } });
  });
}
