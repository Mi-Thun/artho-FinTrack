import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { getReturn } from "@/lib/ereturn/load";
import { returnChecks } from "@/lib/ereturn/checks";
import { incomeStatementRows } from "@/lib/ereturn/statements";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { MoneyText } from "@/components/MoneyText";
import { Breakdown } from "@/components/Breakdown";
import { ChecksList } from "@/components/ereturn/ChecksList";
import { StatementTable } from "@/components/ereturn/StatementTable";

export default async function ReturnSummaryPage({ params }: { params: Promise<{ year: string }> }) {
  const userId = await requireUserId();
  const { year } = await params;
  const [{ record, result: r }, { fmt }] = await Promise.all([getReturn(userId, year), getLocalisation(userId)]);
  const checks = returnChecks(record, r, fmt);
  const m = fmt.money;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total income"
          value={<MoneyText value={r.income.total} money={m} />}
          hint={
            <Breakdown
              title="Taxable income by head"
              rows={[
                { label: "Employment (after exemption)", value: m(r.income.employment) },
                { label: "Rent", value: m(r.income.rent) },
                { label: "Agriculture", value: m(r.income.agriculture) },
                { label: "Business", value: m(r.income.business) },
                { label: "Capital gain", value: m(r.income.capitalGain) },
                { label: "Financial assets", value: m(r.income.financialAssets) },
                { label: "Other sources", value: m(r.income.otherSources) },
                { label: "Firm or AoP", value: m(r.income.firmShare) },
                { label: "Minor or spouse", value: m(r.income.minorSpouse) },
                { label: "Abroad", value: m(r.income.abroad) },
              ]}
              total={{ label: "Total income", value: m(r.income.total) }}
            />
          }
        />
        <StatCard
          label="Tax payable"
          value={<MoneyText value={r.tax.totalPayable} money={m} />}
          hint={
            <Breakdown
              title="How the tax is worked out"
              rows={[
                { label: "Gross tax", value: m(r.tax.grossTax) },
                { label: "Investment rebate", value: m(r.tax.rebate), sign: "−" },
                { label: `Minimum tax (${m(r.tax.minimumTax)})`, value: m(r.tax.minimumTaxApplies ? r.tax.minimumTax - r.tax.netTax : 0), sign: "+" },
                { label: "Surcharge", value: m(r.tax.surcharge), sign: "+" },
                { label: "Delay interest / penalty", value: m(r.tax.delayInterest), sign: "+" },
              ]}
              total={{ label: "Total payable", value: m(r.tax.totalPayable) }}
            />
          }
        />
        <StatCard
          label="Tax already paid"
          value={<MoneyText value={r.paid.total} money={m} />}
          hint={
            <Breakdown
              title="Tax paid for the year"
              rows={[
                { label: "Salary TDS", value: m(r.paid.tdsSalary) },
                { label: "TDS on interest and profit", value: m(r.paid.tdsFinancial) },
                { label: "Other TDS", value: m(r.paid.tdsOther) },
                { label: "Advance tax", value: m(r.paid.advance) },
                { label: "Refund adjusted", value: m(r.paid.refundAdjustment) },
                { label: "Paid with return", value: m(r.paid.withReturn) },
              ]}
              total={{ label: "Total paid", value: m(r.paid.total) }}
            />
          }
        />
        {r.paid.due > 0 ? (
          <StatCard label="Still to pay" tone="negative" value={<MoneyText value={r.paid.due} money={m} />} hint="Tax payable less tax already paid. Pay it before submitting the return." />
        ) : (
          <StatCard
            label="Paid in excess"
            tone={r.paid.excess > 0 ? "positive" : "neutral"}
            value={<MoneyText value={r.paid.excess} money={m} />}
            hint="Tax already paid beyond what's payable (line 25) — refundable, or adjustable against a later year."
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card title="Before you file" className="lg:col-span-2 lg:self-start">
          <ChecksList checks={checks} base={`/ereturn/${year}`} />
        </Card>
        <Card title="Statement of income and tax" description="IT-11GA, lines 1–26 — as they go into NBR's online form." className="lg:col-span-3">
          <StatementTable rows={incomeStatementRows(r, fmt)} />
        </Card>
      </div>
    </div>
  );
}
