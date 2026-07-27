"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

function DonutTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div className="donut-tooltip rounded border px-2 py-1 text-xs shadow-sm">
      {name}: {value.toLocaleString()}
    </div>
  );
}

export function DonutChart({
  segments,
  centerLabel,
  size = 160,
}: {
  segments: DonutSegment[];
  centerLabel?: string;
  size?: number;
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  return (
    <div className="donut-root relative" style={{ width: size, height: size }}>
      <style>{`
        .donut-root {
          --donut-track: #eef0fe;
          --donut-text: #12131a;
          --donut-tooltip-bg: #ffffff;
          --donut-tooltip-border: rgba(11,11,11,0.10);
        }
        @media (prefers-color-scheme: dark) {
          :root:not([data-theme="light"]) .donut-root {
            --donut-track: #262837;
            --donut-text: #f1f2f8;
            --donut-tooltip-bg: #14151d;
            --donut-tooltip-border: rgba(255,255,255,0.10);
          }
        }
        :root[data-theme="dark"] .donut-root {
          --donut-track: #262837;
          --donut-text: #f1f2f8;
          --donut-tooltip-bg: #14151d;
          --donut-tooltip-border: rgba(255,255,255,0.10);
        }
        .donut-tooltip {
          background: var(--donut-tooltip-bg);
          color: var(--donut-text);
          border-color: var(--donut-tooltip-border);
        }
      `}</style>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={total > 0 ? segments : [{ label: "empty", value: 1, color: "var(--donut-track)" }]}
            dataKey="value"
            nameKey="label"
            innerRadius="70%"
            outerRadius="100%"
            paddingAngle={total > 0 ? 2 : 0}
            stroke="none"
          >
            {(total > 0 ? segments : [{ label: "empty", value: 1, color: "var(--donut-track)" }]).map((seg, i) => (
              <Cell key={i} fill={seg.color} />
            ))}
          </Pie>
          {total > 0 && <Tooltip content={<DonutTooltip />} />}
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="px-2 text-center text-sm font-semibold" style={{ color: "var(--donut-text)" }}>
            {centerLabel}
          </span>
        </div>
      )}
    </div>
  );
}
