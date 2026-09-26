"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { useFormatter } from "@/components/LocaleProvider";
import { applyNumerals } from "@/lib/i18n";

/**
 * A native date picker plus the chosen day in the app's own format ("Sat, 26 Sep 2026").
 * The browser draws the picker in its locale (09/26/2026 in en-US), which is easy to misread
 * as 9 Feb; the readout underneath removes the doubt without replacing the accessible
 * native control.
 */
export function DateInput({
  name,
  defaultValue,
  required,
  autoFocus,
}: {
  name: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  const fmt = useFormatter();
  const [value, setValue] = useState(defaultValue ?? "");
  const id = useId();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  const weekday = date
    ? applyNumerals(date.toLocaleDateString(fmt.language === "BN" ? "bn-BD" : "en-GB", { weekday: "short", timeZone: "UTC" }), fmt.numerals)
    : null;

  return (
    <>
      <Input
        name={name}
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required}
        autoFocus={autoFocus}
        aria-describedby={`${id}-readout`}
      />
      <span id={`${id}-readout`} className="text-xs font-normal text-muted-foreground" aria-live="polite">
        {date ? `${weekday}, ${fmt.day(date)}` : "\u00a0"}
      </span>
    </>
  );
}
