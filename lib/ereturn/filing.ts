import type { Formatter } from "@/lib/i18n";
import { toNumber } from "@/lib/money";
import type { EReturnResult } from "./compute";
import type { TaxReturnRecord } from "./load";
import { INVESTMENT_KINDS, type InvestmentKind, type LineCode, SALARY_LINES } from "./lines";
import { assessmentYearOf, incomeYearStart } from "./rules";

// The return laid out the way NBR's eReturn site (etaxnbr.gov.bd) asks for it: its tabs in
// order — Assessment, Additional Information, Income, Rebate, Expenditure, Assets &
// Liabilities, Tax & Payment — with each field's label as the site words it and the value
// to type or paste. Amounts are copied as plain digits (the site groups them itself) and
// dates as DD-MM-YYYY, as its date pickers show them.

export interface FilingCell {
  /** What's shown. */
  text: string;
  /** What the copy button puts on the clipboard; absent for cells not to type. */
  copy?: string;
}

export type FilingItem =
  /** A field to type or paste. */
  | { kind: "value"; label: string; cell: FilingCell; hint?: string }
  /** A radio, checkbox or dropdown: the answer to pick. */
  | { kind: "choice"; label: string; answer: string; on?: boolean; hint?: string }
  /** A grid the site fills a row at a time ("+ Add"). */
  | { kind: "table"; title: string; columns: string[]; rows: FilingCell[][]; total?: FilingCell[]; hint?: string }
  /** Figures the site works out itself, shown to compare against. */
  | { kind: "check"; label: string; text: string; strong?: boolean }
  | { kind: "note"; text: string; tone?: "info" | "warning" };

export interface FilingScreen {
  id: string;
  /** The site's tab, e.g. "Income". */
  tab: string;
  title: string;
  /** Path after etaxnbr.gov.bd/#/user-panel/ */
  path: string;
  items: FilingItem[];
  /** Nothing to enter here for this return. */
  empty?: boolean;
}

const digits = (n: number) => String(Math.round(n));
const ddmmyyyy = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;

