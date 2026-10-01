import type { TaxSlab } from "@/lib/tax-slabs";

// The rules an individual's return (IT-11GA) is computed with, for one INCOME YEAR
// (1 July – 30 June; the return is filed in the following assessment, or tax, year).
//
// The figures themselves live in the database (TaxRuleYear): published rows come from
// NBR's yearly Income Tax Paripatra by migration, and a user may keep their own copy of a
// year. This file is their shape and the arithmetic that only depends on them.

export const TAXPAYER_BENEFITS = ["FEMALE", "SENIOR", "THIRD_GENDER", "DISABLED", "FREEDOM_FIGHTER", "JULY_WARRIOR", "PARENT_OF_DISABLED"] as const;
export type TaxpayerBenefit = (typeof TAXPAYER_BENEFITS)[number];

export const MINIMUM_TAX_AREAS = ["DHAKA_CHATTOGRAM_CITY", "OTHER_CITY", "ELSEWHERE"] as const;
export type MinimumTaxArea = (typeof MINIMUM_TAX_AREAS)[number];

export interface EReturnRules {
  /** "2025-26" — the income year. */
  incomeYear: string;
  /** Where the figures come from, e.g. "Income Tax Paripatra 2025-26, §1.1". */
  source: string;
  /** The user's own copy of the year, rather than the published rules. */
  own: boolean;
  /** Tax-free band for each special group; the general band otherwise. */
  threshold: {
    general: number;
    femaleOrSenior: number;
    thirdGender: number;
    disabled: number;
    freedomFighter: number;
    /** Null when the year has no separate band for gazetted July warriors. */
    julyWarrior: number | null;
  };
  /** Added to the band for a parent or guardian of a person with a disability. */
  parentOfDisabledExtra: number;
  /** Slabs above the tax-free band; the last one's width is Infinity. */
  slabs: TaxSlab[];
  /** A non-resident individual pays this flat rate, with no tax-free band or rebate. */
  nonResidentRate: number;
  /** Tax payable is never below this once income exceeds the tax-free band. */
  minimumTax: Record<MinimumTaxArea, number>;
  /** Minimum tax for a first-time filer, or null when the year has none. */
  minimumTaxFirstReturn: number | null;
  /** Part 1, Sixth Schedule: the lesser of this fraction of salary and `cap` is exempt. */
  salaryExemption: { fraction: number; cap: number };
  /** Section 78: the lesser of these, applied to eligible investment made in the year. */
  rebate: { incomePct: number; investmentPct: number; cap: number };
  /** Net wealth surcharge, as a rate on tax, from each `above` threshold upwards. */
  netWealthSurcharge: { above: number; rate: number }[];
  /** The surcharge is on tax at regular rates (from tax year 2026-27), not on tax payable. */
  surchargeOnRegularTax: boolean;
  /** Tax deducted from Sanchayapatra profit is the final tax on it (section 163(11)). */
  sanchayapatraFinalTax: boolean;
  /** "11-30": the return is due on the first such day after the income year ends. */
  returnDueDate: string;
  /** A first-time filer's due date, or null when it's the general one. */
  firstReturnDueDate: string | null;
  /** Section 174: unpaid tax × rate × months late, for at most `maxMonths`. */
  lateFiling: { monthlyRate: number; maxMonths: number };
}

export interface ResolvedEReturnYear {
  rules: EReturnRules;
  /** False when the year had no rules of its own and `rules` is a stand-in. */
  exact: boolean;
}

/**
 * The rules for an income year from those available: the year's own, else the nearest
 * year before it (the law usually carries over), else the earliest after.
 */
export function pickRules(available: readonly EReturnRules[], incomeYear: string): ResolvedEReturnYear | null {
  if (available.length === 0) return null;
  const exact = available.find((r) => r.incomeYear === incomeYear);
  if (exact) return { rules: exact, exact: true };
  const sorted = [...available].sort((a, b) => a.incomeYear.localeCompare(b.incomeYear));
  const before = sorted.filter((r) => r.incomeYear < incomeYear);
  return { rules: before.length > 0 ? before[before.length - 1] : sorted[0], exact: false };
}

/**
 * The day a return is due: the first `MM-DD` after the income year ends, moved past a
 * Friday or Saturday (the weekend) to the next working day. Public holidays aren't known
 * here, so a due date on one is not moved.
 */
