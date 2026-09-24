import type { TaxYearRules, TaxpayerCategory } from "./tax-slabs";

// Every function here takes the year's ruleset explicitly rather than reading a module
// constant, so a computation can never silently apply one income year's slabs to
// another's income. Callers get their ruleset from `resolveTaxYear`.

export function computeSlabTax(taxableIncome: number, category: TaxpayerCategory, rules: TaxYearRules): number {
  let remaining = Math.max(taxableIncome - rules.taxFreeThreshold[category], 0);
  let tax = 0;
  for (const slab of rules.slabs) {
    if (remaining <= 0) break;
    const amountInSlab = Math.min(remaining, slab.width);
    tax += amountInSlab * slab.rate;
    remaining -= amountInSlab;
  }
  return tax;
}

export function computeInvestmentRebate(totalIncome: number, eligibleInvestment: number, rules: TaxYearRules): number {
  const { rate, incomePct, cap } = rules.investmentRebate;
  const allowance = Math.max(Math.min(eligibleInvestment, totalIncome * incomePct, cap), 0);
  return allowance * rate;
}

export interface TaxEstimate {
  grossTax: number;
  rebate: number;
  netTax: number;
  effectiveRate: number;
}

export function estimateNetTax(params: {
  totalIncome: number;
  category: TaxpayerCategory;
  eligibleInvestment: number;
  rules: TaxYearRules;
}): TaxEstimate {
  const { totalIncome, category, eligibleInvestment, rules } = params;
  const grossTax = computeSlabTax(totalIncome, category, rules);
  const rebate = Math.min(computeInvestmentRebate(totalIncome, eligibleInvestment, rules), grossTax);
  const netTax = grossTax - rebate;
  const effectiveRate = totalIncome > 0 ? netTax / totalIncome : 0;
  return { grossTax, rebate, netTax, effectiveRate };
}
