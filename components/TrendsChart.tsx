"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { formatBDT } from "@/lib/currency";

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

function TrendsTooltip({ active, payload }: { active?: boolean; payload?: { value: number }[] }) {
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

export function TrendsChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-neutral-500">No transaction history yet — add some to see trends.</p>;
  }

  return (
    <div className="trend-root h-64 w-full">
      <style>{`
        .trend-root {
          --trend-positive: #2a78d6;
          --trend-negative: #e34948;
          --trend-grid: #e1e0d9;
          --trend-axis: #c3c2b7;
          --trend-surface: #fcfcfb;
          --trend-text: #0b0b0b;
          --trend-border: rgba(11,11,11,0.10);
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .trend-root {
            --trend-positive: #3987e5;
            --trend-negative: #e66767;
            --trend-grid: #2c2c2a;
            --trend-axis: #383835;
            --trend-surface: #1a1a19;
            --trend-text: #ffffff;
            --trend-border: rgba(255,255,255,0.10);
          }
        }
        :root[data-theme="dark"] .trend-root {
          --trend-positive: #3987e5;
          --trend-negative: #e66767;
          --trend-grid: #2c2c2a;
          --trend-axis: #383835;
          --trend-surface: #1a1a19;
          --trend-text: #ffffff;
          --trend-border: rgba(255,255,255,0.10);
        }
      `}</style>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={{ stroke: AXIS }} />
          <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={0} />
          <ReferenceLine y={0} stroke={AXIS} />
          <Tooltip content={<TrendsTooltip />} cursor={{ fill: "transparent" }} />
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
