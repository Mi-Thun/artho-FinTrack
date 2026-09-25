import Link from "next/link";
import { ChevronLeft, ChevronRight, PieChart } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { budgetMonthKeys, getAllCategoryBudgets, monthKey, monthStart, parseMonthKey } from "@/lib/budgets";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { EditModal } from "@/components/EditModal";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
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
  const { fmt } = await getLocalisation(userId);
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
              render={<Link href={olderMonth ? `/budgets?month=${olderMonth}` : "#"} aria-disabled={!olderMonth} aria-label="Previous month" />}
            >
              <ChevronLeft size={16} />
            </Button>
            <form action="/budgets">
              <AutoSubmitSelect
                ariaLabel="Month"
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
              render={<Link href={newerMonth ? `/budgets?month=${newerMonth}` : "#"} aria-disabled={!newerMonth} aria-label="Next month" />}
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
              <Field label="Category name" required>
                <Input name="name" required autoFocus />
              </Field>
              <FormActions submitLabel="Add category" cancel={<ModalCancel />} />
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
                    categoryName={r.categoryName}
                    spent={r.spent}
                    monthlyLimit={r.budgetId ? r.monthlyLimit : null}
                    budgetId={clearableId}
                    inherited={r.inheritedFromEarlierMonth}
                    editHref={`/budgets?month=${selectedKey}&edit=${r.categoryId}`}
                    deleteAction={clearableId ? deleteBudget.bind(null, clearableId) : async () => {}}
                    money={fmt.money}
                    monthLabel={label}
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
            <Field label="Monthly limit" required hint="Set 0 to flag any spending in this category as over budget.">
              <MoneyInput name="monthlyLimit" defaultValue={editRow.budgetId ? editRow.monthlyLimit : undefined} required autoFocus />
            </Field>
            <p className="text-xs text-muted-foreground">
              Applies from {label} onward. Earlier months keep whatever limit they were budgeted at.
            </p>
            <FormActions
              submitLabel="Save limit"
              cancel={
                <Button variant="outline" nativeButton={false} render={<Link href={`/budgets?month=${selectedKey}`} />}>
                  Cancel
                </Button>
              }
            />
          </form>
        </EditModal>
      )}
    </div>
  );
}
