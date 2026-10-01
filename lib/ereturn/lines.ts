// The fixed rows of the NBR return forms. Each row a taxpayer types an amount into is a
// line with a stable code, stored as one TaxReturnLine; the forms, the computation and
// the printed return all read these definitions, so a row is added in one place.
//
// Lists that have a row per item — bank accounts and Sanchayapatra, tax challans,
// rebatable investments — are their own tables instead, and their kinds are below.

export interface LineDef {
  code: string;
  label: string;
  hint?: string;
  /** Takes a free-text description too (property location, vehicle registration…). */
  withNote?: boolean;
  notePlaceholder?: string;
}

/** Schedule 1(b): salary of an employee not on the government pay scale. */
export const SALARY_LINES = [
  { code: "salary.basic", label: "Basic pay" },
  {
    code: "salary.allowances",
    label: "Allowances",
    hint: "House rent, medical, conveyance, festival bonus and every other cash allowance.",
  },
  { code: "salary.arrear", label: "Advance / arrear salary" },
  { code: "salary.gratuity", label: "Gratuity, annuity, pension or similar benefit" },
  { code: "salary.perquisites", label: "Perquisites" },
  { code: "salary.inLieu", label: "Receipt in lieu of or in addition to salary" },
  { code: "salary.shareScheme", label: "Income from employee's share scheme" },
  { code: "salary.accommodation", label: "Accommodation facility", hint: "Non-cash: left out of the sources of fund." },
  { code: "salary.transport", label: "Transport facility", hint: "Non-cash: left out of the sources of fund." },
  { code: "salary.otherFacility", label: "Any other facility provided by employer", hint: "Non-cash." },
  { code: "salary.employerPf", label: "Employer's contribution to recognised provident fund" },
  { code: "salary.other", label: "Others", withNote: true, notePlaceholder: "What it is" },
] as const satisfies readonly LineDef[];

/** Benefits in kind: taxable, but no cash arrived, so they fund no assets. */
export const NON_CASH_SALARY_CODES = ["salary.accommodation", "salary.transport", "salary.otherFacility"] as const;

/** IT-11GA heads 2–10 other than financial assets, which come from the assets list. */
export const OTHER_INCOME_LINES = [
  { code: "income.rent", label: "Income from rent" },
  { code: "income.agriculture", label: "Income from agriculture" },
  { code: "income.business", label: "Income from business" },
  { code: "income.capitalGain", label: "Income from capital gain" },
  { code: "income.otherSources", label: "Income from other sources", hint: "Royalty, licence fees, honorarium, government incentive…" },
  { code: "income.firmShare", label: "Share of income from firm or AoP" },
  { code: "income.minorSpouse", label: "Income of minor or spouse (if not a taxpayer)" },
  { code: "income.abroad", label: "Taxable income from abroad" },
  {
    code: "exempt.other",
    label: "Other tax-exempt income",
    hint: "Exempt income besides the salary exemption, which is worked out for you.",
    withNote: true,
    notePlaceholder: "Source",
  },
] as const satisfies readonly LineDef[];

/** IT-10BB, less line 8 (tax paid), which is worked out from the tax you've recorded. */
export const LIFESTYLE_LINES = [
  { code: "lifestyle.food", label: "Personal and family fooding, clothing and other essentials" },
  { code: "lifestyle.housing", label: "Housing expense" },
  { code: "lifestyle.transport", label: "Personal transport expense" },
  { code: "lifestyle.utility", label: "Utility expense", hint: "Electricity, gas, water, telephone, mobile, internet." },
  { code: "lifestyle.education", label: "Education expense" },
  { code: "lifestyle.travel", label: "Local and foreign travel, vacation" },
  { code: "lifestyle.festival", label: "Festival and other special expense" },
  { code: "lifestyle.loanInterest", label: "Interest paid on personal loans" },
] as const satisfies readonly LineDef[];

/** IT-10B items 1(c) and 4(b). */
export const FUND_LINES = [
  { code: "fund.gift", label: "Receipt of gift and others", withNote: true, notePlaceholder: "From whom" },
  { code: "wealth.otherLoss", label: "Gift, expense or loss not in IT-10BB", withNote: true, notePlaceholder: "What it was" },
] as const satisfies readonly LineDef[];

/** IT-10B item 8 rows that aren't built from the bank-account and Sanchayapatra list. */
export const ASSET_LINES = [
  { code: "asset.business", label: "Total asset of business" },
  { code: "asset.businessLiabilities", label: "Less: business liabilities" },
  { code: "asset.directorShares", label: "Director's shareholdings in companies" },
  { code: "asset.partnershipCapital", label: "Business capital of partnership firm" },
  {
    code: "asset.nonAgriProperty",
    label: "Non-agricultural property, land, house",
    hint: "At cost, with legal expenses.",
    withNote: true,
    notePlaceholder: "Location and description",
  },
  { code: "asset.agriProperty", label: "Agricultural property", withNote: true, notePlaceholder: "Location and description" },
  { code: "asset.loanGiven", label: "Loan given", withNote: true, notePlaceholder: "Name and NID of the borrower" },
  { code: "asset.providentFund", label: "Provident fund or other fund" },
  { code: "asset.otherInvestment", label: "Other investment", withNote: true, notePlaceholder: "What it is" },
  { code: "asset.motorVehicle", label: "Motor vehicle(s)", hint: "Cost with registration.", withNote: true, notePlaceholder: "Type and registration no." },
  { code: "asset.ornaments", label: "Ornaments", withNote: true, notePlaceholder: "Quantity, e.g. 10 bhori gold" },
  { code: "asset.furniture", label: "Furniture and electronic items" },
  { code: "asset.other", label: "Other assets", withNote: true, notePlaceholder: "What they are" },
  { code: "asset.cashInHand", label: "Cash in hand" },
  { code: "asset.cashOther", label: "Other funds outside business" },
  { code: "asset.abroad", label: "Assets outside Bangladesh", withNote: true, notePlaceholder: "What and where" },
] as const satisfies readonly LineDef[];

