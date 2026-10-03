"use client";

import dynamic from "next/dynamic";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { SERIES, SERIES_OTHER } from "@/lib/chart-colors";
import { ChartDataTable } from "@/components/charts/parts";

// recharts loads after the page (see FlowChart); the total and the list render with it.
const CategoryDonutPlot = dynamic(() => import("@/components/charts/CategoryDonutPlot"), { ssr: false });

const TOP = 5;

/**
 * Spending by category: the five largest in fixed palette order, the rest folded into
 * "Other" (never a sixth generated colour). The list beside it labels every slice with its
 * amount and share, so the chart never depends on telling colours apart.
 */
export function CategoryDonut({
  categories,
  language = "EN",
  numerals = "WESTERN",
}: {
  categories: { name: string; amount: number }[];
  language?: Language;
  numerals?: NumeralSystem;
}) {
  const fmt = createFormatter(language, numerals);
  const sorted = [...categories].filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((s, c) => s + c.amount, 0);

  if (sorted.length < 2) {
    return (
      <p className="text-sm text-muted-foreground">
        {sorted.length === 0
          ? "No expenses logged this month yet."
          : `All spending this month is in ${sorted[0].name} (${fmt.money(sorted[0].amount)}). A breakdown appears once there are two or more categories.`}
      </p>
    );
  }

  const top = sorted.slice(0, TOP).map((c, i) => ({ ...c, color: SERIES[i] }));
  const rest = sorted.slice(TOP);
  const segments = rest.length
    ? [...top, { name: `Other (${fmt.number(rest.length)})`, amount: rest.reduce((s, c) => s + c.amount, 0), color: SERIES_OTHER }]
    : top;
  const pct = (v: number) => `${fmt.number((v / total) * 100, { maximumFractionDigits: 0 })}%`;

  return (
    <div>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div className="relative size-48 shrink-0" role="img" aria-label={`Spending by category, total ${fmt.money(total)}`}>
          <CategoryDonutPlot segments={segments} fmt={fmt} pct={pct} />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs text-muted-foreground">Total</span>
            <span className="text-base font-semibold tabular-nums">{fmt.money(total)}</span>
          </div>
        </div>
        <ul className="flex w-full flex-col gap-2.5">
          {segments.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-4 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="truncate">{s.name}</span>
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {fmt.money(s.amount)} · {pct(s.amount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ChartDataTable
        caption="Spending by category"
        headers={["Category", "Amount", "Share"]}
        rows={sorted.map((c) => [c.name, fmt.money(c.amount), pct(c.amount)])}
      />
    </div>
  );
}
