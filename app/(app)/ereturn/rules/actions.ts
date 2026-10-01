"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { money } from "@/lib/money";
import { isIncomeYear } from "@/lib/ereturn/rules";

// A user edits tax rules only as their own copy of a year; the published rows (no user)
// change only by migration. Going back to the published rules deletes the copy.

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

/** A non-negative amount in taka. */
function amount(formData: FormData, key: string): Prisma.Decimal {
  const value = money(str(formData, key));
  if (value.isNegative()) throw new Error(`${key} can't be negative`);
  return value;
}

/** A percentage typed as "10" or "27.5", stored as a fraction. */
function percent(formData: FormData, key: string): Prisma.Decimal {
  const value = money(str(formData, key));
  if (value.isNegative() || value.greaterThan(100)) throw new Error(`${key} must be between 0 and 100%`);
  return value.dividedBy(100);
}

/** "11-30" */
function monthDay(formData: FormData, key: string, required: boolean): string | null {
  const raw = str(formData, key);
  if (!raw && !required) return null;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12 || Number(m[2]) < 1 || Number(m[2]) > 31) throw new Error(`${key} must be MM-DD`);
  return `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * Rows of a band table: `${prefix}Width.0`, `${prefix}Rate.0`… Rows without a rate are
 * skipped; a slab with no width is "the rest" and must come last.
 */
function slabs(formData: FormData): { width: number | null; rate: number }[] {
  const rows: { width: number | null; rate: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const rate = str(formData, `slabRate.${i}`);
    if (!rate) continue;
    const width = str(formData, `slabWidth.${i}`);
    rows.push({ width: width ? amount(formData, `slabWidth.${i}`).toNumber() : null, rate: percent(formData, `slabRate.${i}`).toNumber() });
  }
  if (rows.length === 0) throw new Error("Add at least one slab");
  if (rows.slice(0, -1).some((r) => r.width == null)) throw new Error("Only the last slab can be open-ended");
  rows[rows.length - 1] = { ...rows[rows.length - 1], width: null };
  return rows;
}

function surchargeBands(formData: FormData): { above: number; rate: number }[] {
  const rows: { above: number; rate: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const rate = str(formData, `bandRate.${i}`);
    if (!rate) continue;
    rows.push({ above: amount(formData, `bandAbove.${i}`).toNumber(), rate: percent(formData, `bandRate.${i}`).toNumber() });
  }
  return rows.sort((a, b) => a.above - b.above);
}

function refresh(incomeYear: string) {
  revalidatePath("/ereturn", "layout");
  revalidatePath(`/ereturn/rules/${incomeYear}`);
}

export async function saveRules(incomeYear: string, formData: FormData) {
  const userId = await requireUserId();
  if (!isIncomeYear(incomeYear)) throw new Error("Not an income year");
  const julyWarrior = str(formData, "thresholdJulyWarrior");
  const firstReturnMinimum = str(formData, "minimumTaxFirstReturn");
  const maxMonths = Number(str(formData, "lateFilingMaxMonths"));
  if (!Number.isInteger(maxMonths) || maxMonths < 0 || maxMonths > 120) throw new Error("Months must be a whole number");

  const data = {
    source: str(formData, "source").slice(0, 300),
    thresholdGeneral: amount(formData, "thresholdGeneral"),
    thresholdFemaleOrSenior: amount(formData, "thresholdFemaleOrSenior"),
    thresholdThirdGender: amount(formData, "thresholdThirdGender"),
    thresholdDisabled: amount(formData, "thresholdDisabled"),
    thresholdFreedomFighter: amount(formData, "thresholdFreedomFighter"),
    thresholdJulyWarrior: julyWarrior ? amount(formData, "thresholdJulyWarrior") : null,
    parentOfDisabledExtra: amount(formData, "parentOfDisabledExtra"),
    slabs: slabs(formData),
    nonResidentRate: percent(formData, "nonResidentRate"),
    minimumTaxDhakaChattogram: amount(formData, "minimumTaxDhakaChattogram"),
    minimumTaxOtherCity: amount(formData, "minimumTaxOtherCity"),
    minimumTaxElsewhere: amount(formData, "minimumTaxElsewhere"),
    minimumTaxFirstReturn: firstReturnMinimum ? amount(formData, "minimumTaxFirstReturn") : null,
    salaryExemptionFraction: percent(formData, "salaryExemptionFraction"),
    salaryExemptionCap: amount(formData, "salaryExemptionCap"),
    rebateIncomePct: percent(formData, "rebateIncomePct"),
    rebateInvestmentPct: percent(formData, "rebateInvestmentPct"),
    rebateCap: amount(formData, "rebateCap"),
    netWealthSurcharge: surchargeBands(formData),
    surchargeOnRegularTax: formData.get("surchargeOnRegularTax") === "on",
    sanchayapatraFinalTax: formData.get("sanchayapatraFinalTax") === "on",
    returnDueDate: monthDay(formData, "returnDueDate", true)!,
    firstReturnDueDate: monthDay(formData, "firstReturnDueDate", false),
    lateFilingMonthlyRate: percent(formData, "lateFilingMonthlyRate"),
    lateFilingMaxMonths: maxMonths,
  };

  await db.taxRuleYear.upsert({
    where: { userId_incomeYear: { userId, incomeYear } },
    create: { ...data, userId, incomeYear },
    update: data,
  });
  refresh(incomeYear);
}

/** Drop the user's copy of a year; the published rules apply again. */
export async function resetToPublishedRules(incomeYear: string) {
  const userId = await requireUserId();
  await db.taxRuleYear.deleteMany({ where: { userId, incomeYear } });
  refresh(incomeYear);
  redirect(`/ereturn/rules/${incomeYear}`);
}
