import type { TaxSlab } from "@/lib/tax-slabs";
import {
  INVESTMENT_KINDS,
  LIFESTYLE_LINES,
  NON_CASH_SALARY_CODES,
  SALARY_LINES,
  type FinancialAssetKind,
  type InvestmentKind,
  type LineCode,
  type TaxPaymentKind,
} from "./lines";
import {
  isWithinIncomeYear,
  netWealthSurchargeRate,
  resolveEReturnYear,
  taxFreeThreshold,
  type EReturnRules,
  type MinimumTaxArea,
  type TaxpayerBenefit,
} from "./rules";

// Everything on a return, worked out from what was entered for it. Pure and numeric:
// the loader converts Decimals once on the way in, and every figure comes out in whole
// taka, rounded the way NBR's forms print them.

export interface EReturnInput {
  incomeYear: string;
  resident: boolean;
  benefits: readonly TaxpayerBenefit[];
  dateOfBirth: Date | null;
  area: MinimumTaxArea;
  lines: Partial<Record<LineCode, number>>;
  financialAssets: readonly { kind: FinancialAssetKind; value: number; income: number; taxDeducted: number; openedDate: Date | null }[];
  payments: readonly { kind: TaxPaymentKind; amount: number }[];
  investments: readonly { kind: InvestmentKind; amount: number; date: Date | null }[];
  previousNetWealth: number;
  /** Tax and surcharge paid last year on the strength of last year's return (IT-10BB line 8). */
  lastYearTaxPaid: number;
  environmentalSurcharge: number;
  delayInterest: number;
}

export interface TaxComputation {
  threshold: number;
  grossTax: number;
  /** Allowable investment after per-kind caps. */
  eligibleInvestment: number;
  rebateByIncome: number;
  rebateByInvestment: number;
  /** Rebate the Act allows, before being limited to the gross tax. */
  rebateAllowed: number;
  rebate: number;
  netTax: number;
  minimumTax: number;
  minimumTaxApplies: boolean;
  taxPayable: number;
}

export interface EReturnResult {
  rules: EReturnRules;
  exactRules: boolean;
  salary: { gross: number; exempt: number; taxable: number; nonCash: number };
  income: {
    employment: number;
    rent: number;
    agriculture: number;
    business: number;
    capitalGain: number;
    financialAssets: number;
    otherSources: number;
    firmShare: number;
    minorSpouse: number;
    abroad: number;
    total: number;
  };
  tax: TaxComputation & {
    netWealthSurchargeRate: number;
    netWealthSurcharge: number;
    environmentalSurcharge: number;
    surcharge: number;
    delayInterest: number;
    totalPayable: number;
  };
  paid: {
    tdsSalary: number;
    tdsFinancial: number;
    tdsOther: number;
    tds: number;
    advance: number;
    refundAdjustment: number;
    withReturn: number;
    total: number;
    /** Line 25: paid beyond what's payable. */
    excess: number;
    /** Still to pay (with the return) when payments fall short. */
    due: number;
  };
  exemptIncome: { salary: number; other: number; total: number };
  lifestyle: { lines: Record<string, number>; taxPaid: number; total: number };
  wealth: {
    sources: { taxableIncome: number; exemptIncome: number; gifts: number; total: number };
    previousNetWealth: number;
    fundsAvailable: number;
    expenses: { lifestyle: number; other: number; total: number };
    netWealth: number;
    liabilities: { institutional: number; nonInstitutional: number; other: number; total: number };
    grossWealth: number;
    assets: {
      businessNet: number;
      directorShares: number;
      partnershipCapital: number;
      nonAgriProperty: number;
      agriProperty: number;
      financial: {
        shares: number;
        sanchayapatraDps: number;
        loanGiven: number;
        deposits: number;
        providentFund: number;
        otherInvestment: number;
        total: number;
      };
      motorVehicle: number;
      ornaments: number;
      furniture: number;
      other: number;
      cash: { bank: number; inHand: number; other: number; total: number };
      insideBangladesh: number;
      abroad: number;
      total: number;
    };
    /** Declared assets minus gross wealth: zero when the statement balances. */
    difference: number;
  };
  /** Government-securities rebate claims beyond the Sanchayapatra/bonds bought this year. */
  unsupportedSecuritiesClaim: number;
  /** Rebate investments dated outside the income year. */
  investmentsOutsideYear: { count: number; amount: number };
  /** What `tax.taxPayable` would be without the unsupported securities claim. */
  taxPayableWithoutUnsupported: number;
}

