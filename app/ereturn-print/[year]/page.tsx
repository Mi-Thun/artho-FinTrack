import { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { sumBy, toNumber } from "@/lib/money";
import { getReturn } from "@/lib/ereturn/load";
import { BENEFIT_LABELS, INVESTMENT_KINDS, TAX_PAYMENT_KINDS } from "@/lib/ereturn/lines";
import { assessmentYearOf, incomeYearBounds, isSenior } from "@/lib/ereturn/rules";
import { incomeStatementRows, lifestyleRows, salaryRows, wealthRows, type StatementRow } from "@/lib/ereturn/statements";
import { PrintButton } from "@/components/ereturn/PrintButton";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }): Promise<Metadata> {
  const { year } = await params;
  return { title: `Return ${assessmentYearOf(year)} — WealthFlow` };
}

// The printed return: the same statements as the tabs, laid out as NBR's IT-11GA,
// schedules, IT-10BB, IT-10B and attachments, one form per page. Always black on white —
// it's paper, whatever theme the app is in — so it uses fixed colours, not theme tokens.

function Sheet({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return (
    <section className={cn("mx-auto w-full max-w-[210mm] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none", !first && "mt-6 break-before-page print:mt-0")}>
      {children}
    </section>
  );
}

function FormTitle({ form, title, sub }: { form?: string; title: string; sub?: string }) {
  return (
    <div className="mb-4 text-center">
      {form && <p className="text-right text-xs font-semibold">{form}</p>}
      <h2 className="text-sm font-bold">{title}</h2>
      {sub && <p className="text-xs">{sub}</p>}
    </div>
  );
}

function TaxpayerLine({ name, tin }: { name: string; tin: string | null }) {
  return (
    <div className="mb-3 flex flex-wrap justify-between gap-2 text-xs">
      <span>Name of the taxpayer: {name || "—"}</span>
      <TinBoxes tin={tin} />
    </div>
  );
}

function TinBoxes({ tin }: { tin: string | null }) {
  const digits = (tin ?? "").padEnd(12, " ").slice(0, 12).split("");
  return (
    <span className="inline-flex items-center gap-1">
      TIN:
      <span className="inline-flex">
        {digits.map((d, i) => (
          <span key={i} className="inline-flex h-5 w-4 items-center justify-center border border-neutral-400 text-[0.7rem] tabular-nums">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

function Rows({ rows }: { rows: StatementRow[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={cn(r.total && "font-semibold", r.value === undefined && "bg-neutral-100 font-semibold")}>
            <td className="w-10 border border-neutral-300 px-2 py-1 align-top tabular-nums">{r.no}</td>
            <td className={cn("border border-neutral-300 px-2 py-1 align-top", r.sub && "pl-5")}>{r.label}</td>
            <td className={cn("w-32 border border-neutral-300 px-2 py-1 text-right align-top tabular-nums", r.tone === "danger" && "text-red-700")}>{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Grid({ head, rows, alignRight = [] }: { head: string[]; rows: ReactNode[][]; alignRight?: number[] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-neutral-100">
          {head.map((h, i) => (
            <th key={i} className={cn("border border-neutral-300 px-2 py-1 text-left font-semibold", alignRight.includes(i) && "text-right")}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={head.length} className="border border-neutral-300 px-2 py-1 text-neutral-500">
              None
            </td>
          </tr>
        ) : (
          rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className={cn("border border-neutral-300 px-2 py-1 align-top", alignRight.includes(j) && "text-right tabular-nums")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function Verification({ children, name, date }: { children: ReactNode; name: string; date: string }) {
  return (
    <div className="mt-8 text-xs">
      <p className="mb-2 text-center font-semibold underline">Verification</p>
      <p>{children}</p>
      <div className="mt-10 flex justify-between gap-4">
        <span>Date: {date}</span>
        <span className="text-center">
          {name}
          <span className="block border-t border-neutral-400 pt-1">Signature (name in block letters)</span>
        </span>
      </div>
    </div>
  );
}

export default async function PrintReturnPage({ params }: { params: Promise<{ year: string }> }) {
  const userId = await requireUserId();
  const { year } = await params;
  const [{ record: rec, result: r, line }, { fmt: userFmt }] = await Promise.all([getReturn(userId, year), getLocalisation(userId)]);
  // NBR's form is in English with Western digits, whatever the app's language.
  const fmt = { ...userFmt, money: (v: number | string) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Number(v)) };
  const money = fmt.money;
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split("-").reverse().join("/") : "");
  const ay = assessmentYearOf(year);
  const ayFull = `${ay.slice(0, 4)}-${Number(ay.slice(0, 4)) + 1}`;
  const signedOn = day(rec.filedAt);
  const { end } = incomeYearBounds(year);
  const benefits = new Set<string>(rec.benefits);
  if (isSenior(rec.benefits, rec.dateOfBirth, year)) benefits.add("SENIOR");

  const salaryChallans = rec.payments.filter((p) => p.kind === "SALARY_TDS" || p.kind === "OTHER_TDS");
  const otherPayments = rec.payments.filter((p) => p.kind !== "SALARY_TDS" && p.kind !== "OTHER_TDS");
  const certificates = rec.financialAssets.filter((a) => a.kind === "SANCHAYAPATRA" || a.kind === "DPS" || a.kind === "BOND");
  const accounts = rec.financialAssets.filter((a) => !(a.kind === "SANCHAYAPATRA" || a.kind === "DPS" || a.kind === "BOND"));

  const field = (label: string, value: ReactNode) => (
    <div className="flex gap-2 py-1">
      <span className="shrink-0">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
  const tick = (on: boolean) => <span className="inline-flex size-3.5 items-center justify-center border border-neutral-500 text-[0.6rem]">{on ? "✓" : ""}</span>;

  return (
    <div className="min-h-screen bg-neutral-200 py-6 text-neutral-900 [color-scheme:light] print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex w-full max-w-[210mm] items-center justify-between gap-3 px-4 print:hidden">
        <Link href={`/ereturn/${year}`} className="inline-flex items-center gap-1 text-sm text-neutral-700 hover:text-neutral-950">
          <ChevronLeft size={15} aria-hidden />
          Back to the return
        </Link>
        <PrintButton />
      </div>

      {/* ── IT-11GA: taxpayer ── */}
      <Sheet first>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <table className="border-collapse text-xs">
            <tbody>
              <tr>
                <th colSpan={2} className="border border-neutral-400 px-2 py-1">For office use</th>
              </tr>
              <tr>
                <td className="border border-neutral-400 px-2 py-1">Serial no. of return register</td>
                <td className="w-28 border border-neutral-400 px-2 py-1">{rec.serialNo}</td>
              </tr>
              <tr>
                <td className="border border-neutral-400 px-2 py-1">Date of return submission</td>
                <td className="border border-neutral-400 px-2 py-1">{signedOn}</td>
              </tr>
            </tbody>
          </table>
          <div className="flex-1 text-center">
            <p className="text-sm font-bold">National Board of Revenue</p>
            <p className="mt-2 text-sm font-bold">FORM OF RETURN OF INCOME FOR INDIVIDUAL PERSON</p>
            <p className="text-xs">Section: 180 [Self]</p>
          </div>
          <p className="text-sm font-bold">IT-11GA (2023)</p>
        </div>

        <div className="border border-neutral-400 p-4 text-xs">
          {field("1. Name of the taxpayer:", rec.name)}
          {field("2. National ID no. / Passport no. (if no NID):", rec.nid)}
          <div className="py-1">
            <span className="mr-2">3.</span>
            <TinBoxes tin={rec.tin} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {field("4. (a) Circle:", rec.circle)}
            {field("(b) Taxes zone:", rec.taxZone)}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 py-1">
            <span>5. Assessment year: <span className="font-medium">{ayFull}</span></span>
            <span className="inline-flex items-center gap-2">6. Residential status: Resident {tick(rec.resident)} Non-resident {tick(!rec.resident)}</span>
          </div>
          <div className="flex items-center gap-2 py-1">7. Taxpayer&apos;s status: Individual {tick(true)}</div>
          <div className="py-1">
            8. Special benefit:
            <div className="mt-1 grid grid-cols-2 gap-1 pl-4">
              {Object.entries(BENEFIT_LABELS).map(([k, label]) => (
                <span key={k} className="inline-flex items-center gap-2">
                  {tick(benefits.has(k))} {label}
                </span>
              ))}
            </div>
          </div>
          {field("9. Date of birth:", day(rec.dateOfBirth))}
          {field("10. Wife's / husband's name:", rec.spouseName)}
          {field("TIN (if spouse is a taxpayer):", rec.spouseTin)}
          {field("11. Address:", rec.address)}
          <div className="grid grid-cols-2 gap-2 pl-4">
            {field("Mobile:", rec.phone)}
            {field("E-mail:", rec.email)}
          </div>
          {field("12. Employer's name:", rec.employerName)}
          {field("13. (a) Name of organisation:", rec.businessName)}
          {field("(b) Business identification number (BIN):", rec.bin)}
        </div>
      </Sheet>

      {/* ── IT-11GA: income, tax, payment ── */}
      <Sheet>
        <FormTitle title={`Statement of Income and Tax during the Income Year ended on ${day(end)}`} />
        <TaxpayerLine name={rec.name} tin={rec.tin} />
        <Rows rows={incomeStatementRows(r, fmt)} />
        <Verification name={rec.name} date={signedOn}>
          I {rec.name}
          {rec.fatherName ? `, father / husband: ${rec.fatherName},` : ""} TIN {rec.tin ?? "—"} solemnly declare that to the best
          of my knowledge and belief the information given in this return and statements and documents annexed herewith is
          correct and complete.
        </Verification>
      </Sheet>

      {/* ── Schedule 1 ── */}
      <Sheet>
        <FormTitle form="Schedule 1" title="Particulars of Income from Employment" sub="(b) For employees other than those receiving salary under the government pay scale" />
        <TaxpayerLine name={rec.name} tin={rec.tin} />
        <Rows rows={salaryRows(r, line, fmt)} />

        <div className="mt-8">
          <FormTitle form="Schedule 5" title="Particulars of Investment Tax Credit" />
          <Rows
            rows={[
              ...Object.entries(INVESTMENT_KINDS).map(([kind, k], i) => ({
                no: String(i + 1),
                label: k.label,
                value: money(toNumber(sumBy(rec.investments.filter((x) => x.kind === kind), (x) => x.amount))),
              })),
              { no: "11", label: "Total investment (1 to 10)", value: money(r.tax.eligibleInvestment), total: true },
              { no: "12", label: "Amount of tax rebate", value: money(r.tax.rebateAllowed), total: true },
            ]}
          />
        </div>
      </Sheet>

      {/* ── IT-10BB ── */}
      <Sheet>
        <FormTitle form="IT-10BB (2023)" title="Statement of Expenses Relating to Lifestyle" sub="(For individual person)" />
        <TaxpayerLine name={rec.name} tin={rec.tin} />
        <Rows rows={lifestyleRows(r, fmt)} />
        <Verification name={rec.name} date={signedOn}>
          I solemnly declare that to the best of my knowledge and belief the information given in this IT-10BB (2023) is
          correct and complete.
        </Verification>
      </Sheet>

      {/* ── IT-10B ── */}
      <Sheet>
        <FormTitle form="IT-10B (2023)" title={`Statement of Assets, Liabilities and Expenses (as on ${day(end)})`} />
        <TaxpayerLine name={rec.name} tin={rec.tin} />
        <Rows rows={wealthRows(r, line, fmt)} />
        <Verification name={rec.name} date={signedOn}>
          I solemnly declare that to the best of my knowledge and belief the information given in this IT-10B (2023) is
          correct and complete.
        </Verification>
      </Sheet>

      {/* ── Attachments ── */}
      <Sheet>
        <FormTitle title="Particulars of Sources of Fund" sub="[Attachment for serial no. 1 of IT-10B (2023)]" />
        <TaxpayerLine name={rec.name} tin={rec.tin} />
        <Grid
          head={["Sources", "Particulars", "Amount"]}
          alignRight={[2]}
          rows={[
            ["Taxable income (excluding non-cash benefits)", "—", money(r.wealth.sources.taxableIncome)],
            ["Tax-exempted income", r.exemptIncome.other > 0 ? `Salary; ${line("exempt.other").note || "other"}` : "Salary", money(r.wealth.sources.exemptIncome)],
            ["Receipt of gift and others", line("fund.gift").note || "—", money(r.wealth.sources.gifts)],
          ]}
        />

        <div className="mt-8">
          <FormTitle title="Particulars of Financial Assets and Bank / FI Accounts" sub="[Attachment for serial no. 8(f) of IT-10B (2023)]" />
          <p className="mb-1 text-xs font-semibold">Sanchayapatra, DPS and bonds</p>
          <Grid
            head={["Type", "Registration no.", "Issue date", "Value"]}
            alignRight={[3]}
            rows={certificates.map((a) => [a.description ?? a.kind, a.reference ?? "", day(a.openedDate), money(toNumber(a.value))])}
          />
          <p className="mt-4 mb-1 text-xs font-semibold">Bank accounts, cards and electronic cash</p>
          <Grid
            head={["Name of bank / FI", "Account no.", "Year-end balance"]}
            alignRight={[2]}
            rows={accounts.map((a) => [a.institution, a.reference ?? "", money(toNumber(a.value))])}
          />
        </div>
      </Sheet>

      <Sheet>
        <FormTitle title="Source Tax, AIT and Regular Tax Claim" sub="[Attachment for serial no. 20, 21, 22, 23 of IT-11GA (2023)]" />
        <div className="mb-3 flex justify-between text-xs">
          <span>Assessment year: {ayFull}</span>
          <span>
            Total TDS claimed: <span className="font-semibold">{money(r.paid.tds)}</span>
          </span>
        </div>
        <p className="mb-1 text-xs font-semibold">Salary and other TDS</p>
        <Grid
          head={["Challan no.", "Date", "Purpose", "Depositing authority", "Bank / branch", "Amount"]}
          alignRight={[5]}
          rows={salaryChallans.map((p) => [
            p.reference ?? "",
            day(p.date),
            p.kind === "SALARY_TDS" ? "Salary [Section 86]" : "Other TDS",
            p.depositedBy ?? "",
            [p.bank, p.branch].filter(Boolean).join(", "),
            money(toNumber(p.amount)),
          ])}
        />
        {otherPayments.length > 0 && (
          <>
            <p className="mt-4 mb-1 text-xs font-semibold">Advance tax, refund adjustment and tax paid with the return</p>
            <Grid
              head={["Kind", "Challan no.", "Date", "Amount"]}
              alignRight={[3]}
              rows={otherPayments.map((p) => [TAX_PAYMENT_KINDS[p.kind].label, p.reference ?? "", day(p.date), money(toNumber(p.amount))])}
            />
          </>
        )}
        <p className="mt-4 mb-1 text-xs font-semibold">Bank TDS</p>
        <Grid
          head={["Name", "Branch", "Account no.", "Interest", "TDS"]}
          alignRight={[3, 4]}
          rows={accounts.map((a) => [a.institution, a.branch ?? "", a.reference ?? "", money(toNumber(a.income)), money(toNumber(a.taxDeducted))])}
        />
        <p className="mt-4 mb-1 text-xs font-semibold">Saving certificate TDS</p>
        <Grid
          head={["Name", "Registration no.", "Issue date", "Value", "Interest", "TDS"]}
          alignRight={[3, 4, 5]}
          rows={certificates.map((a) => [
            a.description ?? a.institution,
            a.reference ?? "",
            day(a.openedDate),
            money(toNumber(a.value)),
            money(toNumber(a.income)),
            money(toNumber(a.taxDeducted)),
          ])}
        />
        <p className="mt-6 text-center text-[0.65rem] text-neutral-500 print:hidden">
          Prepared with WealthFlow eReturn. Check every figure against your documents before filing.
        </p>
      </Sheet>
    </div>
  );
}