export function returnDueDate(rules: EReturnRules, incomeYear: string, firstReturn: boolean): Date {
  const monthDay = (firstReturn && rules.firstReturnDueDate) || rules.returnDueDate;
  const [month, day] = monthDay.split("-").map(Number);
  const { end } = incomeYearBounds(incomeYear);
  let due = new Date(Date.UTC(end.getUTCFullYear(), month - 1, day));
  if (due <= end) due = new Date(Date.UTC(end.getUTCFullYear() + 1, month - 1, day));
  while (due.getUTCDay() === 5 || due.getUTCDay() === 6) due = new Date(due.getTime() + 86400000);
  return due;
}

/** Whole months from the due date to filing, a part month counting as one (section 174). */
export function monthsLate(due: Date, filed: Date): number {
  if (filed <= due) return 0;
  const months = (filed.getUTCFullYear() - due.getUTCFullYear()) * 12 + (filed.getUTCMonth() - due.getUTCMonth());
  return filed.getUTCDate() > due.getUTCDate() ? months + 1 : Math.max(months, 1);
}

/** "2025-26" — the income year's shape in URLs and the database. */
export const INCOME_YEAR_PATTERN = /^(\d{4})-(\d{2})$/;

export function isIncomeYear(value: string): boolean {
  const match = INCOME_YEAR_PATTERN.exec(value);
  return match != null && (Number(match[1]) + 1) % 100 === Number(match[2]);
}

export function incomeYearOf(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function incomeYearStart(incomeYear: string): number {
  return Number(incomeYear.slice(0, 4));
}

/** "2025-26" → "2026-27": the year the return is filed in. */
export function assessmentYearOf(incomeYear: string): string {
  return incomeYearOf(incomeYearStart(incomeYear) + 1);
}

/** The income year a stored (UTC-midnight) date falls in. */
export function incomeYearForDate(date: Date): string {
  const year = date.getUTCFullYear();
  return incomeYearOf(date.getUTCMonth() >= 6 ? year : year - 1);
}

/** 1 July of the start year to 30 June of the next, as UTC dates. */
export function incomeYearBounds(incomeYear: string): { start: Date; end: Date } {
  const start = incomeYearStart(incomeYear);
  return { start: new Date(Date.UTC(start, 6, 1)), end: new Date(Date.UTC(start + 1, 5, 30)) };
}

export function isWithinIncomeYear(date: Date, incomeYear: string): boolean {
  return incomeYearForDate(date) === incomeYear;
}

/** Age in whole years on the last day of the income year. */
export function ageAtYearEnd(dateOfBirth: Date, incomeYear: string): number {
  const { end } = incomeYearBounds(incomeYear);
  let age = end.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const birthdayPassed =
    end.getUTCMonth() > dateOfBirth.getUTCMonth() ||
    (end.getUTCMonth() === dateOfBirth.getUTCMonth() && end.getUTCDate() >= dateOfBirth.getUTCDate());
  if (!birthdayPassed) age--;
  return age;
}

/** Whether the taxpayer qualifies as 65 or older — ticked, or old enough by date of birth. */
export function isSenior(benefits: readonly TaxpayerBenefit[], dateOfBirth: Date | null, incomeYear: string): boolean {
  return benefits.includes("SENIOR") || (dateOfBirth != null && ageAtYearEnd(dateOfBirth, incomeYear) >= 65);
}

/** The tax-free band: the most generous group the taxpayer is in, plus the parent allowance. */
export function taxFreeThreshold(
  rules: EReturnRules,
  benefits: readonly TaxpayerBenefit[],
  dateOfBirth: Date | null,
): number {
  const t = rules.threshold;
  const bands = [t.general];
  if (benefits.includes("FEMALE") || isSenior(benefits, dateOfBirth, rules.incomeYear)) bands.push(t.femaleOrSenior);
  if (benefits.includes("THIRD_GENDER")) bands.push(t.thirdGender);
  if (benefits.includes("DISABLED")) bands.push(t.disabled);
  if (benefits.includes("FREEDOM_FIGHTER")) bands.push(t.freedomFighter);
  if (benefits.includes("JULY_WARRIOR") && t.julyWarrior != null) bands.push(t.julyWarrior);
  return Math.max(...bands) + (benefits.includes("PARENT_OF_DISABLED") ? rules.parentOfDisabledExtra : 0);
}

export function netWealthSurchargeRate(rules: EReturnRules, netWealth: number): number {
  let rate = 0;
  for (const band of rules.netWealthSurcharge) if (netWealth > band.above) rate = band.rate;
  return rate;
}
