"use client";

import { useState } from "react";
import { Field } from "@/components/Field";
import { DateInput } from "@/components/DateInput";
import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FINANCIAL_ASSET_KINDS, type FinancialAssetKind } from "@/lib/ereturn/lines";

const KIND_OPTIONS = Object.entries(FINANCIAL_ASSET_KINDS).map(([value, k]) => ({ value: value as FinancialAssetKind, label: k.label }));

/** Held for a fixed term, so the issue date matters (rebate year, maturity). */
const DATED: FinancialAssetKind[] = ["SANCHAYAPATRA", "DPS", "FIXED_DEPOSIT", "BOND"];

/**
 * A bank account, Sanchayapatra or other financial asset. The labels follow the kind —
 * a Sanchayapatra has a face value and profit, an account a balance and interest — and
 * the issue date is asked for only where it means something.
 */
export function FinancialAssetFields({
  defaults,
}: {
  defaults?: {
    kind: FinancialAssetKind;
    institution: string;
    branch: string;
    reference: string;
    description: string;
    openedDate: string;
    value: number;
    income: number;
    taxDeducted: number;
  };
}) {
  const [kind, setKind] = useState<FinancialAssetKind>(defaults?.kind ?? "BANK_ACCOUNT");
  const labels = FINANCIAL_ASSET_KINDS[kind];
  const isSp = kind === "SANCHAYAPATRA";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Field label="Kind" required className="sm:col-span-2">
        <UiSelect
          name="kind"
          value={kind}
          onValueChange={(v) => setKind((v as FinancialAssetKind) ?? "BANK_ACCOUNT")}
          itemToStringLabel={(v) => FINANCIAL_ASSET_KINDS[v as FinancialAssetKind]?.label ?? ""}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </UiSelect>
      </Field>
      <Field label={isSp ? "Issued by" : "Bank or institution"} required hint={isSp ? "The bank or post office it was bought from." : undefined}>
        <Input name="institution" required defaultValue={defaults?.institution} placeholder={isSp ? "Sonali Bank PLC" : "City Bank PLC"} autoFocus />
      </Field>
      <Field label="Branch">
        <Input name="branch" defaultValue={defaults?.branch} />
      </Field>
      <Field label={isSp || kind === "BOND" ? "Registration no." : "Account no."}>
        <Input name="reference" defaultValue={defaults?.reference} />
      </Field>
      {DATED.includes(kind) ? (
        <Field label="Issue date" hint={isSp ? "Decides whether it can be claimed for this year's rebate." : undefined}>
          <DateInput name="openedDate" defaultValue={defaults?.openedDate} />
        </Field>
      ) : (
        <input type="hidden" name="openedDate" value="" />
      )}
      <Field label="Description" className="sm:col-span-2" hint={isSp ? "e.g. 3-month profit-based 3-year Sanchayapatra" : undefined}>
        <Input name="description" defaultValue={defaults?.description} />
      </Field>
      <Field label={labels.valueLabel} hint="As on 30 June — goes to the assets statement (IT-10B).">
        <MoneyInput name="value" defaultValue={defaults?.value || undefined} />
      </Field>
      <Field label={`${labels.incomeLabel} for the year`} hint="Gross, before source tax — from the bank's tax certificate.">
        <MoneyInput name="income" defaultValue={defaults?.income || undefined} />
      </Field>
      <Field label="Tax deducted at source" hint="From the same certificate.">
        <MoneyInput name="taxDeducted" defaultValue={defaults?.taxDeducted || undefined} />
      </Field>
    </div>
  );
}
