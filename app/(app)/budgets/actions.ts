"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { monthStart, parseMonthKey } from "@/lib/budgets";

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

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  redirect(monthParam ? `/budgets?month=${monthParam}` : "/budgets");
}

/**
 * Clears a limit. Only rows whose own month is the one being viewed are offered for
 * deletion in the UI — a limit inherited from an earlier month belongs to that month's
 * record and isn't this month's to remove.
 */
export async function deleteBudget(id: string) {
  const userId = await requireUserId();
  await db.budget.deleteMany({ where: { id, userId } });
  revalidatePath("/budgets");
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

  revalidatePath("/budgets");
  revalidatePath("/transactions");
}
