import { db } from "@/lib/db";

export interface BudgetProgress {
  categoryId: string;
  categoryName: string;
  monthlyLimit: number;
  spent: number;
}

/**
 * Joins each configured budget against this calendar month's actual expense
 * transactions, so both the Budgets page and the Dashboard summary can render the
 * same spent-vs-limit numbers without duplicating the query.
 */
export async function getBudgetProgress(userId: string, asOf: Date): Promise<BudgetProgress[]> {
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1));

  const [budgets, spend] = await Promise.all([
    db.budget.findMany({ where: { userId }, include: { category: true } }),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "EXPENSE", deletedAt: null, date: { gte: start, lt: end }, categoryId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const spendByCategory = new Map(spend.map((s) => [s.categoryId as string, Number(s._sum.amount ?? 0)]));

  return budgets.map((b) => ({
    categoryId: b.categoryId,
    categoryName: b.category.name,
    monthlyLimit: Number(b.monthlyLimit),
    spent: spendByCategory.get(b.categoryId) ?? 0,
  }));
}

export interface CategoryBudgetRow {
  categoryId: string;
  categoryName: string;
  budgetId: string | null;
  monthlyLimit: number;
  spent: number;
}

/**
 * Like getBudgetProgress, but returns every expense category — including ones with
 * no budget set yet (monthlyLimit defaults to 0) — so the Budgets page can offer
 * inline editing for all categories instead of only ones already budgeted.
 */
export async function getAllCategoryBudgets(userId: string, asOf: Date): Promise<CategoryBudgetRow[]> {
  const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  const end = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1));

  const [categories, budgets, spend] = await Promise.all([
    db.category.findMany({ where: { userId, kind: "EXPENSE" }, orderBy: { name: "asc" } }),
    db.budget.findMany({ where: { userId } }),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "EXPENSE", deletedAt: null, date: { gte: start, lt: end }, categoryId: { not: null } },
      _sum: { amount: true },
    }),
  ]);

  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b]));
  const spendByCategory = new Map(spend.map((s) => [s.categoryId as string, Number(s._sum.amount ?? 0)]));

  return categories.map((c) => {
    const budget = budgetByCategory.get(c.id);
    return {
      categoryId: c.id,
      categoryName: c.name,
      budgetId: budget?.id ?? null,
      monthlyLimit: budget ? Number(budget.monthlyLimit) : 0,
      spent: spendByCategory.get(c.id) ?? 0,
    };
  });
}
