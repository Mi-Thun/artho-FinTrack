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
 * actual amounts, then the total.
 */
/** True for a formatted zero ("৳0", "+ ৳0.00", "৳০"): no non-zero digit, Western or Bengali. */
function isZero(value: string): boolean {
  return !/[1-9১-৯]/.test(value);
}

export function Breakdown({
  title,
  rows,
  total,
  empty = "Nothing recorded yet.",
}: {
  title: string;
  rows: BreakdownRow[];
  total?: { label: string; value: string };
  empty?: string;
}) {
  // A ৳0 part adds nothing to the sum, so it isn't listed (e.g. DPS when you have none).
  const shown = rows.filter((r) => !isZero(r.value));
  return (
    <div className="flex flex-col gap-2 text-foreground">
      <p className="text-xs font-semibold">{title}</p>
      {shown.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        <dl className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {shown.map((r, i) => (
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
    </div>
  );
}
