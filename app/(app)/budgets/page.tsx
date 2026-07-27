import { Trash2, PieChart } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { formatBDT } from "@/lib/currency";
import { getAllCategoryBudgets } from "@/lib/budgets";
import { Card } from "@/components/Card";
import { Modal, ModalForm } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { createExpenseCategory, deleteBudget, setBudget } from "./actions";

export default async function BudgetsPage() {
  const userId = await requireUserId();
  const now = new Date();

  const rows = await getAllCategoryBudgets(userId, now);
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<PieChart size={16} />}
        crumbs={[{ label: "Budgets" }]}
        description={`Set a monthly limit per category and track spend against it — showing ${monthLabel}.`}
      />

      <Card
        title={`Progress — ${monthLabel}`}
        action={
          <Modal label="Add Category" title="Add Expense Category">
            <ModalForm action={createExpenseCategory} className="flex flex-col gap-3">
              <input name="name" placeholder="Category name" required className="input" />
              <button type="submit" className="btn-primary">
                Add
              </button>
            </ModalForm>
          </Modal>
        }
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
            No expense categories yet — click &ldquo;Add Category&rdquo; to create one.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((r) => {
              const pct = r.monthlyLimit > 0 ? Math.min((r.spent / r.monthlyLimit) * 100, 100) : 0;
              const over = r.monthlyLimit > 0 && r.spent > r.monthlyLimit;
              return (
                <div key={r.categoryId}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{r.categoryName}</span>
                    <div className="flex items-center gap-2">
                      <span className={over ? "text-rose-600 dark:text-rose-400" : ""} style={over ? {} : { color: "var(--muted)" }}>
                        {formatBDT(r.spent)} /
                      </span>
                      <form action={setBudget} className="flex items-center gap-1">
                        <input type="hidden" name="categoryId" value={r.categoryId} />
                        <input
                          name="monthlyLimit"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={r.monthlyLimit}
                          className="input !w-28 !py-1 text-right"
                        />
                        <button type="submit" className="btn-ghost !px-1.5 text-xs">
                          Save
                        </button>
                      </form>
                      {r.budgetId && (
                        <form action={deleteBudget.bind(null, r.budgetId)}>
                          <button type="submit" className="btn-ghost !px-1.5" aria-label="Reset budget">
                            <Trash2 size={14} />
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-muted)" }}>
                    <div
                      className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-indigo-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
