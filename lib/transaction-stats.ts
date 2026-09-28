import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";

// The Dashboard used to load every transaction a user had ever recorded and reduce over
// the array in JS — unbounded memory and transfer that grows with account age, and
// float accumulation on every total. These roll the same figures up in the database, where
// the result set is bounded by the number of months rather than the number of rows and
// SUM over NUMERIC is exact. DateTime columns are UTC timestamps, so to_char gives the UTC
// month key directly.

export interface MonthlyTotal {
  /** `YYYY-MM`, UTC. */
  monthKey: string;
  income: number;
  expense: number;
}

/**
 * Income and expense totals per calendar month for transactions dated before `before`,
 * oldest month first. One row per month, not per transaction.
 */
export async function monthlyTotals(userId: string, before: Date): Promise<MonthlyTotal[]> {
  const rows = await db.$queryRaw<{ month: string; income: Prisma.Decimal; expense: Prisma.Decimal }[]>`
    SELECT
      to_char("date", 'YYYY-MM') AS month,
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
    monthKey: r.month,
    income: toNumber(r.income),
    expense: toNumber(r.expense),
  }));
}

/**
 * Every month the user has a transaction in, newest first. Drives the month picker, so
 * it deliberately ignores any cutoff — future-dated transactions get a month too.
 */
export async function transactionMonthKeys(userId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ month: string }[]>`
    SELECT DISTINCT to_char("date", 'YYYY-MM') AS month
    FROM "Transaction"
    WHERE "userId" = ${userId} AND "deletedAt" IS NULL
    ORDER BY 1 DESC
  `;
  return rows.map((r) => r.month);
}
