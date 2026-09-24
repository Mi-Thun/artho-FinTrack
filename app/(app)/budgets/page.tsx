import Link from "next/link";
import { ChevronLeft, ChevronRight, PieChart } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { budgetMonthKeys, getAllCategoryBudgets, monthKey, monthStart, parseMonthKey } from "@/lib/budgets";
import { Card } from "@/components/Card";
import { Modal, ModalForm } from "@/components/Modal";
import { EditModal } from "@/components/EditModal";
import { EditField } from "@/components/EditField";
import { BudgetRow } from "@/components/BudgetRow";
import { PageHeader } from "@/components/PageHeader";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { createExpenseCategory, deleteBudget, setBudget } from "./actions";

function labelFor(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; month?: string }>;
}) {
  const userId = await requireUserId();
  const now = new Date();
  const { edit: editId, month: monthParam } = await searchParams;

  // Limits are recorded per month, so this page browses months the way the Dashboard
  // does — a past month shows the limit that was actually in force then, not today's.
  const currentMonth = monthStart(now);
  const months = await budgetMonthKeys(userId, currentMonth);
  const requested = parseMonthKey(monthParam);
  const selectedMonth = requested && months.includes(monthParam!) ? requested : currentMonth;
  const selectedKey = monthKey(selectedMonth);

  const idx = months.indexOf(selectedKey);
  const olderMonth = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;
  const newerMonth = idx > 0 ? months[idx - 1] : null;

  const rows = await getAllCategoryBudgets(userId, selectedMonth);
  const label = labelFor(selectedKey);
  const editRow = rows.find((r) => r.categoryId === editId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<PieChart size={16} />}
        crumbs={[{ label: "Budgets" }]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              className={!olderMonth ? "pointer-events-none opacity-30" : ""}
              nativeButton={false}
              render={<Link href={olderMonth ? `/budgets?month=${olderMonth}` : "#"} aria-disabled={!olderMonth} />}
            >
              <ChevronLeft size={16} />
            </Button>
            <form action="/budgets">
              <AutoSubmitSelect
                name="month"
                defaultValue={selectedKey}
                options={months.map((key) => ({ value: key, label: labelFor(key) }))}
              />
            </form>
            <Button
              variant="secondary"
              size="icon"
              className={!newerMonth ? "pointer-events-none opacity-30" : ""}
              nativeButton={false}
              render={<Link href={newerMonth ? `/budgets?month=${newerMonth}` : "#"} aria-disabled={!newerMonth} />}
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        }
      />

      <Card
        title={`Progress — ${label}`}
        action={
          <Modal label="Add Category" title="Add Expense Category">
            <ModalForm action={createExpenseCategory} className="flex flex-col gap-3">
              <Input name="name" placeholder="Category name" required />
              <Button type="submit">Add</Button>
            </ModalForm>
          </Modal>
        }
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No expense categories yet — click &ldquo;Add Category&rdquo; to create one.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Monthly Limit</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                // Only a limit set *in* this month can be cleared here; an inherited one
                // belongs to the earlier month that set it.
                const clearableId = r.budgetId && !r.inheritedFromEarlierMonth ? r.budgetId : null;
                return (
                  <BudgetRow
                    key={r.categoryId}
                    categoryId={r.categoryId}
                    categoryName={r.categoryName}
                    spent={r.spent}
                    monthlyLimit={r.monthlyLimit}
                    budgetId={clearableId}
                    inherited={r.inheritedFromEarlierMonth}
                    monthKey={selectedKey}
                    deleteAction={clearableId ? deleteBudget.bind(null, clearableId) : async () => {}}
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      {editRow && (
        <EditModal title={`Edit Limit — ${editRow.categoryName} (${label})`} closeHref={`/budgets?month=${selectedKey}`}>
          <form action={setBudget} className="flex flex-col gap-3">
            <input type="hidden" name="categoryId" value={editRow.categoryId} />
            <input type="hidden" name="month" value={selectedKey} />
            <EditField label="Monthly limit">
              <Input name="monthlyLimit" type="number" step="0.01" min="0" defaultValue={editRow.monthlyLimit} required />
            </EditField>
            <p className="text-xs text-muted-foreground">
              Applies from {label} onward. Earlier months keep whatever limit they were budgeted at.
            </p>
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </EditModal>
      )}
    </div>
  );
}
