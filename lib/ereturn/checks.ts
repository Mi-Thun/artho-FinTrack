import type { Formatter } from "@/lib/i18n";
import type { EReturnResult } from "./compute";
import type { TaxReturnRecord } from "./load";
import { assessmentYearOf, incomeYearBounds } from "./rules";

export type CheckLevel = "error" | "warning" | "info";

export interface ReturnCheck {
  level: CheckLevel;
  title: string;
  detail: string;
  /** Where it's fixed: a tab of the return ("", "taxpayer", "income"…) or an absolute path. */
  tab: string;
}

/**
 * What to look at before filing: things that make the return wrong (error), things NBR
 * may question (warning), and plain facts worth knowing (info). Errors first.
 */
export function returnChecks(record: TaxReturnRecord, result: EReturnResult, fmt: Formatter): ReturnCheck[] {
  const checks: ReturnCheck[] = [];
  const money = fmt.money;
  const { start, end } = incomeYearBounds(record.incomeYear);
  const period = `${fmt.day(start)} – ${fmt.day(end)}`;

  if (!result.exactRules) {
    checks.push({
      level: "warning",
      title: "Tax rules for this year aren't in the app yet",
      detail: `Figures use the ${result.rules.incomeYear} income year's slabs, rebate and minimum tax, so treat them as an estimate until ${record.incomeYear}'s rules are added on the Tax rules page.`,
      tab: "/ereturn/rules",
    });
  }

  const late = result.tax.lateFiling;
  if (record.status !== "FILED" || record.filedAt) {
    if (late.months > 0) {
      checks.push({
        level: "error",
        title: record.status === "FILED" ? `Filed ${late.months} month${late.months === 1 ? "" : "s"} late` : `Past the due date of ${fmt.day(late.due)}`,
        detail:
          `Filing after the due date costs the investment rebate and adds ${fmt.number(result.rules.lateFiling.monthlyRate * 100)}% of the unpaid tax for each month or part month (section 174)` +
          (late.charge > 0 ? ` — ${money(late.charge)} so far, included in line 18.` : ".") +
          (result.exemptIncome.other > 0 ? " Other tax-exempt income may be taxable too; only the salary exemption and gifts from close family stay exempt." : ""),
        tab: "tax",
      });
    } else if (record.status !== "FILED") {
      const today = new Date();
      const days = Math.ceil((late.due.getTime() - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
      checks.push({
        level: days <= 14 ? "warning" : "info",
        title: `Due by ${fmt.day(late.due)}${days >= 0 ? ` — ${fmt.number(days)} day${days === 1 ? "" : "s"} left` : ""}`,
        detail: record.firstReturn
          ? "As a first-time filer you have until 30 June after the income year (Paripatra 2025-26, §3.5)."
          : "After that the rebate is lost and 2% of unpaid tax is added each month (section 174). The Commissioner can extend it by up to 90 days on a written application made before the due date.",
        tab: "",
      });
    }
  }

  if (record.lines.length === 0 && record.financialAssets.length === 0 && record.payments.length === 0) {
    checks.push({
      level: "info",
      title: "Start by importing your documents",
      detail: "Drop in your return, bank tax certificates and statements, salary challans and Sanchayapatra certificates — they're read in your browser and fill the return for you to review.",
      tab: "import",
    });
  }

  if (!record.name.trim()) {
    checks.push({ level: "error", title: "Your name is missing", detail: "Add it on the Taxpayer tab.", tab: "taxpayer" });
  }
  if (!record.tin || !/^\d{12}$/.test(record.tin)) {
    checks.push({
      level: "error",
      title: record.tin ? "The TIN doesn't look right" : "Your TIN is missing",
      detail: "An e-TIN has 12 digits.",
      tab: "taxpayer",
    });
  }

  const diff = result.wealth.difference;
  if (diff !== 0) {
    checks.push({
      level: "error",
      title: "The wealth statement doesn't balance",
      detail:
        diff < 0
          ? `Your listed assets are ${money(-diff)} less than your income, previous net wealth and expenses leave you with. Either an asset is missing or undervalued, or some expense wasn't counted — NBR expects the two to match.`
          : `Your listed assets are ${money(diff)} more than your income, previous net wealth and expenses can explain. Check the previous year's net wealth, any gifts or exempt income received, and each asset's value.`,
      tab: "wealth",
    });
  }

  if (result.unsupportedSecuritiesClaim > 0) {
    const higher = result.taxPayableWithoutUnsupported > result.tax.taxPayable;
    checks.push({
      level: "warning",
      title: "Sanchayapatra rebate without a matching purchase",
      detail:
        `${money(result.unsupportedSecuritiesClaim)} is claimed as investment in government securities, but no Sanchayapatra or bond on the Income tab was bought in ${record.incomeYear} (${period}). ` +
        `Only investment made during the income year earns the rebate.` +
        (higher ? ` Without it, tax payable would be ${money(result.taxPayableWithoutUnsupported)} instead of ${money(result.tax.taxPayable)}.` : ""),
      tab: "tax",
    });
  }

  if (result.investmentsOutsideYear.count > 0) {
    checks.push({
      level: "warning",
      title: "Rebate investment dated outside the income year",
      detail: `${fmt.number(result.investmentsOutsideYear.count)} investment${result.investmentsOutsideYear.count === 1 ? "" : "s"} (${money(result.investmentsOutsideYear.amount)}) fall outside ${period}.`,
      tab: "tax",
    });
  }

  if (result.paid.tdsSalary > 0 && result.salary.gross === 0) {
    checks.push({
      level: "warning",
      title: "Salary TDS but no salary",
      detail: "Challans for salary tax are recorded, but the salary schedule is empty.",
      tab: "income",
    });
  }

  const tdsNoIncome = record.financialAssets.filter((a) => Number(a.taxDeducted) > 0 && Number(a.income) === 0);
  if (tdsNoIncome.length > 0) {
    checks.push({
      level: "warning",
      title: "Source tax without the interest it was taken from",
      detail: `${tdsNoIncome.map((a) => a.institution).join(", ")}: tax deducted is entered but the interest or profit is ৳0. Enter the gross amount from the certificate.`,
      tab: "income",
    });
  }

  if (result.tax.minimumTaxApplies) {
    const basis = result.tax.minimumTaxBasis === "firstReturn" ? " for a first return" : new Set(Object.values(result.rules.minimumTax)).size > 1 ? " for your area" : "";
    checks.push({
      level: "info",
      title: "Minimum tax applies",
      detail: `Tax after rebate is ${money(result.tax.netTax)}, below the ${money(result.tax.minimumTax)} minimum${basis}, so ${money(result.tax.minimumTax)} is payable. It applies whenever income is above the tax-free band, however low the tax works out.`,
      tab: "tax",
    });
  }

  if (result.tax.finalTax > 0) {
    checks.push({
      level: "info",
      title: "Sanchayapatra profit is already fully taxed",
      detail: `The ${money(result.tax.finalTax)} deducted from ${money(result.tax.finalTaxIncome)} of profit is your final tax on it (section 163(11)): it's shown in total income but not taxed again at the slab rates, and isn't refunded.`,
      tab: "tax",
    });
  }

  if (result.income.total > 0 && result.income.total <= result.tax.threshold) {
    checks.push({
      level: "info",
      title: "Income is within the tax-free band",
      detail: `Total income of ${money(result.income.total)} doesn't exceed ${money(result.tax.threshold)}, so no tax is payable — the return may still be mandatory.`,
      tab: "",
    });
  }

  if (result.paid.due > 0) {
    checks.push({
      level: "warning",
      title: `${money(result.paid.due)} to pay with the return`,
      detail: "Pay it by challan or online before you submit, then record it on the Tax tab as tax paid with this return.",
      tab: "tax",
    });
  } else if (result.paid.excess > 0) {
    checks.push({
      level: "info",
      title: `${money(result.paid.excess)} paid in excess`,
      detail: `Source tax exceeds what's payable for assessment year ${assessmentYearOf(record.incomeYear)}. It can be claimed as a refund or adjusted against a later year.`,
      tab: "tax",
    });
  }

  const order: Record<CheckLevel, number> = { error: 0, warning: 1, info: 2 };
  return checks.sort((a, b) => order[a.level] - order[b.level]);
}
