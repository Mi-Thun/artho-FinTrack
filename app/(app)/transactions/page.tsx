import Link from "next/link";
import { after } from "next/server";
import { ArrowLeftRight, Download, Pause, Pencil, PieChart, Play, Repeat, RotateCcw, Trash2, Upload } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue, toDateInput } from "@/lib/dates";
import { syncUserDataInBackground } from "@/lib/sync";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { RowActions } from "@/components/RowActions";
import { MoneyText } from "@/components/MoneyText";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { MonthPicker } from "@/components/MonthPicker";
import { TransactionTypeFields } from "@/components/TransactionTypeFields";
import { PageHeader } from "@/components/PageHeader";
import { BudgetsPanel } from "@/components/BudgetsPanel";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditModal } from "@/components/EditModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
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

type Fmt = Awaited<ReturnType<typeof getLocalisation>>["fmt"];
type CategoryOption = { id: string; name: string; kind: "INCOME" | "EXPENSE" };

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}


function RecurringPanel({
  fmt,
  accounts,
  categories,
  recurring,
  recurringSort,
  recurringDir,
  recurringPage,
  recurringPageSize,
  recurringTotal,
  recurringExtraParams,
}: {
  fmt: Fmt;
  accounts: { id: string; name: string }[];
  categories: CategoryOption[];
  recurring: Array<{
    id: string;
    type: "INCOME" | "EXPENSE";
    amount: unknown;
    dayOfMonth: number;
    note: string | null;
    active: boolean;
    account: { name: string } | null;
    category: { name: string } | null;
  }>;
  recurringSort: string;
  recurringDir: "asc" | "desc";
  recurringPage: number;
  recurringPageSize: number;
  recurringTotal: number;
  recurringExtraParams: Record<string, string>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Modal label="Add recurring" title="Add recurring transaction">
        <ModalForm action={createRecurringTransaction} className="flex flex-col gap-3" successMessage="Recurring transaction added">
          <Field label="Amount" required>
            <MoneyInput name="amount" required positive autoFocus />
          </Field>
          <Field label="Day of month" required hint="Logged automatically on this day each month.">
            <Input name="dayOfMonth" type="number" min="1" max="31" required />
          </Field>
          <TransactionTypeFields categories={categories} accounts={accounts} />
          <Field label="Note">
            <Input name="note" type="text" />
          </Field>
          <FormActions submitLabel="Add recurring" cancel={<ModalCancel />} />
        </ModalForm>
      </Modal>
      <p className="text-sm text-muted-foreground">
        Logged automatically every month on the day you pick — e.g. salary on the 1st, rent on the 5th.
      </p>
      <Table responsive>
        <TableHeader><TableRow>
          <TableHead><SortableHeader label="Type" column="type" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" sortParam="rSort" dirParam="rDir" extraParams={recurringExtraParams} /></TableHead>
          <TableHead className="text-right"><SortableHeader label="Amount" column="amount" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" sortParam="rSort" dirParam="rDir" extraParams={recurringExtraParams} /></TableHead>
          <TableHead><SortableHeader label="Day" column="dayOfMonth" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" sortParam="rSort" dirParam="rDir" extraParams={recurringExtraParams} /></TableHead>
          <TableHead>Category</TableHead><TableHead>Account</TableHead><TableHead>Note</TableHead><TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {recurring.map((r) => (
            <TableRow key={r.id} className={r.active ? "" : "text-muted-foreground"}>
              <TableCell primary>
                {r.type === "INCOME" ? "Income" : "Expense"}
                {!r.active && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium">Paused</span>}
              </TableCell>
              <TableCell label="Amount" className="text-right font-medium">
                <MoneyText value={toNumber(r.amount)} money={fmt.money} tone={r.type === "INCOME" ? "income" : "expense"} />
              </TableCell>
              <TableCell label="Day" className="text-muted-foreground">Day {r.dayOfMonth}</TableCell>
              <TableCell label="Category" className="text-muted-foreground">{r.category?.name ?? "—"}</TableCell>
              <TableCell label="Account" className="text-muted-foreground">{r.account?.name ?? "—"}</TableCell>
              <TableCell label="Note" className="text-muted-foreground">{r.note ?? "—"}</TableCell>
              <TableCell actions className="text-right">
                <RowActions
                  label={`Actions for recurring ${fmt.money(toNumber(r.amount))} on day ${r.dayOfMonth}`}
                  actions={[
                    {
                      kind: "run",
                      label: r.active ? "Pause" : "Resume",
                      icon: r.active ? <Pause size={14} /> : <Play size={14} />,
                      action: toggleRecurringTransaction.bind(null, r.id, !r.active),
                      successMessage: r.active ? "Recurring transaction paused" : "Recurring transaction resumed",
                    },
                    {
                      kind: "confirm",
                      label: "Delete",
                      icon: <Trash2 size={14} />,
                      action: deleteRecurringTransaction.bind(null, r.id),
                      title: "Delete recurring transaction?",
                      description: `Stop and delete this ${fmt.money(toNumber(r.amount))} recurring ${r.type === "INCOME" ? "income" : "expense"}? Transactions it already logged are kept.`,
                      successMessage: "Recurring transaction deleted",
                    },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
          {recurring.length === 0 && <TableRow><TableCell empty colSpan={7} className="py-4 text-center text-muted-foreground">No recurring transactions set up.</TableCell></TableRow>}
        </TableBody>
      </Table>
      <Pagination page={recurringPage} pageSize={recurringPageSize} total={recurringTotal} basePath="/transactions" pageParam="rPage" pageSizeParam="rPageSize" extraParams={recurringExtraParams} />
    </div>
  );
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
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
    bMonth?: string;
    bEdit?: string;
  }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const monthLabel = (key: string) => fmt.monthYear(new Date(`${key}-01T00:00:00Z`));
  // Deferred maintenance runs after the response, not during it — see lib/sync.ts.
  after(() => syncUserDataInBackground(userId));

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

  const income = toNumber(sums.find((s) => s.type === "INCOME")?._sum.amount);
  const expense = toNumber(sums.find((s) => s.type === "EXPENSE")?._sum.amount);
  const net = income - expense;

  const today = todayInputValue();
  const returnHref = `/transactions?month=${selectedMonth}`;
  const selectedMonthLabel = selectedMonth ? monthLabel(selectedMonth) : "";

  const extraParams: Record<string, string | undefined> = {
    month: selectedMonth ?? undefined,
    sort: sortColumn,
    dir: sortDir,
  };

  const addTransactionModal = (
    <Modal label="Add transaction" title="Add transaction" presentation="sheet">
      <ModalForm action={createTransaction} className="flex flex-col gap-3" successMessage="Transaction added">
        <Field label="Amount" required>
          <MoneyInput name="amount" required positive autoFocus />
        </Field>
        <TransactionTypeFields categories={categories} accounts={accounts} />
        <Field label="Date" required>
          <Input name="date" type="date" defaultValue={today} required />
        </Field>
        <Field label="Note">
          <Input name="note" type="text" />
        </Field>
        <FormActions submitLabel="Add transaction" cancel={<ModalCancel />} />
      </ModalForm>
    </Modal>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        description="Every income and expense, month by month."
        menu={[{ label: "Export CSV", href: "/api/transactions/export", icon: <Download size={16} />, download: true }]}
        actions={
          <>
            <Modal closeOnNavigate={false} label="Recurring" title="Recurring transactions" variant="secondary" icon={<Repeat size={15} />}>
              <RecurringPanel
                fmt={fmt}
                accounts={accounts}
                categories={categories}
                recurring={recurring}
                recurringSort={recurringSort}
                recurringDir={recurringDir}
                recurringPage={recurringPage}
                recurringPageSize={recurringPageSize}
                recurringTotal={recurringTotal}
                recurringExtraParams={recurringExtraParams}
              />
            </Modal>
            <Modal closeOnNavigate={false} label="Budgets" title="Budgets" variant="secondary" icon={<PieChart size={15} />}>
              <BudgetsPanel userId={userId} monthParam={sp.bMonth} editId={sp.bEdit} />
            </Modal>
            <Modal
              label="Import CSV"
              title="Import transactions from CSV"
              description="Columns, in this order: date, type, amount, category, account, note. Dates as YYYY-MM-DD; type is INCOME or EXPENSE."
              variant="secondary"
              icon={<Upload size={15} />}
            >
              <ModalForm action={importTransactionsCsv} className="flex flex-col gap-3" successMessage="Import finished">
                <Field label="CSV file" required hint="Rows that can't be read are skipped. Categories and accounts are matched by name.">
                  <Input name="file" type="file" accept=".csv,text/csv" required />
                </Field>
                <FormActions submitLabel="Import" cancel={<ModalCancel />} />
              </ModalForm>
            </Modal>
            {addTransactionModal}
          </>
        }
      >
        {selectedMonth && (
          <MonthPicker
            months={monthKeys}
            selected={selectedMonth}
            basePath="/transactions"
            labelFor={monthLabel}
          />
        )}
      </PageHeader>

      {monthKeys.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowLeftRight size={18} />}
            title="No transactions yet"
            description="Add your first income or expense, or import a CSV from your bank."
            action={addTransactionModal}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Income" chip={selectedMonthLabel} tone="positive" value={<MoneyText value={income} money={fmt.money} tone="income" />} />
            <StatCard label="Expense" chip={selectedMonthLabel} tone="negative" value={<MoneyText value={expense} money={fmt.money} tone="expense" />} />
            <StatCard label="Net" chip={selectedMonthLabel} value={<MoneyText value={net} money={fmt.money} tone="auto" />} />
          </div>

          <Card title={`${selectedMonthLabel} transactions`}>
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHeader label="Date" column="date" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={extraParams} />
                  </TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">
                    <SortableHeader label="Amount" column="amount" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={extraParams} />
                  </TableHead>
                  <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthTx.map((t) => {
                  const kind = t.type === "INCOME" ? "income" : "expense";
                  return (
                    <TableRow key={t.id}>
                      <TableCell primary className="whitespace-nowrap">{fmt.day(t.date)}</TableCell>
                      <TableCell label="Category">{t.category?.name ?? "Uncategorised"}</TableCell>
                      <TableCell label="Account" className="text-muted-foreground">{t.account?.name ?? "—"}</TableCell>
                      <TableCell label="Note" className="max-w-64 truncate text-muted-foreground">{t.note ?? "—"}</TableCell>
                      <TableCell label="Amount" className="text-right font-medium">
                        <MoneyText value={toNumber(t.amount)} money={fmt.money} tone={kind} />
                      </TableCell>
                      <TableCell actions className="text-right">
                        <RowActions
                          label={`Actions for ${kind} of ${fmt.money(toNumber(t.amount))} on ${fmt.day(t.date)}`}
                          actions={[
                            { kind: "link", label: "Edit", href: `${returnHref}&edit=${t.id}`, icon: <Pencil size={14} /> },
                            {
                              kind: "confirm",
                              label: "Delete",
                              icon: <Trash2 size={14} />,
                              action: deleteTransaction.bind(null, t.id),
                              title: "Delete transaction?",
                              description: `Delete this ${fmt.money(toNumber(t.amount))} ${kind} from ${fmt.day(t.date)}? Its account balance is adjusted back. You can restore it from Recently deleted.`,
                              successMessage: "Transaction deleted",
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
                {monthTx.length === 0 && (
                  <TableRow>
                    <TableCell empty colSpan={6} className="py-6 text-center text-muted-foreground">
                      No transactions in {selectedMonthLabel}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <Pagination page={page} pageSize={pageSize} total={totalCount} basePath="/transactions" extraParams={extraParams} />
          </Card>
        </>
      )}

      {editId &&
        monthTx
          .filter((t) => t.id === editId)
          .map((t) => (
            <EditModal key={t.id} title="Edit transaction" closeHref={returnHref}>
              <ValidatedForm action={updateTransaction.bind(null, t.id)} className="flex flex-col gap-3">
                <Field label="Amount" required>
                  <MoneyInput name="amount" defaultValue={toNumber(t.amount)} required positive />
                </Field>
                <TransactionTypeFields
                  categories={categories}
                  accounts={accounts}
                  defaultType={t.type}
                  defaultCategoryId={t.categoryId}
                  defaultAccountId={t.accountId}
                />
                <Field label="Date" required>
                  <Input name="date" type="date" defaultValue={toDateInput(t.date)} required />
                </Field>
                <Field label="Note">
                  <Input name="note" type="text" defaultValue={t.note ?? ""} />
                </Field>
                <input type="hidden" name="returnMonth" value={selectedMonth ?? ""} />
                <FormActions
                  submitLabel="Save changes"
                  cancel={
                    <Button variant="outline" nativeButton={false} render={<Link href={returnHref} />}>
                      Cancel
                    </Button>
                  }
                />
              </ValidatedForm>
            </EditModal>
          ))}

      {recentlyDeletedTotal > 0 && (
        <Card title="Recently deleted" description="Restoring puts the amount back on its account.">
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Date" column="date" currentSort={deletedSort} currentDir={deletedDir} basePath="/transactions" extraParams={deletedExtraParams} />
                </TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Amount" column="amount" currentSort={deletedSort} currentDir={deletedDir} basePath="/transactions" extraParams={deletedExtraParams} />
                </TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentlyDeleted.map((t) => (
                <TableRow key={t.id}>
                  <TableCell primary className="whitespace-nowrap">{fmt.day(t.date)}</TableCell>
                  <TableCell label="Category">{t.category?.name ?? "Uncategorised"}</TableCell>
                  <TableCell label="Note" className="text-muted-foreground">{t.note ?? "—"}</TableCell>
                  <TableCell label="Amount" className="text-right">
                    <MoneyText value={toNumber(t.amount)} money={fmt.money} tone={t.type === "INCOME" ? "income" : "expense"} />
                  </TableCell>
                  <TableCell actions className="text-right">
                    <form action={restoreTransaction.bind(null, t.id)}>
                      <Button type="submit" variant="ghost" size="sm" aria-label={`Restore transaction from ${fmt.day(t.date)}`}>
                        <RotateCcw size={14} />
                        Restore
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination page={deletedPage} pageSize={deletedPageSize} total={recentlyDeletedTotal} basePath="/transactions" extraParams={deletedExtraParams} />
        </Card>
      )}
    </div>
  );
}
