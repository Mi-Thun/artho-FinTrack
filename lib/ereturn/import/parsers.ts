import { LIFESTYLE_LINES, SALARY_LINES, type InvestmentKind, type LineCode } from "../lines";
import { incomeYearBounds, incomeYearOf, incomeYearStart } from "../rules";
import { amountsIn, bankFromRouting, bankName, firstDate, majority, normalise, parseAmount, parseDate } from "./text";
import type { AssetProposal, ParseContext, ParsedDocument, PaymentProposal, ProfileField, Proposal } from "./types";

// One parser per kind of document a Bangladeshi salaried taxpayer collects for the year.
// Each reads the lines of the document (pdf.js text, or OCR for scans) and says what the
// return should contain. They look for the wording and table shapes of real documents —
// NBR's online return, Sonali and City Bank certificates and statements, the Sonali
// "চালান ফরম" — and fall back to generic patterns for other banks.

const REG_NO = /\b(\d{4}-\d{7})\b/;
const ACCOUNT_NO = /\b(\d{10,17})\b/;

function joined(pages: string[][]): string {
  return pages.flat().map(normalise).join("\n");
}

function money(text: string | undefined): number | undefined {
  return parseAmount(text) ?? undefined;
}

/** "2025-07-01"…"2026-06-30" against the return's income year; a warning if they differ. */
function periodWarning(from: string | null, to: string | null, incomeYear: string): string | null {
  if (!from || !to) return null;
  const bounds = incomeYearBounds(incomeYear);
  const [start, end] = [bounds.start, bounds.end].map((d) => d.toISOString().slice(0, 10));
  if (from <= start && to >= end) return null;
  if (to < start || from > end) return `It covers ${from} to ${to}, outside the ${incomeYear} income year.`;
  return `It covers ${from} to ${to}, not the whole ${incomeYear} income year (1 July – 30 June).`;
}

// ---------------------------------------------------------------------------
// NBR income tax return (IT-11GA printout from the eReturn site)
// ---------------------------------------------------------------------------

const INVESTMENT_ORDER: InvestmentKind[] = [
  "LIFE_INSURANCE",
  "DEPOSIT_PENSION",
  "GOVT_SECURITIES",
  "LISTED_SECURITIES",
  "PROVIDENT_FUND_1925",
  "RECOGNIZED_PF",
  "SUPERANNUATION",
  "BENEVOLENT_FUND",
  "ZAKAT",
  "OTHER",
];

/** Numbered rows ("3.  Investment in …  2,00,000") between two markers. */
function numberedRows(lines: string[], from: RegExp, to: RegExp): Map<number, number> {
  const rows = new Map<number, number>();
  const start = lines.findIndex((l) => from.test(l));
  if (start < 0) return rows;
  for (let i = start + 1; i < lines.length; i++) {
    if (to.test(lines[i])) break;
    const m = /^(\d{1,2})\.\s+(.*?)\s{2,}([\d,]+)\s*$/.exec(lines[i]);
    if (m) rows.set(Number(m[1]), parseAmount(m[3]) ?? 0);
  }
  return rows;
}

/** The amount at the end of the first line matching `label`. */
function trailingAmount(lines: string[], label: RegExp, after = 0): number | null {
  for (let i = after; i < lines.length; i++) {
    if (!label.test(lines[i])) continue;
    const m = /\s{2,}([\d,]+(?:\.\d+)?)\s*$/.exec(lines[i]);
    return m ? parseAmount(m[1]) : null;
  }
  return null;
}

