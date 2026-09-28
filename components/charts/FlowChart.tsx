"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { ChartDataTable, ChartLegend, ChartTooltipCard } from "@/components/charts/parts";

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
const INCOME = "var(--series-1)";
const EXPENSE = "var(--series-2)";
const NET = "var(--series-3)";

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
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => fmt.compactMoney(v)}
            />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload;
                if (!p) return null;
                if (!p.hasData) return <ChartTooltipCard title={p.fullLabel} rows={[{ label: "No transactions", value: "" }]} />;
                return (
                  <ChartTooltipCard
                    title={p.fullLabel}
                    rows={[
                      { label: "Income", value: fmt.money(p.income), color: INCOME },
                      { label: "Expense", value: fmt.money(p.expense), color: EXPENSE },
                      { label: "Net", value: fmt.money(p.net), color: NET },
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="income" name="Income" fill={INCOME} maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="expense" name="Expense" fill={EXPENSE} maxBarSize={14} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line
              dataKey="net"
              name="Net"
              stroke={NET}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{ r: 4, fill: NET, stroke: "var(--card)", strokeWidth: 2 }}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
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
