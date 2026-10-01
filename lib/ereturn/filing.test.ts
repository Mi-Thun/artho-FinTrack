import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { createFormatter } from "@/lib/i18n";
import { computeEReturn } from "./compute";
import { buildFilingGuide, type FilingItem, type FilingScreen } from "./filing";
import { toComputeInput, type TaxReturnRecord } from "./load";
import type { EReturnRules } from "./rules";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const dec = (n: number) => new Prisma.Decimal(n);

const RULES: EReturnRules = {
  incomeYear: "2025-26",
  source: "test",
  own: false,
  threshold: { general: 375000, femaleOrSenior: 425000, thirdGender: 500000, disabled: 500000, freedomFighter: 525000, julyWarrior: 525000 },
  parentOfDisabledExtra: 50000,
  slabs: [
    { width: 300000, rate: 0.1 },
    { width: 400000, rate: 0.15 },
    { width: 500000, rate: 0.2 },
    { width: 2000000, rate: 0.25 },
    { width: Infinity, rate: 0.3 },
  ],
  nonResidentRate: 0.3,
  minimumTax: { DHAKA_CHATTOGRAM_CITY: 5000, OTHER_CITY: 5000, ELSEWHERE: 5000 },
  minimumTaxFirstReturn: 1000,
  salaryExemption: { fraction: 1 / 3, cap: 500000 },
  rebate: { incomePct: 0.03, investmentPct: 0.15, cap: 1000000 },
  netWealthSurcharge: [{ above: 40000000, rate: 0.1 }],
  surchargeOnRegularTax: true,
  sanchayapatraFinalTax: true,
  returnDueDate: "11-30",
  firstReturnDueDate: "06-30",
  lateFiling: { monthlyRate: 0.02, maxMonths: 24 },
};

// A fictional taxpayer.
const lines: [string, number, string?][] = [
  ["salary.basic", 600000],
  ["salary.allowances", 300000],
  ["lifestyle.food", 240000],
  ["lifestyle.travel", 30000, "Family trip"],
  ["asset.cashInHand", 20000],
];
const record = {
  id: "r1",
  incomeYear: "2025-26",
  status: "DRAFT",
  name: "Test Taxpayer",
  resident: true,
  benefits: [],
  dateOfBirth: d("1990-01-01"),
  area: "ELSEWHERE",
  firstReturn: false,
  employerName: "Example Ltd",
  previousNetWealth: dec(0),
  lastYearTaxPaid: dec(0),
  environmentalSurcharge: dec(0),
  delayInterest: dec(0),
  filedAt: d("2026-11-01"),
  lines: lines.map(([code, amount, note]) => ({ code, amount: dec(amount), note: note ?? null })),
  financialAssets: [
    {
      kind: "SANCHAYAPATRA",
      institution: "Example Bank",
      branch: null,
      reference: "2024-0000001",
      description: "Pensioner Sanchayapatra",
      openedDate: d("2024-08-15"),
      value: dec(100000),
      income: dec(10000),
      taxDeducted: dec(1000),
    },
    {
      kind: "BANK_ACCOUNT",
      institution: "Example Bank",
      branch: "Main Branch",
      reference: "0001-0002",
      description: null,
      openedDate: null,
      value: dec(50000),
      income: dec(500),
      taxDeducted: dec(50),
    },
  ],
  payments: [{ kind: "SALARY_TDS", reference: "CH-1", date: d("2026-01-10"), bank: "Example Bank", amount: dec(12000) }],
  investments: [{ kind: "DEPOSIT_PENSION", description: "DPS 0003", date: d("2025-09-01"), amount: dec(60000) }],
} as unknown as TaxReturnRecord;

const fmt = createFormatter("EN", "WESTERN");
const result = computeEReturn(toComputeInput(record), { rules: RULES, exact: true });
const screens = buildFilingGuide(record, result, fmt);
const screen = (id: string) => screens.find((s) => s.id === id)!;
const nameOf = (i: FilingItem) => ("label" in i ? i.label : "title" in i ? i.title : "");
const item = (s: FilingScreen, label: string | RegExp) =>
  s.items.find((i) => (typeof label === "string" ? nameOf(i).includes(label) : label.test(nameOf(i)))) as FilingItem;

describe("buildFilingGuide", () => {
  it("follows the eReturn site's screens in order", () => {
    expect(screens.map((s) => s.id)).toEqual([
      "assessment",
      "additional",
      "employment",
      "financial",
      "other-income",
      "exempt",
      "rebate",
      "expenditure",
      "assets",
      "liabilities",
      "summary",
      "tax",
    ]);
  });

  it("answers the assessment questions", () => {
    const a = screen("assessment");
    expect(item(a, "Assessment Year")).toMatchObject({ answer: "2026-2027" });
    expect(item(a, "Income Year — From")).toMatchObject({ cell: { copy: "01-07-2025" } });
    expect(item(a, "Income Year — To")).toMatchObject({ cell: { copy: "30-06-2026" } });
    expect(item(a, "Income from Employment")).toMatchObject({ on: true });
    expect(item(a, "Income from Rent")).toMatchObject({ on: false });
    expect(item(screen("additional"), "Claim tax rebate")).toMatchObject({ answer: "Yes" });
    expect(item(screen("additional"), "Location")).toMatchObject({ answer: "Where you earn most" });
  });

  it("copies amounts as plain digits and dates as DD-MM-YYYY", () => {
    const table = item(screen("financial"), "Interest From Sanchayapatra");
    if (table.kind !== "table") throw new Error("expected a table");
    expect(table.rows[0].map((c) => c.copy)).toEqual([undefined, "2024-0000001", "15-08-2024", "100000", "10000", "1000"]);
    const bank = item(screen("financial"), "Interest/Profit (Bank/FI)");
    if (bank.kind !== "table") throw new Error("expected a table");
    expect(bank.rows[0][1].text).toBe("Savings / SND");
    expect(bank.rows[0][4].copy).toBe("500");
  });

  it("puts travel under Any Other Expenses, with its note", () => {
    const other = item(screen("expenditure"), "Any Other Expenses");
    expect(other).toMatchObject({ cell: { copy: "30000" } });
    expect(other.kind === "value" && other.hint).toContain("Family trip");
  });

  it("lists the challans and the figures to compare", () => {
    const t = screen("tax");
    const challans = item(t, /Source Tax \(▾\)/);
    if (challans.kind !== "table") throw new Error("expected a table");
    expect(challans.rows[0].map((c) => c.copy)).toEqual(["CH-1", "10-01-2026", "Example Bank", "12000"]);
    expect(item(t, "Total Income")).toMatchObject({ text: fmt.money(result.income.total) });
    // The site may split the tax differently: say which figures must agree.
    expect(t.items.some((i) => i.kind === "note" && i.text.includes("Total Amount Payable"))).toBe(true);
  });

  it("leaves out empty asset rows", () => {
    const labels = screen("assets").items.map(nameOf);
    expect(labels).toContain("Cash in Hand — Amount at the End of Income Year");
    expect(labels).not.toContain("Motor Car");
  });
});
