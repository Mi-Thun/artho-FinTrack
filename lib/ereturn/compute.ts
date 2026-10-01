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
  monthsLate,
  netWealthSurchargeRate,
  returnDueDate,
  taxFreeThreshold,
  type EReturnRules,
  type MinimumTaxArea,
  type ResolvedEReturnYear,
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
  /** Never filed before: the first-return minimum tax and due date apply. */
  firstReturn: boolean;
  /** When it was (or, for a draft, would be) filed — decides whether it's late. */
  filedOn: Date;
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
  /** Income taxed at the slab rates: total income less income whose source tax is final. */
  regularIncome: number;
  /** Sanchayapatra profit, when the tax deducted from it is the final tax on it. */
  finalTaxIncome: number;
  /** That deducted tax: final, so the rebate never reduces it. */
  finalTax: number;
  /** Raised to the tax a bank deducted from deposit interest, which is a minimum on it. */
  depositTaxTopUp: number;
  /** Line 12: tax at the slab rates on regular income, plus final tax. */
  grossTax: number;
  /** Section 80: tax already borne by a firm or AoP on the taxpayer's share, at the average rate. */
  firmShareCredit: number;
  /** Income the 3% limit is taken on: excluding final-tax income and a firm share. */
  rebateBase: number;
  /** Allowable investment after per-kind caps. */
  eligibleInvestment: number;
  rebateByIncome: number;
  rebateByInvestment: number;
  /** Rebate the Act allows, before being limited to the gross tax. */
  rebateAllowed: number;
  rebate: number;
  netTax: number;
  minimumTax: number;
  /** "first return", or the area it's for. */
  minimumTaxBasis: "firstReturn" | MinimumTaxArea;
  minimumTaxApplies: boolean;
  /** Filed after the due date: the rebate is lost (section 174). */
  rebateLostToLateFiling: boolean;
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
    /** What the net wealth surcharge rate was applied to. */
    surchargeBase: number;
    environmentalSurcharge: number;
    surcharge: number;
    /** Line 18: the late-filing charge plus anything else entered. */
    delayInterest: number;
    /** Penalties and amounts the taxpayer entered, besides the late-filing charge. */
    otherCharges: number;
    lateFiling: { due: Date; months: number; charge: number };
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
  firstReturn: boolean;
  late: boolean;
  totalIncome: number;
  threshold: number;
  investments: EReturnInput["investments"];
  area: MinimumTaxArea;
  heads: { firmShare: number };
  financialAssets: EReturnInput["financialAssets"];
}): TaxComputation {
  const { rules, resident, totalIncome, threshold, investments, area } = params;
  const incomeOf = (kinds: FinancialAssetKind[]) => round(sum(params.financialAssets.filter((a) => kinds.includes(a.kind)).map((a) => a.income)));
  const deductedOf = (kinds: FinancialAssetKind[]) =>
    round(sum(params.financialAssets.filter((a) => kinds.includes(a.kind)).map((a) => a.taxDeducted)));

  // Sanchayapatra profit: the tax deducted from it is the whole tax on it (section 163(11)),
  // so it stays out of the slab calculation and its deducted tax is added as it is.
  const finalApplies = resident && rules.sanchayapatraFinalTax;
  const finalTaxIncome = finalApplies ? incomeOf(["SANCHAYAPATRA"]) : 0;
  const finalTax = finalApplies ? deductedOf(["SANCHAYAPATRA"]) : 0;
  const regularIncome = totalIncome - finalTaxIncome;

  let regularTax = round(resident ? slabTax(regularIncome - threshold, rules.slabs) : totalIncome * rules.nonResidentRate);

  // Tax deducted from deposit interest is a minimum on that interest: the slab tax it adds
  // can't come out lower than what the bank took (section 163, Paripatra 2025-26 ex. 12).
  let depositTaxTopUp = 0;
  if (resident) {
    const depositIncome = incomeOf(["BANK_ACCOUNT", "FIXED_DEPOSIT", "DPS"]);
    const depositDeducted = deductedOf(["BANK_ACCOUNT", "FIXED_DEPOSIT", "DPS"]);
    const withoutDeposits = round(slabTax(regularIncome - depositIncome - threshold, rules.slabs));
    depositTaxTopUp = Math.max(depositDeducted - (regularTax - withoutDeposits), 0);
    regularTax += depositTaxTopUp;
  }
  const grossTax = regularTax + finalTax;

  // A firm's or AoP's share of income has borne tax already; the credit is the average
  // rate on it (section 80, Paripatra 2025-26 example 12).
  const firmShareCredit = totalIncome > 0 ? round((grossTax * params.heads.firmShare) / totalIncome) : 0;

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

  // The 3% limit leaves out final-tax income and a firm share (section 78 as amended).
  const rebateBase = Math.max(totalIncome - finalTaxIncome - params.heads.firmShare, 0);
  const rebateByIncome = round(rebateBase * rules.rebate.incomePct);
  const rebateByInvestment = round(eligibleInvestment * rules.rebate.investmentPct);
  const rebateLostToLateFiling = resident && params.late;
  const rebateAllowed = resident && !params.late ? Math.max(Math.min(rebateByIncome, rebateByInvestment, rules.rebate.cap), 0) : 0;
  const beforeRebate = grossTax - firmShareCredit;
  // Final tax can't be rebated away: it's deducted and kept.
  const rebate = Math.min(rebateAllowed, Math.max(beforeRebate - finalTax, 0));
  const netTax = beforeRebate - rebate;

  const minimumTaxApplies = resident && totalIncome > threshold;
  const useFirst = params.firstReturn && rules.minimumTaxFirstReturn != null;
  const minimumTax = minimumTaxApplies ? (useFirst ? rules.minimumTaxFirstReturn! : rules.minimumTax[area]) : 0;
  const taxPayable = Math.max(netTax, minimumTax);

  return {
    threshold,
    regularIncome,
    finalTaxIncome,
    finalTax,
    depositTaxTopUp,
    grossTax,
    firmShareCredit,
    rebateBase,
    eligibleInvestment,
    rebateByIncome,
    rebateByInvestment,
    rebateAllowed,
    rebate,
    netTax,
    minimumTax,
    minimumTaxBasis: useFirst ? "firstReturn" : area,
    minimumTaxApplies: minimumTaxApplies && minimumTax > netTax,
    rebateLostToLateFiling,
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

export function computeEReturn(input: EReturnInput, resolved: ResolvedEReturnYear): EReturnResult {
  const { rules, exact } = resolved;
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
  const due = returnDueDate(rules, input.incomeYear, input.firstReturn);
  const lateMonths = Math.min(monthsLate(due, input.filedOn), rules.lateFiling.maxMonths);
  const taxParams = {
    rules,
    resident: input.resident,
    firstReturn: input.firstReturn,
    late: lateMonths > 0,
    totalIncome,
    threshold,
    area: input.area,
    heads,
    financialAssets: input.financialAssets,
  };
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
  // From tax year 2026-27 it's on tax at regular rates, so minimum tax no longer counts.
  const surchargeRate = netWealthSurchargeRate(rules, totalAssets - liabilitiesTotal);
  const surchargeBase = rules.surchargeOnRegularTax ? tax.grossTax - tax.firmShareCredit : tax.taxPayable;
  const netWealthSurcharge = round(surchargeBase * surchargeRate);
  const environmentalSurcharge = round(input.environmentalSurcharge);
  const surcharge = netWealthSurcharge + environmentalSurcharge;

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

  // Section 174: late, the tax as computed without the rebate (with minimum tax and
  // surcharge), less tax already deducted or paid in advance, grows 2% a month.
  const lateCharge = lateMonths > 0 ? round(Math.max(tax.taxPayable + surcharge - tds - advance, 0) * rules.lateFiling.monthlyRate * lateMonths) : 0;
  const otherCharges = round(input.delayInterest);
  const delayInterest = lateCharge + otherCharges;
  const totalPayable = tax.taxPayable + surcharge + delayInterest;

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
      surchargeBase,
      environmentalSurcharge,
      surcharge,
      delayInterest,
      otherCharges,
      lateFiling: { due, months: lateMonths, charge: lateCharge },
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