const round = (n: number) => Math.round(n);
const sum = (values: Iterable<number>) => {
  let total = 0;
  for (const v of values) total += v;
  return total;
};

function computeTax(params: {
  rules: EReturnRules;
  resident: boolean;
  totalIncome: number;
  threshold: number;
  investments: EReturnInput["investments"];
  area: MinimumTaxArea;
}): TaxComputation {
  const { rules, resident, totalIncome, threshold, investments, area } = params;

  const grossTax = round(resident ? slabTax(totalIncome - threshold, rules.slabs) : totalIncome * rules.nonResidentRate);

  // Each kind's total is capped where the Act caps it (DPS at ৳1.2 lakh a year).
  const byKind = new Map<InvestmentKind, number>();
  for (const i of investments) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + Math.max(i.amount, 0));
  const eligibleInvestment = round(
    sum(
      [...byKind].map(([kind, amount]) => {
        const cap = (INVESTMENT_KINDS[kind] as { cap?: number }).cap;
        return cap == null ? amount : Math.min(amount, cap);
      }),
    ),
  );

  const rebateByIncome = round(totalIncome * rules.rebate.incomePct);
  const rebateByInvestment = round(eligibleInvestment * rules.rebate.investmentPct);
  const rebateAllowed = resident ? Math.max(Math.min(rebateByIncome, rebateByInvestment, rules.rebate.cap), 0) : 0;
  const rebate = Math.min(rebateAllowed, grossTax);
  const netTax = grossTax - rebate;

  const minimumTaxApplies = resident && totalIncome > threshold;
  const minimumTax = minimumTaxApplies ? rules.minimumTax[area] : 0;
  const taxPayable = Math.max(netTax, minimumTax);

  return {
    threshold,
    grossTax,
    eligibleInvestment,
    rebateByIncome,
    rebateByInvestment,
    rebateAllowed,
    rebate,
    netTax,
    minimumTax,
    minimumTaxApplies: minimumTaxApplies && minimumTax > netTax,
    taxPayable,
  };
}

/** Tax on income above the tax-free band, slab by slab. */
function slabTax(aboveThreshold: number, slabs: readonly TaxSlab[]): number {
  let remaining = Math.max(aboveThreshold, 0);
  let tax = 0;
  for (const slab of slabs) {
    if (remaining <= 0) break;
    const inSlab = Math.min(remaining, slab.width);
    tax += inSlab * slab.rate;
    remaining -= inSlab;
  }
  return tax;
}

