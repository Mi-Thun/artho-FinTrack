import { cache } from "react";
import type { Prisma, TaxRuleYear } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import type { TaxSlab } from "@/lib/tax-slabs";
import { pickRules, type EReturnRules, type ResolvedEReturnYear } from "./rules";

// Rules come from TaxRuleYear: the published rows (no user) and the user's own copies,
// which replace the published row for the same year.

function slabsOf(json: Prisma.JsonValue): TaxSlab[] {
  if (!Array.isArray(json)) return [];
  return json.map((raw) => {
    const s = raw as { width?: number | null; rate?: number };
    return { width: s.width == null ? Infinity : Number(s.width), rate: Number(s.rate ?? 0) };
  });
}

function bandsOf(json: Prisma.JsonValue): { above: number; rate: number }[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((raw) => {
      const b = raw as { above?: number; rate?: number };
      return { above: Number(b.above ?? 0), rate: Number(b.rate ?? 0) };
    })
    .sort((a, b) => a.above - b.above);
}

/** A rate as stored, unrounded: `toNumber` rounds to paisa, which would make ⅓ into 0.33. */
const rate = (value: Prisma.Decimal) => Number(value.toString());

export function toRules(row: TaxRuleYear): EReturnRules {
  return {
    incomeYear: row.incomeYear,
    source: row.source,
    own: row.userId != null,
    threshold: {
      general: toNumber(row.thresholdGeneral),
      femaleOrSenior: toNumber(row.thresholdFemaleOrSenior),
      thirdGender: toNumber(row.thresholdThirdGender),
      disabled: toNumber(row.thresholdDisabled),
      freedomFighter: toNumber(row.thresholdFreedomFighter),
      julyWarrior: row.thresholdJulyWarrior == null ? null : toNumber(row.thresholdJulyWarrior),
    },
    parentOfDisabledExtra: toNumber(row.parentOfDisabledExtra),
    slabs: slabsOf(row.slabs),
    nonResidentRate: rate(row.nonResidentRate),
    minimumTax: {
      DHAKA_CHATTOGRAM_CITY: toNumber(row.minimumTaxDhakaChattogram),
      OTHER_CITY: toNumber(row.minimumTaxOtherCity),
      ELSEWHERE: toNumber(row.minimumTaxElsewhere),
    },
    minimumTaxFirstReturn: row.minimumTaxFirstReturn == null ? null : toNumber(row.minimumTaxFirstReturn),
    salaryExemption: { fraction: rate(row.salaryExemptionFraction), cap: toNumber(row.salaryExemptionCap) },
    rebate: { incomePct: rate(row.rebateIncomePct), investmentPct: rate(row.rebateInvestmentPct), cap: toNumber(row.rebateCap) },
    netWealthSurcharge: bandsOf(row.netWealthSurcharge),
    surchargeOnRegularTax: row.surchargeOnRegularTax,
    sanchayapatraFinalTax: row.sanchayapatraFinalTax,
    returnDueDate: row.returnDueDate,
    firstReturnDueDate: row.firstReturnDueDate,
    lateFiling: { monthlyRate: rate(row.lateFilingMonthlyRate), maxMonths: row.lateFilingMaxMonths },
  };
}

/** Published rows and the user's own, by income year. */
export const getRuleRows = cache(async (userId: string) => {
  const rows = await db.taxRuleYear.findMany({
    where: { OR: [{ userId: null }, { userId }] },
    orderBy: { incomeYear: "asc" },
  });
  const published = new Map(rows.filter((r) => r.userId == null).map((r) => [r.incomeYear, r]));
  const own = new Map(rows.filter((r) => r.userId != null).map((r) => [r.incomeYear, r]));
  return { published, own };
});

/** The rules in force for the user, one per year: their own copy where they have one. */
export const getUserRules = cache(async (userId: string): Promise<EReturnRules[]> => {
  const { published, own } = await getRuleRows(userId);
  const years = new Set([...published.keys(), ...own.keys()]);
  return [...years].sort().map((y) => toRules((own.get(y) ?? published.get(y))!));
});

/** The rules for one income year, or a stand-in from the nearest year (flagged inexact). */
export async function rulesFor(userId: string, incomeYear: string): Promise<ResolvedEReturnYear> {
  const resolved = pickRules(await getUserRules(userId), incomeYear);
  if (!resolved) throw new Error("No tax rules are stored. Apply the database migrations (npm run db:migrate).");
  return resolved;
}