function parseNbrReturn(pages: string[][], ctx: ParseContext): ParsedDocument {
  const lines = pages.flat().map(normalise);
  const text = lines.join("\n");
  const proposals: Proposal[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];

  const ay = /Assessment Year:\s*(\d{4})\s*-\s*(\d{2,4})/.exec(text);
  const returnYear = ay ? incomeYearOf(Number(ay[1]) - 1) : null;
  const relation = returnYear === ctx.incomeYear ? "same" : returnYear === incomeYearOf(incomeYearStart(ctx.incomeYear) - 1) ? "previous" : "other";

  // ── Taxpayer ──
  const profile = (field: ProfileField, value: string | null | undefined) => {
    const v = value?.trim();
    if (v) proposals.push({ type: "profile", field, value: v });
  };
  profile("name", /1\. Name of the Taxpayer:\s*(.+)/.exec(text)?.[1]);
  profile("nid", /2\. National ID[^\n]*?(\d{10,17})/.exec(text)?.[1]);
  const tin = /3\. TIN:[ \t]*([\d \t]+)/.exec(text)?.[1].replace(/\s/g, "");
  if (tin && tin.length === 12) profile("tin", tin);
  const circle = /\(a\) Circle\s+(.+?)\s{2,}\(b\) Taxes Zone:\s*(.+)/.exec(text);
  profile("circle", circle?.[1]);
  profile("taxZone", circle?.[2]);
  const dobAt = lines.findIndex((l) => /9\. Date of Birth/.test(l));
  if (dobAt >= 0) {
    const digits = (lines[dobAt + 1] ?? "").replace(/\s/g, "");
    if (/^\d{8}$/.test(digits)) profile("dateOfBirth", parseDate(`${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`));
  }
  profile("address", /11\. Address:\s*(.+)/.exec(text)?.[1]);
  profile("phone", /Mobile:\s*(\+?\d[\d-]{6,})/.exec(text)?.[1]);
  profile("email", /e-mail:\s*(\S+@\S+)/i.exec(text)?.[1]);
  profile("employerName", /12\. If employed[^:]*\):\s*(.+)/.exec(text)?.[1]);
  profile("fatherName", /father \/ husband:\s*(.+?)\s{2,}TIN/i.exec(text)?.[1]);

  if (relation === "other") {
    warnings.push(
      returnYear
        ? `This return is for income year ${returnYear}, not ${ctx.incomeYear} or the year before, so only your details are taken from it.`
        : "The assessment year couldn't be found, so only your details are taken from it.",
    );
    return { kind: "NBR_RETURN", summary: `Income tax return${returnYear ? ` for ${returnYear}` : ""}`, proposals, notes, warnings, ocr: false };
  }

  if (relation === "same") {
    profile("serialNo", /Serial No\. of Return Register\s+(\d+)/.exec(text)?.[1]);
    profile("filedAt", parseDate(/Date of Return Submission\s+(\S+)/.exec(text)?.[1] ?? ""));

    // Schedule 1(b): rows 1–12 in SALARY_LINES order.
    const salary = numberedRows(lines, /^b\. This part is applicable/, /^13\. Total Salary/);
    SALARY_LINES.forEach((def, i) => {
      const amount = salary.get(i + 1);
      if (amount) proposals.push({ type: "line", code: def.code, amount });
    });
    // IT-10BB: rows 1–7 and 9; row 8 (tax paid) is worked out by the return.
    const lifestyleStart = lines.findIndex((l) => /IT-\s?10 ?BB/.test(l));
    const lifestyle = numberedRows(lines.slice(Math.max(lifestyleStart, 0)), /Particulars of Expenditure/, /^Total:/);
    LIFESTYLE_LINES.forEach((def, i) => {
      const amount = lifestyle.get(i < 7 ? i + 1 : i + 2);
      if (amount) proposals.push({ type: "line", code: def.code, amount });
    });
    // Schedule 5: rows 1–10.
    const invest = numberedRows(lines, /Particulars of Rebatable Investment/, /^11\.\s+Total Investment/);
    INVESTMENT_ORDER.forEach((kind, i) => {
      const amount = invest.get(i + 1);
      if (amount) proposals.push({ type: "investment", kind, amount });
    });
    const previous = trailingAmount(lines, /^2\. Net Wealth as on Last Date of Previous Income Year/);
    if (previous != null) proposals.push({ type: "previousNetWealth", amount: previous });
    const exemptTotal = trailingAmount(lines, /^26\.\s+Tax Exempted/);
    if (exemptTotal != null) notes.push(`Tax-exempt income on the return: ৳${exemptTotal.toLocaleString("en-IN")}.`);
  } else {
    // Last year's return: its closing net wealth opens this year.
    const closing = trailingAmount(lines, /^5\. Net Wealth at the Last Date/);
    if (closing != null) proposals.push({ type: "previousNetWealth", amount: closing });
  }

  // IT-10B rows that aren't the bank or Sanchayapatra lists — these carry forward too.
  const tenB = lines.findIndex((l) => /^IT-10B \(2023\)/.test(l));
  const assetRows: [RegExp, LineCode][] = [
    [/^\(a\) Total Asset of Business/, "asset.business"],
    [/^Less: Business Liabilities/, "asset.businessLiabilities"],
    [/^\(b\) Director.s Shareholdings/, "asset.directorShares"],
    [/^\(c\) Business Capital of Partnership/, "asset.partnershipCapital"],
    [/^\(d\) Non-Agricultural Property/, "asset.nonAgriProperty"],
    [/^\(e\) Agricultural Property/, "asset.agriProperty"],
    [/^\(iii\) Loan Given/, "asset.loanGiven"],
    [/^\(v\) Provident Fund/, "asset.providentFund"],
    [/^\(vi\) Other Investment/, "asset.otherInvestment"],
    [/^\(g\) Motor Vehicle/, "asset.motorVehicle"],
    [/^\(h\) Ornaments/, "asset.ornaments"],
    [/^\(i\) Furniture and Electronic/, "asset.furniture"],
    [/^\(j\) Other Assets/, "asset.other"],
    [/^\(ii\) Cash in Hand/, "asset.cashInHand"],
    [/^\(iii\) Others\b/, "asset.cashOther"],
    [/^9\. Assets Outside Bangladesh/, "asset.abroad"],
    [/^\(a\) Institutional Liabilities/, "liability.institutional"],
    [/^\(b\) Non-Institutional Liabilities/, "liability.nonInstitutional"],
    [/^\(c\) Other Liabilities/, "liability.other"],
  ];
  if (tenB >= 0) {
    for (const [label, code] of assetRows) {
      const amount = trailingAmount(lines, label, tenB);
      if (amount) proposals.push({ type: "line", code, amount });
    }
    if (relation === "same") {
      const gift = trailingAmount(lines, /^\(c\) Receipt of Gift/, tenB);
      if (gift) proposals.push({ type: "line", code: "fund.gift", amount: gift });
      const loss = trailingAmount(lines, /^\(b\) Gift \/ Expenses \/ Loss/, tenB);
      if (loss) proposals.push({ type: "line", code: "wealth.otherLoss", amount: loss });
    }
  }

  // ── Attachments: Sanchayapatra, bank accounts, TDS ──
  const certificates = new Map<string, AssetProposal>();
  for (const l of lines) {
    // "Saving Certificate TDS": name, reg. no, date, value, interest, TDS
    let m = /^(.*?Sanchayapatra)\s+(\d{4}-\d{7})\s+(\d{2}-\d{2}-\d{4})\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)$/.exec(l);
    if (m) {
      certificates.set(m[2], {
        type: "asset",
        kind: "SANCHAYAPATRA",
        institution: "Sanchayapatra",
        reference: m[2],
        description: m[1].trim(),
        openedDate: parseDate(m[3]) ?? undefined,
        value: parseAmount(m[4]) ?? undefined,
        ...(relation === "same" ? { income: parseAmount(m[5]) ?? 0, taxDeducted: parseAmount(m[6]) ?? 0 } : {}),
      });
      continue;
    }
    // "Sanchayapatra" list: n, type, reg. no, issue date, value
    m = /^\d+\s+(.*?Sanchayapatra)\s+(\d{4}-\d{7})\s+(\d{2}-\d{2}-\d{4})\s+([\d,]+)$/.exec(l);
    if (m && !certificates.has(m[2])) {
      certificates.set(m[2], {
        type: "asset",
        kind: "SANCHAYAPATRA",
        institution: "Sanchayapatra",
        reference: m[2],
        description: m[1].trim(),
        openedDate: parseDate(m[3]) ?? undefined,
        value: parseAmount(m[4]) ?? undefined,
      });
    }
  }
  proposals.push(...certificates.values());

  const accounts = new Map<string, AssetProposal>();
  let inBankTds = false;
  for (const l of lines) {
    if (/^Bank TDS/.test(l)) inBankTds = true;
    if (/^Saving Certificate TDS/.test(l)) inBankTds = false;
    // "Bank account/Card/Electronic Cash": n, type, bank, account no, year-end balance
    let m = /^\d+\s+(Bank Account|Card|Credit Card|Mobile Wallet|Electronic Cash|MFS)\s+(.+?)\s{2,}(\d{6,})\s{2,}([\d,]+)$/i.exec(l);
    if (m) {
      const prev = accounts.get(m[3]);
      accounts.set(m[3], {
        ...prev,
        type: "asset",
        kind: /bank/i.test(m[1]) ? "BANK_ACCOUNT" : "MOBILE_WALLET",
        institution: bankName(m[2]),
        reference: m[3],
        // Last year's balances aren't this year's; the certificates or statements supply them.
        ...(relation === "same" ? { value: parseAmount(m[4]) ?? undefined } : {}),
      });
      continue;
    }
    // "Bank TDS": bank, branch, account no, interest, TDS
    m = inBankTds ? /^(.+?)\s{2,}(.+?)\s{2,}(\d{6,})\s{2,}([\d,]+)\s{2,}([\d,]+)$/.exec(l) : null;
    if (m) {
      const prev = accounts.get(m[3]);
      accounts.set(m[3], {
        ...prev,
        type: "asset",
        kind: prev?.kind ?? "BANK_ACCOUNT",
        institution: bankName(m[1]),
        branch: m[2].trim(),
        reference: m[3],
        ...(relation === "same" ? { income: parseAmount(m[4]) ?? 0, taxDeducted: parseAmount(m[5]) ?? 0 } : {}),
      });
    }
  }
  proposals.push(...accounts.values());

  if (relation === "same") {
    for (const l of lines) {
      const m = /^(\d{4}-\d{10})\s+(\d{2}-\d{2}-\d{4})\s+(.*?)\s+([\d,]+)\s+([\d,]+)$/.exec(l);
      if (!m) continue;
      proposals.push({
        type: "payment",
        kind: /Salary/i.test(m[3]) || lines.some((x) => /^Salary \(Others\)/.test(x)) ? "SALARY_TDS" : "OTHER_TDS",
        reference: m[1],
        date: parseDate(m[2]) ?? undefined,
        amount: parseAmount(m[5]) ?? 0,
        bank: /SONALI/i.test(m[3]) ? "Sonali Bank PLC" : undefined,
      });
    }
  } else {
    notes.push(`This is last year's (${returnYear}) return: your details, net wealth, assets and Sanchayapatra carry over; this year's income, tax and expenses come from this year's documents.`);
  }

  return {
    kind: "NBR_RETURN",
    summary: `Income tax return for ${returnYear} (${relation === "same" ? "this year" : "last year"})`,
    proposals,
    notes,
    warnings,
    ocr: false,
    // Carried-forward figures shouldn't outrank this year's certificates.
    rankOverride: relation === "same" ? undefined : 1,
  };
}

