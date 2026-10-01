import { describe, expect, it } from "vitest";
import { computeEReturn, type EReturnInput } from "./compute";
import {
  ageAtYearEnd,
  assessmentYearOf,
  incomeYearForDate,
  isIncomeYear,
  monthsLate,
  pickRules,
  returnDueDate,
  taxFreeThreshold,
  type EReturnRules,
} from "./rules";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

// The rules as Income Tax Paripatra 2025-26 sets them. The published 2024-25 row has these
// figures; the 2025-26 row follows NBR's eReturn site instead (RULES_NBR_SITE_2025_26). Tax year 2025-26 is income year 2024-25 (§2.1); tax year 2026-27 is income
// year 2025-26 (§1.1).
const common = {
  source: "test",
  own: false,
  parentOfDisabledExtra: 50000,
  nonResidentRate: 0.3,
  salaryExemption: { fraction: 1 / 3, cap: 500000 },
  rebate: { incomePct: 0.03, investmentPct: 0.15, cap: 1000000 },
  netWealthSurcharge: [
    { above: 40000000, rate: 0.1 },
    { above: 100000000, rate: 0.2 },
    { above: 200000000, rate: 0.3 },
    { above: 500000000, rate: 0.35 },
  ],
  sanchayapatraFinalTax: true,
  returnDueDate: "11-30",
  firstReturnDueDate: "06-30",
  lateFiling: { monthlyRate: 0.02, maxMonths: 24 },
};

const RULES_2024_25: EReturnRules = {
  ...common,
  incomeYear: "2024-25",
  threshold: { general: 350000, femaleOrSenior: 400000, thirdGender: 475000, disabled: 475000, freedomFighter: 500000, julyWarrior: null },
  slabs: [
    { width: 100000, rate: 0.05 },
    { width: 400000, rate: 0.1 },
    { width: 500000, rate: 0.15 },
    { width: 500000, rate: 0.2 },
    { width: 2000000, rate: 0.25 },
    { width: Infinity, rate: 0.3 },
  ],
  minimumTax: { DHAKA_CHATTOGRAM_CITY: 5000, OTHER_CITY: 4000, ELSEWHERE: 3000 },
  minimumTaxFirstReturn: null,
  surchargeOnRegularTax: false,
};

const RULES_2025_26: EReturnRules = {
  ...common,
  incomeYear: "2025-26",
  threshold: { general: 375000, femaleOrSenior: 425000, thirdGender: 500000, disabled: 500000, freedomFighter: 525000, julyWarrior: 525000 },
  slabs: [
    { width: 300000, rate: 0.1 },
    { width: 400000, rate: 0.15 },
    { width: 500000, rate: 0.2 },
    { width: 2000000, rate: 0.25 },
    { width: Infinity, rate: 0.3 },
  ],
  minimumTax: { DHAKA_CHATTOGRAM_CITY: 5000, OTHER_CITY: 5000, ELSEWHERE: 5000 },
  minimumTaxFirstReturn: 1000,
  surchargeOnRegularTax: true,
};

// Income year 2025-26 as NBR's eReturn site computes it, which the published row follows:
// the 2024-25 rates and bands, Sanchayapatra profit at the slab rates, the rebate limit on
// total income, the Paripatra's minimum tax.
const RULES_NBR_SITE_2025_26: EReturnRules = {
  ...RULES_2025_26,
  threshold: { ...RULES_2024_25.threshold, julyWarrior: 500000 },
  slabs: RULES_2024_25.slabs,
  sanchayapatraFinalTax: false,
};

const exact = (rules: EReturnRules) => ({ rules, exact: true });

function input(overrides: Partial<EReturnInput> = {}): EReturnInput {
  return {
    incomeYear: "2025-26",
    resident: true,
    benefits: [],
    dateOfBirth: d("1990-03-15"),
    area: "DHAKA_CHATTOGRAM_CITY",
    firstReturn: false,
    filedOn: d("2026-09-30"),
    lines: {},
    financialAssets: [],
    payments: [],
    investments: [],
    previousNetWealth: 0,
    lastYearTaxPaid: 0,
    environmentalSurcharge: 0,
    delayInterest: 0,
    ...overrides,
  };
}