/** IT-10B item 6: personal liabilities outside business. */
export const LIABILITY_LINES = [
  { code: "liability.institutional", label: "Institutional liabilities", withNote: true, notePlaceholder: "Lender" },
  { code: "liability.nonInstitutional", label: "Non-institutional liabilities", withNote: true, notePlaceholder: "Lender" },
  { code: "liability.other", label: "Other liabilities", withNote: true, notePlaceholder: "What it is" },
] as const satisfies readonly LineDef[];

export const LINE_SECTIONS = {
  salary: SALARY_LINES,
  otherIncome: OTHER_INCOME_LINES,
  lifestyle: LIFESTYLE_LINES,
  fund: FUND_LINES,
  assets: ASSET_LINES,
  liabilities: LIABILITY_LINES,
} as const;

export type LineSection = keyof typeof LINE_SECTIONS;
export type LineCode = (typeof LINE_SECTIONS)[LineSection][number]["code"];

export function isLineSection(value: string): value is LineSection {
  return Object.hasOwn(LINE_SECTIONS, value);
}

// ---------------------------------------------------------------------------
// Kinds of listed items (mirrors the Prisma enums)
// ---------------------------------------------------------------------------

export const FINANCIAL_ASSET_KINDS = {
  BANK_ACCOUNT: { label: "Bank account", valueLabel: "Year-end balance", incomeLabel: "Interest" },
  SANCHAYAPATRA: { label: "Sanchayapatra", valueLabel: "Face value", incomeLabel: "Profit" },
  DPS: { label: "Deposit pension scheme (DPS)", valueLabel: "Balance", incomeLabel: "Profit" },
  FIXED_DEPOSIT: { label: "Fixed / term deposit", valueLabel: "Balance", incomeLabel: "Interest" },
  SHARES: { label: "Shares, debentures, units", valueLabel: "Cost", incomeLabel: "Dividend" },
  BOND: { label: "Bond / securities", valueLabel: "Cost", incomeLabel: "Interest" },
  MOBILE_WALLET: { label: "Mobile wallet / card", valueLabel: "Year-end balance", incomeLabel: "Income" },
  OTHER: { label: "Other financial asset", valueLabel: "Value", incomeLabel: "Income" },
} as const;
export type FinancialAssetKind = keyof typeof FINANCIAL_ASSET_KINDS;

export const TAX_PAYMENT_KINDS = {
  SALARY_TDS: { label: "Salary TDS (employer's challan)" },
  OTHER_TDS: { label: "Other tax deducted or collected at source" },
  ADVANCE_TAX: { label: "Advance tax" },
  REFUND_ADJUSTMENT: { label: "Adjustment of an earlier year's refund" },
  WITH_RETURN: { label: "Tax paid with this return" },
} as const;
export type TaxPaymentKind = keyof typeof TAX_PAYMENT_KINDS;

/** Schedule 5, rows 1–10. `cap` is the most that counts per year, where the Act sets one. */
export const INVESTMENT_KINDS = {
  LIFE_INSURANCE: { label: "Life insurance premium or contractual deferred annuity" },
  DEPOSIT_PENSION: { label: "Contribution to deposit pension scheme", cap: 120000 },
  GOVT_SECURITIES: { label: "Government securities, Sanchayapatra, unit certificate, mutual fund, ETF" },
  LISTED_SECURITIES: { label: "Securities listed with an approved stock exchange" },
  PROVIDENT_FUND_1925: { label: "Contribution to provident fund under the PF Act 1925" },
  RECOGNIZED_PF: { label: "Self and employer's contribution to recognised provident fund" },
  SUPERANNUATION: { label: "Contribution to super annuation fund" },
  BENEVOLENT_FUND: { label: "Contribution to benevolent fund / group insurance premium" },
  ZAKAT: { label: "Contribution to Zakat fund" },
  OTHER: { label: "Others" },
} as const satisfies Record<string, { label: string; cap?: number }>;
export type InvestmentKind = keyof typeof INVESTMENT_KINDS;

export const BENEFIT_LABELS = {
  FREEDOM_FIGHTER: "A gazetted war-wounded freedom fighter",
  JULY_WARRIOR: "A gazetted \"July warrior\" injured in the 2024 uprising",
  FEMALE: "Female",
  THIRD_GENDER: "Third gender",
  DISABLED: "Person with disability",
  SENIOR: "Aged 65 years or more",
  PARENT_OF_DISABLED: "A parent of a person with disability",
} as const;

export const AREA_LABELS = {
  DHAKA_CHATTOGRAM_CITY: "Dhaka or Chattogram city corporation",
  OTHER_CITY: "Another city corporation",
  ELSEWHERE: "Anywhere else",
} as const;

export function isKind<T extends object>(kinds: T, value: string): value is Extract<keyof T, string> {
  return Object.hasOwn(kinds, value);
}
