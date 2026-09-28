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
 * One "Profit rate" throughout (saved for all three years — profit is worked out at the
 * year-3 rate): adding a scheme SP pre-fills the scheme's current rate; "Other / bank FDR"
 * also asks for the term; editing pre-fills the rate the certificate was bought at.
 */
export function SpSchemeFields({
  schemes,
  mode,
  defaultScheme = "PARIWAR",
  defaultHolder = "SINGLE",
  defaultRates,
  defaultSlabRate,
}: {
  schemes: SchemeOption[];
  mode: "add" | "edit";
  defaultScheme?: string;
  defaultHolder?: string;
  /** Existing rates as percentages, for edit mode (only y3 is shown). */
  defaultRates?: { y1: number; y2: number; y3: number };
  /** Existing rate above the ৳7.5 lakh slab as a percentage, for edit mode. */
  defaultSlabRate?: number;
}) {
  const [scheme, setScheme] = useState(defaultScheme);
  const selected = schemes.find((s) => s.value === scheme);
  const isOther = !selected || selected.ratePercent == null;
  const showRateInputs = mode === "edit" || isOther;

  // Scheme SPs only: the part of this certificate beyond ৳7.5 lakh (counting SPs you
  // opened before it) earns this lower rate. Blank means one rate for the whole amount.
  const slabRateField = !isOther && (
    <Field
      label="Rate above ৳7.5 lakh (% a year)"
      hint="Optional. Sanchayapatra you opened earlier fill the ৳7.5 lakh first; only the part of this one beyond it earns this rate."
    >
      <Input name="slabRate" type="number" step="0.01" min="0" defaultValue={defaultSlabRate} className="sm:max-w-48" />
    </Field>
  );

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
        <Field
          label="Profit rate (% a year)"
          required
          hint={`The scheme's current rate${selected.tenureMonths != null ? ` · ${selected.tenureMonths}-month term` : ""}. Change it to the rate on your certificate.`}
        >
          <Input
            // Remounts on a scheme change so the new scheme's rate is filled in.
            key={scheme}
            name="rate"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={selected.ratePercent ?? undefined}
            className="sm:max-w-48"
          />
        </Field>
      )}
      {!showRateInputs && slabRateField}

      {showRateInputs && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* One rate: profit is worked out at the year-3 (full-term) rate everywhere. */}
            <Field label="Profit rate (% a year)" required>
              <Input
                key={scheme}
                name="rate"
                type="number"
                step="0.01"
                min="0"
                required
                defaultValue={defaultRates?.y3 ?? selected?.ratePercent ?? undefined}
              />
            </Field>
            {mode === "add" && (
              <Field label="Term (months)">
                <Input name="termMonths" type="number" min="1" step="1" defaultValue={36} />
              </Field>
            )}
          </div>
          {slabRateField}
          {mode === "edit" && (
            <p className="-mt-1 text-xs text-muted-foreground">
              Keep the rate this certificate was bought at — scheme rates change by circular.
            </p>
          )}
        </>
      )}
    </>
  );
}
