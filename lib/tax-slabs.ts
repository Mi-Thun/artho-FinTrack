// NBR individual income tax rules, keyed by INCOME YEAR (Bangladesh's income year runs
// 1 July – 30 June; the assessment year is the following one).
//
// Bangladesh's Finance Act changes these figures most years — thresholds, slab widths,
// and rates can all move — so a single flat set of constants silently mis-computes any
// year but the one it was written for. Everything downstream (lib/tax.ts) reads only
// from this file via `resolveTaxYear`.
//
// ADDING A YEAR: cross-check the Finance Act / NBR SRO for that year and add an entry to
// TAX_YEARS — nothing else needs to change. `resolveTaxYear` reports whether the
// requested year had its own ruleset, and the UI warns when it didn't, so an unadded
// year degrades to a labelled approximation rather than a silent wrong answer.

export type TaxpayerCategory = "GENERAL" | "FEMALE_OR_SENIOR" | "DISABLED" | "FREEDOM_FIGHTER";

export const TAXPAYER_CATEGORY_LABELS: Record<TaxpayerCategory, string> = {
  GENERAL: "General (male, under 65)",
  FEMALE_OR_SENIOR: "Female / senior citizen (65+)",
  DISABLED: "Person with disability",
  FREEDOM_FIGHTER: "Gazetted war-wounded freedom fighter",
};

/** Amount of income taxed at this rate; `Infinity` for the final open-ended slab. */
export interface TaxSlab {
  width: number;
  rate: number;
}

export interface InvestmentRebateRules {
  /** Rebate is this fraction of the allowable investment. */
  rate: number;
  /** Allowable investment is capped at this fraction of total income... */
  incomePct: number;
  /** ...and at this absolute ceiling. */
  cap: number;
}

export interface TaxYearRules {
  /** e.g. "2024-25" — the income year these rules apply to. */
  incomeYear: string;
  /** e.g. "2025-26" — the assessment year the return is filed in. */
  assessmentYear: string;
  /** Tax-free (0%) band by taxpayer category. */
  taxFreeThreshold: Record<TaxpayerCategory, number>;
  /** Slabs above the tax-free threshold — identical across all categories. */
  slabs: TaxSlab[];
  investmentRebate: InvestmentRebateRules;
}

// Investment tax rebate under the Income Tax Act 2023: rebate = 15% of the lesser of
// (actual eligible investment, 3% of total income, a fixed ceiling).
const ITA_2023_REBATE: InvestmentRebateRules = { rate: 0.15, incomePct: 0.03, cap: 1000000 };

const STANDARD_THRESHOLDS: Record<TaxpayerCategory, number> = {
  GENERAL: 350000,
  FEMALE_OR_SENIOR: 400000,
  DISABLED: 475000,
  FREEDOM_FIGHTER: 500000,
};

export const TAX_YEARS: Record<string, TaxYearRules> = {
  "2023-24": {
    incomeYear: "2023-24",
    assessmentYear: "2024-25",
    taxFreeThreshold: STANDARD_THRESHOLDS,
    slabs: [
      { width: 100000, rate: 0.05 },
      { width: 300000, rate: 0.1 },
      { width: 400000, rate: 0.15 },
      { width: 500000, rate: 0.2 },
      { width: Infinity, rate: 0.25 },
    ],
    investmentRebate: ITA_2023_REBATE,
  },
  "2024-25": {
    incomeYear: "2024-25",
    assessmentYear: "2025-26",
    taxFreeThreshold: STANDARD_THRESHOLDS,
    slabs: [
      { width: 100000, rate: 0.05 },
      { width: 400000, rate: 0.1 },
      { width: 500000, rate: 0.15 },
      { width: 500000, rate: 0.2 },
      { width: 2000000, rate: 0.25 },
      { width: Infinity, rate: 0.3 },
    ],
    investmentRebate: ITA_2023_REBATE,
  },
};

/** Income years with their own ruleset, oldest first. */
export const INCOME_YEARS: string[] = Object.keys(TAX_YEARS).sort();

export const LATEST_INCOME_YEAR: string = INCOME_YEARS[INCOME_YEARS.length - 1];

/** The Bangladeshi income year (1 July – 30 June) that `date` falls in. */
export function incomeYearForDate(date: Date): string {
  const year = date.getUTCFullYear();
  const startYear = date.getUTCMonth() >= 6 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export interface ResolvedTaxYear {
  /** The income year the caller asked for. */
  requested: string;
  /** Rules actually used — the requested year's if defined, else the latest defined. */
  rules: TaxYearRules;
  /** False when `requested` had no ruleset and `rules` is a stand-in. */
  exact: boolean;
}

/**
 * Resolves an income year to its ruleset. An unknown year falls back to the most recent
 * defined one with `exact: false`, so callers can label the result as an approximation
 * instead of presenting another year's figures as authoritative.
 */
export function resolveTaxYear(requested?: string | null): ResolvedTaxYear {
  const key = requested ?? LATEST_INCOME_YEAR;
  const rules = TAX_YEARS[key];
  if (rules) return { requested: key, rules, exact: true };
  return { requested: key, rules: TAX_YEARS[LATEST_INCOME_YEAR], exact: false };
}