// ---------------------------------------------------------------------------
// Salary TDS challan (scanned "চালান ফরম"; read by OCR)
// ---------------------------------------------------------------------------

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function parseChallans(pages: string[][], ocr: boolean): ParsedDocument {
  const proposals: PaymentProposal[] = [];
  const warnings: string[] = [];
  for (const [p, page] of pages.entries()) {
    const raw = page.join("\n");
    const text = normalise(raw);
    // These challans print figures in Bangla digits, and OCR's English model misreads
    // them as look-alike Latin ones (৪১৭ → 839). So a reading in Bangla digits is
    // trusted first; Latin digits count only on a challan that has no Bangla ones.
    const bangla = (re: RegExp) => [...raw.matchAll(re)].map((m) => normalise(m[0]));
    // Challan numbers are 4 + 10 digits; the printed copy often carries an 11th check
    // digit that NBR's records drop. Tax codes (1-1121-…) don't start with the fiscal year.
    const challanNumbers = (source: string[]) =>
      source
        .flatMap((t) => [...t.matchAll(/\b(\d{4})\s*-\s*(\d{10})\d?/g)])
        .map((m) => `${m[1]}-${m[2]}`)
        .filter((n) => Number(n.slice(2, 4)) === (Number(n.slice(0, 2)) + 1) % 100);
    const reference = majority(challanNumbers(bangla(/[০-৯]{4}\s*-\s*[০-৯]{10,11}/g))) ?? majority(challanNumbers([text]));
    if (!reference) continue;
    const amount =
      majority(bangla(/[০-৯]{1,3}(?:,[০-৯]{2,3})*\.[০-৯]{2}/g).map(parseAmount)) ??
      majority([...text.matchAll(/(?:মোট|Total)[^\n=]*=\s*([\d,]+\.\d{2})/g)].map((m) => parseAmount(m[1]))) ??
      majority(amountsIn(text).filter((a) => a < 10_000_000));
    const date =
      majority(bangla(/[০-৯]{1,2}\/[০-৯]{1,2}\/[০-৯]{4}/g).map(parseDate)) ??
      majority([...text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)].map((m) => parseDate(m[0])));
    const month = /TDS for\s+([A-Za-z]+)\s*[',]?\s*(\d{2,4})/i.exec(text);
    let note: string | undefined;
    if (month) {
      const name = MONTH_NAMES.find((n) => n.startsWith(month[1].slice(0, 3).toLowerCase()));
      const year = month[2].length === 2 ? `20${month[2]}` : month[2];
      if (name) note = `${name[0].toUpperCase()}${name.slice(1)} ${year} salary`;
    }
    const payer = /([A-Z][A-Za-z&.,\s]+?\(?Pvt\.?\)?\s*Ltd\.?|[A-Z][A-Za-z&.,\s]+?Limited|[A-Z][A-Za-z&.,\s]+?PLC)/.exec(text)?.[1];
    if (!amount) {
      warnings.push(`Page ${p + 1}: challan ${reference} was found but not its amount.`);
      continue;
    }
    proposals.push({
      type: "payment",
      kind: /Salary|বেতন|ধারা\s*86|U\/S\s*86/i.test(text) ? "SALARY_TDS" : "OTHER_TDS",
      reference,
      date: date ?? undefined,
      amount,
      depositedBy: payer?.replace(/\s+/g, " ").trim(),
      bank: /সোনালী|Sonali/i.test(text) ? "Sonali Bank PLC" : undefined,
      note,
    });
  }
  // One challan can appear on several pages; keep one per number.
  const unique = [...new Map(proposals.map((p) => [p.reference, p])).values()];
  const total = unique.reduce((s, p) => s + p.amount, 0);
  return {
    kind: "SALARY_CHALLAN",
    summary: `${unique.length} challan${unique.length === 1 ? "" : "s"}, ৳${total.toLocaleString("en-IN")} in total`,
    proposals: unique,
    notes: [],
    warnings,
    ocr,
  };
}