// A fictional salaried taxpayer in Dhaka, income year 2025-26 (tax year 2026-27). Every
// figure is made up; the expected values are worked out by hand.
function taxpayer(overrides: Partial<EReturnInput> = {}): EReturnInput {
  return input({
    lines: {
      "salary.basic": 600000,
      "salary.allowances": 300000,
      "lifestyle.food": 120000,
      "lifestyle.housing": 150000,
      "lifestyle.utility": 30000,
      "lifestyle.festival": 25000,
      "asset.furniture": 804769,
    },
    financialAssets: [
      { kind: "BANK_ACCOUNT", value: 5000.5, income: 50, taxDeducted: 5, openedDate: null },
      { kind: "BANK_ACCOUNT", value: 12000, income: 0, taxDeducted: 0, openedDate: null },
      { kind: "SANCHAYAPATRA", value: 100000, income: 10000, taxDeducted: 500, openedDate: d("2024-08-10") },
      { kind: "SANCHAYAPATRA", value: 50000, income: 5500, taxDeducted: 275, openedDate: d("2025-02-20") },
    ],
    payments: Array.from({ length: 12 }, () => ({ kind: "SALARY_TDS" as const, amount: 1500 })),
    investments: [{ kind: "GOVT_SECURITIES", amount: 150000, date: null }],
    previousNetWealth: 400000,
    ...overrides,
  });
}

describe("computeEReturn — a salaried taxpayer, tax year 2026-27", () => {
  const r = computeEReturn(taxpayer(), exact(RULES_2025_26));

  it("works out the salary schedule", () => {
    expect(r.salary.gross).toBe(900000);
    expect(r.salary.exempt).toBe(300000);
    expect(r.salary.taxable).toBe(600000);
  });

  it("keeps Sanchayapatra profit out of the slabs and adds its deducted tax as final", () => {
    expect(r.income.financialAssets).toBe(15550);
    expect(r.income.total).toBe(615550);
    expect(r.tax.finalTaxIncome).toBe(15500);
    expect(r.tax.regularIncome).toBe(600050);
    // 2,25,050 above ৳3.75 lakh at 10%, plus ৳775 final tax.
    expect(r.tax.finalTax).toBe(775);
    expect(r.tax.grossTax).toBe(23280);
  });

  it("takes the 3% limit on income without final-tax income", () => {
    expect(r.tax.rebateBase).toBe(600050);
    expect(r.tax.rebateByIncome).toBe(18002);
    expect(r.tax.rebateAllowed).toBe(18002);
    expect(r.tax.netTax).toBe(5278);
    expect(r.tax.minimumTaxApplies).toBe(false);
    expect(r.tax.taxPayable).toBe(5278);
  });

  it("totals tax paid and the excess", () => {
    expect(r.paid.tds).toBe(18780);
    expect(r.paid.excess).toBe(13502);
  });

  it("builds a balanced IT-10B", () => {
    expect(r.lifestyle.total).toBe(343780);
    expect(r.wealth.netWealth).toBe(971770);
    expect(r.wealth.difference).toBe(0);
  });

  it("flags a Sanchayapatra rebate when none was bought in the income year", () => {
    expect(r.unsupportedSecuritiesClaim).toBe(150000);
    expect(r.taxPayableWithoutUnsupported).toBe(23280);
  });

  it("isn't late when filed by 30 November", () => {
    expect(r.tax.lateFiling.due).toEqual(d("2026-11-30"));
    expect(r.tax.lateFiling.months).toBe(0);
    expect(r.tax.delayInterest).toBe(0);
  });

  it("loses the rebate and adds 2% a month when filed late", () => {
    const late = computeEReturn(taxpayer({ filedOn: d("2027-01-16") }), exact(RULES_2025_26));
    expect(late.tax.lateFiling.months).toBe(2);
    expect(late.tax.rebateLostToLateFiling).toBe(true);
    expect(late.tax.taxPayable).toBe(23280);
    // (23,280 − 18,780) × 2 × 2%
    expect(late.tax.lateFiling.charge).toBe(180);
    expect(late.tax.delayInterest).toBe(180);
  });
});

