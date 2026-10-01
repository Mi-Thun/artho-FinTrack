import { describe, expect, it } from "vitest";
import { Prisma, type TaxRuleYear } from "@prisma/client";
import { toRules } from "./rules-db";

const D = (v: string | number) => new Prisma.Decimal(v);

describe("toRules", () => {
  const row: TaxRuleYear = {
    id: "r",
    userId: null,
    incomeYear: "2025-26",
    source: "test",
    thresholdGeneral: D(375000),
    thresholdFemaleOrSenior: D(425000),
    thresholdThirdGender: D(500000),
    thresholdDisabled: D(500000),
    thresholdFreedomFighter: D(525000),
    thresholdJulyWarrior: null,
    parentOfDisabledExtra: D(50000),
    slabs: [
      { width: 300000, rate: 0.1 },
      { width: null, rate: 0.3 },
    ],
    nonResidentRate: D("0.3"),
    minimumTaxDhakaChattogram: D(5000),
    minimumTaxOtherCity: D(5000),
    minimumTaxElsewhere: D(5000),
    minimumTaxFirstReturn: D(1000),
    salaryExemptionFraction: D("0.333333333333333333"),
    salaryExemptionCap: D(500000),
    rebateIncomePct: D("0.03"),
    rebateInvestmentPct: D("0.15"),
    rebateCap: D(1000000),
    netWealthSurcharge: [
      { above: 100000000, rate: 0.2 },
      { above: 40000000, rate: 0.1 },
    ],
    surchargeOnRegularTax: true,
    sanchayapatraFinalTax: true,
    returnDueDate: "11-30",
    firstReturnDueDate: "06-30",
    lateFilingMonthlyRate: D("0.02"),
    lateFilingMaxMonths: 24,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  it("keeps rates exact — a third of ৳9 lakh is ৳3 lakh, not ৳2.97 lakh", () => {
    const rules = toRules(row);
    expect(Math.round(900000 * rules.salaryExemption.fraction)).toBe(300000);
    expect(rules.rebate.incomePct).toBe(0.03);
  });

  it("reads open-ended slabs and sorts surcharge bands", () => {
    const rules = toRules(row);
    expect(rules.slabs[1].width).toBe(Infinity);
    expect(rules.netWealthSurcharge.map((b) => b.above)).toEqual([40000000, 100000000]);
    expect(rules.threshold.julyWarrior).toBeNull();
    expect(rules.own).toBe(false);
  });
});
