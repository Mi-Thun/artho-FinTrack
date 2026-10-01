import { cn } from "@/lib/utils";
import type { StatementRow } from "@/lib/ereturn/statements";

/**
 * A statement laid out like the NBR form: serial, particulars, amount. Used on the
 * return's tabs and the printed return alike, so the two always show the same lines.
 */
export function StatementTable({ rows, className }: { rows: StatementRow[]; className?: string }) {
  return (
    <table className={cn("w-full text-sm", className)}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className={cn("border-b last:border-0", r.total && "font-semibold")}>
            <td className="w-10 py-2 pr-2 align-top text-muted-foreground tabular-nums">{r.no}</td>
            <td className={cn("py-2 pr-4 align-top", r.sub && "pl-4 text-muted-foreground", r.value === undefined && "font-semibold")}>
              {r.label}
            </td>
            <td
              className={cn(
                "py-2 text-right align-top whitespace-nowrap tabular-nums",
                r.sub && "text-muted-foreground",
                r.tone === "danger" && "text-danger",
                r.tone === "success" && "text-success",
              )}
            >
              {r.value}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
