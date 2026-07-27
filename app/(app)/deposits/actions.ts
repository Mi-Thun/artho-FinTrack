"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";

function num(formData: FormData, key: string): number {
  return Number(formData.get(key));
}
function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createFixedDeposit(formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const principal = num(formData, "principal");
  const openedDate = new Date(str(formData, "openedDate"));
  const rateY1 = num(formData, "rateY1") / 100;
  const rateY2 = num(formData, "rateY2") / 100;
  const rateY3 = num(formData, "rateY3") / 100;
  const termMonths = num(formData, "termMonths") || 36;
  if (!label || !Number.isFinite(principal) || Number.isNaN(openedDate.getTime())) return;

  await db.fixedDeposit.create({
    data: { userId, label, principal, openedDate, rateY1, rateY2, rateY3, termMonths },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function updateFixedDeposit(id: string, formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const principal = num(formData, "principal");
  const openedDate = new Date(str(formData, "openedDate"));
  const rateY1 = num(formData, "rateY1") / 100;
  const rateY2 = num(formData, "rateY2") / 100;
  const rateY3 = num(formData, "rateY3") / 100;
  const termMonths = num(formData, "termMonths") || 36;
  if (!label || !Number.isFinite(principal) || Number.isNaN(openedDate.getTime())) return;

  await db.fixedDeposit.updateMany({
    where: { id, userId, source: "MANUAL" },
    data: { label, principal, openedDate, rateY1, rateY2, rateY3, termMonths },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
  redirect("/deposits?tab=deposits");
}

export async function deleteFixedDeposit(id: string) {
  const userId = await requireUserId();
  await db.fixedDeposit.deleteMany({ where: { id, userId, source: "MANUAL" } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function createDpsPlan(formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const monthlyDeposit = num(formData, "monthlyDeposit");
  const startMonthStr = str(formData, "startMonth");
  const startMonth = new Date(startMonthStr.length === 7 ? `${startMonthStr}-01` : startMonthStr);
  const tenureMonths = num(formData, "tenureMonths");
  const interestRate = num(formData, "interestRate") / 100;
  const profitTaxAtSourceStr = str(formData, "profitTaxAtSource");
  const profitTaxAtSource = profitTaxAtSourceStr === "" ? 0.1 : Number(profitTaxAtSourceStr) / 100;
  if (!label || !Number.isFinite(monthlyDeposit) || Number.isNaN(startMonth.getTime()) || !Number.isInteger(tenureMonths) || tenureMonths <= 0) {
    return;
  }

  await db.dpsPlan.create({
    data: { userId, label, monthlyDeposit, startMonth, tenureMonths, interestRate, profitTaxAtSource },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function updateDpsPlan(id: string, formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const monthlyDeposit = num(formData, "monthlyDeposit");
  const startMonthStr = str(formData, "startMonth");
  const startMonth = new Date(startMonthStr.length === 7 ? `${startMonthStr}-01` : startMonthStr);
  const tenureMonths = num(formData, "tenureMonths");
  const interestRate = num(formData, "interestRate") / 100;
  const profitTaxAtSourceStr = str(formData, "profitTaxAtSource");
  const profitTaxAtSource = profitTaxAtSourceStr === "" ? 0.1 : Number(profitTaxAtSourceStr) / 100;
  if (!label || !Number.isFinite(monthlyDeposit) || Number.isNaN(startMonth.getTime()) || !Number.isInteger(tenureMonths) || tenureMonths <= 0) {
    return;
  }

  await db.dpsPlan.updateMany({
    where: { id, userId },
    data: { label, monthlyDeposit, startMonth, tenureMonths, interestRate, profitTaxAtSource },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
  redirect("/deposits?tab=dps");
}

export async function deleteDpsPlan(id: string) {
  const userId = await requireUserId();
  await db.dpsPlan.deleteMany({ where: { id, userId } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function saveDepositPlanConfig(formData: FormData) {
  const userId = await requireUserId();
  const startingNetWorth = num(formData, "startingNetWorth");
  const startMonth = new Date(str(formData, "startMonth"));
  const depositUnitSize = num(formData, "depositUnitSize");
  const profitRateY1 = num(formData, "profitRateY1");
  const profitRateY2 = num(formData, "profitRateY2");
  const profitRateY3 = num(formData, "profitRateY3");
  const investmentCap = num(formData, "investmentCap");
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
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function saveSalaryConfig(formData: FormData) {
  const userId = await requireUserId();
  const year = num(formData, "year");
  const monthlySalary = num(formData, "monthlySalary");
  const festivalBonusMultiplier = num(formData, "festivalBonusMultiplier");
  const bonusMonths = str(formData, "bonusMonths")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  const taxRebate = num(formData, "taxRebate");
  const annualTax = num(formData, "annualTax");
  const monthlyExpense = num(formData, "monthlyExpense") || 0;
  if (!Number.isInteger(year)) return;

  await db.salaryConfig.upsert({
    where: { userId_year: { userId, year } },
    create: { userId, year, monthlySalary, festivalBonusMultiplier, bonusMonths, taxRebate, annualTax, monthlyExpense },
    update: { monthlySalary, festivalBonusMultiplier, bonusMonths, taxRebate, annualTax, monthlyExpense },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function updateSalaryConfig(id: string, formData: FormData) {
  const userId = await requireUserId();
  const year = num(formData, "year");
  const monthlySalary = num(formData, "monthlySalary");
  const festivalBonusMultiplier = num(formData, "festivalBonusMultiplier");
  const bonusMonths = str(formData, "bonusMonths")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
  const taxRebate = num(formData, "taxRebate");
  const annualTax = num(formData, "annualTax");
  const monthlyExpense = num(formData, "monthlyExpense") || 0;
  if (!Number.isInteger(year)) return;

  await db.salaryConfig.updateMany({
    where: { id, userId },
    data: { year, monthlySalary, festivalBonusMultiplier, bonusMonths, taxRebate, annualTax, monthlyExpense },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
  redirect("/deposits?tab=salary");
}

export async function deleteSalaryConfig(id: string) {
  const userId = await requireUserId();
  await db.salaryConfig.deleteMany({ where: { id, userId } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function createMilestone(formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const targetAmount = num(formData, "targetAmount");
  if (!label || !Number.isFinite(targetAmount)) return;

  await db.milestone.create({ data: { userId, label, targetAmount } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function updateMilestone(id: string, formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const targetAmount = num(formData, "targetAmount");
  if (!label || !Number.isFinite(targetAmount)) return;

  await db.milestone.updateMany({ where: { id, userId }, data: { label, targetAmount } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
  redirect("/deposits?tab=milestones");
}

export async function deleteMilestone(id: string) {
  const userId = await requireUserId();
  await db.milestone.deleteMany({ where: { id, userId } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}
