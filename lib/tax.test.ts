import { describe, expect, it } from "vitest";
import { computeInvestmentRebate, computeSlabTax, estimateNetTax } from "./tax";
import {
  INCOME_YEARS,
  LATEST_INCOME_YEAR,
  TAX_YEARS,
  incomeYearForDate,
  resolveTaxYear,
} from "./tax-slabs";

const FY2324 = TAX_YEARS["2023-24"];
const FY2425 = TAX_YEARS["2024-25"];

describe("computeSlabTax", () => {
  it("is zero below the tax-free threshold", () => {
    expect(computeSlabTax(300000, "GENERAL", FY2425)).toBe(0);
  });

  it("uses a higher threshold for FEMALE_OR_SENIOR before any slab applies", () => {
    expect(computeSlabTax(380000, "FEMALE_OR_SENIOR", FY2425)).toBe(0);
    expect(computeSlabTax(380000, "GENERAL", FY2425)).toBeGreaterThan(0);
  });

  it("matches a hand-worked example spanning the first three slabs (2024-25, GENERAL, income 1,000,000)", () => {
    // remaining after threshold: 1,000,000 - 350,000 = 650,000
    // 100,000 @ 5%  = 5,000
    // 400,000 @ 10% = 40,000
    // 150,000 @ 15% = 22,500
    // total = 67,500
    expect(computeSlabTax(1000000, "GENERAL", FY2425)).toBeCloseTo(67500, 5);
  });

  it("matches a hand-worked example spanning every slab including the open-ended top rate (2024-25, GENERAL, income 5,000,000)", () => {
    // remaining after threshold: 5,000,000 - 350,000 = 4,650,000
    // 100,000 @ 5%    = 5,000
    // 400,000 @ 10%   = 40,000
    // 500,000 @ 15%   = 75,000
    // 500,000 @ 20%   = 100,000
    // 2,000,000 @ 25% = 500,000
    // 1,150,000 @ 30% = 345,000
    // total = 1,065,000
    expect(computeSlabTax(5000000, "GENERAL", FY2425)).toBeCloseTo(1065000, 5);
  });

  it("applies 2023-24's narrower slabs to that year (GENERAL, income 1,000,000)", () => {
    // remaining after threshold: 650,000
    // 100,000 @ 5%  = 5,000
    // 300,000 @ 10% = 30,000
    // 250,000 @ 15% = 37,500
    // total = 72,500
    expect(computeSlabTax(1000000, "GENERAL", FY2324)).toBeCloseTo(72500, 5);
  });

  it("gives different answers for different income years — the whole point of year-scoping", () => {
    expect(computeSlabTax(1000000, "GENERAL", FY2324)).not.toBeCloseTo(
      computeSlabTax(1000000, "GENERAL", FY2425),
      5,
    );
  });

  it("caps 2023-24 at its 25% top rate rather than 2024-25's 30%", () => {
    // remaining after threshold: 4,650,000
    // 100,000 @ 5%  = 5,000
    // 300,000 @ 10% = 30,000
    // 400,000 @ 15% = 60,000
    // 500,000 @ 20% = 100,000
    // 3,350,000 @ 25% = 837,500
    // total = 1,032,500
    expect(computeSlabTax(5000000, "GENERAL", FY2324)).toBeCloseTo(1032500, 5);
  });
});

describe("computeInvestmentRebate", () => {
  it("caps at 3% of total income when that's the binding constraint", () => {
    // 3% of 1,000,000 = 30,000 < eligible investment of 200,000
    // rebate = 30,000 * 15% = 4,500
    expect(computeInvestmentRebate(1000000, 200000, FY2425)).toBeCloseTo(4500, 5);
  });

  it("caps at the actual eligible investment when that's the binding constraint", () => {
    // 3% of 10,000,000 = 300,000 > eligible investment of 50,000
    // rebate = 50,000 * 15% = 7,500
    expect(computeInvestmentRebate(10000000, 50000, FY2425)).toBeCloseTo(7500, 5);
  });

  it("caps at the fixed ceiling when that's the binding constraint", () => {
    // 3% of 100,000,000 = 3,000,000; eligible investment 5,000,000; fixed cap 1,000,000
    // rebate = 1,000,000 * 15% = 150,000
    expect(computeInvestmentRebate(100000000, 5000000, FY2425)).toBeCloseTo(150000, 5);
  });
});

describe("estimateNetTax", () => {
  it("never lets the rebate push net tax below zero", () => {
    const result = estimateNetTax({
      totalIncome: 360000,
      category: "GENERAL",
      eligibleInvestment: 1000000,
      rules: FY2425,
    });
    expect(result.netTax).toBeGreaterThanOrEqual(0);
  });

  it("nets the rebate off the gross slab tax", () => {
    const result = estimateNetTax({
      totalIncome: 1000000,
      category: "GENERAL",
      eligibleInvestment: 200000,
      rules: FY2425,
    });
    expect(result.grossTax).toBeCloseTo(67500, 5);
    expect(result.rebate).toBeCloseTo(4500, 5);
    expect(result.netTax).toBeCloseTo(63000, 5);
  });
});

describe("incomeYearForDate", () => {
  it("puts July onward in the income year starting that calendar year", () => {
    expect(incomeYearForDate(new Date(Date.UTC(2024, 6, 1)))).toBe("2024-25");
    expect(incomeYearForDate(new Date(Date.UTC(2024, 11, 31)))).toBe("2024-25");
  });

  it("puts January–June in the income year that started the previous calendar year", () => {
    expect(incomeYearForDate(new Date(Date.UTC(2025, 0, 1)))).toBe("2024-25");
    expect(incomeYearForDate(new Date(Date.UTC(2025, 5, 30)))).toBe("2024-25");
  });

  it("zero-pads the end year across a century boundary", () => {
    expect(incomeYearForDate(new Date(Date.UTC(2099, 6, 1)))).toBe("2099-00");
  });
});

describe("resolveTaxYear", () => {
  it("returns the exact ruleset for a defined year", () => {
    const resolved = resolveTaxYear("2023-24");
    expect(resolved.exact).toBe(true);
    expect(resolved.rules.incomeYear).toBe("2023-24");
    expect(resolved.rules.assessmentYear).toBe("2024-25");
  });

  it("falls back to the latest defined year and flags it as inexact", () => {
    const resolved = resolveTaxYear("2099-00");
    expect(resolved.exact).toBe(false);
    expect(resolved.requested).toBe("2099-00");
    expect(resolved.rules.incomeYear).toBe(LATEST_INCOME_YEAR);
  });

  it("defaults to the latest defined year when asked for nothing", () => {
    expect(resolveTaxYear(null).rules.incomeYear).toBe(LATEST_INCOME_YEAR);
    expect(resolveTaxYear(undefined).exact).toBe(true);
  });
});

describe("TAX_YEARS registry", () => {
  it("keys every entry by its own incomeYear", () => {
    for (const [key, rules] of Object.entries(TAX_YEARS)) {
      expect(rules.incomeYear).toBe(key);
    }
  });

  it("lists income years oldest-first with the latest last", () => {
    expect(INCOME_YEARS).toEqual([...INCOME_YEARS].sort());
    expect(INCOME_YEARS.at(-1)).toBe(LATEST_INCOME_YEAR);
  });

  it("ends every year's slabs with an open-ended top rate", () => {
    for (const rules of Object.values(TAX_YEARS)) {
      expect(rules.slabs.at(-1)?.width).toBe(Infinity);
    }
  });
});
