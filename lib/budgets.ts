import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";

export interface BudgetProgress {
  categoryId: string;
  categoryName: string;
  monthlyLimit: number;
  spent: number;
}

/** First instant (UTC) of the calendar month `date` falls in. */
export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Parses a `YYYY-MM` key back to that month's first instant, or null if malformed. */
export function parseMonthKey(key: string | undefined | null): Date | null {
  if (!key) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(Number(match[1]), month - 1, 1));
}

interface LimitInForce {
  budgetId: string;
  monthlyLimit: number;
  setInMonth: Date;
}

/**
 * A Budget row records the limit a category takes effect at *from* a given month, so
 * the limit in force for any month is the newest row at or before it. Editing today's
 * limit therefore leaves what last month was budgeted at untouched — which matters
 * because the Dashboard and Budgets page both let you browse past months.
 */
async function limitsInForce(userId: string, month: Date): Promise<Map<string, LimitInForce>> {
  const rows = await db.budget.findMany({
    where: { userId, month: { lte: month } },
    orderBy: { month: "asc" },
  });

  // Ascending order means a later row for the same category overwrites an earlier one,
  // leaving exactly the newest limit at or before `month`.
  const byCategory = new Map<string, LimitInForce>();
  for (const row of rows) {
    byCategory.set(row.categoryId, {
      budgetId: row.id,
      monthlyLimit: toNumber(row.monthlyLimit),
      setInMonth: monthStart(row.month),
    });
  }
  return byCategory;
}

async function spendByCategory(userId: string, month: Date): Promise<Map<string, number>> {
  const spend = await db.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      type: "EXPENSE",
      deletedAt: null,
      date: { gte: month, lt: nextMonthStart(month) },
      categoryId: { not: null },
    },
    _sum: { amount: true },
  });
  // Postgres SUM over NUMERIC is exact; this only converts the finished total.
  return new Map(spend.map((s) => [s.categoryId as string, toNumber(s._sum.amount)]));
}

/**
 * Joins each category's limit in force for `asOf`'s month against that month's actual
 * expenses, so both the Budgets page and the Dashboard summary render the same
 * spent-vs-limit numbers without duplicating the query.
 */
export async function getBudgetProgress(userId: string, asOf: Date): Promise<BudgetProgress[]> {
  const month = monthStart(asOf);
  const [limits, spend, categories] = await Promise.all([
    limitsInForce(userId, month),
    spendByCategory(userId, month),
    db.category.findMany({ where: { userId, kind: "EXPENSE" } }),
  ]);

  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  return [...limits.entries()]
    .filter(([categoryId]) => nameById.has(categoryId))
    .map(([categoryId, limit]) => ({
      categoryId,
      categoryName: nameById.get(categoryId)!,
      monthlyLimit: limit.monthlyLimit,
      spent: spend.get(categoryId) ?? 0,
    }));
}

export interface CategoryBudgetRow {
  categoryId: string;
  categoryName: string;
  /** The row that set the limit in force, or null when no limit has ever been set. */
  budgetId: string | null;
  monthlyLimit: number;
  spent: number;
  /** True when the limit was set in an earlier month and carried forward into this one. */
  inheritedFromEarlierMonth: boolean;
}

/**
 * Like getBudgetProgress, but returns every expense category — including ones with no
 * limit ever set (monthlyLimit 0) — so the Budgets page can offer inline editing for
 * all of them.
 */
export async function getAllCategoryBudgets(userId: string, asOf: Date): Promise<CategoryBudgetRow[]> {
  const month = monthStart(asOf);
  const [categories, limits, spend] = await Promise.all([
    db.category.findMany({ where: { userId, kind: "EXPENSE" }, orderBy: { name: "asc" } }),
    limitsInForce(userId, month),
    spendByCategory(userId, month),
  ]);

  return categories.map((c) => {
    const limit = limits.get(c.id);
    return {
      categoryId: c.id,
      categoryName: c.name,
      budgetId: limit?.budgetId ?? null,
      monthlyLimit: limit?.monthlyLimit ?? 0,
      spent: spend.get(c.id) ?? 0,
      inheritedFromEarlierMonth: limit != null && limit.setInMonth.getTime() < month.getTime(),
    };
  });
}

/**
 * Months the Budgets page offers in its month picker: everything from the earliest
 * budget row or expense through `includeMonth`, newest first.
 */
export async function budgetMonthKeys(userId: string, includeMonth: Date): Promise<string[]> {
  const [earliestBudget, earliestExpense] = await Promise.all([
    db.budget.findFirst({ where: { userId }, select: { month: true }, orderBy: { month: "asc" } }),
    db.transaction.findFirst({
      where: { userId, type: "EXPENSE", deletedAt: null },
      select: { date: true },
      orderBy: { date: "asc" },
    }),
  ]);

  const current = monthStart(includeMonth);
  let earliest = current;
  if (earliestBudget) {
    const m = monthStart(earliestBudget.month);
    if (m < earliest) earliest = m;
  }
  if (earliestExpense) {
    const m = monthStart(earliestExpense.date);
    if (m < earliest) earliest = m;
  }

  const keys: string[] = [];
  for (let d = earliest; d <= current; d = nextMonthStart(d)) {
    keys.push(monthKey(d));
  }
  return keys.reverse();
}
