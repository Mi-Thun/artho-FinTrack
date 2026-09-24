import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";

// The Dashboard used to load every transaction a user had ever recorded and reduce over
// the array in JS — unbounded memory and transfer that grows with account age, and
// float accumulation on every total. These roll the same figures up in Postgres, where
// the result set is bounded by the number of months rather than the number of rows and
// SUM over NUMERIC is exact.

export interface MonthlyTotal {
  /** `YYYY-MM`, UTC. */
  monthKey: string;
  income: number;
  expense: number;
}

function keyOf(month: Date): string {
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Income and expense totals per calendar month for transactions dated before `before`,
 * oldest month first. One row per month, not per transaction.
 */
export async function monthlyTotals(userId: string, before: Date): Promise<MonthlyTotal[]> {
  const rows = await db.$queryRaw<{ month: Date; income: Prisma.Decimal; expense: Prisma.Decimal }[]>`
    SELECT
      date_trunc('month', "date") AS month,
      COALESCE(SUM("amount") FILTER (WHERE "type" = 'INCOME'), 0) AS income,
      COALESCE(SUM("amount") FILTER (WHERE "type" = 'EXPENSE'), 0) AS expense
    FROM "Transaction"
    WHERE "userId" = ${userId}
      AND "deletedAt" IS NULL
      AND "date" < ${before}
    GROUP BY 1
    ORDER BY 1 ASC
  `;

  return rows.map((r) => ({
    monthKey: keyOf(r.month),
    income: toNumber(r.income),
    expense: toNumber(r.expense),
  }));
}

/**
 * Every month the user has a transaction in, newest first. Drives the month picker, so
 * it deliberately ignores any cutoff — future-dated transactions get a month too.
 */
export async function transactionMonthKeys(userId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ month: Date }[]>`
    SELECT DISTINCT date_trunc('month', "date") AS month
    FROM "Transaction"
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL
    ORDER BY 1 DESC
  `;
  return rows.map((r) => keyOf(r.month));
}

/**
 * Transactions that need undoing to reconstruct account balances as of `cutoff` — see
 * computeNetWorth. Only account-linked rows at or after the cutoff matter, which for
 * the common case (cutoff = now) is a handful of future-dated rows rather than the
 * user's whole history.
 */
export async function accountTransactionsFrom(userId: string, cutoff: Date) {
  return db.transaction.findMany({
    where: { userId, deletedAt: null, accountId: { not: null }, date: { gte: cutoff } },
    select: { accountId: true, date: true, type: true, amount: true },
  });
}
