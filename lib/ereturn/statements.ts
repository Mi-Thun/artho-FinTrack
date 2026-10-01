import type { Formatter } from "@/lib/i18n";
import type { EReturnResult } from "./compute";
import { ASSET_LINES, LIABILITY_LINES, LIFESTYLE_LINES, SALARY_LINES, type LineCode } from "./lines";

// The statements of a return as rows — serial, particulars, amount — in NBR's order and
// wording. The return's tabs and the printed return both render these, so what's on
// screen and on paper can't drift apart.

export interface StatementRow {
  /** Serial number on the NBR form, e.g. "11" or "(a)". */
  no?: string;
  label: string;
  /** Already formatted. Omitted for a heading row. */
  value?: string;
  /** A total: bold, with a rule above. */
  total?: boolean;
  /** Detail under the row above: indented and muted. */
  sub?: boolean;
  tone?: "danger" | "success";
}

type LineValue = (code: LineCode) => { amount: number; note: string };

/** IT-11GA, lines 1–26. */
export function incomeStatementRows(r: EReturnResult, fmt: Formatter): StatementRow[] {
  const m = fmt.money;
  return [
    { label: "Particulars of income" },
    { no: "1", label: "Income from employment", value: m(r.income.employment) },
    { no: "2", label: "Income from rent", value: m(r.income.rent) },
    { no: "3", label: "Income from agriculture", value: m(r.income.agriculture) },
    { no: "4", label: "Income from business", value: m(r.income.business) },
    { no: "5", label: "Income from capital gain", value: m(r.income.capitalGain) },
    { no: "6", label: "Income from financial assets (bank interest, dividend, securities profit…)", value: m(r.income.financialAssets) },
    { no: "7", label: "Income from other sources (royalty, licence fees, honorarium, govt. incentive…)", value: m(r.income.otherSources) },
    { no: "8", label: "Share of income from firm or AoP", value: m(r.income.firmShare) },
    { no: "9", label: "Income of minor or spouse (if not a taxpayer)", value: m(r.income.minorSpouse) },
    { no: "10", label: "Taxable income from abroad", value: m(r.income.abroad) },
    { no: "11", label: "Total income (aggregate of 1 to 10)", value: m(r.income.total), total: true },
    { label: "Tax computation" },
    { no: "12", label: "Gross tax on taxable income", value: m(r.tax.grossTax) },
    { no: "13", label: "Tax rebate (Schedule 5)", value: m(r.tax.rebateAllowed) },
    // NBR's form prints the higher of 12 − 13 and the minimum tax here, never below it.
    { no: "14", label: "Net tax after rebate (12 − 13)", value: m(r.tax.taxPayable) },
    { no: "15", label: "Minimum tax", value: m(r.tax.minimumTax) },
    { no: "16", label: "Tax payable (higher of 14 and 15)", value: m(r.tax.taxPayable), total: true },
    { no: "17", label: "Surcharge", value: m(r.tax.surcharge) },
    { no: "", label: `(a) Net wealth surcharge${r.tax.netWealthSurchargeRate ? ` at ${fmt.number(r.tax.netWealthSurchargeRate * 100)}%` : ""}`, value: m(r.tax.netWealthSurcharge), sub: true },
    { no: "", label: "(b) Environmental surcharge", value: m(r.tax.environmentalSurcharge), sub: true },
    { no: "18", label: "Delay interest, penalty or other amount", value: m(r.tax.delayInterest) },
    { no: "19", label: "Total amount payable (16 + 17 + 18)", value: m(r.tax.totalPayable), total: true },
    { label: "Tax payment" },
    { no: "20", label: "Tax deducted or collected at source", value: m(r.paid.tds) },
    { no: "21", label: "Advance tax paid", value: m(r.paid.advance) },
    { no: "22", label: "Adjustment of tax refund", value: m(r.paid.refundAdjustment) },
    { no: "23", label: "Tax paid with this return", value: m(r.paid.withReturn) },
    { no: "24", label: "Total tax paid and adjusted (20 + 21 + 22 + 23)", value: m(r.paid.total), total: true },
    r.paid.due > 0
      ? { no: "25", label: "Tax still payable (19 − 24)", value: m(r.paid.due), tone: "danger" }
      : { no: "25", label: "Excess payment (24 − 19)", value: m(r.paid.excess), tone: r.paid.excess > 0 ? "success" : undefined },
    { no: "26", label: "Tax exempted / tax-free income", value: m(r.exemptIncome.total) },
  ];
}

/** Schedule 1(b): salary, the exempt part, and what's taxable. */
export function salaryRows(r: EReturnResult, line: LineValue, fmt: Formatter): StatementRow[] {
  const m = fmt.money;
  return [
    ...SALARY_LINES.map((d, i) => ({ no: String(i + 1), label: d.label, value: m(line(d.code).amount) })),
    { no: "13", label: "Total salary received (1 to 12)", value: m(r.salary.gross), total: true },
    {
      no: "14",
      label: `Exempted amount — the lesser of ⅓ of salary and ${m(r.rules.salaryExemption.cap)}`,
      value: m(r.salary.exempt),
    },
    { no: "15", label: "Total income from salary (13 − 14)", value: m(r.salary.taxable), total: true },
  ];
}

/** IT-10BB: expenses relating to lifestyle. */
export function lifestyleRows(r: EReturnResult, fmt: Formatter): StatementRow[] {
  const m = fmt.money;
  const rows: StatementRow[] = LIFESTYLE_LINES.map((d, i) => ({
    no: String(i < 7 ? i + 1 : i + 2),
    label: d.label,
    value: m(r.lifestyle.lines[d.code] ?? 0),
  }));
  // NBR's line 8 — tax paid — sits between festival expense and loan interest.
  rows.splice(7, 0, {
    no: "8",
    label: "Tax deducted or collected at source, and tax paid on last year's return",
    value: m(r.lifestyle.taxPaid),
  });
  rows.push({ label: "Total", value: m(r.lifestyle.total), total: true });
  return rows;
}

