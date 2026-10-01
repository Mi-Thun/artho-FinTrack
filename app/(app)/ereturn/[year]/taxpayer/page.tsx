import { requireUserId } from "@/lib/current-user";
import { getReturn } from "@/lib/ereturn/load";
import { AREA_LABELS, BENEFIT_LABELS } from "@/lib/ereturn/lines";
import { MINIMUM_TAX_AREAS, ageAtYearEnd, taxFreeThreshold } from "@/lib/ereturn/rules";
import { getLocalisation } from "@/lib/preferences";
import { toDateInput } from "@/lib/dates";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { DateInput } from "@/components/DateInput";
import { Select } from "@/components/Select";
import { ValidatedForm } from "@/components/ValidatedForm";
import { FormActions } from "@/components/Modal";
import { Input } from "@/components/ui/input";
import { updateTaxpayer } from "../../actions";

export default async function TaxpayerPage({ params }: { params: Promise<{ year: string }> }) {
  const userId = await requireUserId();
  const { year } = await params;
  const [{ record: r, result, version }, { fmt }] = await Promise.all([getReturn(userId, year), getLocalisation(userId)]);
  const age = r.dateOfBirth ? ageAtYearEnd(r.dateOfBirth, year) : null;
  const rules = result.rules;
  const minimums = [...new Set(MINIMUM_TAX_AREAS.map((a) => rules.minimumTax[a]))];
  const t = rules.threshold;

  return (
    <ValidatedForm key={version()} action={updateTaxpayer.bind(null, r.id)} className="flex flex-col gap-6" successMessage="Taxpayer details saved">
      <Card title="Taxpayer" description="Items 1–12 of IT-11GA, as on your e-TIN certificate.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" required className="sm:col-span-2" hint="In block letters, as on the e-TIN certificate.">
            <Input name="name" defaultValue={r.name} required autoComplete="name" />
          </Field>
          <Field label="TIN" hint="12 digits.">
            <Input name="tin" defaultValue={r.tin ?? ""} inputMode="numeric" pattern="\d{12}" title="12 digits" />
          </Field>
          <Field label="NID (or passport no. without an NID)">
            <Input name="nid" defaultValue={r.nid ?? ""} />
          </Field>
          <Field label="Circle" hint="e.g. Circle-100">
            <Input name="circle" defaultValue={r.circle ?? ""} />
          </Field>
          <Field label="Taxes zone" hint="e.g. 10, Dhaka">
            <Input name="taxZone" defaultValue={r.taxZone ?? ""} />
          </Field>
          <Field label="Date of birth" hint={age != null ? `${fmt.number(age)} on 30 June — ${age >= 65 ? "counts as 65 or older" : "under 65"}.` : undefined}>
            <DateInput name="dateOfBirth" defaultValue={r.dateOfBirth ? toDateInput(r.dateOfBirth) : ""} />
          </Field>
          <Field label="Father's / husband's name" hint="For the verification.">
            <Input name="fatherName" defaultValue={r.fatherName ?? ""} />
          </Field>
          <Field label="Wife's / husband's name">
            <Input name="spouseName" defaultValue={r.spouseName ?? ""} />
          </Field>
          <Field label="Spouse's TIN (if a taxpayer)">
            <Input name="spouseTin" defaultValue={r.spouseTin ?? ""} inputMode="numeric" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input name="address" defaultValue={r.address ?? ""} autoComplete="street-address" />
          </Field>
          <Field label="Mobile">
            <Input name="phone" defaultValue={r.phone ?? ""} type="tel" autoComplete="tel" />
          </Field>
          <Field label="Email">
            <Input name="email" defaultValue={r.email ?? ""} type="email" autoComplete="email" />
          </Field>
          <Field label="Employer" hint="The latest, if more than one." className="sm:col-span-2">
            <Input name="employerName" defaultValue={r.employerName ?? ""} />
          </Field>
          <Field label="Business name">
            <Input name="businessName" defaultValue={r.businessName ?? ""} />
          </Field>
          <Field label="Business identification number (BIN)">
            <Input name="bin" defaultValue={r.bin ?? ""} />
          </Field>
        </div>
      </Card>

      <Card title="Status and special benefits" description={`Your tax-free band this year: ${fmt.money(result.tax.threshold)}.`}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Residential status" required>
            <Select
              name="resident"
              defaultValue={r.resident ? "YES" : "NO"}
              options={[
                { value: "YES", label: "Resident" },
                { value: "NO", label: "Non-resident" },
              ]}
            />
          </Field>
          {minimums.length > 1 ? (
            <Field label="Where you live" required hint={`Sets the minimum tax: ${minimums.map((v) => fmt.money(v)).join(", ")}.`}>
              <Select name="area" defaultValue={r.area} options={MINIMUM_TAX_AREAS.map((a) => ({ value: a, label: `${AREA_LABELS[a]} — ${fmt.money(rules.minimumTax[a])}` }))} />
            </Field>
          ) : (
            <input type="hidden" name="area" value={r.area} />
          )}
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="firstReturn" defaultChecked={r.firstReturn} className="mt-0.5 size-4" />
            <span>
              This is my first ever return
              <span className="block text-xs text-muted-foreground">
                {rules.minimumTaxFirstReturn != null
                  ? `Minimum tax is ${fmt.money(rules.minimumTaxFirstReturn)} instead of ${fmt.money(minimums[0])}`
                  : "No lower minimum tax this year"}
                {rules.firstReturnDueDate ? `, and the return is due by 30 June after the income year instead of 30 November.` : "."}
              </span>
            </span>
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Tick any that apply (item 8)</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(BENEFIT_LABELS).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="benefits" value={value} defaultChecked={(r.benefits as string[]).includes(value)} className="size-4" />
                  {label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              General band {fmt.money(t.general)}; female or 65+ {fmt.money(t.femaleOrSenior)}; third gender {fmt.money(t.thirdGender)}; person
              with disability {fmt.money(t.disabled)}; war-wounded freedom fighter {fmt.money(t.freedomFighter)}
              {t.julyWarrior != null ? `; July warrior ${fmt.money(t.julyWarrior)}` : " (no separate July warrior band this year)"}; a parent of a
              person with disability adds {fmt.money(rules.parentOfDisabledExtra)}. With your ticks:{" "}
              {fmt.money(taxFreeThreshold(rules, r.benefits, r.dateOfBirth))}.
            </p>
          </fieldset>
        </div>
      </Card>

      <Card title="Filing" description="Once submitted, from NBR's acknowledgement.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Serial no. of return register">
            <Input name="serialNo" defaultValue={r.serialNo ?? ""} />
          </Field>
          <Field label="Date of submission">
            <DateInput name="filedAt" defaultValue={r.filedAt ? toDateInput(r.filedAt) : ""} />
          </Field>
        </div>
      </Card>

      <FormActions submitLabel="Save details" bare />
    </ValidatedForm>
  );
}
