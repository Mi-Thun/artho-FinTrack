"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";

export async function setBudget(formData: FormData) {
  const userId = await requireUserId();
  const categoryId = String(formData.get("categoryId") || "");
  const monthlyLimit = Number(formData.get("monthlyLimit"));
  if (!categoryId || !Number.isFinite(monthlyLimit) || monthlyLimit < 0) return;

  await db.budget.upsert({
    where: { userId_categoryId: { userId, categoryId } },
    create: { userId, categoryId, monthlyLimit },
    update: { monthlyLimit },
  });

  revalidatePath("/budgets");
  revalidatePath("/dashboard");
}

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
