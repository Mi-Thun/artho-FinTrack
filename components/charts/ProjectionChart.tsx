"use client";

import { Area, AreaChart, CartesianGrid, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { ChartDataTable, ChartTooltipCard } from "@/components/charts/parts";

export interface ProjectionPoint {
  /** Month index from the plan start. */
  i: number;
  label: string;
  year: number;
  value: number;
  spDeposited: number;
}

const LINE = "var(--series-1)";

/**
 * Projected accumulated savings over the plan, one series (so no legend box — the card
 * title names it). Milestones are dashed horizontal targets labelled with their amount;
 * the month the SP target is reached is marked on the line.
 */
export function ProjectionChart({
  points,
  milestones,
  capReached,
  language = "EN",
  numerals = "WESTERN",
}: {
  points: ProjectionPoint[];
  milestones: { label: string; target: number; reachedIndex: number | null }[];
  capReached: { index: number; label: string } | null;
  language?: Language;
  numerals?: NumeralSystem;
}) {
  const fmt = createFormatter(language, numerals);
  if (points.length === 0) return null;
  // Year ticks only: 240 monthly labels would be unreadable.
  const yearTicks = points.filter((p, idx) => idx === 0 || p.year !== points[idx - 1].year).map((p) => p.i);
  const every = Math.max(1, Math.ceil(yearTicks.length / 8));
  const ticks = yearTicks.filter((_, idx) => idx % every === 0);
  const capPoint = capReached ? points.find((p) => p.i === capReached.index) : undefined;

  return (
    <div>
      <div className="h-72 w-full" role="img" aria-label="Projected accumulated savings by month">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="projection-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE} stopOpacity={0.22} />
                <stop offset="100%" stopColor={LINE} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="i"
              type="number"
              domain={["dataMin", "dataMax"]}
              ticks={ticks}
              tickFormatter={(i: number) => fmt.number(points[i]?.year ?? 0, { useGrouping: false })}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              // "auto" lets recharts pick round ticks (৳50L, ৳1Cr…); milestone lines below
              // extend the domain themselves when a target sits above the data.
              domain={[0, "auto"]}
              tickCount={6}
              tickFormatter={(v: number) => fmt.compactMoney(v)}
              tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            {milestones.map((m) => (
              <ReferenceLine
                key={m.label + m.target}
                y={m.target}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                ifOverflow="extendDomain"
                label={{ value: fmt.compactMoney(m.target), position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }}
              />
            ))}
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                const p = active && (payload?.[0]?.payload as ProjectionPoint | undefined);
                if (!p) return null;
                const hit = milestones.filter((m) => m.reachedIndex === p.i);
                return (
                  <ChartTooltipCard
                    title={p.label}
                    rows={[
                      { label: "Accumulated savings", value: fmt.money(p.value), color: LINE },
                      { label: "Sanchayapatra deposited", value: fmt.money(p.spDeposited) },
                      ...hit.map((m) => ({ label: "Milestone reached", value: m.label })),
                    ]}
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={LINE}
              strokeWidth={2}
              fill="url(#projection-fill)"
              isAnimationActive={false}
              activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
            />
            {milestones
              .filter((m) => m.reachedIndex != null && points[m.reachedIndex!])
              .map((m) => (
                <ReferenceDot
                  key={`dot-${m.label}`}
                  x={m.reachedIndex!}
                  y={points[m.reachedIndex!].value}
                  r={4}
                  fill={LINE}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              ))}
            {capPoint && (
              <ReferenceLine
                x={capPoint.i}
                stroke="var(--muted-foreground)"
                strokeOpacity={0.6}
                label={{ value: `Sanchayapatra target · ${capReached!.label}`, position: "insideTopLeft", fill: "var(--muted-foreground)", fontSize: 11 }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartDataTable
        caption="Projected accumulated savings, year end"
        headers={["Year", "Accumulated savings", "Sanchayapatra deposited"]}
        rows={points
          .filter((p, idx) => idx === points.length - 1 || points[idx + 1].year !== p.year)
          .map((p) => [fmt.number(p.year, { useGrouping: false }), fmt.money(p.value), fmt.money(p.spDeposited)])}
      />
    </div>
  );
}
