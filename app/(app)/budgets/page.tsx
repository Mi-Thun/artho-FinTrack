import Link from "next/link";
import { PieChart } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { budgetMonthKeys, getAllCategoryBudgets, monthKey, monthStart, parseMonthKey } from "@/lib/budgets";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { EditModal } from "@/components/EditModal";
import { Field } from "@/components/Field";
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { BudgetRow } from "@/components/BudgetRow";
import { PageHeader } from "@/components/PageHeader";
import { MonthPicker } from "@/components/MonthPicker";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead } from "@/components/ui/table";
import { createExpenseCategory, deleteBudget, setBudget } from "./actions";

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; month?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const labelFor = (key: string) => fmt.monthYear(new Date(`${key}-01T00:00:00Z`));
  const now = new Date();
  const { edit: editId, month: monthParam } = await searchParams;

  // Limits are recorded per month, so this page browses months the way the Dashboard
  // does — a past month shows the limit that was actually in force then, not today's.
  const currentMonth = monthStart(now);
  const months = await budgetMonthKeys(userId, currentMonth);
  const requested = parseMonthKey(monthParam);
  const selectedMonth = requested && months.includes(monthParam!) ? requested : currentMonth;
  const selectedKey = monthKey(selectedMonth);

  const rows = await getAllCategoryBudgets(userId, selectedMonth);
  const label = labelFor(selectedKey);
  const editRow = rows.find((r) => r.categoryId === editId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Budgets"
        actions={
          <Modal label="Add category" title="Add expense category">
            <ModalForm action={createExpenseCategory} className="flex flex-col gap-3" successMessage="Category added">
              <Field label="Category name" required>
                <Input name="name" required autoFocus />
              </Field>
              <FormActions submitLabel="Add category" cancel={<ModalCancel />} />
            </ModalForm>
          </Modal>
        }
      >
        <MonthPicker months={months} selected={selectedKey} basePath="/budgets" labelFor={labelFor} />
      </PageHeader>

      <Card title={`Progress — ${label}`}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<PieChart size={18} />}
            title="No expense categories yet"
            description="Add a category, then set a monthly limit for it."
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Monthly limit</TableHead>
                <TableHead className="w-20"><span className="sr-only">Actions</span></TableHead>
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
        <EditModal title={`${editRow.budgetId ? "Edit" : "Set"} ${editRow.categoryName} limit — ${label}`} closeHref={`/budgets?month=${selectedKey}`}>
          <ValidatedForm action={setBudget} className="flex flex-col gap-3">
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
          </ValidatedForm>
        </EditModal>
      )}
    </div>
  );
}
