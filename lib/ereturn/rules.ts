import type { TaxSlab } from "@/lib/tax-slabs";

// NBR rules an individual's return (IT-11GA) is computed with, keyed by INCOME YEAR
// (1 July – 30 June; the return is filed in the following assessment year).
//
// Deliberately separate from lib/tax-slabs.ts: that file feeds the salary planner's
// estimate, and the return needs more of the Act than slabs — minimum tax by area, the
// salary exemption, the investment rebate as NBR computes it (the lesser of 3% of total
// income, 15% of eligible investment, and ৳10 lakh) and the net wealth surcharge.
//
// ADDING A YEAR: cross-check the Finance Act for that year and add an entry to
// RETURN_YEARS. Until then `resolveEReturnYear` falls back to the latest year it has
// and says so, and the return's checks warn that the figures are an approximation.

export const TAXPAYER_BENEFITS = ["FEMALE", "SENIOR", "THIRD_GENDER", "DISABLED", "FREEDOM_FIGHTER", "PARENT_OF_DISABLED"] as const;
export type TaxpayerBenefit = (typeof TAXPAYER_BENEFITS)[number];

export const MINIMUM_TAX_AREAS = ["DHAKA_CHATTOGRAM_CITY", "OTHER_CITY", "ELSEWHERE"] as const;
export type MinimumTaxArea = (typeof MINIMUM_TAX_AREAS)[number];

export interface EReturnRules {
  /** "2025-26" — the income year. */
  incomeYear: string;
  /** Tax-free band for each special group; the general band otherwise. */
  threshold: {
    general: number;
    femaleOrSenior: number;
    thirdGender: number;
    disabled: number;
    freedomFighter: number;
  };
  /** Added to the band for a parent or guardian of a person with a disability. */
  parentOfDisabledExtra: number;
  /** Slabs above the tax-free band. */
  slabs: TaxSlab[];
  /** A non-resident individual pays this flat rate, with no tax-free band or rebate. */
  nonResidentRate: number;
  /** Tax payable is never below this once income exceeds the tax-free band. */
  minimumTax: Record<MinimumTaxArea, number>;
  /** Part 1, Sixth Schedule: the lesser of this fraction of salary and `cap` is exempt. */
  salaryExemption: { fraction: number; cap: number };
  /** Section 78: the lesser of these, applied to eligible investment made in the year. */
  rebate: { incomePct: number; investmentPct: number; cap: number };
  /** Net wealth surcharge, as a rate on tax payable, from each `above` threshold upwards. */
  netWealthSurcharge: { above: number; rate: number }[];
}

const THRESHOLDS = {
  general: 350000,
  femaleOrSenior: 400000,
  thirdGender: 475000,
  disabled: 475000,
  freedomFighter: 500000,
};

const MINIMUM_TAX: Record<MinimumTaxArea, number> = {
  DHAKA_CHATTOGRAM_CITY: 5000,
  OTHER_CITY: 4000,
  ELSEWHERE: 3000,
};

const ITA_2023_REBATE = { incomePct: 0.03, investmentPct: 0.15, cap: 1000000 };

const SURCHARGE = [
  { above: 40000000, rate: 0.1 },
  { above: 100000000, rate: 0.2 },
  { above: 200000000, rate: 0.3 },
  { above: 500000000, rate: 0.35 },
];

const SLABS_2024: TaxSlab[] = [
  { width: 100000, rate: 0.05 },
  { width: 400000, rate: 0.1 },
  { width: 500000, rate: 0.15 },
  { width: 500000, rate: 0.2 },
  { width: 2000000, rate: 0.25 },
  { width: Infinity, rate: 0.3 },
];

export const RETURN_YEARS: Record<string, EReturnRules> = {
  "2023-24": {
    incomeYear: "2023-24",
    threshold: THRESHOLDS,
    parentOfDisabledExtra: 50000,
    slabs: [
      { width: 100000, rate: 0.05 },
      { width: 300000, rate: 0.1 },
      { width: 400000, rate: 0.15 },
      { width: 500000, rate: 0.2 },
      { width: Infinity, rate: 0.25 },
    ],
    nonResidentRate: 0.3,
    minimumTax: MINIMUM_TAX,
    salaryExemption: { fraction: 1 / 3, cap: 450000 },
    rebate: ITA_2023_REBATE,
    netWealthSurcharge: SURCHARGE,
  },
  "2024-25": {
    incomeYear: "2024-25",
    threshold: THRESHOLDS,
    parentOfDisabledExtra: 50000,
    slabs: SLABS_2024,
    nonResidentRate: 0.3,
    minimumTax: MINIMUM_TAX,
    salaryExemption: { fraction: 1 / 3, cap: 450000 },
    rebate: ITA_2023_REBATE,
    netWealthSurcharge: SURCHARGE,
  },
  // Finance Ordinance 2025 kept 2024-25's slabs for this year and raised the salary
  // exemption ceiling to ৳5 lakh. Checked against a filed AY 2026-27 return.
  "2025-26": {
    incomeYear: "2025-26",
    threshold: THRESHOLDS,
    parentOfDisabledExtra: 50000,
    slabs: SLABS_2024,
    nonResidentRate: 0.3,
    minimumTax: MINIMUM_TAX,
    salaryExemption: { fraction: 1 / 3, cap: 500000 },
    rebate: ITA_2023_REBATE,
    netWealthSurcharge: SURCHARGE,
  },
};

const KNOWN_YEARS = Object.keys(RETURN_YEARS).sort();
const LATEST_KNOWN = KNOWN_YEARS[KNOWN_YEARS.length - 1];

export interface ResolvedEReturnYear {
  rules: EReturnRules;
  /** False when the year had no ruleset of its own and `rules` is a stand-in. */
  exact: boolean;
}

export function resolveEReturnYear(incomeYear: string): ResolvedEReturnYear {
  const rules = RETURN_YEARS[incomeYear];
  if (rules) return { rules, exact: true };
  // Before the earliest year we know, the earliest is the closer stand-in.
  const fallback = incomeYear < KNOWN_YEARS[0] ? KNOWN_YEARS[0] : LATEST_KNOWN;
  return { rules: RETURN_YEARS[fallback], exact: false };
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
  return Math.max(...bands) + (benefits.includes("PARENT_OF_DISABLED") ? rules.parentOfDisabledExtra : 0);
}

export function netWealthSurchargeRate(rules: EReturnRules, netWealth: number): number {
  let rate = 0;
  for (const band of rules.netWealthSurcharge) if (netWealth > band.above) rate = band.rate;
  return rate;
}
