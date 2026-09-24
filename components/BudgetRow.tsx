import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { formatBDT } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";

export function BudgetRow({
  categoryName,
  spent,
  monthlyLimit,
  budgetId,
  inherited,
  editHref,
  deleteAction,
}: {
  categoryName: string;
  spent: number;
  monthlyLimit: number;
  /** Non-null only when a limit was set in the month being viewed, so it can be cleared. */
  budgetId: string | null;
  /** The limit carried forward from an earlier month rather than being set in this one. */
  inherited: boolean;
  /** Link that opens this row's edit modal, supplied by whichever view is hosting the row. */
  editHref: string;
  deleteAction: (formData: FormData) => void;
}) {
  const pct = monthlyLimit > 0 ? Math.min((spent / monthlyLimit) * 100, 100) : 0;
  const over = monthlyLimit > 0 && spent > monthlyLimit;

  return (
    <>
      <TableRow className="border-b-0 hover:bg-transparent">
        <TableCell className="font-medium">{categoryName}</TableCell>
        <TableCell className={cn("text-right", over && "text-destructive")}>{formatBDT(spent)}</TableCell>
        <TableCell className="text-right">
          {formatBDT(monthlyLimit)}
          {inherited && (
            <span className="ml-1.5 text-xs text-muted-foreground" title="Carried forward from an earlier month">
              carried
            </span>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Edit limit"
              nativeButton={false}
              render={<Link href={editHref} />}
            >
              <Pencil size={14} />
            </Button>
            {budgetId && (
              <form action={deleteAction}>
                <Button type="submit" variant="ghost" size="icon-sm" aria-label="Reset budget">
                  <Trash2 size={14} />
                </Button>
              </form>
            )}
          </div>
        </TableCell>
      </TableRow>
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={4} className="pt-0 pb-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`} style={{ width: `${pct}%` }} />
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}
