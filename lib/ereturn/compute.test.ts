import { describe, expect, it } from "vitest";
import { computeEReturn, type EReturnInput } from "./compute";
import {
  ageAtYearEnd,
  assessmentYearOf,
  incomeYearForDate,
  isIncomeYear,
  resolveEReturnYear,
  taxFreeThreshold,
  RETURN_YEARS,
} from "./rules";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

// A fictional salaried taxpayer in Dhaka, income year 2025-26 (AY 2026-27). Every figure
// is made up; the expected values below are worked out by hand.
function taxpayer(overrides: Partial<EReturnInput> = {}): EReturnInput {
  return {
    incomeYear: "2025-26",
    resident: true,
    benefits: [],
    dateOfBirth: d("1990-03-15"),
    area: "DHAKA_CHATTOGRAM_CITY",
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
    lastYearTaxPaid: 0,
    environmentalSurcharge: 0,
    delayInterest: 0,
    ...overrides,
  };
}

describe("computeEReturn — a salaried taxpayer", () => {
  const r = computeEReturn(taxpayer());

  it("works out the salary schedule", () => {
    expect(r.salary.gross).toBe(900000);
    // A third of ৳9 lakh, below the ৳5 lakh ceiling.
    expect(r.salary.exempt).toBe(300000);
    expect(r.salary.taxable).toBe(600000);
  });

  it("totals income and tax", () => {
    expect(r.income.financialAssets).toBe(15550);
    expect(r.income.total).toBe(615550);
    // 2,65,550 above the band: 1,00,000 at 5% + 1,65,550 at 10%.
    expect(r.tax.grossTax).toBe(21555);
    // The least of 3% of income (18,466.5), 15% of ৳1.5 lakh (22,500) and ৳10 lakh.
    expect(r.tax.rebateAllowed).toBe(18467);
    expect(r.tax.rebateByInvestment).toBe(22500);
    expect(r.tax.netTax).toBe(3088);
    expect(r.tax.minimumTax).toBe(5000);
    expect(r.tax.minimumTaxApplies).toBe(true);
    expect(r.tax.taxPayable).toBe(5000);
    expect(r.tax.totalPayable).toBe(5000);
  });

  it("totals tax paid and the excess", () => {
    expect(r.paid.tdsSalary).toBe(18000);
    expect(r.paid.tdsFinancial).toBe(780);
    expect(r.paid.tds).toBe(18780);
    expect(r.paid.excess).toBe(13780);
    expect(r.paid.due).toBe(0);
    expect(r.exemptIncome.total).toBe(300000);
  });

  it("builds IT-10BB and a balanced IT-10B", () => {
    expect(r.lifestyle.taxPaid).toBe(18780);
    expect(r.lifestyle.total).toBe(343780);
    expect(r.wealth.sources.total).toBe(915550);
    expect(r.wealth.fundsAvailable).toBe(1315550);
    expect(r.wealth.netWealth).toBe(971770);
    expect(r.wealth.grossWealth).toBe(971770);
    expect(r.wealth.assets.financial.sanchayapatraDps).toBe(150000);
    expect(r.wealth.assets.cash.bank).toBe(17001);
    expect(r.wealth.assets.total).toBe(971770);
    expect(r.wealth.difference).toBe(0);
  });

  it("flags a Sanchayapatra rebate when none was bought in the income year", () => {
    expect(r.unsupportedSecuritiesClaim).toBe(150000);
    // Without the rebate the gross tax stands, above the minimum.
    expect(r.taxPayableWithoutUnsupported).toBe(21555);
  });

  it("shows how far the wealth statement is out when an asset is undervalued", () => {
    const short = computeEReturn(taxpayer({ lines: { ...taxpayer().lines, "asset.furniture": 800000 } }));
    expect(short.wealth.difference).toBe(-4769);
  });
});

