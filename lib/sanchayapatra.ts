// Sanchayapatra — Bangladesh government savings certificates.
//
// These are modelled separately from FixedDeposit because they are statutory products,
// not bank products: the profit rate, the per-NID investment ceiling, the source-tax
// rate, and the profit payment frequency are all fixed by the National Savings
// Directorate, and the ceiling applies ACROSS schemes per holder. Tracking that
// aggregate ceiling is something people genuinely struggle with, and it is the main
// reason this deserves its own module.
//
// ─────────────────────────────────────────────────────────────────────────────
// DATA ACCURACY — READ BEFORE RELYING ON THE NUMBERS
//
// Profit rates and ceilings are revised by government circular, and rates have moved
// several times in recent years (including a move to slab-based rates where a larger
// investment earns a lower rate). The figures below are the last set this module was
// written against and are marked with `lastVerified`. They are NOT continuously
// maintained.
//
// Everything downstream reads only from SCHEMES, so correcting a rate is a one-line
// edit here. `schemeNeedsReview()` reports when an entry is older than a year so the UI
// can tell the user the figure may be stale instead of presenting it as current.
// Cross-check against nationalsavings.gov.bd before treating any of this as advice.
// ─────────────────────────────────────────────────────────────────────────────

import { ZERO, money, toNumber } from "@/lib/money";

export type CertificateScheme =
  | "FIVE_YEAR_BSP"
  | "THREE_MONTH_PROFIT"
  | "PARIWAR"
  | "PENSIONER"
  | "POST_OFFICE_FD"
  | "OTHER";

export type CertificateHolder = "SINGLE" | "JOINT";

export type PayoutFrequency = "MONTHLY" | "QUARTERLY" | "AT_MATURITY";

export interface SchemeDefinition {
  key: CertificateScheme;
  label: string;
  labelBn: string;
  /** Nominal annual profit rate at maturity, as a fraction. */
  annualRate: number;
  tenureMonths: number;
  payout: PayoutFrequency;
  /** Investment ceiling per holder, by holding type. Null where no separate joint limit. */
  ceilingSingle: number | null;
  ceilingJoint: number | null;
  /** Who may buy it — a real constraint on several schemes. */
  eligibility: string;
  /** ISO date the figures were last checked against a published circular. */
  lastVerified: string;
  note?: string;
}

/** Source tax on profit is tiered by the holder's total investment across all schemes. */
export const SOURCE_TAX_LOW = 0.05;
export const SOURCE_TAX_HIGH = 0.1;
export const SOURCE_TAX_THRESHOLD = 500000;

export const SCHEMES: Record<Exclude<CertificateScheme, "OTHER">, SchemeDefinition> = {
  FIVE_YEAR_BSP: {
    key: "FIVE_YEAR_BSP",
    label: "5-Year Bangladesh Sanchayapatra",
    labelBn: "৫-বছর মেয়াদি বাংলাদেশ সঞ্চয়পত্র",
    annualRate: 0.1128,
    tenureMonths: 60,
    payout: "AT_MATURITY",
    ceilingSingle: 3000000,
    ceilingJoint: 6000000,
    eligibility: "Any adult Bangladeshi citizen.",
    lastVerified: "2025-01-01",
    note: "Profit compounds and is paid on encashment; early encashment pays a reduced rate.",
  },
  THREE_MONTH_PROFIT: {
    key: "THREE_MONTH_PROFIT",
    label: "3-Monthly Profit-Bearing Sanchayapatra",
    labelBn: "৩-মাস অন্তর মুনাফাভিত্তিক সঞ্চয়পত্র",
    annualRate: 0.1104,
    tenureMonths: 36,
    payout: "QUARTERLY",
    ceilingSingle: 3000000,
    ceilingJoint: 6000000,
    eligibility: "Any adult Bangladeshi citizen.",
    lastVerified: "2025-01-01",
    note: "Pays out every three months — commonly used as an income substitute.",
  },
  PARIWAR: {
    key: "PARIWAR",
    label: "Pariwar Sanchayapatra",
    labelBn: "পরিবার সঞ্চয়পত্র",
    annualRate: 0.1152,
    tenureMonths: 60,
    payout: "MONTHLY",
    ceilingSingle: 4500000,
    ceilingJoint: null,
    eligibility: "Women 18+, physically disabled persons, and men aged 65+.",
    lastVerified: "2025-01-01",
    note: "Single-holder only. Monthly payout makes it the standard retirement-income product.",
  },
  PENSIONER: {
    key: "PENSIONER",
    label: "Pensioner Sanchayapatra",
    labelBn: "পেনশনার সঞ্চয়পত্র",
    annualRate: 0.1176,
    tenureMonths: 60,
    payout: "QUARTERLY",
    ceilingSingle: 5000000,
    ceilingJoint: null,
    eligibility: "Retired government, semi-government, and autonomous body employees.",
    lastVerified: "2025-01-01",
    note: "Purchased from retirement benefits; highest statutory rate of the schemes.",
  },
  POST_OFFICE_FD: {
    key: "POST_OFFICE_FD",
    label: "Post Office Fixed Deposit",
    labelBn: "ডাকঘর সঞ্চয় ব্যাংক (মেয়াদি)",
    annualRate: 0.1132,
    tenureMonths: 36,
    payout: "AT_MATURITY",
    ceilingSingle: 3000000,
    ceilingJoint: 6000000,
    eligibility: "Any Bangladeshi citizen.",
    lastVerified: "2025-01-01",
  },
};