// ---------------------------------------------------------------------------
// Employer's salary certificate (Schedule 2, Rule 10(1): "Source Tax Deduction or
// Collection Certificate" for income from salaries)
// ---------------------------------------------------------------------------

/** Salary heads as employers name them, mapped to the return's Schedule 1(b) lines. */
const SALARY_HEADS: [RegExp, LineCode][] = [
  [/^basic/i, "salary.basic"],
  [/arrear|advance salary/i, "salary.arrear"],
  [/gratuity|pension|annuity/i, "salary.gratuity"],
  [/provident|\bpf\b/i, "salary.employerPf"],
  [/perquisite/i, "salary.perquisites"],
  [/accommodation|rent[- ]free|residence/i, "salary.accommodation"],
  [/transport facility|car facility|vehicle/i, "salary.transport"],
  [/share scheme|esop/i, "salary.shareScheme"],
  // House rent, medical, conveyance, festival bonus and every other cash allowance.
  [/./, "salary.allowances"],
];

/**
 * A challan's date is believable if it falls on or after the start of the month it pays
 * tax for, and within three months of it. Employers' certificates carry typos (a
 * February 2026 challan dated 05.03.2025); such a date is left out rather than imported.
 */
function plausibleChallanDate(date: string, forMonth: { year: number; month: number } | null, incomeYear: string): boolean {
  const d = new Date(`${date}T00:00:00Z`);
  if (forMonth) {
    const start = new Date(Date.UTC(forMonth.year, forMonth.month - 1, 1));
    const latest = new Date(Date.UTC(forMonth.year, forMonth.month + 3, 0));
    return d >= start && d <= latest;
  }
  const { start, end } = incomeYearBounds(incomeYear);
  return d >= start && d <= new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 3, 30));
}

/** "July-2025", "Jan 26", "December 2025" → { year, month }. */
function monthOf(text: string): { year: number; month: number } | null {
  const m = /([A-Za-z]{3,9})[\s,'-]*(\d{4}|\d{2})\b/.exec(text);
  if (!m) return null;
  const month = MONTH_NAMES.findIndex((n) => n.startsWith(m[1].slice(0, 3).toLowerCase()));
  if (month < 0) return null;
  return { year: m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]), month: month + 1 };
}

const monthLabel = (m: { year: number; month: number }) => `${MONTH_NAMES[m.month - 1][0].toUpperCase()}${MONTH_NAMES[m.month - 1].slice(1)} ${m.year}`;

