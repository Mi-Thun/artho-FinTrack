import { describe, expect, it } from "vitest";
import { parseDocument } from "./parsers";
import { mergeDocuments, type ExistingReturn } from "./merge";
import { amountsIn, itemsToLines, parseDate } from "./text";
import type { AssetProposal, PaymentProposal } from "./types";

// Fixtures mirror the layout of real documents (as pdf.js or OCR yields them), with
// made-up names and numbers.

const ctx = { incomeYear: "2025-26", employerName: "Acme Software Ltd." };
const empty: ExistingReturn = { profile: {}, assets: [], payments: [], lines: {}, investments: [], previousNetWealth: 0 };

describe("text helpers", () => {
  it("rebuilds lines from pdf.js items, keeping columns apart", () => {
    const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [1, 0, 0, 1, x, y], width });
    expect(itemsToLines([item("Total Interest", 10, 500), item(":", 120, 500), item("22", 140, 501), item("Next", 10, 480)])).toEqual([
      "Total Interest  :  22",
      "Next",
    ]);
  });

  it("reads every date style the documents use", () => {
    expect(parseDate("13-05-2024")).toBe("2024-05-13");
    expect(parseDate("30/06/2026")).toBe("2026-06-30");
    expect(parseDate("30-JUN-2026")).toBe("2026-06-30");
    expect(parseDate("01-July-2025")).toBe("2025-07-01");
    expect(parseDate("2025-07-01")).toBe("2025-07-01");
    expect(parseDate("Aug 30, 2026")).toBe("2026-08-30");
    expect(parseDate("৩০/০৬/২০২৬")).toBe("2026-06-30");
    expect(parseDate("31-02-2026")).toBeNull();
  });

  it("finds lakh- and thousand-grouped amounts, not account numbers", () => {
    expect(amountsIn("10-07-2025  HEAD OFFICE  EWALLET A2A-NPSB  3,00,010.00  77,944.00")).toEqual([300010, 77944]);
    expect(amountsIn("CT/FT-CBLTA-251837430402-17815  500.00  620.04")).toEqual([500, 620.04]);
    expect(amountsIn("TO:1234567890001")).toEqual([]);
  });
});

describe("bank tax certificates", () => {
  it("reads a letter-style certificate", () => {
    const doc = parseDocument(
      [
        [
          "Tax Certificate",
          "This  is  to  inform  that,  your  Current/Saving  account  bearing  number",
          "1234567890123 maintained with SONALI BANK PLC, Mirpur Branch, Dhaka shows credit",
          "balance of Tk. 15,500.50 as at the close of business on 30-JUN-2026 . During 01-JUL-2025 to 30-JUN-2026 total",
          "Total Interest  :  120",
          "Source Tax  :  12",
        ],
      ],
      ctx,
    );
    expect(doc.kind).toBe("BANK_TAX_CERTIFICATE");
    expect(doc.warnings).toEqual([]);
    expect(doc.proposals).toEqual([
      expect.objectContaining({ institution: "Sonali Bank PLC", branch: "Mirpur Branch", reference: "1234567890123", value: 15500.5, income: 120, taxDeducted: 12 }),
    ]);
  });

  it("reads a table-style certificate, and warns about another year", () => {
    const doc = parseDocument(
      [
        [
          "City Bank PLC",
          "Ref: CBL/TAXCERTIFICATE/2025",
          "customer. We have deducted applicable withholding Tax on interest given to the below mentioned Account(s) for the period of 2024-07-01 to 2025-06-30 .",
          "Savings  9876543210001  Active  13-JUN-2023  1,250.75  80.00  8.00  72.00",
        ],
      ],
      ctx,
    );
    expect(doc.proposals).toEqual([expect.objectContaining({ institution: "City Bank PLC", reference: "9876543210001", value: 1250.75, income: 80, taxDeducted: 8 })]);
    expect(doc.warnings[0]).toMatch(/outside the 2025-26 income year/);
  });
});

