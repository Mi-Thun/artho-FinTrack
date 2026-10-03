"use client";

import dynamic from "next/dynamic";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { ChartDataTable, ChartLegend } from "@/components/charts/parts";

// recharts is the largest thing the dashboard ships, so the plot loads after the page and
// fills the fixed-height box below; the legend and data table render with the page.
const FlowChartPlot = dynamic(() => import("@/components/charts/FlowChartPlot"), { ssr: false });

export interface FlowPoint {
  /** Axis label, e.g. "Sep 26". */
  label: string;
  /** Full label for the tooltip and table, e.g. "Sep 2026". */
  fullLabel: string;
  income: number;
  expense: number;
  /** False for months with no transactions — drawn as a gap, not as zero activity. */
  hasData: boolean;
}

// Income, expense, net: categorical slots 1–3, the three that validate on every pair in
// both modes. Status green/red are kept for states (over budget, overdue), not series.
export const INCOME = "var(--series-1)";
export const EXPENSE = "var(--series-2)";
export const NET = "var(--series-3)";

/**
 * Income vs expense per month as grouped bars, with net as a line over them. One y-axis in
 * ৳ (never two scales), hover tooltip per month, legend above, data table below.
 */
export function FlowChart({
  points,
  language = "EN",
  numerals = "WESTERN",
}: {
  points: FlowPoint[];
  language?: Language;
  numerals?: NumeralSystem;
}) {
  const fmt = createFormatter(language, numerals);
  const data = points.map((p) => ({
    ...p,
    income: p.hasData ? p.income : null,
    expense: p.hasData ? p.expense : null,
    net: p.hasData ? p.income - p.expense : null,
  }));

  if (!points.some((p) => p.hasData)) {
    return <p className="text-sm text-muted-foreground">No transaction history yet — add some to see the monthly flow.</p>;
  }

  return (
    <div>
      <ChartLegend
        items={[
          { label: "Income", color: INCOME },
          { label: "Expense", color: EXPENSE },
          { label: "Net", color: NET, kind: "line" },
        ]}
      />
      <div className="h-64 w-full" role="img" aria-label="Monthly income, expense and net flow">
        <FlowChartPlot data={data} fmt={fmt} />
      </div>
      <ChartDataTable
        caption="Monthly income, expense and net"
        headers={["Month", "Income", "Expense", "Net"]}
        rows={points.map((p) =>
          p.hasData
            ? [p.fullLabel, fmt.money(p.income), fmt.money(p.expense), fmt.money(p.income - p.expense)]
            : [p.fullLabel, "—", "—", "—"],
        )}
      />
    </div>
  );
}
