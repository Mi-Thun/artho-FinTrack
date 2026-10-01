import { Field } from "@/components/Field";
import { DateInput } from "@/components/DateInput";
import { MoneyInput } from "@/components/MoneyInput";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/input";
import { INVESTMENT_KINDS, TAX_PAYMENT_KINDS, type InvestmentKind, type TaxPaymentKind } from "@/lib/ereturn/lines";

/** A tax challan or other payment: what it was for, how much, and the challan's details. */
export function PaymentFields({
  defaults,
}: {
  defaults?: {
    kind: TaxPaymentKind;
    amount?: number;
    reference?: string;
    date?: string;
    depositedBy?: string;
    bank?: string;
    branch?: string;
    note?: string;
  };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Kind" required className="sm:col-span-2">
        <Select
          name="kind"
          defaultValue={defaults?.kind ?? "SALARY_TDS"}
          options={Object.entries(TAX_PAYMENT_KINDS).map(([value, k]) => ({ value, label: k.label }))}
        />
      </Field>
      <Field label="Amount" required>
        <MoneyInput name="amount" required positive defaultValue={defaults?.amount} autoFocus />
      </Field>
      <Field label="Challan date">
        <DateInput name="date" defaultValue={defaults?.date} />
      </Field>
      <Field label="Challan no." hint="e.g. 2526-0001234567">
        <Input name="reference" defaultValue={defaults?.reference} />
      </Field>
      <Field label="Deposited by" hint="For salary TDS, your employer.">
        <Input name="depositedBy" defaultValue={defaults?.depositedBy} />
      </Field>
      <Field label="Bank">
        <Input name="bank" defaultValue={defaults?.bank} placeholder="Sonali Bank PLC" />
      </Field>
      <Field label="Branch">
        <Input name="branch" defaultValue={defaults?.branch} />
      </Field>
      <Field label="Note" className="sm:col-span-2" hint="e.g. which month's salary it's for.">
        <Input name="note" defaultValue={defaults?.note} />
      </Field>
    </div>
  );
}

/** An investment claimed for the rebate (Schedule 5). */
export function InvestmentFields({
  defaults,
}: {
  defaults?: { kind: InvestmentKind; amount?: number; date?: string; description?: string };
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Kind" required className="sm:col-span-2">
        <Select
          name="kind"
          defaultValue={defaults?.kind ?? "GOVT_SECURITIES"}
          options={Object.entries(INVESTMENT_KINDS).map(([value, k]) => ({ value, label: k.label }))}
        />
      </Field>
      <Field label="Amount invested this year" required>
        <MoneyInput name="amount" required positive defaultValue={defaults?.amount} autoFocus />
      </Field>
      <Field label="Date" hint="Only investment made during the income year counts.">
        <DateInput name="date" defaultValue={defaults?.date} />
      </Field>
      <Field label="Description" className="sm:col-span-2" hint="e.g. the certificate's registration no., the policy no.">
        <Input name="description" defaultValue={defaults?.description} />
      </Field>
    </div>
  );
}