describe("bank statements", () => {
  const statement = [
    [
      "STATEMENT OF ACCOUNT",
      "Branch : 12345-Mirpur Branch, Dhaka",
      "Account Number: 1234567890123",
      "Period: 01-July-2025 - 30-June-2026",
      "Routing Number: 200261234",
      "Opening Balance  10,000.00",
      "15-07-2025  Local Office, Dhaka  EFT AUTO  1,850.00  11,850.00",
      "202507150000001",
      "TREASURY SINGLE",
      "ACCOUN~30000000000~SANCHOY PROF",
      "20-07-2025  HEAD OFFICE  EWALLET A2A-NPSB  2,000.00  9,850.00",
      "31-12-2025  Mirpur Branch  INTEREST APPLIED  10.00  9,860.00",
      "31-12-2025  Mirpur Branch  TDS DEDUCTION ON  1.00  9,859.00",
      "INTEREST AMOUNT",
      "Closing Balance  9,859.00",
    ],
  ];

  it("finds the bank by routing number, and the year's interest, tax and closing balance", () => {
    const doc = parseDocument(statement, ctx);
    expect(doc.kind).toBe("BANK_STATEMENT");
    expect(doc.proposals).toEqual([
      expect.objectContaining({ institution: "Sonali Bank PLC", branch: "Mirpur Branch", reference: "1234567890123", value: 9859, income: 10, taxDeducted: 1 }),
    ]);
    expect(doc.notes[0]).toMatch(/Sanchayapatra profit received here: ৳1,850 in 1 payments/);
  });

  it("gives way to the tax certificate for the same account", () => {
    const certificate = parseDocument([["Tax Certificate", "account bearing number 1234567890123 maintained with SONALI BANK PLC, Mirpur Branch,", "Total Interest  :  11", "Source Tax  :  2"]], ctx);
    const items = mergeDocuments(
      [
        { fileName: "statement.pdf", parsed: parseDocument(statement, ctx) },
        { fileName: "certificate.pdf", parsed: certificate },
      ],
      empty,
    );
    expect(items).toHaveLength(1);
    const asset = items[0].proposal as AssetProposal;
    // Interest and tax from the certificate; the balance only the statement has.
    expect(asset).toMatchObject({ income: 11, taxDeducted: 2, value: 9859 });
    expect(items[0].sources).toEqual(["certificate.pdf", "statement.pdf"]);
  });
});

describe("salary TDS challans (OCR)", () => {
  // One scanned page: three copies, one where OCR's English model misread the Bangla
  // digits ৬৫০ as "830", and a printed 11th check digit on the challan number.
  const page = [
    "চালান ফরম",
    "সোনালী ব্যাংক ধানমন্ডি শাখা শাখায় টাকা জমা দেওয়ার চালান",
    "সার্কেল-৩১১, পরিদশী Acme Software (Pvt.) Ltd. |JOHN DOE ২৫২৬-০০০১১১২২২৩১ ১১১২১০১-কোম্পানিসমূহ ৬৫০.০০",
    "নতুন কোড: ১১১০২১৭১০৩০১৫-১১০০০০০০০-১১০০১০০০-১১১২১০১ মোট (অংকে) = 830.00",
    "২০২৬ - ২৭ এর জন্য আয়কর ধারা ৮৬ অনুযায়ী Salary TDS for December 2025",
    "তারিখ: ১২/০১/২০২৬ খ্রি",
    "সার্কেল-৩১১, পরিদশী Acme Software (Pvt.) Ltd. |JOHN DOE ২৫২৬-০০০১১১২২২৩১ ১১১২১০১-কোম্পানিসমূহ ৬৫০.০০",
    "মোট (অংকে) = ৬৫০.০০",
    "তারিখ: ১২/০১/২০২৬ খ্রি",
  ];

  it("reads the challan, trusting Bangla digits over Latin misreads", () => {
    const doc = parseDocument([page], ctx, true);
    expect(doc.kind).toBe("SALARY_CHALLAN");
    expect(doc.ocr).toBe(true);
    expect(doc.proposals).toEqual([
      {
        type: "payment",
        kind: "SALARY_TDS",
        reference: "2526-0001112223",
        date: "2026-01-12",
        amount: 650,
        depositedBy: "Acme Software (Pvt.) Ltd.",
        bank: "Sonali Bank PLC",
        note: "December 2025 salary",
      },
    ]);
  });

  it("prefers the same challan read from a text document", () => {
    const fromText: PaymentProposal = { type: "payment", kind: "SALARY_TDS", reference: "2526-0001112223", amount: 650, date: "2026-01-14" };
    const items = mergeDocuments(
      [
        { fileName: "scan.pdf", parsed: parseDocument([page], ctx, true) },
        { fileName: "return.pdf", parsed: { kind: "NBR_RETURN", summary: "", proposals: [fromText], notes: [], warnings: [], ocr: false } },
      ],
      empty,
    );
    expect(items).toHaveLength(1);
    expect(items[0].ocr).toBe(false);
    expect(items[0].proposal).toMatchObject({ date: "2026-01-14", note: "December 2025 salary" });
  });
});

