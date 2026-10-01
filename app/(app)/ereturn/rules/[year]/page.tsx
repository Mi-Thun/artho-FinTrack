import { notFound } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { getRuleRows, getUserRules, toRules } from "@/lib/ereturn/rules-db";
import { assessmentYearOf, isIncomeYear, pickRules } from "@/lib/ereturn/rules";
import { Card } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { PageHeader } from "@/components/PageHeader";
import { ValidatedForm } from "@/components/ValidatedForm";
import { FormActions } from "@/components/Modal";
import { Input } from "@/components/ui/input";
import { resetToPublishedRules, saveRules } from "../actions";

/** 0.333333333333 → "33.333333333"; 0.1 → "10". */
const asPercent = (fraction: number) => String(Number((fraction * 100).toFixed(9)));

function Percent({ name, value }: { name: string; value: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input name={name} defaultValue={asPercent(value)} inputMode="decimal" required className="tabular-nums" />
      <span className="text-sm text-muted-foreground">%</span>
    </div>
  );
}

export default async function RuleYearPage({ params }: { params: Promise<{ year: string }> }) {
  const userId = await requireUserId();
  const { year } = await params;
  if (!isIncomeYear(year)) notFound();
  const [{ published, own }, all, { fmt }] = await Promise.all([getRuleRows(userId), getUserRules(userId), getLocalisation(userId)]);

  const ownRow = own.get(year);
  const publishedRow = published.get(year);
  // A year with no rules yet starts from the nearest year's, to be checked and saved.
  const start = ownRow ?? publishedRow;
  const rules = start ? toRules(start) : pickRules(all, year)?.rules;
  if (!rules) notFound();
  const isNew = !start;
  const slabRows = [...rules.slabs, ...Array.from({ length: Math.max(8 - rules.slabs.length, 2) }, () => null)];
  const bandRows = [...rules.netWealthSurcharge, ...Array.from({ length: Math.max(6 - rules.netWealthSurcharge.length, 1) }, () => null)];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Tax rules ${year}`}
        back={{ href: "/ereturn/rules", label: "Tax rules" }}
        description={
          isNew
            ? `No rules for income year ${year} (tax year ${assessmentYearOf(year)}) yet. These start from ${rules.incomeYear}'s — change what the new Paripatra changes, then save.`
            : ownRow
              ? `Your own copy for income year ${year} (tax year ${assessmentYearOf(year)}). Your returns for this year use it instead of the published rules.`
              : `Published for income year ${year} (tax year ${assessmentYearOf(year)}). Saving makes your own copy; the published rules stay as they are for everyone else.`
        }
        actions={
          ownRow && publishedRow ? (
            <ConfirmDialog
              action={resetToPublishedRules.bind(null, year)}
              title="Use the published rules?"
              description="Deletes your copy of this year's rules. Your returns go back to the published figures."
              confirmLabel="Use published rules"
              tone="default"
              successMessage="Using the published rules"
              triggerLabel="Use published rules"
              triggerIcon={<RotateCcw size={14} />}
              triggerVariant="outline"
            />
          ) : undefined
        }
      />

      <ValidatedForm key={start?.updatedAt.getTime() ?? "new"} action={saveRules.bind(null, year)} className="flex flex-col gap-6" successMessage="Rules saved">
        <Card title="Source">
          <Field label="Where these figures come from" hint="The Finance Act or Paripatra section, so you can check them later.">
            <Input name="source" defaultValue={isNew ? "" : rules.source} />
          </Field>
        </Card>

        <Card title="Tax-free income" description="Income up to the band is taxed at 0%. The most generous band a taxpayer qualifies for applies.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="General" required>
              <MoneyInput name="thresholdGeneral" defaultValue={rules.threshold.general} required />
            </Field>
            <Field label="Female, or 65 or older" required>
              <MoneyInput name="thresholdFemaleOrSenior" defaultValue={rules.threshold.femaleOrSenior} required />
            </Field>
            <Field label="Third gender" required>
              <MoneyInput name="thresholdThirdGender" defaultValue={rules.threshold.thirdGender} required />
            </Field>
            <Field label="Person with disability" required>
              <MoneyInput name="thresholdDisabled" defaultValue={rules.threshold.disabled} required />
            </Field>
            <Field label="Gazetted war-wounded freedom fighter" required>
              <MoneyInput name="thresholdFreedomFighter" defaultValue={rules.threshold.freedomFighter} required />
            </Field>
            <Field label="Gazetted July warrior" hint="Leave blank if the year has no separate band.">
              <MoneyInput name="thresholdJulyWarrior" defaultValue={rules.threshold.julyWarrior ?? undefined} />
            </Field>
            <Field label="Added for each child with a disability (parent or guardian)" required>
              <MoneyInput name="parentOfDisabledExtra" defaultValue={rules.parentOfDisabledExtra} required />
            </Field>
          </div>
        </Card>

        <Card title="Slabs above the band" description="In order. Leave the last slab's width blank: it's everything above. Clear a rate to drop a row.">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_8rem] gap-3 text-xs font-medium text-muted-foreground">
              <span>Next … taka</span>
              <span>Rate</span>
            </div>
            {slabRows.map((slab, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem] gap-3">
                <MoneyInput name={`slabWidth.${i}`} defaultValue={slab && Number.isFinite(slab.width) ? slab.width : undefined} placeholder={slab ? "The rest" : ""} />
                <div className="flex items-center gap-1.5">
                  <Input name={`slabRate.${i}`} defaultValue={slab ? asPercent(slab.rate) : ""} inputMode="decimal" className="tabular-nums" />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 max-w-xs">
            <Field label="Non-resident: flat rate on all income" required>
              <Percent name="nonResidentRate" value={rules.nonResidentRate} />
            </Field>
          </div>
        </Card>

        <Card title="Minimum tax" description="Payable once total income exceeds the tax-free band, however low the tax works out.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Dhaka North, Dhaka South or Chattogram city corporation" required>
              <MoneyInput name="minimumTaxDhakaChattogram" defaultValue={rules.minimumTax.DHAKA_CHATTOGRAM_CITY} required />
            </Field>
            <Field label="Other city corporations" required>
              <MoneyInput name="minimumTaxOtherCity" defaultValue={rules.minimumTax.OTHER_CITY} required />
            </Field>
            <Field label="Everywhere else" required hint="Set all three alike when the year has one amount for everyone.">
              <MoneyInput name="minimumTaxElsewhere" defaultValue={rules.minimumTax.ELSEWHERE} required />
            </Field>
            <Field label="First-time filer" hint="Leave blank if the year has no lower amount.">
              <MoneyInput name="minimumTaxFirstReturn" defaultValue={rules.minimumTaxFirstReturn ?? undefined} />
            </Field>
          </div>
        </Card>

        <Card title="Salary exemption and rebate">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Salary exempt: this share…" required>
              <Percent name="salaryExemptionFraction" value={rules.salaryExemption.fraction} />
            </Field>
            <Field label="…or this much, whichever is less" required>
              <MoneyInput name="salaryExemptionCap" defaultValue={rules.salaryExemption.cap} required />
            </Field>
            <Field label="Rebate: share of total income" required hint="Final-tax income and a firm share are left out.">
              <Percent name="rebateIncomePct" value={rules.rebate.incomePct} />
            </Field>
            <Field label="Rebate: share of eligible investment" required>
              <Percent name="rebateInvestmentPct" value={rules.rebate.investmentPct} />
            </Field>
            <Field label="Rebate ceiling" required>
              <MoneyInput name="rebateCap" defaultValue={rules.rebate.cap} required />
            </Field>
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="sanchayapatraFinalTax" defaultChecked={rules.sanchayapatraFinalTax} className="mt-0.5 size-4" />
            <span>
              Tax deducted from Sanchayapatra profit is the final tax on it
              <span className="block text-xs text-muted-foreground">The profit isn&apos;t taxed again at the slab rates, and isn&apos;t in the rebate&apos;s income limit.</span>
            </span>
          </label>
        </Card>

        <Card title="Net wealth surcharge" description="A rate on tax once net wealth is above each amount.">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_8rem] gap-3 text-xs font-medium text-muted-foreground">
              <span>Net wealth above</span>
              <span>Rate</span>
            </div>
            {bandRows.map((band, i) => (
              <div key={i} className="grid grid-cols-[1fr_8rem] gap-3">
                <MoneyInput name={`bandAbove.${i}`} defaultValue={band?.above} placeholder="" />
                <div className="flex items-center gap-1.5">
                  <Input name={`bandRate.${i}`} defaultValue={band ? asPercent(band.rate) : ""} inputMode="decimal" className="tabular-nums" />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
            ))}
          </div>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="surchargeOnRegularTax" defaultChecked={rules.surchargeOnRegularTax} className="mt-0.5 size-4" />
            <span>
              Charged on tax at regular rates
              <span className="block text-xs text-muted-foreground">From tax year 2026-27. Before that it&apos;s on tax payable, which can be the minimum tax.</span>
            </span>
          </label>
        </Card>

        <Card title="Filing deadline and late filing">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Return due (MM-DD)" required hint="The first such day after the income year ends, e.g. 11-30.">
              <Input name="returnDueDate" defaultValue={rules.returnDueDate} required pattern="\d{1,2}-\d{1,2}" />
            </Field>
            <Field label="First-time filer due (MM-DD)" hint="Leave blank if it's the same.">
              <Input name="firstReturnDueDate" defaultValue={rules.firstReturnDueDate ?? ""} pattern="\d{1,2}-\d{1,2}" />
            </Field>
            <Field label="Late filing: share of unpaid tax per month" required>
              <Percent name="lateFilingMonthlyRate" value={rules.lateFiling.monthlyRate} />
            </Field>
            <Field label="…for at most (months)" required>
              <Input name="lateFilingMaxMonths" defaultValue={String(rules.lateFiling.maxMonths)} inputMode="numeric" required pattern="\d+" />
            </Field>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            A due date on a Friday or Saturday moves to the next working day; other public holidays aren&apos;t known to the app. With these rules a
            return for {year} is due by {fmt.day(new Date(Date.UTC(Number(year.slice(0, 4)) + 1, Number(rules.returnDueDate.slice(0, 2)) - 1, Number(rules.returnDueDate.slice(3)))))}.
          </p>
        </Card>

        <FormActions submitLabel={ownRow ? "Save my copy" : "Save as my copy"} bare />
      </ValidatedForm>
    </div>
  );
}
