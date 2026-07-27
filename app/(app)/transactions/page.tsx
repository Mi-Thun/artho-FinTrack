import Link from "next/link";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Download, Pencil, RotateCcw, Trash2, Upload } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { formatBDT } from "@/lib/currency";
import { applyDueRecurringTransactions } from "@/lib/recurring";
import { Card } from "@/components/Card";
import { Modal, ModalForm } from "@/components/Modal";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditField } from "@/components/EditField";
import { EditModal } from "@/components/EditModal";
import { Select } from "@/components/Select";
import {
  bulkDeleteTransactions,
  createRecurringTransaction,
  createTransaction,
  deleteRecurringTransaction,
  deleteTransaction,
  importTransactionsCsv,
  restoreTransaction,
  toggleRecurringTransaction,
  updateTransaction,
} from "./actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    edit?: string;
    sort?: string;
    dir?: string;
    page?: string;
    pageSize?: string;
    rSort?: string;
    rDir?: string;
    rPage?: string;
    rPageSize?: string;
    delSort?: string;
    delDir?: string;
    delPage?: string;
    delPageSize?: string;
  }>;
}) {
  const userId = await requireUserId();
  await applyDueRecurringTransactions(userId);

  const sp = await searchParams;
  const editId = sp.edit;
  const sortColumn = sp.sort === "amount" ? "amount" : "date";
  const sortDir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;

  const recurringSort = sp.rSort === "type" || sp.rSort === "amount" ? sp.rSort : "dayOfMonth";
  const recurringDir: "asc" | "desc" = sp.rDir === "desc" ? "desc" : "asc";
  const recurringPage = Math.max(1, Number(sp.rPage) || 1);
  const recurringPageSize = [10, 25, 50, 100].includes(Number(sp.rPageSize)) ? Number(sp.rPageSize) : 25;

  const deletedSort = sp.delSort === "amount" ? "amount" : "date";
  const deletedDir: "asc" | "desc" = sp.delDir === "asc" ? "asc" : "desc";
  const deletedPage = Math.max(1, Number(sp.delPage) || 1);
  const deletedPageSize = [10, 25, 50, 100].includes(Number(sp.delPageSize)) ? Number(sp.delPageSize) : 25;

  const [dates, accounts, categories, recurring, recurringTotal, recentlyDeleted, recentlyDeletedTotal] = await Promise.all([
    db.transaction.findMany({ where: { userId, deletedAt: null }, select: { date: true }, orderBy: { date: "desc" } }),
    db.account.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.recurringTransaction.findMany({
      where: { userId },
      include: { account: true, category: true },
      orderBy: { [recurringSort]: recurringDir },
      skip: (recurringPage - 1) * recurringPageSize,
      take: recurringPageSize,
    }),
    db.recurringTransaction.count({ where: { userId } }),
    db.transaction.findMany({
      where: { userId, deletedAt: { not: null } },
      include: { account: true, category: true },
      orderBy: { [deletedSort]: deletedDir },
      skip: (deletedPage - 1) * deletedPageSize,
      take: deletedPageSize,
    }),
    db.transaction.count({ where: { userId, deletedAt: { not: null } } }),
  ]);

  const recurringExtraParams = { rSort: recurringSort, rDir: recurringDir };
  const deletedExtraParams = { delSort: deletedSort, delDir: deletedDir };

  const monthKeys = Array.from(new Set(dates.map((d) => monthKey(d.date)))).sort().reverse();
  const selectedMonth = sp.month && monthKeys.includes(sp.month) ? sp.month : (monthKeys[0] ?? null);

  type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: { account: true; category: true } }>;
  let monthTx: TransactionWithRelations[] = [];
  let totalCount = 0;
  let sums: { type: "INCOME" | "EXPENSE"; _sum: { amount: Prisma.Decimal | null } }[] = [];

  if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const listWhere: Prisma.TransactionWhereInput = { userId, deletedAt: null, date: { gte: start, lt: end } };

    [monthTx, totalCount, sums] = await Promise.all([
      db.transaction.findMany({
        where: listWhere,
        include: { account: true, category: true },
        orderBy: { [sortColumn]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.transaction.count({ where: listWhere }),
      db.transaction.groupBy({ by: ["type"], where: listWhere, _sum: { amount: true } }),
    ]);
  }

  const idx = selectedMonth ? monthKeys.indexOf(selectedMonth) : -1;
  const olderMonth = idx >= 0 && idx < monthKeys.length - 1 ? monthKeys[idx + 1] : null;
  const newerMonth = idx > 0 ? monthKeys[idx - 1] : null;

  const income = toNumber(sums.find((s) => s.type === "INCOME")?._sum.amount);
  const expense = toNumber(sums.find((s) => s.type === "EXPENSE")?._sum.amount);
  const net = income - expense;

  const today = new Date().toISOString().slice(0, 10);
  const returnHref = `/transactions?month=${selectedMonth}`;

  const extraParams: Record<string, string | undefined> = {
    month: selectedMonth ?? undefined,
    sort: sortColumn,
    dir: sortDir,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ArrowLeftRight size={16} />}
        crumbs={[{ label: "Transactions" }]}
        description="Log income and expenses, browse month by month."
        actions={
          <>
            <a href="/api/transactions/export" className="btn-secondary">
              <Download size={15} />
              Export CSV
            </a>
            <Modal label="Import CSV" title="Import Transactions CSV" variant="secondary">
              <div className="callout-warning mb-3">Required columns, in order: date, type, amount, category, account, note.</div>
              <form action={importTransactionsCsv} className="flex flex-col gap-3" encType="multipart/form-data">
                <input name="file" type="file" accept=".csv,text/csv" required className="input" />
                <button type="submit" className="btn-primary">
                  <Upload size={15} />
                  Import
                </button>
              </form>
            </Modal>
            <Modal label="Add Transaction" title="Add Transaction">
              <ModalForm action={createTransaction} className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Date
                  <input name="date" type="date" defaultValue={today} required className="input" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Type
                  <Select
                    name="type"
                    defaultValue="EXPENSE"
                    options={[
                      { value: "EXPENSE", label: "Expense" },
                      { value: "INCOME", label: "Income" },
                    ]}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Amount
                  <input name="amount" type="number" step="0.01" min="0.01" required className="input" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Account
                  <Select name="accountId" placeholder="—" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Category
                  <Select name="categoryId" placeholder="—" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Note
                  <input name="note" type="text" className="input" />
                </label>
                <div className="col-span-2">
                  <button type="submit" className="btn-primary">
                    Add
                  </button>
                </div>
              </ModalForm>
            </Modal>
          </>
        }
      />

      <Card
        title="Recurring Transactions"
        action={
          <Modal label="Add Recurring" title="Add Recurring Transaction" variant="secondary">
            <ModalForm action={createRecurringTransaction} className="grid grid-cols-2 gap-3">
              <Select
                name="type"
                defaultValue="EXPENSE"
                options={[
                  { value: "EXPENSE", label: "Expense" },
                  { value: "INCOME", label: "Income" },
                ]}
              />
              <input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required className="input" />
              <input name="dayOfMonth" type="number" min="1" max="31" placeholder="Day of month" required className="input" />
              <Select name="accountId" placeholder="Account —" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
              <Select name="categoryId" placeholder="Category —" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
              <input name="note" type="text" placeholder="Note" className="input" />
              <div className="col-span-2">
                <button type="submit" className="btn-primary">
                  Add Recurring
                </button>
              </div>
            </ModalForm>
          </Modal>
        }
      >
        <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
          Auto-logged every month on the day you pick — e.g. salary on the 1st, rent on the 5th.
        </p>
        <div className="overflow-x-auto">
          <table className="table-clean w-full">
            <thead>
              <tr>
                <th>
                  <SortableHeader label="Type" column="type" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" extraParams={recurringExtraParams} />
                </th>
                <th className="text-right">
                  <SortableHeader label="Amount" column="amount" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" extraParams={recurringExtraParams} />
                </th>
                <th>
                  <SortableHeader label="Day" column="dayOfMonth" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" extraParams={recurringExtraParams} />
                </th>
                <th>Category</th>
                <th>Account</th>
                <th>Note</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {recurring.map((r) => (
                <tr key={r.id}>
                  <td>{r.type === "INCOME" ? "Income" : "Expense"}</td>
                  <td className="text-right font-medium">{formatBDT(toNumber(r.amount))}</td>
                  <td style={{ color: "var(--muted)" }}>day {r.dayOfMonth}</td>
                  <td style={{ color: "var(--muted)" }}>{r.category?.name ?? "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{r.account?.name ?? "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{r.note ?? "—"}</td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <form action={toggleRecurringTransaction.bind(null, r.id, !r.active)}>
                        <button type="submit" className="btn-secondary">
                          {r.active ? "Pause" : "Resume"}
                        </button>
                      </form>
                      <form action={deleteRecurringTransaction.bind(null, r.id)}>
                        <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                          <Trash2 size={15} />
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {recurring.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center" style={{ color: "var(--muted)" }}>
                    No recurring transactions set up.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={recurringPage} pageSize={recurringPageSize} total={recurringTotal} basePath="/transactions" extraParams={recurringExtraParams} />
      </Card>

      {monthKeys.length === 0 ? (
        <Card title="History">
          <p className="py-6 text-center text-sm" style={{ color: "var(--muted)" }}>
            No transactions yet.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link
                href={olderMonth ? `/transactions?month=${olderMonth}` : "#"}
                aria-disabled={!olderMonth}
                className={`btn-secondary !px-2 ${!olderMonth && "pointer-events-none opacity-30"}`}
              >
                <ChevronLeft size={16} />
              </Link>

              <form action="/transactions">
                <AutoSubmitSelect
                  name="month"
                  defaultValue={selectedMonth ?? undefined}
                  options={monthKeys.map((key) => ({ value: key, label: monthLabel(key) }))}
                />
              </form>

              <Link
                href={newerMonth ? `/transactions?month=${newerMonth}` : "#"}
                aria-disabled={!newerMonth}
                className={`btn-secondary !px-2 ${!newerMonth && "pointer-events-none opacity-30"}`}
              >
                <ChevronRight size={16} />
              </Link>
            </div>

            <div className="flex gap-4 text-sm font-medium">
              <span className="text-emerald-600 dark:text-emerald-400">+{formatBDT(income)}</span>
              <span className="text-rose-600 dark:text-rose-400">-{formatBDT(expense)}</span>
              <span className={net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}>
                Net {formatBDT(net)}
              </span>
            </div>
          </div>

          <form action={bulkDeleteTransactions}>
            <div className="overflow-x-auto">
              <table className="table-clean w-full">
                <thead>
                  <tr>
                    <th>
                      <SortableHeader label="Date" column="date" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={extraParams} />
                    </th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Account</th>
                    <th>Note</th>
                    <th className="text-right">
                      <SortableHeader label="Amount" column="amount" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={extraParams} />
                    </th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {monthTx.map((t) => (
                    <tr key={t.id}>
                      <td>{t.date.toISOString().slice(0, 10)}</td>
                      <td>{t.type === "INCOME" ? "Income" : "Expense"}</td>
                      <td>{t.category?.name ?? "—"}</td>
                      <td>{t.account?.name ?? "—"}</td>
                      <td>{t.note ?? "—"}</td>
                      <td
                        className={`text-right font-medium ${t.type === "INCOME" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}
                      >
                        {t.type === "INCOME" ? "+" : "-"}
                        {formatBDT(toNumber(t.amount))}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`${returnHref}&edit=${t.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                            <Pencil size={15} />
                          </Link>
                          <button type="submit" formAction={deleteTransaction.bind(null, t.id)} className="btn-ghost !px-1.5" aria-label="Delete">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {monthTx.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center" style={{ color: "var(--muted)" }}>
                        No transactions in this month.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </form>
          <Pagination page={page} pageSize={pageSize} total={totalCount} basePath="/transactions" extraParams={extraParams} />
        </Card>
      )}

      {editId &&
        monthTx
          .filter((t) => t.id === editId)
          .map((t) => (
            <EditModal key={t.id} title="Edit Transaction" closeHref={returnHref}>
              <form action={updateTransaction.bind(null, t.id)} className="flex flex-col gap-3">
                <EditField label="Date">
                  <input name="date" type="date" defaultValue={t.date.toISOString().slice(0, 10)} required className="input" />
                </EditField>
                <EditField label="Type">
                  <Select
                    name="type"
                    defaultValue={t.type}
                    options={[
                      { value: "EXPENSE", label: "Expense" },
                      { value: "INCOME", label: "Income" },
                    ]}
                  />
                </EditField>
                <EditField label="Amount">
                  <input name="amount" type="number" step="0.01" min="0.01" defaultValue={toNumber(t.amount)} required className="input" />
                </EditField>
                <EditField label="Account">
                  <Select
                    name="accountId"
                    defaultValue={t.accountId ?? ""}
                    placeholder="—"
                    options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                  />
                </EditField>
                <EditField label="Category">
                  <Select
                    name="categoryId"
                    defaultValue={t.categoryId ?? ""}
                    placeholder="—"
                    options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  />
                </EditField>
                <EditField label="Note">
                  <input name="note" type="text" defaultValue={t.note ?? ""} className="input" />
                </EditField>
                <input type="hidden" name="returnMonth" value={selectedMonth ?? ""} />
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href={returnHref} className="btn-secondary">
                    Cancel
                  </Link>
                </div>
              </form>
            </EditModal>
          ))}

      {recentlyDeletedTotal > 0 && (
        <Card title="Recently Deleted">
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>
                    <SortableHeader label="Date" column="date" currentSort={deletedSort} currentDir={deletedDir} basePath="/transactions" extraParams={deletedExtraParams} />
                  </th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Note</th>
                  <th className="text-right">
                    <SortableHeader label="Amount" column="amount" currentSort={deletedSort} currentDir={deletedDir} basePath="/transactions" extraParams={deletedExtraParams} />
                  </th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentlyDeleted.map((t) => (
                  <tr key={t.id}>
                    <td>{t.date.toISOString().slice(0, 10)}</td>
                    <td>{t.type === "INCOME" ? "Income" : "Expense"}</td>
                    <td>{t.category?.name ?? "—"}</td>
                    <td>{t.note ?? "—"}</td>
                    <td className="text-right font-medium">{formatBDT(toNumber(t.amount))}</td>
                    <td className="text-right">
                      <form action={restoreTransaction.bind(null, t.id)}>
                        <button type="submit" className="btn-ghost !px-1.5" aria-label="Restore">
                          <RotateCcw size={15} />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={deletedPage} pageSize={deletedPageSize} total={recentlyDeletedTotal} basePath="/transactions" extraParams={deletedExtraParams} />
        </Card>
      )}
    </div>
  );
}
