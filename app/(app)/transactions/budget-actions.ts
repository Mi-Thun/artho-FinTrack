"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { monthStart, parseMonthKey } from "@/lib/budgets";

// Budgets are a tab of the Transactions page rather than a page of their own — a limit
// only means anything against the spending it is measured on. These live beside the
// transaction actions for the same reason.

/** Where the budgets tab lives, month included when one is being viewed. */
function budgetsHref(monthParam: string): string {
  return monthParam ? `/transactions?tab=budgets&bMonth=${monthParam}` : "/transactions?tab=budgets";
}

export async function setBudget(formData: FormData) {
  const userId = await requireUserId();
  const categoryId = String(formData.get("categoryId") || "");
  const monthlyLimit = Number(formData.get("monthlyLimit"));
  if (!categoryId || !Number.isFinite(monthlyLimit) || monthlyLimit < 0) return;

  // The limit takes effect from the month being edited and carries forward from there,
  // so saving today never rewrites what an earlier month was budgeted at.
  const monthParam = String(formData.get("month") || "");
  const month = parseMonthKey(monthParam) ?? monthStart(new Date());

  // Don't let a forged categoryId attach a budget to another user's category.
  const category = await db.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!category) return;

  await db.budget.upsert({
    where: { userId_categoryId_month: { userId, categoryId, month } },
    create: { userId, categoryId, month, monthlyLimit },
    update: { monthlyLimit },
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect(budgetsHref(monthParam));
}

/**
 * Clears a limit. Only rows whose own month is the one being viewed are offered for
 * deletion in the UI — a limit inherited from an earlier month belongs to that month's
 * record and isn't this month's to remove.
 */
export async function deleteBudget(id: string) {
  const userId = await requireUserId();
  await db.budget.deleteMany({ where: { id, userId } });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

export async function createExpenseCategory(formData: FormData) {
  const userId = await requireUserId();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  await db.category.upsert({
    where: { userId_name_kind: { userId, name, kind: "EXPENSE" } },
    create: { userId, name, kind: "EXPENSE" },
    update: {},
  });

  revalidatePath("/transactions");
}