describe("NBR return", () => {
  const pages = (assessmentYear: string) => [
    [
      "FORM OF RETURN OF INCOME FOR",
      "IT-11GA (2023)",
      "Serial No. of Return Register  9200000001",
      "Date of Return Submission  30/09/2026",
      "1. Name of the Taxpayer:  JOHN DOE",
      "2. National ID No. / Passport No. (If No  1234567890",
      "3. TIN:  1  2  3  4  5  6  7  8  9  0  1  2",
      "4. (a) Circle  Circle-100  (b) Taxes Zone:  10, Dhaka",
      `5. Assessment Year:  ${assessmentYear}  6. Residential Status:  Resident  Non-resident`,
      "9. Date of Birth (DD MM YYYY):",
      "1  5  0  8  1  9  9  0",
      "11. Address: Mirpur, Dhaka",
      "Telephone: 01700000000  Mobile: 01700000000  e-mail: john@example.com",
      "12. If employed, employer's name (latest employer's name in case of multiple employment): Acme Software Ltd.",
      "I  JOHN DOE  father / husband: Richard Doe  TIN  1  2  3",
    ],
    [
      "b. This part is applicable for employees other than employees receiving salary under government pay scale.",
      "1. Basic pay  6,00,000",
      "2. Allowances  4,00,000",
      "13. Total Salary Received (aggregate of 1 to 12)  10,00,000",
      "Particulars of Rebatable Investment:",
      "2.  Contribution to Deposit Pension Scheme  60,000",
      "11.  Total Investment (aggregate of 1 to 10)  60,000",
      "IT- 10 BB (2023)",
      "Serial  Particulars of Expenditure  Amount of Taka  Comments",
      "1.  Personal and family fooding, clothing and other essentials  1,20,000",
      "8.  Tax Deducted / Collected at Source (with TS on Profit of Sanchaypatra) and Tax  20,000",
      "9.  Interest Paid on Personal Loan Received from Institution & Other Source  5,000",
      "Total:  1,45,000",
      "IT-10B (2023)",
      "2. Net Wealth as on Last Date of Previous Income Year  5,00,000",
      "5. Net Wealth at the Last Date of this Financial Year (3 – 4)  9,00,000",
      "(i) Furniture and Electronic Items  2,00,000",
      "(ii) Cash in Hand  10,000",
      "1  Tin Mash Antar Munafa Vittik 3 Year Sanchayapatra  2025-0000001  01-08-2025  5,00,000",
      "1  Bank Account  Example Bank PLC  1111222233334  1,90,000",
      "Salary (Others)",
      "2526-0000000001  13-08-2025  Salary [  Acme  SONALI  Motijheel  1,500  1,500",
      "Bank TDS",
      "Example Bank PLC  Gulshan Branch  1111222233334  3,000  300",
      "Saving Certificate TDS",
      "Tin Mash Antar Munafa Vittik 3 Year Sanchayapatra  2025-0000001  01-08-2025  5,00,000  30,000  3,000",
    ],
  ];

  it("imports everything from this year's filed return", () => {
    const doc = parseDocument(pages("2026-2027"), ctx);
    expect(doc.kind).toBe("NBR_RETURN");
    const by = (type: string) => doc.proposals.filter((p) => p.type === type);
    expect(Object.fromEntries(by("profile").map((p) => [(p as { field: string }).field, (p as { value: string }).value]))).toMatchObject({
      name: "JOHN DOE",
      nid: "1234567890",
      tin: "123456789012",
      circle: "Circle-100",
      taxZone: "10, Dhaka",
      dateOfBirth: "1990-08-15",
      phone: "01700000000",
      email: "john@example.com",
      employerName: "Acme Software Ltd.",
      fatherName: "Richard Doe",
      serialNo: "9200000001",
      filedAt: "2026-09-30",
    });
    expect(by("line")).toEqual(
      expect.arrayContaining([
        { type: "line", code: "salary.basic", amount: 600000 },
        { type: "line", code: "salary.allowances", amount: 400000 },
        { type: "line", code: "lifestyle.food", amount: 120000 },
        { type: "line", code: "lifestyle.loanInterest", amount: 5000 },
        { type: "line", code: "asset.furniture", amount: 200000 },
        { type: "line", code: "asset.cashInHand", amount: 10000 },
      ]),
    );
    // Line 8 (tax) is worked out by the return, never imported.
    expect(by("line").some((p) => (p as { amount: number }).amount === 20000)).toBe(false);
    expect(by("investment")).toEqual([{ type: "investment", kind: "DEPOSIT_PENSION", amount: 60000 }]);
    expect(by("previousNetWealth")).toEqual([{ type: "previousNetWealth", amount: 500000 }]);
    expect(by("asset")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "SANCHAYAPATRA", reference: "2025-0000001", openedDate: "2025-08-01", value: 500000, income: 30000, taxDeducted: 3000 }),
        expect.objectContaining({ kind: "BANK_ACCOUNT", reference: "1111222233334", institution: "Example Bank PLC", branch: "Gulshan Branch", value: 190000, income: 3000, taxDeducted: 300 }),
      ]),
    );
    expect(by("payment")).toEqual([expect.objectContaining({ kind: "SALARY_TDS", reference: "2526-0000000001", amount: 1500, date: "2025-08-13" })]);
  });

  it("carries forward only what's still true from last year's return", () => {
    const doc = parseDocument(pages("2025-2026"), ctx);
    const types = new Set(doc.proposals.map((p) => p.type));
    expect(types.has("payment")).toBe(false);
    expect(types.has("investment")).toBe(false);
    expect(doc.proposals).toContainEqual({ type: "previousNetWealth", amount: 900000 });
    expect(doc.proposals).not.toContainEqual(expect.objectContaining({ code: "salary.basic" }));
    const sp = doc.proposals.find((p) => p.type === "asset" && p.kind === "SANCHAYAPATRA") as AssetProposal;
    expect(sp).toMatchObject({ value: 500000 });
    expect(sp.income).toBeUndefined();
    const bank = doc.proposals.find((p) => p.type === "asset" && p.kind === "BANK_ACCOUNT") as AssetProposal;
    expect(bank.value).toBeUndefined();
    expect(doc.rankOverride).toBe(1);
  });

  it("takes only the details from a return for another year", () => {
    const doc = parseDocument(pages("2020-2021"), ctx);
    expect(doc.proposals.every((p) => p.type === "profile")).toBe(true);
    expect(doc.warnings[0]).toMatch(/only your details/);
  });
});

