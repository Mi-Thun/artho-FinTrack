"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Formatter } from "@/lib/i18n";
import { ChartTooltipCard } from "@/components/charts/parts";
import type { StackedSeries } from "@/components/charts/StackedMonthlyBars";

/** The recharts half of StackedMonthlyBars, split out so recharts loads after the page. */
export default function StackedMonthlyBarsPlot({
  points,
  series,
  fmt,
  value,
}: {
  points: ({ label: string; fullLabel: string } & Record<string, number | string>)[];
  series: StackedSeries[];
  fmt: Formatter;
  value: (p: Record<string, number | string>, key: string) => number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v: number) => fmt.compactMoney(v)}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.6 }}
          content={({ active, payload }) => {
            const p = active && payload?.[0]?.payload;
            if (!p) return null;
            const rows = series
              .filter((s) => value(p, s.key) > 0)
              .map((s) => ({ label: s.label, value: fmt.money(value(p, s.key)), color: s.color }));
            const total = series.reduce((sum, s) => sum + value(p, s.key), 0);
            return <ChartTooltipCard title={p.fullLabel} rows={[...rows, { label: "Total", value: fmt.money(total) }]} />;
          }}
        />
        {series.map((s) => (
          // A 1px card-coloured stroke keeps a visible gap between stacked segments.
          <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--card)" strokeWidth={1} maxBarSize={28} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