export function computeEReturn(input: EReturnInput): EReturnResult {
  const { rules, exact } = resolveEReturnYear(input.incomeYear);
  const line = (code: LineCode) => input.lines[code] ?? 0;
  const lineSum = (defs: readonly { code: LineCode }[]) => sum(defs.map((d) => line(d.code)));

  // ── Salary (Schedule 1b) ──
  const salaryGross = round(lineSum(SALARY_LINES));
  const salaryExempt = round(Math.min(salaryGross * rules.salaryExemption.fraction, rules.salaryExemption.cap));
  const salaryTaxable = salaryGross - salaryExempt;
  const nonCash = round(sum(NON_CASH_SALARY_CODES.map(line)));

  // ── Income heads ──
  const financialAssets = round(sum(input.financialAssets.map((a) => a.income)));
  const heads = {
    employment: salaryTaxable,
    rent: round(line("income.rent")),
    agriculture: round(line("income.agriculture")),
    business: round(line("income.business")),
    capitalGain: round(line("income.capitalGain")),
    financialAssets,
    otherSources: round(line("income.otherSources")),
    firmShare: round(line("income.firmShare")),
    minorSpouse: round(line("income.minorSpouse")),
    abroad: round(line("income.abroad")),
  };
  const totalIncome = sum(Object.values(heads));

  // ── Tax ──
  const threshold = input.resident ? taxFreeThreshold(rules, input.benefits, input.dateOfBirth) : 0;
  const taxParams = { rules, resident: input.resident, totalIncome, threshold, area: input.area };
  const tax = computeTax({ ...taxParams, investments: input.investments });

  // ── Assets and liabilities (IT-10B) — needed before the surcharge ──
  const assetValue = (...kinds: FinancialAssetKind[]) =>
    round(sum(input.financialAssets.filter((a) => kinds.includes(a.kind)).map((a) => a.value)));
  const financial = {
    shares: assetValue("SHARES", "BOND"),
    sanchayapatraDps: assetValue("SANCHAYAPATRA", "DPS"),
    loanGiven: round(line("asset.loanGiven")),
    deposits: assetValue("FIXED_DEPOSIT"),
    providentFund: round(line("asset.providentFund")),
    otherInvestment: round(line("asset.otherInvestment")) + assetValue("OTHER"),
  };
  const financialTotal = sum(Object.values(financial));
  const cash = {
    bank: assetValue("BANK_ACCOUNT"),
    inHand: round(line("asset.cashInHand")),
    other: round(line("asset.cashOther")) + assetValue("MOBILE_WALLET"),
  };
  const cashTotal = sum(Object.values(cash));
  const assetsInside = {
    businessNet: round(line("asset.business") - line("asset.businessLiabilities")),
    directorShares: round(line("asset.directorShares")),
    partnershipCapital: round(line("asset.partnershipCapital")),
    nonAgriProperty: round(line("asset.nonAgriProperty")),
    agriProperty: round(line("asset.agriProperty")),
    motorVehicle: round(line("asset.motorVehicle")),
    ornaments: round(line("asset.ornaments")),
    furniture: round(line("asset.furniture")),
    other: round(line("asset.other")),
  };
  const insideBangladesh = sum(Object.values(assetsInside)) + financialTotal + cashTotal;
  const abroad = round(line("asset.abroad"));
  const totalAssets = insideBangladesh + abroad;

  const liabilities = {
    institutional: round(line("liability.institutional")),
    nonInstitutional: round(line("liability.nonInstitutional")),
    other: round(line("liability.other")),
  };
  const liabilitiesTotal = sum(Object.values(liabilities));

  // The surcharge is on declared net wealth: what the taxpayer owns less what they owe.
  const surchargeRate = netWealthSurchargeRate(rules, totalAssets - liabilitiesTotal);
  const netWealthSurcharge = round(tax.taxPayable * surchargeRate);
  const environmentalSurcharge = round(input.environmentalSurcharge);
  const surcharge = netWealthSurcharge + environmentalSurcharge;
  const delayInterest = round(input.delayInterest);
  const totalPayable = tax.taxPayable + surcharge + delayInterest;

  // ── Payments ──
  const paidOf = (kind: TaxPaymentKind) => round(sum(input.payments.filter((p) => p.kind === kind).map((p) => p.amount)));
  const tdsSalary = paidOf("SALARY_TDS");
  const tdsOther = paidOf("OTHER_TDS");
  const tdsFinancial = round(sum(input.financialAssets.map((a) => a.taxDeducted)));
  const tds = tdsSalary + tdsOther + tdsFinancial;
  const advance = paidOf("ADVANCE_TAX");
  const refundAdjustment = paidOf("REFUND_ADJUSTMENT");
  const withReturn = paidOf("WITH_RETURN");
  const totalPaid = tds + advance + refundAdjustment + withReturn;

  // ── Exempt income ──
  const exemptOther = round(line("exempt.other"));

  // ── Lifestyle (IT-10BB). Line 8 is the tax that left your pocket this year. ──
  const lifestyleLines = Object.fromEntries(LIFESTYLE_LINES.map((d) => [d.code, round(line(d.code))]));
  const lifestyleTax = tds + advance + round(input.lastYearTaxPaid);
  const lifestyleTotal = sum(Object.values(lifestyleLines)) + lifestyleTax;

  // ── Net wealth reconciliation (IT-10B items 1–7) ──
  const sources = {
    taxableIncome: totalIncome - nonCash,
    exemptIncome: salaryExempt + exemptOther,
    gifts: round(line("fund.gift")),
  };
  const sourcesTotal = sum(Object.values(sources));
  const previousNetWealth = round(input.previousNetWealth);
  const fundsAvailable = previousNetWealth + sourcesTotal;
  const otherLoss = round(line("wealth.otherLoss"));
  const expensesTotal = lifestyleTotal + otherLoss;
  const netWealth = fundsAvailable - expensesTotal;
  const grossWealth = netWealth + liabilitiesTotal;

  // ── Checks that need the computation ──
  const securitiesBoughtInYear = round(
    sum(
      input.financialAssets
        .filter((a) => (a.kind === "SANCHAYAPATRA" || a.kind === "BOND") && a.openedDate && isWithinIncomeYear(a.openedDate, input.incomeYear))
        .map((a) => a.value),
    ),
  );
  const securitiesClaimed = round(sum(input.investments.filter((i) => i.kind === "GOVT_SECURITIES").map((i) => i.amount)));
  const unsupportedSecuritiesClaim = Math.max(securitiesClaimed - securitiesBoughtInYear, 0);
  const taxPayableWithoutUnsupported =
    unsupportedSecuritiesClaim > 0
      ? computeTax({
          ...taxParams,
          investments: [
            ...input.investments.filter((i) => i.kind !== "GOVT_SECURITIES"),
            { kind: "GOVT_SECURITIES", amount: securitiesClaimed - unsupportedSecuritiesClaim, date: null },
          ],
        }).taxPayable
      : tax.taxPayable;
  const outside = input.investments.filter((i) => i.date && !isWithinIncomeYear(i.date, input.incomeYear));

  return {
    rules,
    exactRules: exact,
    salary: { gross: salaryGross, exempt: salaryExempt, taxable: salaryTaxable, nonCash },
    income: { ...heads, total: totalIncome },
    tax: {
      ...tax,
      netWealthSurchargeRate: surchargeRate,
      netWealthSurcharge,
      environmentalSurcharge,
      surcharge,
      delayInterest,
      totalPayable,
    },
    paid: {
      tdsSalary,
      tdsFinancial,
      tdsOther,
      tds,
      advance,
      refundAdjustment,
      withReturn,
      total: totalPaid,
      excess: Math.max(totalPaid - totalPayable, 0),
      due: Math.max(totalPayable - totalPaid, 0),
    },
    exemptIncome: { salary: salaryExempt, other: exemptOther, total: salaryExempt + exemptOther },
    lifestyle: { lines: lifestyleLines, taxPaid: lifestyleTax, total: lifestyleTotal },
    wealth: {
      sources: { ...sources, total: sourcesTotal },
      previousNetWealth,
      fundsAvailable,
      expenses: { lifestyle: lifestyleTotal, other: otherLoss, total: expensesTotal },
      netWealth,
      liabilities: { ...liabilities, total: liabilitiesTotal },
      grossWealth,
      assets: {
        ...assetsInside,
        financial: { ...financial, total: financialTotal },
        cash: { ...cash, total: cashTotal },
        insideBangladesh,
        abroad,
        total: totalAssets,
      },
      difference: totalAssets - grossWealth,
    },
    unsupportedSecuritiesClaim,
    investmentsOutsideYear: { count: outside.length, amount: round(sum(outside.map((i) => i.amount))) },
    taxPayableWithoutUnsupported,
  };
}
