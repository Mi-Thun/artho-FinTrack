import Link from "next/link";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { getReturn } from "@/lib/ereturn/load";
import { ASSET_LINES, FUND_LINES, LIABILITY_LINES, LIFESTYLE_LINES } from "@/lib/ereturn/lines";
import { wealthRows } from "@/lib/ereturn/statements";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { ValidatedForm } from "@/components/ValidatedForm";
import { FormActions } from "@/components/Modal";
import { LineFields } from "@/components/ereturn/LineFields";
import { StatementTable } from "@/components/ereturn/StatementTable";
import { cn } from "@/lib/utils";
import { saveLines, saveWealthBasics } from "../../actions";

export default async function WealthPage({ params }: { params: Promise<{ year: string }> }) {
  const userId = await requireUserId();
  const { year } = await params;
  const [{ record, result: r, line, version }, { fmt }] = await Promise.all([getReturn(userId, year), getLocalisation(userId)]);
  const m = fmt.money;
  const w = r.wealth;
  const fromList = [
    { label: "Bank balances", value: w.assets.cash.bank },
    { label: "Sanchayapatra / DPS", value: w.assets.financial.sanchayapatraDps },
    { label: "Fixed / term deposits", value: w.assets.financial.deposits },
    { label: "Shares, bonds, units", value: w.assets.financial.shares },
  ].filter((x) => x.value > 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <div className="flex flex-col gap-6 lg:col-span-3">
        <Card title="Opening position" description="IT-10B items 1(c), 2 and 4(b).">
          <ValidatedForm key={`${version()}-${version(FUND_LINES)}`} action={saveWealthBasics.bind(null, record.id)} className="flex flex-col gap-4" successMessage="Saved">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Net wealth on 30 June last year" hint="Item 5 of last year's IT-10B.">
                <MoneyInput name="previousNetWealth" defaultValue={w.previousNetWealth || undefined} />
              </Field>
              <Field label="Tax paid on last year's return" hint="Paid this year on the strength of last year's return — part of IT-10BB line 8.">
                <MoneyInput name="lastYearTaxPaid" defaultValue={Number(record.lastYearTaxPaid) || undefined} />
              </Field>
            </div>
            <LineFields defs={FUND_LINES} value={line} />
            <FormActions submitLabel="Save" />
          </ValidatedForm>
        </Card>

        <Card title="Lifestyle expenses" description="IT-10BB — what you and your family spent during the year.">
          <ValidatedForm key={version(LIFESTYLE_LINES)} action={saveLines.bind(null, record.id, "lifestyle")} className="flex flex-col gap-4" successMessage="Expenses saved">
            <LineFields defs={LIFESTYLE_LINES} value={line} />
            <dl className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Tax paid this year (line 8, worked out)</dt>
                <dd className="tabular-nums">{m(r.lifestyle.taxPaid)}</dd>
              </div>
              <div className="flex justify-between gap-3 font-semibold">
                <dt>Total lifestyle expense</dt>
                <dd className="tabular-nums">{m(r.lifestyle.total)}</dd>
              </div>
            </dl>
            <FormActions submitLabel="Save expenses" />
          </ValidatedForm>
        </Card>

        <Card title="Assets on 30 June" description="IT-10B item 8. Bank balances and Sanchayapatra come from the Income tab.">
          <ValidatedForm key={version(ASSET_LINES)} action={saveLines.bind(null, record.id, "assets")} className="flex flex-col gap-4" successMessage="Assets saved">
            {fromList.length > 0 && (
              <dl className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3 text-sm">
                {fromList.map((x) => (
                  <div key={x.label} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{x.label}</dt>
                    <dd className="tabular-nums">{m(x.value)}</dd>
                  </div>
                ))}
                <Link href={`/ereturn/${year}/income`} className="text-xs text-link hover:underline">
                  Change these on the Income tab
                </Link>
              </dl>
            )}
            <LineFields defs={ASSET_LINES} value={line} />
            <FormActions submitLabel="Save assets" />
          </ValidatedForm>
        </Card>

        <Card title="Liabilities" description="IT-10B item 6 — personal loans and other debts outside business.">
          <ValidatedForm key={version(LIABILITY_LINES)} action={saveLines.bind(null, record.id, "liabilities")} className="flex flex-col gap-4" successMessage="Liabilities saved">
            <LineFields defs={LIABILITY_LINES} value={line} />
            <FormActions submitLabel="Save liabilities" />
          </ValidatedForm>
        </Card>
      </div>

      <div className="lg:col-span-2">
        <div className="flex flex-col gap-6">
          <Card
            title={w.difference === 0 ? "The statement balances" : "The statement doesn't balance"}
            className={cn("border-l-4", w.difference === 0 ? "border-l-success" : "border-l-danger")}
          >
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Gross wealth your income leaves you</dt>
                <dd className="tabular-nums">{m(w.grossWealth)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Assets you&apos;ve listed</dt>
                <dd className="tabular-nums">{m(w.assets.total)}</dd>
              </div>
              <div className={cn("flex justify-between gap-3 border-t pt-1 font-semibold", w.difference === 0 ? "text-success" : "text-danger")}>
                <dt>Difference</dt>
                <dd className="tabular-nums">
                  {w.difference === 0 ? m(0) : `${w.difference < 0 ? "−" : "+"}${m(Math.abs(w.difference))}`}
                </dd>
              </div>
            </dl>
            {w.difference !== 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                {w.difference < 0
                  ? "Your assets fall short of what your income says you should have. Look for a missing or undervalued asset, or an expense you haven't entered."
                  : "Your assets are more than your income can explain. Check last year's net wealth, gifts received and exempt income."}
              </p>
            )}
          </Card>
          <Card title="Statement of assets, liabilities and expenses" description="IT-10B">
            <StatementTable rows={wealthRows(r, line, fmt)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
