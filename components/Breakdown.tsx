import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface BreakdownRow {
  label: ReactNode;
  /** Already formatted, e.g. "৳3,00,000". */
  value: string;
  /** The operation applied to this row, shown before the value so the sum reads top to bottom. */
  sign?: "+" | "−" | "÷";
  /** Smaller, indented detail under the row above (e.g. each certificate under SP). */
  sub?: boolean;
}

/**
 * How a headline figure is made up, for the ⓘ on a stat card: the parts with their
 * actual amounts, then the total. Optional `note` explains the rule in one line.
 */
export function Breakdown({
  title,
  rows,
  total,
  note,
  empty = "Nothing recorded yet.",
}: {
  title: string;
  rows: BreakdownRow[];
  total?: { label: string; value: string };
  note?: ReactNode;
  empty?: string;
}) {
  return (
    <div className="flex flex-col gap-2 text-foreground">
      <p className="text-xs font-semibold">{title}</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <dl className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {rows.map((r, i) => (
            <div key={i} className={cn("flex items-baseline justify-between gap-3", r.sub && "pl-3 text-muted-foreground")}>
              <dt className="min-w-0 truncate">{r.label}</dt>
              <dd className="shrink-0 tabular-nums">
                {r.sign && <span className="mr-1 text-muted-foreground">{r.sign}</span>}
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {total && (
        <div className="flex items-baseline justify-between gap-3 border-t pt-2 font-semibold">
          <span>{total.label}</span>
          <span className="tabular-nums">{total.value}</span>
        </div>
      )}
      {note && <p className="text-muted-foreground">{note}</p>}
    </div>
  );
}
