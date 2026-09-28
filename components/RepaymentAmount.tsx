"use client";

import { useState } from "react";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";

/** Repayment amount with a one-tap "Full amount" that fills in what's outstanding. */
export function RepaymentAmount({ outstanding, outstandingLabel }: { outstanding: number; outstandingLabel: string }) {
  // Remounting the (uncontrolled) MoneyInput is how "Full amount" sets its value.
  const [preset, setPreset] = useState<{ key: number; value?: number }>({ key: 0 });
  return (
    <Field
      label="Amount"
      required
      hint={
        <span className="flex flex-wrap items-center gap-2">
          {outstandingLabel} outstanding
          <button
            type="button"
            onClick={() => setPreset((p) => ({ key: p.key + 1, value: outstanding }))}
            className="font-medium text-link hover:underline"
          >
            Full amount
          </button>
        </span>
      }
    >
      <MoneyInput key={preset.key} name="amount" defaultValue={preset.value} required positive autoFocus />
    </Field>
  );
}
