import Link from "next/link";
import { Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export type BudgetStatus = "none" | "ok" | "near" | "over";

/** Share of a limit at which a budget turns amber. */
const NEAR_LIMIT = 0.8;

/**
 * "No limit" and "limit of ৳0" are different things: the first is unbudgeted, the second
 * means any spending at all is over budget.
 */
export function budgetStatus(spent: number, monthlyLimit: number | null): BudgetStatus {
  if (monthlyLimit == null) return "none";
  if (spent > monthlyLimit) return "over";
  if (monthlyLimit > 0 && spent >= monthlyLimit * NEAR_LIMIT) return "near";
  return "ok";
}

export const BUDGET_BAR_CLASS: Record<BudgetStatus, string> = {
  none: "bg-muted-foreground/30",
  ok: "bg-success",
  near: "bg-warning",
  over: "bg-danger",
};

export function budgetBarWidth(spent: number, monthlyLimit: number | null): number {
  if (monthlyLimit == null) return 0;
  if (monthlyLimit <= 0) return spent > 0 ? 100 : 0;
  return Math.min((spent / monthlyLimit) * 100, 100);
}

export function BudgetRow({
  categoryName,
  spent,
  monthlyLimit,
  budgetId,
  inherited,
  editHref,
  deleteAction,
  money,
  monthLabel,
}: {
  categoryName: string;
  spent: number;
  /** Null when no limit has ever been set for this category. */
  monthlyLimit: number | null;
  /** Non-null only when a limit was set in the month being viewed, so it can be cleared. */
  budgetId: string | null;
  /** The limit carried forward from an earlier month rather than being set in this one. */
  inherited: boolean;
  /** Link that opens this row's edit modal, supplied by whichever view is hosting the row. */
  editHref: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  money: (value: number) => string;
  monthLabel: string;
}) {
  const status = budgetStatus(spent, monthlyLimit);
  const pct = budgetBarWidth(spent, monthlyLimit);

  // Why the clear button can't be used, when it can't — shown as its tooltip rather than
  // hiding the button on some rows and leaving people to guess why.
  const clearDisabledReason =
    monthlyLimit == null
      ? "No limit to clear"
      : inherited
        ? "This limit was set in an earlier month. Edit it to override from this month."
        : null;

  return (
    <>
      <TableRow className={cn("hover:bg-transparent", status !== "none" && "border-b-0")}>
        <TableCell primary className="font-medium">{categoryName}</TableCell>
        <TableCell label="Spent" className={cn("text-right tabular-nums", status === "over" && "font-medium text-danger")}>
          {money(spent)}
        </TableCell>
        <TableCell label="Limit" className="text-right tabular-nums">
          {monthlyLimit == null ? (
            <span className="text-muted-foreground">No limit</span>
          ) : (
            <>
              {money(monthlyLimit)}
              {inherited && (
                <span className="ml-1.5 text-xs text-muted-foreground" title="Carried forward from an earlier month">
                  carried
                </span>
              )}
            </>
          )}
        </TableCell>
        <TableCell actions className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={monthlyLimit == null ? `Set limit for ${categoryName}` : `Edit limit for ${categoryName}`}
              title={monthlyLimit == null ? "Set limit" : "Edit limit"}
              nativeButton={false}
              render={<Link href={editHref} />}
            >
              <Pencil size={14} />
            </Button>
            {budgetId && !clearDisabledReason ? (
              <ConfirmDialog
                action={deleteAction}
                title={`Clear the ${categoryName} limit?`}
                description={`Removes the limit set for ${monthLabel}. Earlier months keep theirs; if an earlier limit exists, it applies again.`}
                confirmLabel="Clear limit"
                triggerLabel={`Clear limit for ${categoryName}`}
                triggerIcon={<RotateCcw size={14} />}
                iconOnly
              />
            ) : (
              <span title={clearDisabledReason ?? undefined} className="inline-flex">
                <Button variant="ghost" size="icon-sm" disabled aria-label={`Clear limit for ${categoryName} (unavailable: ${clearDisabledReason})`}>
                  <RotateCcw size={14} />
                </Button>
              </span>
            )}
          </div>
        </TableCell>
      </TableRow>
      {status !== "none" && (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={4} className="pt-0 pb-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${BUDGET_BAR_CLASS[status]}`} style={{ width: `${pct}%` }} />
          </div>
          {status === "over" && (
            <p className="mt-1 text-xs text-danger">
              Over budget by {money(spent - (monthlyLimit ?? 0))}
            </p>
          )}
          {status === "near" && monthlyLimit != null && (
            <p className="mt-1 text-xs text-warning">{money(monthlyLimit - spent)} left</p>
          )}
        </TableCell>
      </TableRow>
      )}
    </>
  );
}
