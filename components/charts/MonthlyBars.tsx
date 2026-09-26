"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { ChartDataTable, ChartTooltipCard } from "@/components/charts/parts";

const FILL = "var(--series-1)";

/** One series per month (e.g. income by month). The card title names the series. */
export function MonthlyBars({
  points,
  seriesLabel,
  language = "EN",
  numerals = "WESTERN",
}: {
  points: { label: string; fullLabel: string; value: number }[];
  seriesLabel: string;
  language?: Language;
  numerals?: NumeralSystem;
}) {
  const fmt = createFormatter(language, numerals);
  return (
    <div>
      <div className="h-56 w-full" role="img" aria-label={`${seriesLabel} by month`}>
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
                return <ChartTooltipCard title={p.fullLabel} rows={[{ label: seriesLabel, value: fmt.money(p.value), color: FILL }]} />;
              }}
            />
            <Bar dataKey="value" fill={FILL} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption={`${seriesLabel} by month`}
        headers={["Month", seriesLabel]}
        rows={points.map((p) => [p.fullLabel, fmt.money(p.value)])}
      />
    </div>
  );
}
