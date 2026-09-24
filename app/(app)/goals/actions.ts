"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { goalTemplate, suggestedTargetDate } from "@/lib/goals";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function num(formData: FormData, key: string): number {
  const n = Number(formData.get(key));
  return Number.isFinite(n) ? n : 0;
}
/** Unclamped — the plan forms below validate NaN themselves rather than silently saving 0. */
function rawNum(formData: FormData, key: string): number {
  return Number(formData.get(key));
}
function optionalDate(formData: FormData, key: string): Date | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createGoal(formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const targetAmount = num(formData, "targetAmount");
  if (!name || targetAmount <= 0) return;

  await db.savingsGoal.create({
    data: {
      userId,
      name,
      templateKey: str(formData, "templateKey") || null,
      targetAmount,
      targetDate: optionalDate(formData, "targetDate"),
      note: str(formData, "note") || null,
    },
  });

  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

/**
 * One-click creation from a template. Observance-linked templates (Qurbani, Eid) resolve
 * their deadline through the Hijri calendar, so the date is always the next occurrence.
 */
export async function createGoalFromTemplate(templateKey: string) {
  const userId = await requireUserId();
  const template = goalTemplate(templateKey);
  if (!template) return;

  await db.savingsGoal.create({
    data: {
      userId,
      name: template.name,
      templateKey: template.key,
      targetAmount: template.suggestedAmount,
      targetDate: suggestedTargetDate(template, new Date()),
    },
  });

  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function updateGoal(id: string, formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const targetAmount = num(formData, "targetAmount");
  if (!name || targetAmount <= 0) return;

  await db.savingsGoal.updateMany({
    where: { id, userId },
    data: { name, targetAmount, targetDate: optionalDate(formData, "targetDate"), note: str(formData, "note") || null },
  });

  revalidatePath("/goals");
}

export async function contributeToGoal(formData: FormData) {
  const userId = await requireUserId();
  const goalId = str(formData, "goalId");
  const amount = num(formData, "amount");
  if (!goalId || amount <= 0) return;

  const goal = await db.savingsGoal.findFirst({ where: { id: goalId, userId }, select: { id: true } });
  if (!goal) return;

  await db.goalContribution.create({
    data: { goalId, date: optionalDate(formData, "date") ?? new Date(), amount, note: str(formData, "note") || null },
  });

  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

export async function archiveGoal(id: string) {
  const userId = await requireUserId();
  await db.savingsGoal.updateMany({ where: { id, userId }, data: { archivedAt: new Date() } });
  revalidatePath("/goals");
}

export async function deleteGoal(id: string) {
  const userId = await requireUserId();
  await db.savingsGoal.deleteMany({ where: { id, userId } });
  revalidatePath("/goals");
  revalidatePath("/dashboard");
}

/* ---------------------------------------------------------------------------
 * Plan assumptions, salary years, and milestones.
 *
 * These feed the deposit projection but are *planning* inputs, not deposits, so
 * they live with Goals. The deposits pages read the same rows, hence the second
 * revalidate below.
 * ------------------------------------------------------------------------- */

export async function saveDepositPlanConfig(formData: FormData) {
  const userId = await requireUserId();
  const startingNetWorth = rawNum(formData, "startingNetWorth");
  const startMonth = new Date(str(formData, "startMonth"));
  const depositUnitSize = rawNum(formData, "depositUnitSize");
  const profitRateY1 = rawNum(formData, "profitRateY1");
  const profitRateY2 = rawNum(formData, "profitRateY2");
  const profitRateY3 = rawNum(formData, "profitRateY3");
  const investmentCap = rawNum(formData, "investmentCap");
  if (Number.isNaN(startMonth.getTime())) return;

  await db.depositPlanConfig.upsert({
    where: { userId },
    create: {
      userId,
      startingNetWorth,
      startMonth,
      depositUnitSize,
      profitRateY1,
      profitRateY2,
      profitRateY3,
      investmentCap,
    },
    update: {
      startingNetWorth,
      startMonth,
      depositUnitSize,
      profitRateY1,
      profitRateY2,
      profitRateY3,
      investmentCap,
    },
  });
  revalidatePath("/goals");
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function saveSalaryConfig(formData: FormData) {
  const userId = await requireUserId();
  const year = rawNum(formData, "year");
  const monthlySalary = rawNum(formData, "monthlySalary");
  const festivalBonusMultiplier = rawNum(formData, "festivalBonusMultiplier");
  const bonusMonths = str(formData, "bonusMonths")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  const taxRebate = rawNum(formData, "taxRebate");
  const annualTax = rawNum(formData, "annualTax");
  const monthlyExpense = rawNum(formData, "monthlyExpense") || 0;
  if (!Number.isInteger(year)) return;

  await db.salaryConfig.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, monthlySalary, festivalBonusMultiplier, bonusMonths, taxRebate, annualTax, monthlyExpense },
    update: { monthlySalary, festivalBonusMultiplier, bonusMonths, taxRebate, annualTax, monthlyExpense },
  });
  revalidatePath("/goals");
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function updateSalaryConfig(id: string, formData: FormData) {
  const userId = await requireUserId();
  const year = rawNum(formData, "year");
  const monthlySalary = rawNum(formData, "monthlySalary");
  const festivalBonusMultiplier = rawNum(formData, "festivalBonusMultiplier");
  const bonusMonths = str(formData, "bonusMonths")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  const taxRebate = rawNum(formData, "taxRebate");
  const annualTax = rawNum(formData, "annualTax");
  const monthlyExpense = rawNum(formData, "monthlyExpense") || 0;
  if (!Number.isInteger(year)) return;

  await db.salaryConfig.updateMany({
    where: { id, userId },
    data: { year, monthlySalary, festivalBonusMultiplier, bonusMonths, taxRebate, annualTax, monthlyExpense },
  });
  revalidatePath("/goals");
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
  redirect("/goals#salary");
}

export async function deleteSalaryConfig(id: string) {
  const userId = await requireUserId();
  await db.salaryConfig.deleteMany({ where: { id, userId } });
  revalidatePath("/goals");
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function createMilestone(formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const targetAmount = rawNum(formData, "targetAmount");
  if (!label || !Number.isFinite(targetAmount)) return;

  await db.milestone.create({ data: { userId, label, targetAmount } });
  revalidatePath("/goals");
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function updateMilestone(id: string, formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const targetAmount = rawNum(formData, "targetAmount");
  if (!label || !Number.isFinite(targetAmount)) return;

  await db.milestone.updateMany({ where: { id, userId }, data: { label, targetAmount } });
  revalidatePath("/goals");
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
  redirect("/goals#milestones");
}

export async function deleteMilestone(id: string) {
  const userId = await requireUserId();
  await db.milestone.deleteMany({ where: { id, userId } });
  revalidatePath("/goals");
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}