describe("Income Tax Paripatra 2025-26 worked examples", () => {
  it("example 12: final tax, deposit interest, firm share credit and the rebate base", () => {
    // Tax year 2025-26. A woman with rent ৳4 lakh, bank interest ৳3 lakh (৳30,000 deducted),
    // Sanchayapatra profit ৳2.5 lakh (৳25,000 deducted), a ¼ firm share of ৳5 lakh, and
    // ৳2 lakh of new Sanchayapatra.
    const r = computeEReturn(
      input({
        incomeYear: "2024-25",
        filedOn: d("2025-11-01"),
        benefits: ["FEMALE"],
        lines: { "income.rent": 400000, "income.firmShare": 500000 },
        financialAssets: [
          { kind: "BANK_ACCOUNT", value: 0, income: 300000, taxDeducted: 30000, openedDate: null },
          { kind: "SANCHAYAPATRA", value: 200000, income: 250000, taxDeducted: 25000, openedDate: d("2025-01-10") },
        ],
        investments: [{ kind: "GOVT_SECURITIES", amount: 200000, date: d("2025-01-10") }],
      }),
      exact(RULES_2024_25),
    );
    expect(r.income.total).toBe(1450000);
    expect(r.tax.grossTax).toBe(115000);
    expect(r.tax.depositTaxTopUp).toBe(0);
    expect(r.tax.firmShareCredit).toBe(39655);
    expect(r.tax.rebateByIncome).toBe(21000);
    expect(r.tax.taxPayable).toBe(54345);
    expect(r.paid.excess).toBe(655);
  });

  it("raises tax on deposit interest to what the bank deducted", () => {
    const r = computeEReturn(
      input({ lines: { "salary.basic": 600000 }, financialAssets: [{ kind: "BANK_ACCOUNT", value: 0, income: 10000, taxDeducted: 1000, openedDate: null }] }),
      exact(RULES_2025_26),
    );
    // ৳4 lakh taxable salary + ৳10,000 interest: 35,000 above the band at 10% = 3,500, of
    // which the interest adds 1,000 — exactly what the bank took, so nothing is added.
    expect(r.tax.depositTaxTopUp).toBe(0);
    const low = computeEReturn(
      input({ lines: { "salary.basic": 450000 }, financialAssets: [{ kind: "BANK_ACCOUNT", value: 0, income: 10000, taxDeducted: 1000, openedDate: null }] }),
      exact(RULES_2025_26),
    );
    // ৳3 lakh salary + ৳10,000 interest is under the band: the bank's ৳1,000 still stands.
    expect(low.tax.depositTaxTopUp).toBe(1000);
    expect(low.tax.grossTax).toBe(1000);
  });

  it("example 15: filed two months late", () => {
    // Tax year 2025-26: salary ৳12 lakh, business ৳15 lakh, ৳60,000 TDS and ৳25,000 advance
    // tax, filed on 16 January 2026.
    const r = computeEReturn(
      input({
        incomeYear: "2024-25",
        filedOn: d("2026-01-16"),
        lines: { "salary.basic": 1200000, "income.business": 1500000 },
        payments: [
          { kind: "SALARY_TDS", amount: 60000 },
          { kind: "ADVANCE_TAX", amount: 25000 },
        ],
        investments: [{ kind: "GOVT_SECURITIES", amount: 500000, date: d("2025-01-01") }],
      }),
      exact(RULES_2024_25),
    );
    expect(r.salary.exempt).toBe(400000);
    expect(r.tax.grossTax).toBe(332500);
    expect(r.tax.rebate).toBe(0);
    expect(r.tax.lateFiling.months).toBe(2);
    expect(r.tax.lateFiling.charge).toBe(9900);
    expect(r.tax.totalPayable).toBe(342400);
  });

  it("example 1: from 2026-27 the surcharge is on tax at regular rates", () => {
    const wealthy = (rules: EReturnRules, incomeYear: string) =>
      computeEReturn(input({ incomeYear, lines: { "income.business": 2000000, "asset.nonAgriProperty": 51000000 } }), exact(rules));
    const later = wealthy(RULES_2025_26, "2025-26");
    expect(later.tax.grossTax).toBe(296250);
    expect(later.tax.netWealthSurcharge).toBe(29625);
    const earlier = wealthy(RULES_2024_25, "2024-25");
    expect(earlier.tax.grossTax).toBe(257500);
    expect(earlier.tax.netWealthSurcharge).toBe(25750);
  });
});

describe("computeEReturn — rules", () => {
  const run = (overrides: Partial<EReturnInput>, rules = RULES_2025_26) => computeEReturn(input(overrides), exact(rules));

  it("pays no tax, and no minimum tax, at or below the tax-free band", () => {
    const r = run({ lines: { "salary.basic": 562500 } });
    expect(r.income.total).toBe(375000);
    expect(r.tax.grossTax).toBe(0);
    expect(r.tax.minimumTax).toBe(0);
  });

  it("caps the salary exemption", () => {
    expect(run({ lines: { "salary.basic": 3000000 } }).salary.exempt).toBe(500000);
  });

  it("limits the rebate by 15% of investment when that's lowest, and caps DPS at ৳1.2 lakh", () => {
    const r = run({ lines: { "salary.basic": 3000000 }, investments: [{ kind: "DEPOSIT_PENSION", amount: 200000, date: null }] });
    expect(r.tax.eligibleInvestment).toBe(120000);
    expect(r.tax.rebate).toBe(18000);
  });

  it("uses a flat minimum from 2026-27, the area's before, and ৳1,000 for a first return", () => {
    const lines = { "salary.basic": 600000 };
    const investments = [{ kind: "ZAKAT" as const, amount: 1000000, date: null }];
    expect(run({ lines, investments, area: "ELSEWHERE" }).tax.taxPayable).toBe(5000);
    expect(run({ lines, investments, area: "ELSEWHERE", incomeYear: "2024-25" }, RULES_2024_25).tax.taxPayable).toBe(3000);
    const first = run({ lines, investments, firstReturn: true });
    expect(first.tax.taxPayable).toBe(1000);
    expect(first.tax.minimumTaxBasis).toBe("firstReturn");
  });

  it("gives a first-time filer until 30 June the following year", () => {
    const r = run({ firstReturn: true, filedOn: d("2027-06-01") });
    expect(r.tax.lateFiling.due).toEqual(d("2027-06-30"));
    expect(r.tax.lateFiling.months).toBe(0);
  });

  it("taxes a non-resident at a flat rate with no band or rebate", () => {
    const r = run({ resident: false, lines: { "income.otherSources": 100000 } });
    expect(r.tax.grossTax).toBe(30000);
    expect(r.tax.rebate).toBe(0);
    expect(r.tax.minimumTax).toBe(0);
  });

  it("leaves non-cash benefits out of the sources of fund", () => {
    const r = run({ lines: { "salary.basic": 600000, "salary.transport": 60000 } });
    expect(r.wealth.sources.taxableIncome).toBe(r.income.total - 60000);
  });

  it("counts investments dated outside the income year", () => {
    const r = run({
      investments: [
        { kind: "LIFE_INSURANCE", amount: 10000, date: d("2025-07-01") },
        { kind: "LIFE_INSURANCE", amount: 5000, date: d("2026-07-01") },
      ],
    });
    expect(r.investmentsOutsideYear).toEqual({ count: 1, amount: 5000 });
  });
});

