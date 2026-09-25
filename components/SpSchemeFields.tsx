"use client";

import { useState } from "react";
import { Field } from "@/components/Field";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/input";

export interface SchemeOption {
  value: string;
  label: string;
  /** Statutory annual rate as a percentage; null for "Other / bank FDR". */
  ratePercent: number | null;
  tenureMonths: number | null;
}

/**
 * Scheme, holder, and rate fields for an SP (Sanchayapatra) form.
 *
 * Adding: a government scheme's rate and tenure are statutory, so they're shown read-only
 * and nothing is submitted — the server fills them from the scheme. Only "Other / bank
 * FDR" asks for rates. Editing: rates stay editable, because an older certificate keeps
 * the rate it was actually bought at.
 */
export function SpSchemeFields({
  schemes,
  mode,
  defaultScheme = "PARIWAR",
  defaultHolder = "SINGLE",
  defaultRates,
}: {
  schemes: SchemeOption[];
  mode: "add" | "edit";
  defaultScheme?: string;
  defaultHolder?: string;
  /** Existing rates as percentages, for edit mode. */
  defaultRates?: { y1: number; y2: number; y3: number };
}) {
  const [scheme, setScheme] = useState(defaultScheme);
  const selected = schemes.find((s) => s.value === scheme);
  const isOther = !selected || selected.ratePercent == null;
  const showRateInputs = mode === "edit" || isOther;

  return (
    <>
      <Field label="Scheme" required>
        <Select
          name="scheme"
          defaultValue={defaultScheme}
          onValueChange={setScheme}
          options={schemes.map((s) => ({ value: s.value, label: s.label }))}
        />
      </Field>
      <Field label="Holder" required>
        <Select
          name="holderType"
          defaultValue={defaultHolder}
          options={[
            { value: "SINGLE", label: "Single holder" },
            { value: "JOINT", label: "Joint holders" },
          ]}
        />
      </Field>

      {!showRateInputs && selected && (
        <div className="rounded-lg border border-dashed px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{selected.ratePercent}% a year</span>
          {selected.tenureMonths != null && (
            <span className="text-muted-foreground"> · {selected.tenureMonths}-month term</span>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            Set by the scheme. Choose &ldquo;Other / bank FDR&rdquo; to enter your own rates.
          </p>
        </div>
      )}

      {showRateInputs && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Rate year 1 (%)" required={isOther}>
              <Input
                name="rateY1"
                type="number"
                step="0.01"
                min="0"
                required={isOther}
                defaultValue={defaultRates?.y1 ?? selected?.ratePercent ?? undefined}
              />
            </Field>
            <Field label="Rate year 2 (%)" required={isOther}>
              <Input
                name="rateY2"
                type="number"
                step="0.01"
                min="0"
                required={isOther}
                defaultValue={defaultRates?.y2 ?? selected?.ratePercent ?? undefined}
              />
            </Field>
            <Field label="Rate year 3 (%)" required={isOther}>
              <Input
                name="rateY3"
                type="number"
                step="0.01"
                min="0"
                required={isOther}
                defaultValue={defaultRates?.y3 ?? selected?.ratePercent ?? undefined}
              />
            </Field>
          </div>
          {mode === "add" && (
            <Field label="Term (months)">
              <Input name="termMonths" type="number" min="1" step="1" defaultValue={36} />
            </Field>
          )}
          {mode === "edit" && (
            <p className="-mt-1 text-xs text-muted-foreground">
              Keep the rates this certificate was bought at — scheme rates change by circular.
            </p>
          )}
        </>
      )}
    </>
  );
}
