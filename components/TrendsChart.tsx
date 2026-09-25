"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";

export interface TrendPoint {
  label: string;
  netFlow: number;
}

const POSITIVE = "var(--trend-positive)";
const NEGATIVE = "var(--trend-negative)";
const GRID = "var(--trend-grid)";
const AXIS = "var(--trend-axis)";
const SURFACE = "var(--trend-surface)";
const TEXT = "var(--trend-text)";

function TrendsTooltip({
  active,
  payload,
  formatBDT,
}: {
  active?: boolean;
  payload?: { value: number }[];
  formatBDT: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div
      style={{ background: SURFACE, color: TEXT, borderColor: "var(--trend-border)" }}
      className="rounded border px-2 py-1 text-xs shadow-sm"
    >
      {formatBDT(value)}
    </div>
  );
}

export function TrendsChart({
  points,
  language = "EN",
  numerals = "WESTERN",
}: {
  points: TrendPoint[];
  language?: Language;
  numerals?: NumeralSystem;
}) {
  const formatBDT = createFormatter(language, numerals).money;
  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">No transaction history yet — add some to see trends.</p>;
  }

  return (
    <div className="trend-root h-64 w-full">
      {/* Chart colours come from the app's tokens so they follow the theme and keep
          axis text at AA contrast (the old hard-coded axis grey was ~1.5:1 in dark mode). */}
      <style>{`
        .trend-root {
          --trend-positive: var(--status-success);
          --trend-negative: var(--status-danger);
          --trend-grid: var(--border);
          --trend-axis: var(--muted-foreground);
          --trend-surface: var(--popover);
          --trend-text: var(--popover-foreground);
          --trend-border: var(--border);
        }
      `}</style>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={GRID} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={0} />
          <ReferenceLine y={0} stroke={GRID} />
          <Tooltip content={<TrendsTooltip formatBDT={formatBDT} />} cursor={{ fill: "transparent" }} />
          <Bar dataKey="netFlow" radius={[4, 4, 4, 4]} maxBarSize={28}>
            {points.map((p, i) => (
              <Cell key={i} fill={p.netFlow >= 0 ? POSITIVE : NEGATIVE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