function parseSalaryCertificate(pages: string[][], ctx: ParseContext): ParsedDocument {
  const lines = pages.flat().map(normalise);
  const text = lines.join("\n");
  const proposals: Proposal[] = [];
  const notes: string[] = [];
  const warnings: string[] = [];

  // The signature line ("For Acme Ltd.") is usually spelt more carefully than item 1.
  const employer = (/^For\s+(.+?(?:Ltd\.?|Limited|PLC|Company|Co\.))\s*$/im.exec(text)?.[1] ?? /1 Name and Address of[^:]*:\s*(.+)/.exec(text)?.[1])?.trim();
  if (employer) proposals.push({ type: "profile", field: "employerName", value: employer });
  const employee = /3 Name of the employee[^:]*:\s*(.+)/.exec(text)?.[1];
  const tin = employee ? /\b(\d{12})\b/.exec(employee)?.[1] : undefined;
  if (tin) proposals.push({ type: "profile", field: "tin", value: tin });

  const period = /tax period[^:]*:\s*(\d{4})\s*-\s*(\d{2,4})/i.exec(text);
  if (period && incomeYearOf(Number(period[1])) !== ctx.incomeYear) {
    warnings.push(`It's for the ${period[1]}-${period[2]} tax period, not ${ctx.incomeYear}.`);
  }

  // ── Salary heads ──
  const headsAt = lines.findIndex((l) => /^Income Heads/i.test(l));
  const totals = new Map<LineCode, number>();
  const parts: string[] = [];
  let headsSum = 0;
  let stated: number | null = null;
  for (let i = headsAt + 1; headsAt >= 0 && i < lines.length; i++) {
    const m = /^(.+?)\s{2,}([\d,]+(?:\.\d+)?)\s*$/.exec(lines[i]);
    if (!m) break;
    const amount = parseAmount(m[2]) ?? 0;
    if (/^Total/i.test(m[1])) {
      stated = amount;
      break;
    }
    const code = SALARY_HEADS.find(([re]) => re.test(m[1].trim()))![1];
    totals.set(code, (totals.get(code) ?? 0) + amount);
    headsSum += amount;
    if (code === "salary.allowances") parts.push(`${m[1].trim().toLowerCase()} ৳${amount.toLocaleString("en-IN")}`);
  }
  for (const [code, amount] of totals) if (amount) proposals.push({ type: "line", code, amount });
  if (parts.length > 1) notes.push(`Allowances ৳${(totals.get("salary.allowances") ?? 0).toLocaleString("en-IN")} = ${parts.join(" + ")}.`);
  const gross = parseAmount(/Gross Payment:\s*([\d,]+)/i.exec(text)?.[1]) ?? stated;
  if (gross != null && Math.abs(gross - headsSum) > 0.5) {
    warnings.push(`The salary heads add up to ৳${headsSum.toLocaleString("en-IN")}, but the certificate's total is ৳${gross.toLocaleString("en-IN")}.`);
  }

  // ── Challans ──
  const payments: PaymentProposal[] = [];
  for (const l of lines) {
    const m = /^\d+\s+(\d{4})-(\d{10})\d?\s+(\d{1,2}[./-]\d{1,2}[./-]\d{4})\s+(.+?)\s{2,}([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)(?:\s+(.*))?$/.exec(l);
    if (!m) continue;
    const reference = `${m[1]}-${m[2]}`;
    const forMonth = monthOf(m[7] ?? "");
    let date = parseDate(m[3]) ?? undefined;
    if (date && !plausibleChallanDate(date, forMonth, ctx.incomeYear)) {
      warnings.push(
        `Challan ${reference} is dated ${m[3]}${forMonth ? `, which doesn't fit the ${monthLabel(forMonth)} salary it's for` : ", outside the income year"} — probably a typo. Its date is left out; check it on the challan.`,
      );
      date = undefined;
    }
    payments.push({
      type: "payment",
      kind: "SALARY_TDS",
      reference,
      date,
      // "Amount of taka in the challan for this certificate": the part that's this employee's.
      amount: parseAmount(m[6]) ?? 0,
      depositedBy: employer,
      bank: bankName(m[4]),
      note: forMonth ? `${monthLabel(forMonth)} salary` : undefined,
    });
  }
  proposals.push(...payments);
  const tds = parseAmount(/Amount of source tax deduction:\s*([\d,]+(?:\.\d+)?)/i.exec(text)?.[1] ?? /section 86:\s*([\d,]+(?:\.\d+)?)/i.exec(text)?.[1]);
  const challanSum = payments.reduce((s, p) => s + p.amount, 0);
  if (tds != null && Math.abs(tds - challanSum) > 0.5) {
    warnings.push(`The challans add up to ৳${challanSum.toLocaleString("en-IN")}, but the certificate says ৳${tds.toLocaleString("en-IN")} was deducted.`);
  }

  return {
    kind: "SALARY_CERTIFICATE",
    summary: `${employer ?? "Employer"} — salary ৳${headsSum.toLocaleString("en-IN")}, ${payments.length} challans (৳${challanSum.toLocaleString("en-IN")} TDS)`,
    proposals,
    notes,
    warnings,
    ocr: false,
  };
}

// ---------------------------------------------------------------------------
// Bank tax certificates
// ---------------------------------------------------------------------------

function parseTaxCertificate(pages: string[][], ctx: ParseContext): ParsedDocument {
  const text = joined(pages);
  const flat = text.replace(/\s+/g, " ");
  const proposals: AssetProposal[] = [];
  const warnings: string[] = [];

  // A table of accounts (City Bank): type, number, status, opened, balance, gross, tax, net.
  const bank = /City Bank/i.test(text) ? "City Bank PLC" : bankName(/([A-Z][A-Za-z ]+Bank(?: PLC| Limited| Ltd\.?)?)/.exec(text)?.[1] ?? "Bank");
  for (const m of text.matchAll(/^(Savings|Current|SND|FDR|Fixed Deposit|Term Deposit|DPS)\S*\s+(\d{8,17})\s+\S+\s+\S+\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s*$/gim)) {
    const term = /FDR|Fixed|Term/i.test(m[1]);
    proposals.push({
      type: "asset",
      kind: term ? "FIXED_DEPOSIT" : m[1].toUpperCase() === "DPS" ? "DPS" : "BANK_ACCOUNT",
      institution: bank,
      reference: m[2],
      value: parseAmount(m[3]) ?? undefined,
      income: parseAmount(m[4]) ?? 0,
      taxDeducted: parseAmount(m[5]) ?? 0,
    });
  }

  // A letter about one account (Sonali Bank and most others).
  if (proposals.length === 0) {
    const account = /(?:account|a\/c)[^0-9]{0,40}?(\d{10,17})/i.exec(flat)?.[1];
    const maintained = /maintained with\s+(.+?),\s*(.+?Branch)/i.exec(flat);
    const balance = /(?:credit )?balance of (?:Tk\.?|BDT)\s*([\d,]+(?:\.\d+)?)/i.exec(flat)?.[1];
    const interest = /(?:Total|Gross) Interest\s*:?\s*([\d,]+(?:\.\d+)?)/i.exec(flat)?.[1] ?? /Interest(?: Amount| Paid)?\s*:\s*([\d,]+(?:\.\d+)?)/i.exec(flat)?.[1];
    const tax = /(?:Source Tax|Tax Deduct(?:ed|ion)|TDS|AIT)\s*:?\s*([\d,]+(?:\.\d+)?)/i.exec(flat)?.[1];
    if (account) {
      proposals.push({
        type: "asset",
        kind: "BANK_ACCOUNT",
        institution: bankName(maintained?.[1] ?? bank),
        branch: maintained?.[2]?.trim(),
        reference: account,
        value: money(balance),
        income: money(interest) ?? 0,
        taxDeducted: money(tax) ?? 0,
      });
    }
  }

  const period =
    /period of\s+(\S+)\s+to\s+(\S+?)\s*\.?(?:\s|$)/i.exec(flat) ?? /During\s+(\S+)\s+to\s+(\S+)/i.exec(flat) ?? /From\s+(\S+)\s+to\s+(\S+)/i.exec(flat);
  const w = period ? periodWarning(parseDate(period[1]), parseDate(period[2]), ctx.incomeYear) : null;
  if (w) warnings.push(w);
  if (proposals.length === 0) warnings.push("No account figures were found in this certificate.");

  return {
    kind: "BANK_TAX_CERTIFICATE",
    summary: proposals.map((a) => `${a.institution} — ${a.reference}`).join("; ") || "Bank tax certificate",
    proposals,
    notes: [],
    warnings,
    ocr: false,
  };
}

// ---------------------------------------------------------------------------
// Bank statements
// ---------------------------------------------------------------------------

interface Txn {
  date: string;
  description: string;
  amount: number;
  balance: number;
  credit: boolean;
}

function statementTransactions(lines: string[]): { txns: Txn[]; opening: number | null } {
  const opening = (() => {
    for (const l of lines) {
      const m = /Opening Balance\s*:?\s*([\d,]+\.\d{2})/i.exec(l);
      if (m) return parseAmount(m[1]);
    }
    return null;
  })();
  const txns: Txn[] = [];
  let prevBalance = opening;
  let current: Txn | null = null;
  for (const l of lines) {
    const m = /^(\d{2}-\d{2}-\d{4})\s+(.*)$/.exec(l);
    const nums = m ? amountsIn(m[2]) : [];
    if (m && nums.length >= 2) {
      const amount = nums[nums.length - 2];
      const balance = nums[nums.length - 1];
      const credit = prevBalance != null ? balance > prevBalance : /\bCR\b|DEPOSIT|INTEREST|NPSB IN|FROM\s/i.test(m[2]);
      current = { date: parseDate(m[1])!, description: m[2].replace(/[\d,]+\.\d{2}/g, "").trim(), amount, balance, credit };
      txns.push(current);
      prevBalance = balance;
    } else if (current && !/^(Page|Date|Branch|This is|Total|Grand|Closing|Balance C\/F|-{3,}|_{3,})/i.test(l)) {
      current.description += ` ${l}`;
    } else {
      current = null;
    }
  }
  return { txns, opening };
}

function parseStatement(pages: string[][], ctx: ParseContext): ParsedDocument {
  const lines = pages.flat().map(normalise);
  const text = lines.join("\n");
  const notes: string[] = [];
  const warnings: string[] = [];

  const account = /Account (?:Number|No\.?)\s*:?\s*(\d{8,17})/i.exec(text)?.[1] ?? ACCOUNT_NO.exec(text)?.[1];
  const routing = /Routing Number\s*:?\s*(\d{9})/i.exec(text)?.[1];
  const institution =
    (routing && bankFromRouting(routing)) ||
    (/CITYTOUCH|Customer ID\s*:\s*CB|city bank/i.test(text) ? "City Bank PLC" : null) ||
    bankName(/([A-Z][A-Za-z ]+Bank(?: PLC| Limited| Ltd\.?)?)/.exec(text)?.[1] ?? "Bank");
  const branch =
    /Branch\s*:\s*(?:\d+-)?(.+?Branch)/i.exec(text)?.[1] ?? lines.find((l) => /^[A-Z][A-Z ]+ BRANCH$/.test(l))?.replace(/(\w)(\w*)/g, (_, a, b) => a + b.toLowerCase());

  const { txns } = statementTransactions(lines);
  const closing =
    parseAmount(/Closing Balance\s+([\d,]+\.\d{2})/i.exec(text)?.[1]) ??
    parseAmount(/Available Balance as of \S+\s*:\s*([\d,]+\.\d{2})/i.exec(text)?.[1]) ??
    txns[txns.length - 1]?.balance ??
    null;
  const interest = txns.filter((t) => t.credit && /INTEREST APPLIED|INT\.?\s*CR|INTEREST PAID|PROFIT (?:PAID|APPLIED)/i.test(t.description));
  const tds = txns.filter((t) => !t.credit && /TDS|TAX DEDUCT|SOURCE TAX|\bAIT\b/i.test(t.description));
  const sum = (ts: Txn[]) => Math.round(ts.reduce((s, t) => s + t.amount, 0) * 100) / 100;

  const spProfit = txns.filter((t) => t.credit && /TREASURY|SANCHOY|SANCHAY|SAVINGS CERT|\bNSC\b/i.test(t.description));
  if (spProfit.length > 0) {
    notes.push(`Sanchayapatra profit received here: ৳${sum(spProfit).toLocaleString("en-IN")} in ${spProfit.length} payments, after source tax — your Sanchayapatra certificate gives the gross profit and tax.`);
  }
  const employerWord = ctx.employerName?.split(/\s+/).slice(0, 2).join(" ").toUpperCase();
  if (employerWord) {
    const salary = txns.filter((t) => t.credit && t.description.toUpperCase().includes(employerWord));
    if (salary.length > 0) notes.push(`Deposits from ${ctx.employerName}: ৳${sum(salary).toLocaleString("en-IN")} in ${salary.length} payments (after TDS) — enter salary from your salary certificate.`);
  }

  const period = /Period(?: From)?\s*:?\s*(\S+)\s*(?:-|To)\s*(\S+)/i.exec(text);
  const w = period ? periodWarning(parseDate(period[1]), parseDate(period[2]), ctx.incomeYear) : null;
  if (w) warnings.push(w);
  if (!account) warnings.push("The account number wasn't found.");

  const proposals: AssetProposal[] = account
    ? [
        {
          type: "asset",
          kind: "BANK_ACCOUNT",
          institution,
          branch: branch?.trim(),
          reference: account,
          value: closing ?? undefined,
          income: sum(interest),
          taxDeducted: sum(tds),
        },
      ]
    : [];
  return {
    kind: "BANK_STATEMENT",
    summary: `${institution}${account ? ` — ${account}` : ""}, ${txns.length} transactions`,
    proposals,
    notes,
    warnings,
    ocr: false,
  };
}

// ---------------------------------------------------------------------------
// Sanchayapatra certificates and statements (any issuer; generic)
// ---------------------------------------------------------------------------

/**
 * A row of the National Savings Directorate's certificate (প্রত্যয়নপত্র), or any table
 * shaped like it: registration no., issue date, value, profit paid, source tax.
 */
const SP_ROW = /(\d{4}-\d{7})\s+(\d{1,2}[/-]\d{1,2}[/-]\d{4})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/;

/**
 * The scheme, from what survives of its name. The Directorate's PDFs embed a Bangla font
 * whose text comes out garbled ("৩-মজস অনর মনজফজ…"), but digits and fragments remain.
 */
function schemeName(text: string): string | undefined {
  if (/[৩3]\s*-\s*ম|3\s*-?\s*month|তিন মাস|Tin Mash/i.test(text)) return "3-month profit-based Sanchayapatra";
  if (/পধরবজর|পরিবার|Paribar|Family/i.test(text)) return "Paribar Sanchayapatra";
  if (/পপনশনজর|পেনশনার|Pensioner/i.test(text)) return "Pensioner Sanchayapatra";
  if (/[৫5]\s*-?\s*বছর|পাঁচ বছর|5[- ]?year|Bangladesh Sanchayapatra/i.test(text)) return "5-year Bangladesh Sanchayapatra";
  if (/ডাকঘর|Post Office/i.test(text)) return "Post Office savings";
  return undefined;
}

function parseSanchayapatraTable(lines: string[], ctx: ParseContext, ocr: boolean): ParsedDocument | null {
  const rows = lines.map((l) => ({ line: l, m: SP_ROW.exec(l) })).filter((r) => r.m);
  if (rows.length === 0) return null;
  const text = lines.join("\n");
  const institution = /অধধদপর|অধিদপ্তর|Directorate/i.test(text) ? "National Savings Directorate" : bankName(/(Sonali|Janata|Agrani|Rupali|Bangladesh Bank|Post Office)[^\n,]*/i.exec(text)?.[0] ?? "Sanchayapatra");
  const warnings: string[] = [];
  // "2025-26" — the fiscal year the certificate reports; registration numbers have 7 digits after the dash.
  const year = /\b(20\d{2})-(\d{2})\b(?!\d)/.exec(text);
  if (year && `${year[1]}-${year[2]}` !== ctx.incomeYear) warnings.push(`It reports the ${year[1]}-${year[2]} fiscal year, not ${ctx.incomeYear}.`);

  // A scheme's name is printed on its first row only; the rows below it share it.
  let scheme: string | undefined;
  const proposals: AssetProposal[] = rows.map(({ line, m }) => {
    scheme = schemeName(line.slice(0, line.indexOf(m![1]))) ?? scheme;
    return {
      type: "asset",
      kind: "SANCHAYAPATRA",
      institution,
      reference: m![1],
      description: scheme,
      openedDate: parseDate(m![2]) ?? undefined,
      value: parseAmount(m![3]) ?? undefined,
      income: parseAmount(m![4]) ?? 0,
      taxDeducted: parseAmount(m![5]) ?? 0,
    };
  });
  const profit = proposals.reduce((s, p) => s + (p.income ?? 0), 0);
  const tax = proposals.reduce((s, p) => s + (p.taxDeducted ?? 0), 0);
  return {
    kind: "SANCHAYAPATRA",
    summary: `${proposals.length} Sanchayapatra — profit ৳${profit.toLocaleString("en-IN")}, source tax ৳${tax.toLocaleString("en-IN")}`,
    proposals,
    notes: [],
    warnings,
    ocr,
  };
}

function parseSanchayapatra(pages: string[][], ctx: ParseContext, ocr: boolean): ParsedDocument {
  const lines = pages.flat().map(normalise);
  const table = parseSanchayapatraTable(lines, ctx, ocr);
  if (table) return table;
  const text = lines.join("\n");
  const flat = text.replace(/\s+/g, " ");
  const proposals: AssetProposal[] = [];
  const issuer = bankName(/(Sonali|Janata|Agrani|Rupali|Bangladesh Bank|Post Office|সোনালী|জনতা|অগ্রণী|রূপালী|ডাকঘর)[^\n,]*/i.exec(text)?.[0] ?? "Sanchayapatra");
  const scheme =
    /(Tin Mash[^\n]*?Sanchayapatra|3[- ]?Month[^\n]*?(?:Sanchayapatra|Certificate)|(?:5|Five)[- ]?Year Bangladesh Sanchayapatra|Paribar Sanchayapatra|Pensioner Sanchayapatra|তিন মাস অন্তর মুনাফাভিত্তিক[^\n]*|পরিবার সঞ্চয়পত্র|পেনশনার সঞ্চয়পত্র|পাঁচ বছর মেয়াদি[^\n]*)/i.exec(text)?.[1];

  // A row per certificate: registration no. with a date and amounts on the same line.
  for (const l of lines) {
    const reg = REG_NO.exec(l)?.[1];
    if (!reg) continue;
    const rest = l.replace(reg, " ");
    const nums = amountsIn(rest).concat([...rest.matchAll(/(?<![\d,.-])\d{4,7}(?![\d,.-])/g)].map((m) => Number(m[0]))).filter((n) => n > 0 && n < 100_000_000);
    const [value, income, tax] = [...new Set(nums)];
    proposals.push({
      type: "asset",
      kind: "SANCHAYAPATRA",
      institution: issuer,
      reference: reg,
      description: scheme,
      openedDate: firstDate(rest) ?? undefined,
      value,
      income,
      taxDeducted: tax,
    });
  }

  // One certificate described in a letter: labelled figures.
  if (proposals.length <= 1) {
    const label = (re: RegExp) => money(re.exec(flat)?.[1]);
    const reference = REG_NO.exec(flat)?.[1] ?? /(?:Registration|Reg\.?|নিবন্ধন)\s*(?:No\.?|নং|নম্বর)?\s*[:：]?\s*([\w-]{6,})/i.exec(flat)?.[1];
    const single: AssetProposal = {
      type: "asset",
      kind: "SANCHAYAPATRA",
      institution: issuer,
      reference,
      description: scheme,
      openedDate: parseDate(/(?:Issue|Purchase|Registration|ইস্যু|ক্রয়)[^:：\d]{0,20}[:：]?\s*(\S+)/i.exec(flat)?.[1] ?? "") ?? undefined,
      value: label(/(?:Face Value|Principal|Amount of Certificate|Investment|মূল্যমান|মূল্য|বিনিয়োগ)[^:：\d]{0,20}[:：]?\s*(?:Tk\.?|৳)?\s*([\d,]+(?:\.\d+)?)/i),
      income: label(/(?:Gross Profit|Total Profit|Profit|Interest|মুনাফা)[^:：\d]{0,25}[:：]?\s*(?:Tk\.?|৳)?\s*([\d,]+(?:\.\d+)?)/i),
      taxDeducted: label(/(?:Source Tax|Tax Deducted|TDS|AIT|উৎসে কর)[^:：\d]{0,20}[:：]?\s*(?:Tk\.?|৳)?\s*([\d,]+(?:\.\d+)?)/i),
    };
    if (proposals.length === 1) Object.assign(proposals[0], Object.fromEntries(Object.entries(single).filter(([, v]) => v != null)));
    else if (single.reference || single.value) proposals.push(single);
  }

  const period = /(?:period|During|From)\s+(\S+)\s+to\s+(\S+)/i.exec(flat);
  const w = period ? periodWarning(parseDate(period[1]), parseDate(period[2]), ctx.incomeYear) : null;
  return {
    kind: "SANCHAYAPATRA",
    summary: `${proposals.length} Sanchayapatra`,
    proposals,
    notes: [],
    warnings: [
      ...(w ? [w] : []),
      "This layout of Sanchayapatra document is read with general patterns — check each figure against the paper.",
      ...(proposals.length === 0 ? ["No certificate registration number was found."] : []),
    ],
    ocr,
  };
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Reads one document: works out what it is, then what it says. */
export function parseDocument(pages: string[][], ctx: ParseContext, ocr = false): ParsedDocument {
  const text = joined(pages);
  if (/FORM OF RETURN OF INCOME/i.test(text) && /IT-11GA/i.test(text)) return parseNbrReturn(pages, ctx);
  // Before challans and tax certificates: it lists challans and says "source tax" too.
  if (/Source Tax Deduction or Collection Certificate|Income from Salaries/i.test(text) && /Basic/i.test(text)) return parseSalaryCertificate(pages, ctx);
  if (SP_ROW.test(text)) return parseSanchayapatra(pages, ctx, ocr);
  if (/চালান|Challan/i.test(text) && /\b\d{4}\s*-\s*\d{10}/.test(text)) return parseChallans(pages, ocr);
  if (/Tax Certificate|TAXCERTIFICATE|withholding Tax on interest|Source Tax/i.test(text) && !/Sanchay|সঞ্চয়পত্র/i.test(text))
    return parseTaxCertificate(pages, ctx);
  if (/STATEMENT OF ACCOUNT/i.test(text) && /\d{2}-\d{2}-\d{4}/.test(text)) return parseStatement(pages, ctx);
  if (/Sanchay|সঞ্চয়পত্র|Savings Certificate|Saving Certificate/i.test(text)) return parseSanchayapatra(pages, ctx, ocr);
  return {
    kind: "UNKNOWN",
    summary: "Not recognised",
    proposals: [],
    notes: [],
    warnings: [
      text.trim().length < 20
        ? "No text could be read from this file."
        : "This isn't a document eReturn knows: a return, salary certificate or challan, bank tax certificate, bank statement or Sanchayapatra certificate.",
    ],
    ocr,
  };
}
