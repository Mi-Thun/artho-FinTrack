"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { toWesternNumerals } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Strips a typed amount down to `-?digits(.digits)?`, accepting Bengali digits too. */
function clean(text: string, allowNegative: boolean): string {
  const western = toWesternNumerals(text);
  const negative = allowNegative && western.trimStart().startsWith("-");
  let body = western.replace(/[^0-9.]/g, "");
  const dot = body.indexOf(".");
  if (dot >= 0) body = body.slice(0, dot + 1) + body.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return (negative ? "-" : "") + body;
}

/** `-1234567.5` → `-12,34,567.5` — lakh grouping on the integer part only. */
function group(raw: string): string {
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [int, dec] = body.split(".");
  const grouped = int ? new Intl.NumberFormat("en-IN").format(Number(int)) : dec !== undefined ? "0" : "";
  return (negative ? "-" : "") + grouped + (dec !== undefined ? `.${dec}` : "");
}

/** Characters that carry value — everything but grouping commas. */
function significantBefore(text: string, caret: number): number {
  return text.slice(0, caret).replace(/,/g, "").length;
}

function caretAfterSignificant(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== ",") seen++;
    if (seen === count) return i + 1;
  }
  return text.length;
}

function initialRaw(value: number | string | null | undefined, allowNegative: boolean): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  // Two decimals at most, and none when the amount is whole.
  return clean(String(Math.round(n * 100) / 100), allowNegative);
}

/**
 * An amount field that groups digits as you type (1,00,000) behind a ৳ prefix, while
 * submitting the plain number under `name` — server actions keep reading `Number(...)`.
 */
export function MoneyInput({
  name,
  defaultValue,
  required,
  positive,
  allowNegative = false,
  placeholder,
  id,
  className,
  autoFocus,
  size = "default",
}: {
  name: string;
  defaultValue?: number | string | null;
  required?: boolean;
  /** Reject zero — for amounts that must be greater than 0. */
  positive?: boolean;
  allowNegative?: boolean;
  placeholder?: string;
  id?: string;
  className?: string;
  autoFocus?: boolean;
  /** "lg" for the headline amount of an entry form. */
  size?: "default" | "lg";
}) {
  const [raw, setRaw] = useState(() => initialRaw(defaultValue, allowNegative));
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const display = group(raw);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    if (pendingCaret.current != null && document.activeElement === input) {
      const pos = caretAfterSignificant(display, pendingCaret.current);
      input.setSelectionRange(pos, pos);
    }
    pendingCaret.current = null;
    const n = Number(raw);
    input.setCustomValidity(positive && raw !== "" && !(n > 0) ? "Enter an amount greater than 0." : "");
  }, [display, raw, positive]);

  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center rounded-lg border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[:user-invalid]:border-destructive dark:bg-input/30",
        size === "lg" ? "h-14" : "h-8",
        className,
      )}
    >
      <span aria-hidden className={cn("pl-2.5 text-muted-foreground", size === "lg" ? "pl-4 text-2xl" : "text-sm")}>
        ৳
      </span>
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        required={required}
        placeholder={placeholder ?? "0"}
        value={display}
        onChange={(e) => {
          const next = clean(e.target.value, allowNegative);
          pendingCaret.current = significantBefore(e.target.value, e.target.selectionStart ?? e.target.value.length);
          setRaw(next);
        }}
        className={cn(
          "h-full w-full min-w-0 bg-transparent px-1.5 tabular-nums outline-none placeholder:text-muted-foreground",
          size === "lg" ? "text-2xl font-semibold" : "text-base md:text-sm",
        )}
      />
      <input type="hidden" name={name} value={raw === "-" ? "" : raw} />
    </div>
  );
}