export const SCHEME_KEYS = Object.keys(SCHEMES) as Exclude<CertificateScheme, "OTHER">[];

export function schemeDefinition(scheme: CertificateScheme): SchemeDefinition | null {
  return scheme === "OTHER" ? null : SCHEMES[scheme];
}

/** True when a scheme's figures are older than a year and should be re-checked. */
export function schemeNeedsReview(scheme: SchemeDefinition, asOf: Date): boolean {
  const verified = new Date(`${scheme.lastVerified}T00:00:00Z`);
  const ageDays = (asOf.getTime() - verified.getTime()) / 86400000;
  return ageDays > 365;
}

/** Source tax rate on profit, tiered by the holder's total investment across schemes. */
export function sourceTaxRate(totalInvestmentAcrossSchemes: number): number {
  return totalInvestmentAcrossSchemes > SOURCE_TAX_THRESHOLD ? SOURCE_TAX_HIGH : SOURCE_TAX_LOW;
}

// ---------------------------------------------------------------------------
// Per-certificate projection
// ---------------------------------------------------------------------------

export interface CertificateInput {
  id?: string;
  scheme: CertificateScheme;
  label: string;
  principal: unknown;
  purchaseDate: Date;
  holderType: CertificateHolder;
  encashedAt?: Date | null;
}

export interface CertificateProjection {
  label: string;
  scheme: CertificateScheme;
  schemeLabel: string;
  principal: number;
  purchaseDate: Date;
  maturityDate: Date;
  annualRate: number;
  payout: PayoutFrequency;
  /** Gross profit per payout period (0 for AT_MATURITY schemes). */
  grossPerPayout: number;
  netPerPayout: number;
  /** Total gross profit accrued from purchase to `asOf`, capped at maturity. */
  grossProfitToDate: number;
  netProfitToDate: number;
  /** Total gross profit over the full term. */
  grossProfitAtMaturity: number;
  netProfitAtMaturity: number;
  nextPayoutDate: Date | null;
  isMatured: boolean;
  isEncashed: boolean;
}

function payoutsPerYear(payout: PayoutFrequency): number {
  if (payout === "MONTHLY") return 12;
  if (payout === "QUARTERLY") return 4;
  return 0;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Clamp when the target month is shorter (31 Jan + 1 month).
  if (d.getUTCDate() < day) d.setUTCDate(0);
  return d;
}

function monthsBetween(from: Date, to: Date): number {
  const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  return to.getUTCDate() < from.getUTCDate() ? months - 1 : months;
}

