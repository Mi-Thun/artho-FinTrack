"use client";

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Formatter } from "@/lib/i18n";
import { ChartTooltipCard } from "@/components/charts/parts";
import { EXPENSE, INCOME, NET, type FlowPoint } from "@/components/charts/FlowChart";

/** The recharts half of FlowChart, split out so recharts loads after the page. */
export default function FlowChartPlot({
  data,
  fmt,
}: {
  data: (Omit<FlowPoint, "income" | "expense"> & { income: number | null; expense: number | null; net: number | null })[];
  fmt: Formatter;
}) {
  return (
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
  );
}