describe("rules helpers", () => {
  it("picks the most generous tax-free band and adds the parent allowance", () => {
    expect(taxFreeThreshold(RULES_2025_26, [], null)).toBe(375000);
    expect(taxFreeThreshold(RULES_2025_26, ["FEMALE"], null)).toBe(425000);
    expect(taxFreeThreshold(RULES_2025_26, ["JULY_WARRIOR"], null)).toBe(525000);
    expect(taxFreeThreshold(RULES_2024_25, ["JULY_WARRIOR"], null)).toBe(350000);
    expect(taxFreeThreshold(RULES_2025_26, ["PARENT_OF_DISABLED"], null)).toBe(425000);
  });

  it("treats 65 at the end of the income year as senior", () => {
    expect(ageAtYearEnd(d("1961-06-30"), "2025-26")).toBe(65);
    expect(ageAtYearEnd(d("1961-07-01"), "2025-26")).toBe(64);
    expect(taxFreeThreshold(RULES_2025_26, [], d("1961-06-30"))).toBe(425000);
  });

  it("names income and assessment years", () => {
    expect(isIncomeYear("2025-26")).toBe(true);
    expect(isIncomeYear("2025-27")).toBe(false);
    expect(assessmentYearOf("2025-26")).toBe("2026-27");
    expect(incomeYearForDate(d("2025-07-01"))).toBe("2025-26");
  });

  it("moves a due date off the weekend", () => {
    // 30 November 2029 is a Friday.
    expect(returnDueDate(RULES_2025_26, "2028-29", false)).toEqual(d("2029-12-02"));
  });

  it("counts a part month as a whole one", () => {
    const due = d("2026-11-30");
    expect(monthsLate(due, d("2026-11-30"))).toBe(0);
    expect(monthsLate(due, d("2026-12-01"))).toBe(1);
    expect(monthsLate(due, d("2026-12-30"))).toBe(1);
    expect(monthsLate(due, d("2026-12-31"))).toBe(2);
  });

  it("falls back to the nearest earlier year and says so", () => {
    const available = [RULES_2024_25, RULES_2025_26];
    expect(pickRules(available, "2025-26")).toEqual({ rules: RULES_2025_26, exact: true });
    expect(pickRules(available, "2028-29")).toEqual({ rules: RULES_2025_26, exact: false });
    expect(pickRules(available, "2019-20")).toEqual({ rules: RULES_2024_25, exact: false });
    expect(pickRules([], "2025-26")).toBeNull();
  });
});

describe("computeEReturn — as NBR's eReturn site computes tax year 2026-27", () => {
  const r = computeEReturn(taxpayer({ investments: [{ kind: "GOVT_SECURITIES", amount: 100000, date: null }] }), exact(RULES_NBR_SITE_2025_26));

  it("taxes Sanchayapatra profit at the slab rates", () => {
    expect(r.income.total).toBe(615550);
    expect(r.tax.finalTax).toBe(0);
    // 615,550 − 350,000 = 265,550: 1,00,000 at 5% + 1,65,550 at 10%.
    expect(r.tax.grossTax).toBe(21555);
  });

  it("takes the rebate limit on total income", () => {
    expect(r.tax.rebateBase).toBe(615550);
    expect(r.tax.rebateAllowed).toBe(15000);
    expect(r.tax.taxPayable).toBe(6555);
    expect(r.paid.excess).toBe(18000 + 780 - 6555);
  });
});
