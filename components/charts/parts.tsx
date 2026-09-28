"use client";

import { ReactNode } from "react";

/** Tooltip card shared by every chart: surface + text tokens, never the series colour for text. */
export function ChartTooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-40 rounded-lg border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {r.color && <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="font-medium tabular-nums">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** A legend above the plot: swatch beside a text label, so identity is never colour alone. */
export function ChartLegend({ items }: { items: { label: string; color: string; kind?: "bar" | "line" }[] }) {
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={item.kind === "line" ? "inline-block h-0.5 w-3 rounded-full" : "inline-block size-2.5 rounded-sm"}
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * The chart's numbers as a table for screen readers only — hidden on screen, where the
 * tooltips carry the exact figures.
 */
export function ChartDataTable({ caption, headers, rows }: { caption: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="sr-only">
      <div>
        <table>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b text-muted-foreground">
              {headers.map((h, i) => (
                <th key={h} scope="col" className={`py-1 font-medium ${i === 0 ? "text-left" : "text-right"}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b last:border-0">
                {row.map((cell, c) => (
                  <td key={c} className={`py-1 tabular-nums ${c === 0 ? "text-left" : "text-right"}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