describe("employer's salary certificate", () => {
  const certificate = [
    [
      "Schedule 2",
      '[Rules 10 (1)] "Income from Salaries"',
      "Source Tax Deduction or Collection Certificate",
      "1 Name and Address of individual or company who paid the source tax:  Acme Sofware Ltd.",
      "2 For which tax period payment has done:  2025-2026",
      "3 Name of the employee, designation and TIN:  John Doe, Engineer, 123456789012",
      "Income Heads  Amount (BDT)",
      "Basic Salary  300,000",
      "House Rent Allowances  150,000",
      "Medical Allowances  30,000",
      "Festive Bonus  50,000",
      "Total  530,000",
      "5 Gross Payment: 530,000",
      "8 Amount of source tax deduction: 1,500",
      "1  2526-00000000011  13.08.2025  Sonali Bank PLC  500  500  July-2025",
      "2  2526-00000000021  05.03.2025  Sonali Bank PLC  500  500  February-2026",
      "3  2526-00000000031  30.06.2026  Sonali Bank PLC  500  500  June-2026",
      "Total  1,500  1,500",
      "For Acme Software Ltd.",
    ],
  ];

  it("maps salary heads to the return's lines and reads the challans", () => {
    const doc = parseDocument(certificate, ctx);
    expect(doc.kind).toBe("SALARY_CERTIFICATE");
    expect(doc.proposals).toEqual(
      expect.arrayContaining([
        { type: "line", code: "salary.basic", amount: 300000 },
        { type: "line", code: "salary.allowances", amount: 230000 },
        // The signature line, spelt right, over item 1's typo.
        { type: "profile", field: "employerName", value: "Acme Software Ltd." },
        { type: "profile", field: "tin", value: "123456789012" },
      ]),
    );
    expect(doc.notes[0]).toBe("Allowances ৳2,30,000 = house rent allowances ৳1,50,000 + medical allowances ৳30,000 + festive bonus ৳50,000.");
    const challans = doc.proposals.filter((p) => p.type === "payment") as PaymentProposal[];
    expect(challans.map((c) => [c.reference, c.date, c.amount, c.note])).toEqual([
      ["2526-0000000001", "2025-08-13", 500, "July 2025 salary"],
      // 05.03.2025 can't pay February 2026's tax: the date is dropped, with a warning.
      ["2526-0000000002", undefined, 500, "February 2026 salary"],
      ["2526-0000000003", "2026-06-30", 500, "June 2026 salary"],
    ]);
    expect(doc.warnings).toEqual([expect.stringMatching(/2526-0000000002 is dated 05\.03\.2025, which doesn't fit the February 2026 salary/)]);
  });

  it("flags totals that don't add up", () => {
    const wrong = [certificate[0].map((l) => l.replace("Gross Payment: 530,000", "Gross Payment: 540,000").replace("deduction: 1,500", "deduction: 2,000"))];
    const doc = parseDocument(wrong, ctx);
    expect(doc.warnings).toEqual(
      expect.arrayContaining([expect.stringMatching(/heads add up to ৳5,30,000.*৳5,40,000/), expect.stringMatching(/challans add up to ৳1,500.*৳2,000/)]),
    );
  });
});

describe("Savings Directorate certificate", () => {
  // The Directorate's PDF garbles its Bangla font; the digits survive.
  const certificate = [
    [
      "গণপজজতনন বজবলজদদশ সরকজর",
      "জজতনয় সঞয় অধধদপর",
      "সনমসমহ হদত 2025-26 অর রবছদর আহধরত মনজফজ ও উৎদস আয়কর কতরদনর পধরমজণ ধনমরপপ",
      "৩ - মজস অনর মনজফজ ধভধতক সঞয়পত  2025-0000001  10/08/2024  100,000.00  10,000.00  500.00  --",
      "2025-0000002  20/02/2025  50,000.00  5,500.00  412.50  --",
      "মমনট :  150,000.00  15,500.00  912.50",
    ],
  ];

  it("reads each certificate's profit and tax, carrying the scheme down", () => {
    const doc = parseDocument(certificate, ctx);
    expect(doc.kind).toBe("SANCHAYAPATRA");
    expect(doc.warnings).toEqual([]);
    expect(doc.proposals).toEqual([
      expect.objectContaining({ institution: "National Savings Directorate", reference: "2025-0000001", description: "3-month profit-based Sanchayapatra", openedDate: "2024-08-10", value: 100000, income: 10000, taxDeducted: 500 }),
      expect.objectContaining({ reference: "2025-0000002", description: "3-month profit-based Sanchayapatra", openedDate: "2025-02-20", value: 50000, income: 5500, taxDeducted: 412.5 }),
    ]);
  });

  it("warns when it reports another fiscal year", () => {
    const doc = parseDocument([certificate[0].map((l) => l.replace("2025-26", "2024-25"))], ctx);
    expect(doc.warnings[0]).toMatch(/2024-25 fiscal year, not 2025-26/);
  });
});

describe("review status", () => {
  it("marks what the return already has", () => {
    const doc = parseDocument([["Tax Certificate", "account bearing number 1234567890123 maintained with SONALI BANK PLC, Mirpur Branch,", "Total Interest  :  11", "Source Tax  :  2"]], ctx);
    const existing: ExistingReturn = {
      ...empty,
      assets: [{ kind: "BANK_ACCOUNT", reference: "1234567890123", institution: "Sonali Bank PLC", value: 0, income: 11, taxDeducted: 2, openedDate: null }],
    };
    expect(mergeDocuments([{ fileName: "c.pdf", parsed: doc }], existing)[0].status).toBe("same");
    existing.assets[0].income = 10;
    expect(mergeDocuments([{ fileName: "c.pdf", parsed: doc }], existing)[0].status).toBe("update");
    expect(mergeDocuments([{ fileName: "c.pdf", parsed: doc }], empty)[0].status).toBe("new");
  });

  it("doesn't recognise an unrelated document", () => {
    expect(parseDocument([["Grocery receipt", "Milk 120.00"]], ctx).kind).toBe("UNKNOWN");
  });
});
