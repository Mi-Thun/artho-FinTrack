"use client";

import dynamic from "next/dynamic";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { ChartDataTable, ChartLegend } from "@/components/charts/parts";

// recharts loads after the page (see FlowChart) and fills the fixed-height box below.
const StackedMonthlyBarsPlot = dynamic(() => import("@/components/charts/StackedMonthlyBarsPlot"), { ssr: false });

export interface StackedSeries {
  key: string;
  label: string;
  color: string;
}

/**
 * Months as stacked bars, one segment per series (e.g. income by type). Colours are
 * assigned by the caller so a series keeps its colour whichever year is shown.
 */
export function StackedMonthlyBars({
  points,
  series,
  title,
  language = "EN",
  numerals = "WESTERN",
}: {
  points: ({ label: string; fullLabel: string } & Record<string, number | string>)[];
  series: StackedSeries[];
  title: string;
  language?: Language;
  numerals?: NumeralSystem;
}) {
  const fmt = createFormatter(language, numerals);
  const value = (p: Record<string, number | string>, key: string) => Number(p[key] ?? 0);
  return (
    <div>
      <ChartLegend items={series.map((s) => ({ label: s.label, color: s.color }))} />
      <div className="h-64 w-full" role="img" aria-label={title}>
        <StackedMonthlyBarsPlot points={points} series={series} fmt={fmt} value={value} />
      </div>
      <ChartDataTable
        caption={title}
        headers={["Month", ...series.map((s) => s.label), "Total"]}
        rows={points.map((p) => [
          p.fullLabel,
          ...series.map((s) => (value(p, s.key) > 0 ? fmt.money(value(p, s.key)) : "—")),
          fmt.money(series.reduce((sum, s) => sum + value(p, s.key), 0)),
        ])}
      />
    </div>
  );
}
