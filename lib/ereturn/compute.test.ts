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

// A salaried taxpayer in Dhaka, income year 2025-26 (AY 2026-27), from real documents:
// salary schedule, bank tax certificates, Sanchayapatra TDS and the employer's challans.
function filedReturn(overrides: Partial<EReturnInput> = {}): EReturnInput {
  return {
    incomeYear: "2025-26",
    resident: true,
    benefits: [],
    dateOfBirth: d("2001-01-01"),
    area: "DHAKA_CHATTOGRAM_CITY",
    lines: {
      "salary.basic": 396000,
      "salary.allowances": 319000,
      "lifestyle.food": 84000,
      "lifestyle.housing": 90000,
      "lifestyle.utility": 23500,
      "lifestyle.festival": 19847,
      "asset.furniture": 565000,
    },
    financialAssets: [
      { kind: "BANK_ACCOUNT", value: 99.8, income: 0, taxDeducted: 0, openedDate: null },
      { kind: "BANK_ACCOUNT", value: 22952, income: 22, taxDeducted: 4, openedDate: null },
      { kind: "SANCHAYAPATRA", value: 100000, income: 11040, taxDeducted: 552, openedDate: d("2024-05-13") },
      { kind: "SANCHAYAPATRA", value: 100000, income: 12300, taxDeducted: 769, openedDate: d("2025-04-13") },
    ],
    payments: [
      ...Array.from({ length: 6 }, () => ({ kind: "SALARY_TDS" as const, amount: 417 })),
      ...Array.from({ length: 6 }, () => ({ kind: "SALARY_TDS" as const, amount: 900 })),
    ],
    investments: [{ kind: "GOVT_SECURITIES", amount: 200000, date: null }],
    previousNetWealth: 277750,
    lastYearTaxPaid: 0,
    environmentalSurcharge: 0,
    delayInterest: 0,
    ...overrides,
  };
}

describe("computeEReturn — the filed AY 2026-27 return", () => {
  // The filed return shows ৳21,876 of financial-asset income; the certificates add up to
  // ৳23,362. With the filed figure, every other line of the return is reproduced.
  const asFiled = filedReturn();
  asFiled.financialAssets = asFiled.financialAssets.map((a, i) => (i === 3 ? { ...a, income: 21876 - 22 - 11040 } : a));
  const r = computeEReturn(asFiled);

  it("works out the salary schedule", () => {
    expect(r.salary.gross).toBe(715000);
    expect(r.salary.exempt).toBe(238333);
    expect(r.salary.taxable).toBe(476667);
  });

  it("totals income and tax as NBR did", () => {
    expect(r.income.financialAssets).toBe(21876);
    expect(r.income.total).toBe(498543);
    expect(r.tax.grossTax).toBe(9854);
    // Line 13 prints the rebate the Act allows: 3% of income, below 15% of ৳2 lakh.
    expect(r.tax.rebateAllowed).toBe(14956);
    expect(r.tax.rebateByInvestment).toBe(30000);
    expect(r.tax.netTax).toBe(0);
    expect(r.tax.minimumTax).toBe(5000);
    expect(r.tax.minimumTaxApplies).toBe(true);
    expect(r.tax.taxPayable).toBe(5000);
    expect(r.tax.totalPayable).toBe(5000);
  });

  it("totals tax paid and the excess", () => {
    expect(r.paid.tdsSalary).toBe(7902);
    expect(r.paid.tdsFinancial).toBe(1325);
    expect(r.paid.tds).toBe(9227);
    expect(r.paid.excess).toBe(4227);
    expect(r.paid.due).toBe(0);
    expect(r.exemptIncome.total).toBe(238333);
  });

  it("builds IT-10BB and a balanced IT-10B", () => {
    expect(r.lifestyle.taxPaid).toBe(9227);
    expect(r.lifestyle.total).toBe(226574);
    expect(r.wealth.sources.total).toBe(736876);
    expect(r.wealth.fundsAvailable).toBe(1014626);
    expect(r.wealth.netWealth).toBe(788052);
    expect(r.wealth.grossWealth).toBe(788052);
    expect(r.wealth.assets.financial.sanchayapatraDps).toBe(200000);
    expect(r.wealth.assets.cash.bank).toBe(23052);
    expect(r.wealth.assets.total).toBe(788052);
    expect(r.wealth.difference).toBe(0);
  });

  it("flags the Sanchayapatra rebate: neither certificate was bought in 2025-26", () => {
    expect(r.unsupportedSecuritiesClaim).toBe(200000);
    // Without the rebate the gross tax stands, above the minimum.
    expect(r.taxPayableWithoutUnsupported).toBe(9854);
  });
});

describe("computeEReturn — from the certificates", () => {
  const r = computeEReturn(filedReturn());

  it("counts the full interest the bank and Sanchayapatra certificates show", () => {
    expect(r.income.financialAssets).toBe(23362);
    expect(r.income.total).toBe(500029);
    expect(r.tax.taxPayable).toBe(5000);
  });

  it("shows the ৳1,486 the wealth statement is then short by", () => {
    expect(r.wealth.netWealth).toBe(789538);
    expect(r.wealth.difference).toBe(-1486);
  });
});

describe("computeEReturn — rules", () => {
  const base = filedReturn({ investments: [] });

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
