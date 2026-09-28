"use client";

import { useRef } from "react";
import { useFormValues } from "@/lib/use-form-values";
import { dpsBalanceToDate, nextSpInterestPayment, type SpPayout } from "@/lib/deposit-planner";
import { splitAtSlab } from "@/lib/rate-slab";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

function PreviewBox({ children }: { children: React.ReactNode }) {
  return (
    <div aria-live="polite" className="rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 text-sm">
      <p className="mb-1 text-xs font-medium text-muted-foreground">Preview (estimate)</p>
      {children}
    </div>
  );
}

/**
 * Live estimate while adding an SP, using the same model as the dashboard and projection
 * (lib/deposit-planner): profit at the year-3 rate, net of 5% tax at source — paid
 * quarterly, or all at maturity for a scheme like the 5-year Bangladesh Sanchayapatra.
 */
export function SpPreview({
  schemeRates,
  investedBefore = 0,
  termMonths,
  language,
  numerals,
}: {
  /** Statutory rate (fraction) and tenure per scheme key. */
  schemeRates: Record<string, { rate: number; tenureMonths: number; payout: SpPayout }>;
  /** Scheme SPs already held, which fill the ৳7.5 lakh rate slab before this one. */
  investedBefore?: number;
  /** The saved term, for editing an "Other / bank FDR" (whose form has no term input). */
  termMonths?: number;
  language: Language;
  numerals: NumeralSystem;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useFormValues(ref);
  const fmt = createFormatter(language, numerals);
  const principal = Number(v.principal);
  const opened = new Date(v.openedDate ?? "");
  const scheme = schemeRates[v.scheme ?? ""];
  // A typed profit rate wins over the scheme's current one.
  const baseRate = v.rate ? Number(v.rate) / 100 : scheme ? scheme.rate : 0;
  // With a rate above ৳7.5 lakh, the part of this SP beyond the slab earns that rate.
  const slabRate = Number(v.slabRate) / 100;
  const split = scheme && v.slabRate ? splitAtSlab(principal || 0, investedBefore, baseRate, slabRate) : null;
  const rate = split ? split.blendedRate : baseRate;
  const term = scheme ? scheme.tenureMonths : Number(v.termMonths) || termMonths || 36;
  const ready = principal > 0 && !Number.isNaN(opened.getTime()) && rate > 0;

  let body = <p className="text-muted-foreground">Enter the principal and profit rate to see payouts.</p>;
  if (ready) {
    const payout = scheme?.payout ?? "QUARTERLY";
    const deposit = { label: "", principal, openedDate: opened, rateY1: rate, rateY2: rate, rateY3: rate, termMonths: term, payout };
    const first = nextSpInterestPayment(deposit, opened);
    body = (
      <ul className="flex flex-col gap-0.5">
        {payout === "AT_MATURITY" ? (
          <li>
            No profit until maturity, then <span className="font-medium tabular-nums">{fmt.money(first.amount)}</span> in one
            payment after tax on {fmt.day(first.date)}
          </li>
        ) : (
          <li>
            <span className="font-medium tabular-nums">{fmt.money(first.amount)}</span> every 3 months after tax — first on{" "}
            {fmt.day(first.date)}
          </li>
        )}
        {split && split.slabAmount > 0 && (
          <li>
            <span className="tabular-nums">{fmt.money(principal - split.slabAmount)}</span> at{" "}
            {fmt.number(baseRate * 100, { maximumFractionDigits: 2 })}%, <span className="tabular-nums">{fmt.money(split.slabAmount)}</span> at{" "}
            {fmt.number(slabRate * 100, { maximumFractionDigits: 2 })}%
            {investedBefore > 0 && <> — you already hold {fmt.money(investedBefore)} toward the ৳7.5 lakh</>}
          </li>
        )}
        <li>
          Matures {fmt.day(addMonths(opened, term))} ({fmt.number(term)} months); your {fmt.money(principal)} is returned then.
        </li>
      </ul>
    );
  }
  return (
    <div ref={ref}>
      <PreviewBox>{body}</PreviewBox>
    </div>
  );
}

/** Live estimate while adding a DPS: total paid in and the balance at maturity. */
export function DpsPreview({ language, numerals }: { language: Language; numerals: NumeralSystem }) {
  const ref = useRef<HTMLDivElement>(null);
  const v = useFormValues(ref);
  const fmt = createFormatter(language, numerals);
  const monthly = Number(v.monthlyDeposit);
  const tenure = Number(v.tenureMonths);
  const rate = Number(v.interestRate) / 100;
  const tax = v.profitTaxAtSource === "" || v.profitTaxAtSource == null ? 0.1 : Number(v.profitTaxAtSource) / 100;
  const start = new Date(v.startMonth ? `${v.startMonth}-01T00:00:00Z` : "");
  const ready = monthly > 0 && Number.isInteger(tenure) && tenure > 0 && rate >= 0 && !Number.isNaN(start.getTime());

  let body = <p className="text-muted-foreground">Enter the monthly deposit, tenure and rate to see the maturity value.</p>;
  if (ready) {
    const maturity = addMonths(start, tenure);
    const plan = { label: "", monthlyDeposit: monthly, startMonth: start, tenureMonths: tenure, interestRate: rate, profitTaxAtSource: tax };
    const value = dpsBalanceToDate([plan], maturity);
    body = (
      <ul className="flex flex-col gap-0.5">
        <li>
          You pay in <span className="font-medium tabular-nums">{fmt.money(monthly * tenure)}</span> over {fmt.number(tenure)} months.
        </li>
        <li>
          About <span className="font-medium tabular-nums">{fmt.money(value)}</span> at maturity, {fmt.monthYear(maturity)}.
        </li>
      </ul>
    );
  }
  return (
    <div ref={ref}>
      <PreviewBox>{body}</PreviewBox>
    </div>
  );
}