export function buildFilingGuide(record: TaxReturnRecord, r: EReturnResult, fmt: Formatter): FilingScreen[] {
  const money = (n: number): FilingCell => ({ text: fmt.money(Math.round(n)), copy: digits(n) });
  const text = (s: string | null | undefined): FilingCell => (s ? { text: s, copy: s } : { text: "—" });
  const date = (d: Date | null): FilingCell => (d ? { text: ddmmyyyy(d), copy: ddmmyyyy(d) } : { text: "—" });
  const lineOf = (code: LineCode) => {
    const l = record.lines.find((x) => x.code === code);
    return { amount: l ? toNumber(l.amount) : 0, note: l?.note ?? "" };
  };
  const yes = (on: boolean) => (on ? "Yes" : "No");
  const tick = (label: string, on: boolean, hint?: string): FilingItem => ({ kind: "choice", label, answer: on ? "Tick" : "Leave unticked", on, hint });
  const amountItem = (label: string, amount: number, hint?: string): FilingItem => ({ kind: "value", label, cell: money(amount), hint });
  const start = incomeYearStart(record.incomeYear);
  const assets = record.financialAssets;
  const ofKind = (...kinds: string[]) => assets.filter((a) => kinds.includes(a.kind));
  const i = r.income;
  const benefits = new Set<string>(record.benefits);

  // ── Assessment ──
  const assessment: FilingScreen = {
    id: "assessment",
    tab: "Assessment",
    title: "Assessment Information",
    path: "assessment/regular-return",
    items: [
      { kind: "choice", label: "Assessment Year (top right)", answer: assessmentYearOf(record.incomeYear).replace("-", "-20") },
      { kind: "choice", label: "Return Scheme", answer: "Self" },
      { kind: "value", label: "Income Year — From", cell: { text: `01-07-${start}`, copy: `01-07-${start}` } },
      { kind: "value", label: "Income Year — To", cell: { text: `30-06-${start + 1}`, copy: `30-06-${start + 1}` } },
      { kind: "choice", label: "Resident Status", answer: record.resident ? "Resident" : "Non Resident" },
      {
        kind: "choice",
        label: "Tax Exempted Income — Any income which is fully exempted from tax?",
        answer: yes(r.exemptIncome.other > 0),
        on: r.exemptIncome.other > 0,
        hint: "The ⅓ salary exemption is worked out on the employment screen; answer Yes only for other exempt income.",
      },
      { kind: "choice", label: "Heads of Income — Any taxable income in the income year?", answer: yes(i.total > 0), on: i.total > 0 },
      tick("Income from Employment", r.salary.gross > 0),
      tick("Income from Rent", i.rent > 0),
      tick("Income from Agriculture", i.agriculture > 0),
      tick("Income from Business or Profession", i.business > 0),
      tick("Capital Gains", i.capitalGain > 0),
      tick("Income from Financial Assets", i.financialAssets > 0),
      tick("Income from Other Sources", i.otherSources > 0),
      tick("As a Partner of a Firm / As a Member of an AoP", i.firmShare > 0, "Tick the one that applies."),
      tick("Income Earned outside Bangladesh", i.abroad > 0),
      tick("Income Earned by the Spouse or Minor Children", i.minorSpouse > 0),
      tick("Voluntary Disclosure of Income under 1st Schedule", false),
    ],
  };

  // ── Additional information ──
  const areaAnswer =
    record.area === "DHAKA_CHATTOGRAM_CITY" ? "Dhaka / Chattogram city corporation" : record.area === "OTHER_CITY" ? "Another city corporation" : "Any Other Area";
  const w = r.wealth;
  const additional: FilingScreen = {
    id: "additional",
    tab: "Assessment",
    title: "Additional Information",
    path: "additional-information",
    items: [
      new Set(Object.values(r.rules.minimumTax)).size > 1
        ? { kind: "choice", label: "Location of Main Source of Income", answer: areaAnswer, hint: "Pick the option that matches in the dropdown." }
        : {
            kind: "choice",
            label: "Location of Main Source of Income",
            answer: "Where you earn most",
            hint: "Pick yours in the dropdown (e.g. “Any Other Area” outside the city corporations). The minimum tax is the same everywhere this year, so it doesn't change the tax.",
          },
      tick("War-wounded Gazetted Freedom Fighter / Wounded Gazetted July Fighter", benefits.has("FREEDOM_FIGHTER") || benefits.has("JULY_WARRIOR")),
      tick("Person with Disability / Third Gender", benefits.has("DISABLED") || benefits.has("THIRD_GENDER")),
      tick("Claim Benefit as a Parent/Legal Guardian of a Person with Disability", benefits.has("PARENT_OF_DISABLED")),
      { kind: "note", text: "There's no box for women or anyone 65 or older: the site takes that from your TIN registration." },
      { kind: "choice", label: "Tax Rebate — Claim tax rebate for investment?", answer: yes(record.investments.length > 0), on: record.investments.length > 0 },
      { kind: "choice", label: "IT10B — Gross Wealth over 50,00,000?", answer: yes(w.grossWealth > 5000000 || w.assets.total > 5000000) },
      { kind: "choice", label: "IT10B — Own Motor Car?", answer: yes(w.assets.motorVehicle > 0) },
      { kind: "choice", label: "IT10B — Own Offshore Property?", answer: yes(w.assets.abroad > 0) },
      { kind: "choice", label: "IT10B — Shareholder director of a company?", answer: yes(w.assets.directorShares > 0) },
      {
        kind: "choice",
        label: "IT10B — Have any House Property?",
        answer: yes(w.assets.nonAgriProperty > 0),
        hint: w.assets.nonAgriProperty > 0 ? "Yes only if the non-agricultural property includes a house or flat." : undefined,
      },
    ],
  };

  // ── Income: employment ──
  const salaryRows = SALARY_LINES.map((d, n) => ({ d, n, l: lineOf(d.code) })).filter((x) => x.l.amount > 0);
  const employment: FilingScreen = {
    id: "employment",
    tab: "Income",
    title: "Income from Employment",
    path: "employment",
    empty: r.salary.gross === 0,
    items:
      r.salary.gross === 0
        ? [{ kind: "note", text: "No salary this year." }]
        : [
            { kind: "note", text: "These follow the salary schedule of the printed return; the site may word or group them a little differently, so match each by meaning." },
            { kind: "value", label: "Employer", cell: text(record.employerName) },
            ...salaryRows.map(({ d, n, l }): FilingItem => amountItem(`${n + 1}. ${d.label}`, l.amount, l.note || undefined)),
            { kind: "check", label: "Total salary received", text: fmt.money(r.salary.gross) },
            { kind: "check", label: `Exempted (the lesser of ⅓ and ${fmt.money(r.rules.salaryExemption.cap)})`, text: fmt.money(r.salary.exempt) },
            { kind: "check", label: "Income from salary", text: fmt.money(r.salary.taxable), strong: true },
          ],
  };

  // ── Income: financial assets ──
  const sanchayapatra = ofKind("SANCHAYAPATRA");
  const deposits = ofKind("BANK_ACCOUNT", "FIXED_DEPOSIT", "DPS").filter((a) => toNumber(a.income) > 0 || toNumber(a.taxDeducted) > 0);
  const otherFinancial = ofKind("SHARES", "BOND", "MOBILE_WALLET", "OTHER").filter((a) => toNumber(a.income) > 0);
  const accountType = (kind: string) => (kind === "FIXED_DEPOSIT" ? "FDR / Term Deposit" : kind === "DPS" ? "DPS" : "Savings / SND");
  const financial: FilingScreen = {
    id: "financial",
    tab: "Income",
    title: "Income from Financial Assets",
    path: "financial-assets",
    empty: i.financialAssets === 0,
    items: [
      ...(sanchayapatra.length > 0
        ? [
            {
              kind: "table",
              title: "Interest From Sanchayapatra",
              hint: "Or use the site's Import From NSD, then check each row against this. Tick Encashed for a certificate cashed during the year.",
              columns: ["Scheme Name", "Registration No", "Issue Date", "Value", "Gross Interest", "TDS"],
              rows: sanchayapatra.map((a) => [
                { text: a.description || "Pick the scheme" },
                text(a.reference),
                date(a.openedDate),
                money(toNumber(a.value)),
                money(toNumber(a.income)),
                money(toNumber(a.taxDeducted)),
              ]),
              total: [
                { text: "Total" },
                { text: "" },
                { text: "" },
                money(sanchayapatra.reduce((s, a) => s + toNumber(a.value), 0)),
                money(sanchayapatra.reduce((s, a) => s + toNumber(a.income), 0)),
                money(sanchayapatra.reduce((s, a) => s + toNumber(a.taxDeducted), 0)),
              ],
            } satisfies FilingItem,
          ]
        : []),
      ...(deposits.length > 0
        ? [
            {
              kind: "table",
              title: "Interest/Profit (Bank/FI)",
              hint: "Add this type with + Add Another Type. Related Fees/Charges: bank charges taken from the account, if you want them deducted — 0 otherwise.",
              columns: ["Bank/FI Name", "Account Type", "Branch Name", "Account No", "Gross Interest/Profit", "Related Fees/Charges", "TDS", "Year End Balance"],
              rows: deposits.map((a) => [
                text(a.institution),
                { text: accountType(a.kind) },
                text(a.branch),
                text(a.reference),
                money(toNumber(a.income)),
                money(0),
                money(toNumber(a.taxDeducted)),
                money(toNumber(a.value)),
              ]),
            } satisfies FilingItem,
          ]
        : []),
      ...otherFinancial.map(
        (a): FilingItem => ({
          kind: "value",
          label: `${a.institution}${a.reference ? ` (${a.reference})` : ""} — add its type with + Add Another Type`,
          cell: money(toNumber(a.income)),
          hint: toNumber(a.taxDeducted) > 0 ? `Tax deducted: ${fmt.money(toNumber(a.taxDeducted))}` : undefined,
        }),
      ),
      ...(i.financialAssets === 0 ? [{ kind: "note", text: "No income from financial assets this year." } satisfies FilingItem] : []),
      { kind: "check", label: "Income from financial assets", text: fmt.money(i.financialAssets), strong: true },
    ],
  };

  // ── Income: other heads ──
  const otherHeads: [string, LineCode][] = [
    ["Income from Rent", "income.rent"],
    ["Income from Agriculture", "income.agriculture"],
    ["Income from Business or Profession", "income.business"],
    ["Capital Gains", "income.capitalGain"],
    ["Income from Other Sources", "income.otherSources"],
    ["Share of Income from Firm or AoP", "income.firmShare"],
    ["Income of Minor or Spouse", "income.minorSpouse"],
    ["Foreign Income", "income.abroad"],
  ];
  const presentHeads = otherHeads.filter(([, code]) => lineOf(code).amount > 0);
  const otherIncome: FilingScreen = {
    id: "other-income",
    tab: "Income",
    title: "Other heads of income",
    path: "",
    empty: presentHeads.length === 0,
    items:
      presentHeads.length === 0
        ? [{ kind: "note", text: "No other income this year." }]
        : presentHeads.map(([label, code]) => amountItem(label, lineOf(code).amount, lineOf(code).note || undefined)),
  };

  // ── Income: tax-exempted ──
  const exemptOther = lineOf("exempt.other");
  const exempt: FilingScreen = {
    id: "exempt",
    tab: "Income",
    title: "Tax Exempted Income",
    path: "tax-exempted-income",
    empty: exemptOther.amount === 0,
    items:
      exemptOther.amount === 0
        ? [{ kind: "note", text: "Nothing beyond the salary exemption, which the site works out itself." }]
        : [
            { kind: "choice", label: "Tax Exempted Income Type", answer: exemptOther.note || "Pick the type that matches" },
            amountItem("Total Amount Received", exemptOther.amount),
          ],
  };

  // ── Rebate ──
  const NBR_INVESTMENT_LABEL: Record<InvestmentKind, string> = {
    LIFE_INSURANCE: "Life Insurance Premium",
    DEPOSIT_PENSION: "Deposit Pension Scheme (DPS)",
    GOVT_SECURITIES: "Approved Sanchayapatra & Other Govt. Securities",
    LISTED_SECURITIES: "Listed Stocks or Shares",
    PROVIDENT_FUND_1925: "General Provident Fund (GPF)",
    RECOGNIZED_PF: "Recognized Provident Fund (RPF)",
    SUPERANNUATION: "Approved Superannuation Fund",
    BENEVOLENT_FUND: "Approved Benevolent Fund & Group Insurance Premium",
    ZAKAT: "Zakat Fund (Under Zakat Fund Management ACT 2023)",
    OTHER: "Others",
  };
  const investmentKinds = [...new Set(record.investments.map((x) => x.kind))];
  const rebate: FilingScreen = {
    id: "rebate",
    tab: "Rebate",
    title: "Rebate — Investment Category",
    path: "rebate",
    empty: record.investments.length === 0,
    items:
      record.investments.length === 0
        ? [{ kind: "note", text: "No rebatable investment this year: answer No to the rebate question on Additional Information." }]
        : [
            ...investmentKinds.map(
              (kind): FilingItem => ({
                kind: "table",
                title: `Tick “${NBR_INVESTMENT_LABEL[kind]}”`,
                hint:
                  kind === "GOVT_SECURITIES"
                    ? "Name of the Instrument: “Other than Pensioners” for ordinary Sanchayapatra. Unit certificates and mutual funds go under “Unit Certificate/Mutual Fund/ETF/Joint Investment Scheme” instead."
                    : kind === "DEPOSIT_PENSION"
                      ? `Bank/FI and Account No of the DPS; Deposit Amount is what you paid in during the year (up to ${fmt.money(120000)} is allowed).`
                      : INVESTMENT_KINDS[kind].label,
                columns: ["Description", "Date", "Amount"],
                rows: record.investments.filter((x) => x.kind === kind).map((x) => [text(x.description), date(x.date), money(toNumber(x.amount))]),
              }),
            ),
            { kind: "check", label: "Total Actual Investment", text: fmt.money(record.investments.reduce((s, x) => s + toNumber(x.amount), 0)) },
            { kind: "check", label: "Allowable investment (after caps)", text: fmt.money(r.tax.eligibleInvestment) },
            {
              kind: "note",
              tone: "warning",
              text: "Only investment made during the income year earns the rebate. The site may accept older certificates in this list, but NBR can disallow them on assessment.",
            },
          ],
  };

  // ── Expenditure ──
  const exp = (code: LineCode, label: string, hint?: string): FilingItem => {
    const l = lineOf(code);
    return { kind: "value", label, cell: money(l.amount), hint: [hint, l.note && `Comment: ${l.note}`].filter(Boolean).join(" ") || undefined };
  };
  const expenditure: FilingScreen = {
    id: "expenditure",
    tab: "Expenditure",
    title: "Expenditure (IT-10BB)",
    path: "expenditure",
    items: [
      exp("lifestyle.food", "Expenses for Food, Clothing and Other Essentials"),
      exp("lifestyle.housing", "Accommodation Expense"),
      exp("lifestyle.transport", "Auto and Transportation Expenses", "Expand the row (▾) to enter it."),
      exp("lifestyle.utility", "Household and Utility Expenses", "Expand the row (▾): electricity, gas, water, phone, internet."),
      exp("lifestyle.education", "Education Expenses"),
      exp("lifestyle.festival", "Festival And Other Special Expenses", "Expand the row (▾)."),
      exp("lifestyle.travel", "Any Other Expenses", "Travel and vacation (IT-10BB line 6): the site has no row of its own for it on this screen."),
      { kind: "check", label: "Total Expense Relating to Lifestyle", text: fmt.money(r.lifestyle.total - r.lifestyle.taxPaid) },
      {
        kind: "check",
        label: `Tax, Charges, Etc. Paid During 1st July ${start} to 30th June ${start + 1}`,
        text: fmt.money(r.lifestyle.taxPaid),
      },
      exp("lifestyle.loanInterest", "Interest Payment of Personal Loan"),
      amountItem("Environmental Surcharge", r.tax.environmentalSurcharge),
      { kind: "check", label: "Total Amount of Expense and Tax", text: fmt.money(r.lifestyle.total + r.tax.environmentalSurcharge), strong: true },
    ],
  };

  // ── Assets & liabilities ──
  const withNote = (code: LineCode, label: string, hint?: string): FilingItem[] => {
    const l = lineOf(code);
    if (l.amount === 0) return [];
    return [{ kind: "value", label, cell: money(l.amount), hint: [l.note && `Description: ${l.note}`, hint].filter(Boolean).join(" · ") || undefined }];
  };
  const fixed = ofKind("FIXED_DEPOSIT");
  const dps = ofKind("DPS");
  const shares = ofKind("SHARES", "BOND");
  const banks = ofKind("BANK_ACCOUNT", "MOBILE_WALLET");
  const otherFinancialAssets = ofKind("OTHER");
  const assetsScreen: FilingScreen = {
    id: "assets",
    tab: "Assets & Liabilities",
    title: "Assets",
    path: "assets-and-liabilities",
    items: [
      {
        kind: "note",
        text: "Tick each heading that applies, then fill its rows. “Import and Autofill” at the top copies last year's statement — check it against this.",
      },
      ...withNote("asset.business", "Business Capital", "Business assets less business liabilities."),
      ...withNote("asset.nonAgriProperty", "Non-Agricultural Property — Purchase/Acquisition cost", "Also give Property Type, Description and Location, Type of Acquisition and area."),
      ...withNote("asset.agriProperty", "Agricultural Property — cost"),
      ...withNote("asset.directorShares", "Director's shareholdings in companies"),
      ...withNote("asset.partnershipCapital", "Business capital of partnership firm"),
      ...(shares.length > 0
        ? [
            {
              kind: "table",
              title: "Financial Assets → Share, Debenture, Bond, Securities, Unit Certificate",
              columns: ["Particulars", "Reference", "Value"],
              rows: shares.map((a) => [text(a.institution), text(a.reference), money(toNumber(a.value))]),
            } satisfies FilingItem,
          ]
        : []),
      ...(sanchayapatra.length > 0
        ? [
            {
              kind: "table",
              title: "Financial Assets → Sanchayapatra",
              hint: "“Import from Income” fills these from the income screen.",
              columns: ["Type of Sanchayapatra", "Registration No.", "Issue Date", "Value"],
              rows: sanchayapatra.map((a) => [{ text: a.description || "—" }, text(a.reference), date(a.openedDate), money(toNumber(a.value))]),
              total: [{ text: "Sub Total" }, { text: "" }, { text: "" }, money(sanchayapatra.reduce((s, a) => s + toNumber(a.value), 0))],
            } satisfies FilingItem,
          ]
        : []),
      ...(fixed.length > 0
        ? [
            {
              kind: "table",
              title: "Financial Assets → Fixed Deposits, Term Deposits",
              columns: ["Particulars", "Name of the Bank", "Account No.", "Balance Amount"],
              rows: fixed.map((a) => [{ text: "FDR" }, text(a.institution), text(a.reference), money(toNumber(a.value))]),
            } satisfies FilingItem,
          ]
        : []),
      ...(dps.length > 0
        ? [
            {
              kind: "table",
              title: "Financial Assets → DPS",
              columns: ["Bank", "Account No.", "Balance"],
              rows: dps.map((a) => [text(a.institution), text(a.reference), money(toNumber(a.value))]),
            } satisfies FilingItem,
          ]
        : []),
      ...withNote("asset.loanGiven", "Financial Assets → Loans Given to Others", "Name and NID of each borrower."),
      ...withNote("asset.providentFund", "Financial Assets → Provident Fund and Other Fund"),
      ...withNote("asset.otherInvestment", "Financial Assets → Other Financial Assets"),
      ...otherFinancialAssets.map(
        (a): FilingItem => ({ kind: "value", label: `Financial Assets → Other Financial Assets: ${a.institution}`, cell: money(toNumber(a.value)) }),
      ),
      ...withNote("asset.motorVehicle", "Motor Car", "Type and registration number."),
      ...withNote("asset.ornaments", "Gold, Diamond, Gems and Other Items", "Give the quantity."),
      ...withNote("asset.furniture", "Furniture, Equipments and Electronic Items", "The site takes a row per item (Particulars, Type of Acquisition, Quantity, Value); this is the total."),
      ...withNote("asset.other", "Other Assets of Significant Value"),
      ...(banks.length > 0
        ? [
            {
              kind: "table",
              title: "Cash and Fund Outside Business → Notes, Currencies, Banks, Cards and Other Electronic Cash",
              hint: "“Import from Income” fills the accounts that earned interest; add the rest.",
              columns: ["Type", "Bank/FI Name", "Account/Card no.", "Balance"],
              rows: banks.map((a) => [{ text: a.kind === "MOBILE_WALLET" ? "Mobile wallet / card" : "Bank Account" }, text(a.institution), text(a.reference), money(toNumber(a.value))]),
              total: [{ text: "Aggregate Amount at the End of Income Year" }, { text: "" }, { text: "" }, money(w.assets.cash.bank + banks.filter((a) => a.kind === "MOBILE_WALLET").reduce((s, a) => s + toNumber(a.value), 0))],
            } satisfies FilingItem,
          ]
        : []),
      ...withNote("asset.cashInHand", "Cash in Hand — Amount at the End of Income Year"),
      ...withNote("asset.cashOther", "Other Deposits, Balance and Advance"),
      ...withNote("asset.abroad", "Asset Outside Bangladesh"),
      { kind: "check", label: "Total assets", text: fmt.money(w.assets.total), strong: true },
    ],
  };

  const liabilities: FilingScreen = {
    id: "liabilities",
    tab: "Assets & Liabilities",
    title: "Liabilities, Other Outflow, Sources of Fund",
    path: "assets-and-liabilities",
    items: [
      ...withNote("liability.institutional", "Liabilities (Outside Business) → Institutional"),
      ...withNote("liability.nonInstitutional", "Liabilities (Outside Business) → Non-institutional"),
      ...withNote("liability.other", "Liabilities (Outside Business) → Other"),
      ...(w.liabilities.total === 0 ? [{ kind: "choice", label: "Liabilities (Outside Business)", answer: "None — leave empty" } satisfies FilingItem] : []),
      { kind: "check", label: "Other Outflow → Annual Living Expense (filled from Expenditure)", text: fmt.money(w.expenses.lifestyle) },
      ...withNote("wealth.otherLoss", "Other Outflow → Loss Deduction Other Expense / Gift Donation and Contribution", "Tick the one that fits."),
      { kind: "check", label: "Sources of Fund → Income Shown in the Return (excluding non cash benefits)", text: fmt.money(w.sources.taxableIncome) },
      { kind: "check", label: "Sources of Fund → Tax Exempted Income and Allowances", text: fmt.money(w.sources.exemptIncome) },
      ...withNote("fund.gift", "Sources of Fund → Other Receipts", "Gifts and other receipts."),
      { kind: "value", label: "Net Wealth at the Last Date of Previous Income Year", cell: money(w.previousNetWealth), hint: "Item 5 of last year's IT-10B." },
    ],
  };

  const summary: FilingScreen = {
    id: "summary",
    tab: "Assets & Liabilities",
    title: "Summary — compare with the site",
    path: "assets-and-liabilities",
    items: [
      { kind: "check", label: "Gross Wealth", text: fmt.money(w.assets.total) },
      { kind: "check", label: "Total Liabilities Outside Business", text: fmt.money(w.liabilities.total) },
      { kind: "check", label: "Net Wealth", text: fmt.money(w.assets.total - w.liabilities.total) },
      { kind: "check", label: "Net Wealth at the Last Date of Previous Income Year", text: fmt.money(w.previousNetWealth) },
      { kind: "check", label: "Change in Net Wealth", text: fmt.money(w.assets.total - w.liabilities.total - w.previousNetWealth) },
      { kind: "check", label: "Other Fund Outflow During Income Year", text: fmt.money(w.expenses.total) },
      { kind: "check", label: "Total Fund Outflow", text: fmt.money(w.assets.total - w.liabilities.total - w.previousNetWealth + w.expenses.total) },
      { kind: "check", label: "Source of Fund", text: fmt.money(w.sources.total) },
      { kind: "check", label: "Difference", text: fmt.money(w.difference), strong: true },
      ...(w.difference !== 0
        ? [{ kind: "note", tone: "warning", text: "The site shows the same difference: it must be 0 before you submit. See the Assets & expenses tab." } satisfies FilingItem]
        : []),
    ],
  };

  // ── Tax & payment ──
  const t = r.tax;
  const salaryChallans = record.payments.filter((p) => p.kind === "SALARY_TDS" || p.kind === "OTHER_TDS");
  const tax: FilingScreen = {
    id: "tax",
    tab: "Tax & Payment",
    title: "Tax & Payment — compare, then record payments",
    path: "tax-and-payment",
    items: [
      { kind: "note", text: "The site works out the tax itself from what you entered. Compare its figures with these before you proceed." },
      { kind: "check", label: "Income from Employment", text: fmt.money(i.employment) },
      { kind: "check", label: "Income from Financial Assets", text: fmt.money(i.financialAssets) },
      ...(i.total - i.employment - i.financialAssets > 0 ? [{ kind: "check", label: "Other heads", text: fmt.money(i.total - i.employment - i.financialAssets) } satisfies FilingItem] : []),
      { kind: "check", label: "Total Income", text: fmt.money(i.total), strong: true },
      { kind: "check", label: "Tax Exempted Income", text: fmt.money(r.exemptIncome.total) },
      { kind: "check", label: "Gross Tax before Rebate", text: fmt.money(t.grossTax) },
      { kind: "check", label: "Tax Rebate — On Investment (allowed)", text: fmt.money(t.rebateAllowed) },
      { kind: "check", label: "Minimum Payable Tax — For Taxable Income", text: fmt.money(t.minimumTax) },
      { kind: "check", label: "Net Tax after Rebate", text: fmt.money(t.taxPayable) },
      { kind: "check", label: "Surcharge — Wealth surcharge", text: fmt.money(t.netWealthSurcharge) },
      amountItem("Surcharge — Environmental surcharge (✎)", t.environmentalSurcharge),
      amountItem("Any Other Amount (✎)", t.delayInterest),
      { kind: "check", label: "Total Amount Payable", text: fmt.money(t.totalPayable), strong: true },
      {
        kind: "note",
        tone: "warning",
        text:
          "Total Amount Payable and the refund or amount due must agree with the site. If they don't, compare the income screens first: a missing row or a different figure there is the usual cause.",
      },
      ...(salaryChallans.length > 0
        ? [
            {
              kind: "table",
              title: "Payment → Source Tax (▾) — challans",
              hint: "Use “Update Tax Payment Status” if a challan isn't listed.",
              columns: ["Challan no", "Date", "Bank", "Amount"],
              rows: salaryChallans.map((p) => [text(p.reference), date(p.date), text(p.bank), money(toNumber(p.amount))]),
              total: [{ text: "Total" }, { text: "" }, { text: "" }, money(salaryChallans.reduce((s, p) => s + toNumber(p.amount), 0))],
            } satisfies FilingItem,
          ]
        : []),
      { kind: "check", label: "Payment → Source Tax (challans and interest/profit TDS)", text: fmt.money(r.paid.tds) },
      amountItem("Payment → Advance Income Tax", r.paid.advance),
      amountItem("Payment → Tax Paid With Return", r.paid.withReturn),
      { kind: "check", label: "Total Payment & Adjustments", text: fmt.money(r.paid.total) },
      r.paid.due > 0
        ? { kind: "check", label: "Net Payable — pay before you submit (Pay Now)", text: fmt.money(r.paid.due), strong: true }
        : { kind: "check", label: "Refundable", text: fmt.money(r.paid.excess), strong: true },
      { kind: "note", text: "Then “Proceed to online return”, check the Return View, and submit." },
    ],
  };

  return [assessment, additional, employment, financial, otherIncome, exempt, rebate, expenditure, assetsScreen, liabilities, summary, tax];
}
