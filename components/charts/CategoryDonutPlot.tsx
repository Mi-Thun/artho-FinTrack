"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Formatter } from "@/lib/i18n";
import { ChartTooltipCard } from "@/components/charts/parts";

/** The recharts half of CategoryDonut, split out so recharts loads after the page. */
export default function CategoryDonutPlot({
  segments,
  fmt,
  pct,
}: {
  segments: { name: string; amount: number; color: string }[];
  fmt: Formatter;
  pct: (v: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={segments}
          dataKey="amount"
          nameKey="name"
          innerRadius="68%"
          outerRadius="100%"
          paddingAngle={1}
          // The 2px surface gap between slices.
          stroke="var(--card)"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {segments.map((s) => (
            <Cell key={s.name} fill={s.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            const s = active && payload?.[0]?.payload;
            if (!s) return null;
            return <ChartTooltipCard title={s.name} rows={[{ label: pct(s.amount), value: fmt.money(s.amount), color: s.color }]} />;
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
