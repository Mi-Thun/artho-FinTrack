"use client";

import dynamic from "next/dynamic";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { ChartDataTable } from "@/components/charts/parts";

// recharts loads after the page (see FlowChart) and fills the fixed-height box below.
const ProjectionChartPlot = dynamic(() => import("@/components/charts/ProjectionChartPlot"), { ssr: false });

export interface ProjectionPoint {
  /** Month index from the plan start. */
  i: number;
  label: string;
  year: number;
  value: number;
  spDeposited: number;
}

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

  return (
    <div>
      <div className="h-72 w-full" role="img" aria-label="Projected accumulated savings by month">
        <ProjectionChartPlot points={points} milestones={milestones} capReached={capReached} fmt={fmt} />
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