export function projectCertificate(
  input: CertificateInput,
  asOf: Date,
  taxRate: number,
): CertificateProjection {
  const definition = schemeDefinition(input.scheme);
  const annualRate = definition?.annualRate ?? 0;
  const tenureMonths = definition?.tenureMonths ?? 60;
  const payout = definition?.payout ?? "AT_MATURITY";

  const principal = money(input.principal);
  const maturityDate = addMonths(input.purchaseDate, tenureMonths);
  const effectiveAsOf = asOf < maturityDate ? asOf : maturityDate;

  const perYear = payoutsPerYear(payout);
  const grossPerPayout = perYear > 0 ? toNumber(principal.times(annualRate).dividedBy(perYear)) : 0;
  const netPerPayout = toNumber(money(grossPerPayout).times(1 - taxRate));

  const elapsedMonths = Math.max(monthsBetween(input.purchaseDate, effectiveAsOf), 0);

  let grossToDate = ZERO;
  let nextPayoutDate: Date | null = null;

  if (perYear > 0) {
    const monthsPerPayout = 12 / perYear;
    const payoutsSoFar = Math.floor(elapsedMonths / monthsPerPayout);
    grossToDate = money(grossPerPayout).times(payoutsSoFar);
    const upcoming = addMonths(input.purchaseDate, (payoutsSoFar + 1) * monthsPerPayout);
    nextPayoutDate = upcoming <= maturityDate ? upcoming : null;
  } else {
    // Accrues continuously, realised on encashment.
    grossToDate = principal.times(annualRate).times(elapsedMonths / 12);
    nextPayoutDate = asOf < maturityDate ? maturityDate : null;
  }

  const grossAtMaturity = toNumber(principal.times(annualRate).times(tenureMonths / 12));

  return {
    label: input.label,
    scheme: input.scheme,
    schemeLabel: definition?.label ?? "Other certificate",
    principal: toNumber(principal),
    purchaseDate: input.purchaseDate,
    maturityDate,
    annualRate,
    payout,
    grossPerPayout,
    netPerPayout,
    grossProfitToDate: toNumber(grossToDate),
    netProfitToDate: toNumber(grossToDate.times(1 - taxRate)),
    grossProfitAtMaturity: grossAtMaturity,
    netProfitAtMaturity: toNumber(money(grossAtMaturity).times(1 - taxRate)),
    nextPayoutDate,
    isMatured: asOf >= maturityDate,
    isEncashed: input.encashedAt != null,
  };
}

// ---------------------------------------------------------------------------
// Ceiling tracking — the part people actually get wrong
// ---------------------------------------------------------------------------

export interface CeilingUsage {
  scheme: CertificateScheme;
  schemeLabel: string;
  ceiling: number | null;
  invested: number;
  remaining: number | null;
  /** Fraction of the ceiling used, 0–1. Null when the scheme has no ceiling. */
  utilisation: number | null;
  isOverCeiling: boolean;
}

/**
 * Investment against each scheme's per-holder ceiling. Encashed certificates are
 * excluded — the ceiling applies to live holdings.
 */
export function ceilingUsage(certificates: CertificateInput[]): CeilingUsage[] {
  const live = certificates.filter((c) => c.encashedAt == null);

  return SCHEME_KEYS.map((key) => {
    const definition = SCHEMES[key];
    const forScheme = live.filter((c) => c.scheme === key);

    const invested = forScheme.reduce((sum, c) => sum.plus(money(c.principal)), ZERO);
    // A joint holding is assessed against the joint ceiling where the scheme has one.
    const anyJoint = forScheme.some((c) => c.holderType === "JOINT");
    const ceiling = anyJoint && definition.ceilingJoint != null ? definition.ceilingJoint : definition.ceilingSingle;

    const investedNumber = toNumber(invested);
    return {
      scheme: key,
      schemeLabel: definition.label,
      ceiling,
      invested: investedNumber,
      remaining: ceiling == null ? null : Math.max(ceiling - investedNumber, 0),
      utilisation: ceiling && ceiling > 0 ? investedNumber / ceiling : null,
      isOverCeiling: ceiling != null && investedNumber > ceiling,
    };
  });
}

export interface CertificatePortfolio {
  projections: CertificateProjection[];
  totalPrincipal: number;
  totalNetProfitToDate: number;
  /** Source tax rate applied, derived from total investment. */
  appliedTaxRate: number;
  ceilings: CeilingUsage[];
  /** Payouts due in the next 90 days, soonest first. */
  upcomingPayouts: { label: string; date: Date; amount: number }[];
}

export function buildCertificatePortfolio(certificates: CertificateInput[], asOf: Date): CertificatePortfolio {
  const live = certificates.filter((c) => c.encashedAt == null);
  const totalPrincipal = live.reduce((sum, c) => sum.plus(money(c.principal)), ZERO);
  const appliedTaxRate = sourceTaxRate(toNumber(totalPrincipal));

  const projections = certificates.map((c) => projectCertificate(c, asOf, appliedTaxRate));

  const horizon = new Date(asOf.getTime() + 90 * 86400000);
  const upcomingPayouts = projections
    .filter((p) => !p.isEncashed && p.nextPayoutDate != null && p.nextPayoutDate <= horizon)
    .map((p) => ({
      label: p.label,
      date: p.nextPayoutDate!,
      amount: p.payout === "AT_MATURITY" ? p.netProfitAtMaturity : p.netPerPayout,
    }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    projections,
    totalPrincipal: toNumber(totalPrincipal),
    totalNetProfitToDate: projections
      .filter((p) => !p.isEncashed)
      .reduce((sum, p) => sum + p.netProfitToDate, 0),
    appliedTaxRate,
    ceilings: ceilingUsage(certificates),
    upcomingPayouts,
  };
}