/** IT-10B: sources of fund, net wealth, and the assets and liabilities that make it up. */
export function wealthRows(r: EReturnResult, line: LineValue, fmt: Formatter): StatementRow[] {
  const m = fmt.money;
  const w = r.wealth;
  const a = w.assets;
  const withNote = (code: LineCode, label: string) => {
    const note = line(code).note;
    return note ? `${label} — ${note}` : label;
  };
  const labelOf = (code: LineCode) => [...ASSET_LINES, ...LIABILITY_LINES].find((d) => d.code === code)?.label ?? code;

  return [
    { no: "1", label: "Sources of fund" },
    { no: "(a)", label: "Total income shown in the return (less non-cash benefits)", value: m(w.sources.taxableIncome), sub: true },
    { no: "(b)", label: "Tax-exempted income", value: m(w.sources.exemptIncome), sub: true },
    { no: "(c)", label: "Receipt of gift and others", value: m(w.sources.gifts), sub: true },
    { label: "Total source of fund", value: m(w.sources.total), total: true },
    { no: "2", label: "Net wealth on the last date of the previous income year", value: m(w.previousNetWealth) },
    { no: "3", label: "Sum of source of fund and previous net wealth (1 + 2)", value: m(w.fundsAvailable), total: true },
    { no: "4", label: "Expenses and losses" },
    { no: "(a)", label: "Expense relating to lifestyle (IT-10BB)", value: m(w.expenses.lifestyle), sub: true },
    { no: "(b)", label: "Gift, expense or loss not in IT-10BB", value: m(w.expenses.other), sub: true },
    { label: "Total expense and loss", value: m(w.expenses.total), total: true },
    { no: "5", label: "Net wealth at the last date of this income year (3 − 4)", value: m(w.netWealth), total: true },
    { no: "6", label: "Personal liabilities outside business" },
    { no: "(a)", label: withNote("liability.institutional", labelOf("liability.institutional")), value: m(w.liabilities.institutional), sub: true },
    { no: "(b)", label: withNote("liability.nonInstitutional", labelOf("liability.nonInstitutional")), value: m(w.liabilities.nonInstitutional), sub: true },
    { no: "(c)", label: withNote("liability.other", labelOf("liability.other")), value: m(w.liabilities.other), sub: true },
    { label: "Total liabilities outside business", value: m(w.liabilities.total), total: true },
    { no: "7", label: "Gross wealth (5 + 6)", value: m(w.grossWealth), total: true },
    { no: "8", label: "Particulars of assets" },
    { no: "(a)", label: "Business assets less business liabilities", value: m(a.businessNet), sub: true },
    { no: "(b)", label: "Director's shareholdings in companies", value: m(a.directorShares), sub: true },
    { no: "(c)", label: "Business capital of partnership firm", value: m(a.partnershipCapital), sub: true },
    { no: "(d)", label: withNote("asset.nonAgriProperty", "Non-agricultural property / land / house"), value: m(a.nonAgriProperty), sub: true },
    { no: "(e)", label: withNote("asset.agriProperty", "Agricultural property"), value: m(a.agriProperty), sub: true },
    { no: "(f)", label: "Financial assets", value: m(a.financial.total), sub: true },
    { no: "", label: "(i) Share / debenture / bond / securities / unit certificate", value: m(a.financial.shares), sub: true },
    { no: "", label: "(ii) Sanchayapatra / deposit pension scheme", value: m(a.financial.sanchayapatraDps), sub: true },
    { no: "", label: withNote("asset.loanGiven", "(iii) Loan given"), value: m(a.financial.loanGiven), sub: true },
    { no: "", label: "(iv) Savings deposit / term deposit", value: m(a.financial.deposits), sub: true },
    { no: "", label: "(v) Provident fund or other fund", value: m(a.financial.providentFund), sub: true },
    { no: "", label: withNote("asset.otherInvestment", "(vi) Other investment"), value: m(a.financial.otherInvestment), sub: true },
    { no: "(g)", label: withNote("asset.motorVehicle", "Motor vehicle(s)"), value: m(a.motorVehicle), sub: true },
    { no: "(h)", label: withNote("asset.ornaments", "Ornaments"), value: m(a.ornaments), sub: true },
    { no: "(i)", label: "Furniture and electronic items", value: m(a.furniture), sub: true },
    { no: "(j)", label: withNote("asset.other", "Other assets"), value: m(a.other), sub: true },
    { no: "(k)", label: "Cash in hand and fund outside business", value: m(a.cash.total), sub: true },
    { no: "", label: "(i) Bank balance", value: m(a.cash.bank), sub: true },
    { no: "", label: "(ii) Cash in hand", value: m(a.cash.inHand), sub: true },
    { no: "", label: "(iii) Others", value: m(a.cash.other), sub: true },
    { label: "Total assets inside Bangladesh", value: m(a.insideBangladesh), total: true },
    { no: "9", label: withNote("asset.abroad", "Assets outside Bangladesh"), value: m(a.abroad) },
    { no: "10", label: "Total assets in and outside Bangladesh (8 + 9)", value: m(a.total), total: true },
    w.difference === 0
      ? { label: "Difference from gross wealth (7)", value: m(0), tone: "success" }
      : { label: "Difference from gross wealth (7) — must be zero", value: `${w.difference < 0 ? "−" : "+"}${m(Math.abs(w.difference))}`, tone: "danger" },
  ];
}