describe("computeEReturn — rules", () => {
  const base = taxpayer({ investments: [] });

  it("pays no tax, and no minimum tax, at or below the tax-free band", () => {
    const r = computeEReturn({ ...base, lines: { "salary.basic": 525000 }, financialAssets: [] });
    expect(r.income.total).toBe(350000);
    expect(r.tax.grossTax).toBe(0);
    expect(r.tax.minimumTax).toBe(0);
    expect(r.tax.taxPayable).toBe(0);
  });

  it("caps the salary exemption", () => {
    const r = computeEReturn({ ...base, lines: { "salary.basic": 3000000 }, financialAssets: [] });
    expect(r.salary.exempt).toBe(500000);
    const older = computeEReturn({ ...base, incomeYear: "2024-25", lines: { "salary.basic": 3000000 }, financialAssets: [] });
    expect(older.salary.exempt).toBe(450000);
  });

  it("limits the rebate by 15% of investment when that's lowest, and caps DPS at ৳1.2 lakh", () => {
    const r = computeEReturn({
      ...base,
      lines: { "salary.basic": 3000000 },
      financialAssets: [],
      investments: [{ kind: "DEPOSIT_PENSION", amount: 200000, date: null }],
    });
    expect(r.tax.eligibleInvestment).toBe(120000);
    expect(r.tax.rebateByInvestment).toBe(18000);
    expect(r.tax.rebate).toBe(18000);
  });

  it("never lets the rebate take tax below zero", () => {
    const r = computeEReturn({ ...base, lines: { "salary.basic": 600000 }, financialAssets: [], investments: [{ kind: "ZAKAT", amount: 1000000, date: null }] });
    expect(r.tax.rebate).toBe(r.tax.grossTax);
    expect(r.tax.netTax).toBe(0);
  });

  it("uses the minimum tax for the area", () => {
    const lines = { "salary.basic": 600000 };
    const investments = [{ kind: "ZAKAT" as const, amount: 1000000, date: null }];
    expect(computeEReturn({ ...base, lines, investments, financialAssets: [], area: "OTHER_CITY" }).tax.taxPayable).toBe(4000);
    expect(computeEReturn({ ...base, lines, investments, financialAssets: [], area: "ELSEWHERE" }).tax.taxPayable).toBe(3000);
  });

  it("taxes a non-resident at a flat rate with no band or rebate", () => {
    const r = computeEReturn({ ...base, resident: false, lines: { "income.otherSources": 100000 }, financialAssets: [] });
    expect(r.tax.grossTax).toBe(30000);
    expect(r.tax.rebate).toBe(0);
    expect(r.tax.minimumTax).toBe(0);
  });

  it("adds the net wealth surcharge above ৳4 crore", () => {
    const r = computeEReturn({ ...base, lines: { "salary.basic": 3000000, "asset.nonAgriProperty": 50000000 }, financialAssets: [] });
    expect(r.tax.netWealthSurchargeRate).toBe(0.1);
    expect(r.tax.netWealthSurcharge).toBe(Math.round(r.tax.taxPayable * 0.1));
  });

  it("leaves non-cash benefits out of the sources of fund", () => {
    const r = computeEReturn({ ...base, lines: { "salary.basic": 600000, "salary.transport": 60000 }, financialAssets: [] });
    expect(r.salary.nonCash).toBe(60000);
    expect(r.wealth.sources.taxableIncome).toBe(r.income.total - 60000);
  });

  it("counts investments dated outside the income year", () => {
    const r = computeEReturn({
      ...base,
      investments: [
        { kind: "LIFE_INSURANCE", amount: 10000, date: d("2025-07-01") },
        { kind: "LIFE_INSURANCE", amount: 5000, date: d("2026-07-01") },
      ],
    });
    expect(r.investmentsOutsideYear).toEqual({ count: 1, amount: 5000 });
  });
});

describe("rules helpers", () => {
  const rules = RETURN_YEARS["2025-26"];

  it("picks the most generous tax-free band and adds the parent allowance", () => {
    expect(taxFreeThreshold(rules, [], null)).toBe(350000);
    expect(taxFreeThreshold(rules, ["FEMALE"], null)).toBe(400000);
    expect(taxFreeThreshold(rules, ["FEMALE", "DISABLED"], null)).toBe(475000);
    expect(taxFreeThreshold(rules, ["PARENT_OF_DISABLED"], null)).toBe(400000);
  });

  it("treats 65 at the end of the income year as senior", () => {
    expect(ageAtYearEnd(d("1961-06-30"), "2025-26")).toBe(65);
    expect(ageAtYearEnd(d("1961-07-01"), "2025-26")).toBe(64);
    expect(taxFreeThreshold(rules, [], d("1961-06-30"))).toBe(400000);
  });

  it("names income and assessment years", () => {
    expect(isIncomeYear("2025-26")).toBe(true);
    expect(isIncomeYear("2025-27")).toBe(false);
    expect(isIncomeYear("1999-00")).toBe(true);
    expect(assessmentYearOf("2025-26")).toBe("2026-27");
    expect(incomeYearForDate(d("2025-06-30"))).toBe("2024-25");
    expect(incomeYearForDate(d("2025-07-01"))).toBe("2025-26");
  });

  it("falls back to the nearest known year and says so", () => {
    expect(resolveEReturnYear("2025-26").exact).toBe(true);
    const later = resolveEReturnYear("2027-28");
    expect(later.exact).toBe(false);
    expect(later.rules.incomeYear).toBe("2025-26");
    expect(resolveEReturnYear("2019-20").rules.incomeYear).toBe("2023-24");
  });
});
