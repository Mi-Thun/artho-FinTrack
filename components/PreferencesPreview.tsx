"use client";

import { useRef } from "react";
import { useFormValues } from "@/lib/use-form-values";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { term, type FinanceMode } from "@/lib/finance-mode";

const SAMPLE_DATE = new Date(Date.UTC(2026, 8, 26));

/** Shows the choices in the enclosing form applied to sample figures, before saving. */
export function NumbersPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const v = useFormValues(ref);
  const fmt = createFormatter((v.language as Language) || "EN", (v.numerals as NumeralSystem) || "WESTERN");
  return (
    <div ref={ref} aria-live="polite" className="rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 text-sm">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Preview</p>
      <p className="tabular-nums">
        {fmt.money(1234567)} · {fmt.day(SAMPLE_DATE)} · {fmt.compactMoney(150000)}
      </p>
    </div>
  );
}

/** The wording finance mode changes, applied live to a few sample labels. */
export function WordingPreview() {
  const ref = useRef<HTMLDivElement>(null);
  const v = useFormValues(ref);
  const mode = (v.financeMode as FinanceMode) || "CONVENTIONAL";
  return (
    <div ref={ref} aria-live="polite" className="rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 text-sm">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Preview</p>
      <p>
        {term("interestRate", mode)} · {term("fixedDeposit", mode)} · {term("loan", mode)} · {term("insurance", mode)}
      </p>
    </div>
  );
}
