import Link from "next/link";
import { after } from "next/server";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Download, Pencil, PieChart, Repeat, RotateCcw, Upload } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue, toDateInput } from "@/lib/dates";
import { syncUserDataInBackground } from "@/lib/sync";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { TransactionTypeFields } from "@/components/TransactionTypeFields";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { PageHeader } from "@/components/PageHeader";
import { BudgetsPanel } from "@/components/BudgetsPanel";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditModal } from "@/components/EditModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric" });
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
      <Modal label="Add Recurring" title="Add Recurring Transaction">
        <ModalForm action={createRecurringTransaction} className="flex flex-col gap-3">
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
        Auto-logged every month on the day you pick — e.g. salary on the 1st, rent on the 5th.
      </p>
      <Table>
        <TableHeader><TableRow>
          <TableHead><SortableHeader label="Type" column="type" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" sortParam="rSort" dirParam="rDir" extraParams={recurringExtraParams} /></TableHead>
          <TableHead className="text-right"><SortableHeader label="Amount" column="amount" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" sortParam="rSort" dirParam="rDir" extraParams={recurringExtraParams} /></TableHead>
          <TableHead><SortableHeader label="Day" column="dayOfMonth" currentSort={recurringSort} currentDir={recurringDir} basePath="/transactions" sortParam="rSort" dirParam="rDir" extraParams={recurringExtraParams} /></TableHead>
          <TableHead>Category</TableHead><TableHead>Account</TableHead><TableHead>Note</TableHead><TableHead className="text-right">Action</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {recurring.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.type === "INCOME" ? "Income" : "Expense"}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmt.money(toNumber(r.amount))}</TableCell>
              <TableCell className="text-muted-foreground">day {r.dayOfMonth}</TableCell>
              <TableCell className="text-muted-foreground">{r.category?.name ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.account?.name ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.note ?? "—"}</TableCell>
              <TableCell className="text-right"><div className="flex justify-end gap-1">
                <form action={toggleRecurringTransaction.bind(null, r.id, !r.active)}><Button type="submit" variant="secondary" size="sm">{r.active ? "Pause" : "Resume"}</Button></form>
                <ConfirmDelete
                  action={deleteRecurringTransaction.bind(null, r.id)}
                  label="Delete recurring transaction"
                  message={`Stop and delete this ${fmt.money(toNumber(r.amount))} recurring ${r.type === "INCOME" ? "income" : "expense"}? Transactions it already logged are kept.`}
                />
              </div></TableCell>
            </TableRow>
          ))}
          {recurring.length === 0 && <TableRow><TableCell colSpan={7} className="py-4 text-center text-muted-foreground">No recurring transactions set up.</TableCell></TableRow>}
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

  const idx = selectedMonth ? monthKeys.indexOf(selectedMonth) : -1;
  const olderMonth = idx >= 0 && idx < monthKeys.length - 1 ? monthKeys[idx + 1] : null;
  const newerMonth = idx > 0 ? monthKeys[idx - 1] : null;

  const income = toNumber(sums.find((s) => s.type === "INCOME")?._sum.amount);
  const expense = toNumber(sums.find((s) => s.type === "EXPENSE")?._sum.amount);
  const net = income - expense;

  const today = todayInputValue();
  const returnHref = `/transactions?month=${selectedMonth}`;

  const extraParams: Record<string, string | undefined> = {
    month: selectedMonth ?? undefined,
    sort: sortColumn,
    dir: sortDir,
  };

  const addTransactionModal = (
    <Modal label="Add Transaction" title="Add Transaction">
      <ModalForm action={createTransaction} className="flex flex-col gap-3">
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
        icon={<ArrowLeftRight size={16} />}
        crumbs={[{ label: "Transactions" }]}
        actions={
          <>
            <Modal label="Recurring Transaction" title="Recurring Transaction" variant="secondary" icon={<Repeat size={15} />}>
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
            <Modal label="Budgets" title="Budgets" variant="secondary" icon={<PieChart size={15} />}>
              <BudgetsPanel userId={userId} monthParam={sp.bMonth} editId={sp.bEdit} />
            </Modal>
              <Button variant="secondary" nativeButton={false} render={<a href="/api/transactions/export" />}>
                <Download size={15} />
                Export CSV
              </Button>
              <Modal label="Import CSV" title="Import Transactions CSV" variant="secondary" icon={<Upload size={15} />}>
                <Alert className="mb-3 rounded-lg border-l-4 p-3" style={{ background: "var(--status-warning-soft)", borderLeftColor: "var(--status-warning)" }}>
                  <AlertDescription className="text-foreground">
                    Required columns, in order: date, type, amount, category, account, note.
                  </AlertDescription>
                </Alert>
                <ModalForm action={importTransactionsCsv} className="flex flex-col gap-3">
                  <Field label="CSV file" required>
                    <Input name="file" type="file" accept=".csv,text/csv" required />
                  </Field>
                  <FormActions submitLabel="Import" cancel={<ModalCancel />} />
                </ModalForm>
              </Modal>
          </>
        }
      />

      {monthKeys.length === 0 && (
        <Card title="Transactions" action={addTransactionModal}>
          <p className="py-6 text-center text-sm text-muted-foreground">No transactions yet.</p>
        </Card>
      )}
      {monthKeys.length > 0 && (
        <Card title="Transactions" action={addTransactionModal}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="icon"
                className={!olderMonth ? "pointer-events-none opacity-30" : ""}
                nativeButton={false}
                render={<Link href={olderMonth ? `/transactions?tab=transactions&month=${olderMonth}` : "#"} aria-disabled={!olderMonth} aria-label="Previous month" />}
              >
                <ChevronLeft size={16} />
              </Button>

              <form action="/transactions">
                <input type="hidden" name="tab" value="transactions" />
                <AutoSubmitSelect
                  ariaLabel="Month"
                  name="month"
                  defaultValue={selectedMonth ?? undefined}
                  options={monthKeys.map((key) => ({ value: key, label: monthLabel(key) }))}
                />
              </form>

              <Button
                variant="secondary"
                size="icon"
                className={!newerMonth ? "pointer-events-none opacity-30" : ""}
                nativeButton={false}
                render={<Link href={newerMonth ? `/transactions?tab=transactions&month=${newerMonth}` : "#"} aria-disabled={!newerMonth} aria-label="Next month" />}
              >
                <ChevronRight size={16} />
              </Button>
            </div>

            <div className="flex gap-4 text-sm font-medium tabular-nums">
              <span style={{ color: "var(--status-success)" }}>+{fmt.money(income)}</span>
              <span className="text-destructive">-{fmt.money(expense)}</span>
              <span style={net >= 0 ? { color: "var(--status-success)" } : undefined} className={net < 0 ? "text-destructive" : ""}>
                Net {fmt.money(net)}
              </span>
            </div>
          </div>

          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortableHeader label="Date" column="date" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={extraParams} />
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">
                    <SortableHeader label="Amount" column="amount" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={extraParams} />
                  </TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthTx.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap">{fmt.date(t.date, DATE_FORMAT)}</TableCell>
                    <TableCell>{t.type === "INCOME" ? "Income" : "Expense"}</TableCell>
                    <TableCell>{t.category?.name ?? "—"}</TableCell>
                    <TableCell>{t.account?.name ?? "—"}</TableCell>
                    <TableCell>{t.note ?? "—"}</TableCell>
                    <TableCell
                      className="text-right font-medium tabular-nums"
                      style={{ color: t.type === "INCOME" ? "var(--status-success)" : "var(--status-danger)" }}
                    >
                      {t.type === "INCOME" ? "+" : "-"}
                      {fmt.money(toNumber(t.amount))}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Edit transaction" title="Edit" nativeButton={false} render={<Link href={`${returnHref}&edit=${t.id}`} />}>
                          <Pencil size={15} />
                        </Button>
                        <ConfirmDelete
                          action={deleteTransaction.bind(null, t.id)}
                          label="Delete transaction"
                          message={`Delete this ${fmt.money(toNumber(t.amount))} ${t.type === "INCOME" ? "income" : "expense"} from ${fmt.date(t.date, DATE_FORMAT)}? Its account balance is adjusted back. You can restore it from Recently Deleted.`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {monthTx.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                      No transactions in this month.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={totalCount} basePath="/transactions" extraParams={extraParams} />
        </Card>
      )}

      {
        editId &&
        monthTx
          .filter((t) => t.id === editId)
          .map((t) => (
            <EditModal key={t.id} title="Edit Transaction" closeHref={returnHref}>
              <form action={updateTransaction.bind(null, t.id)} className="flex flex-col gap-3">
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
              </form>
            </EditModal>
          ))}

      {recentlyDeletedTotal > 0 && (
        <Card title="Recently Deleted">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Date" column="date" currentSort={deletedSort} currentDir={deletedDir} basePath="/transactions" extraParams={deletedExtraParams} />
                </TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Note</TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Amount" column="amount" currentSort={deletedSort} currentDir={deletedDir} basePath="/transactions" extraParams={deletedExtraParams} />
                </TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentlyDeleted.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="whitespace-nowrap">{fmt.date(t.date, DATE_FORMAT)}</TableCell>
                  <TableCell>{t.type === "INCOME" ? "Income" : "Expense"}</TableCell>
                  <TableCell>{t.category?.name ?? "—"}</TableCell>
                  <TableCell>{t.note ?? "—"}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmt.money(toNumber(t.amount))}</TableCell>
                  <TableCell className="text-right">
                    <form action={restoreTransaction.bind(null, t.id)}>
                      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Restore transaction" title="Restore">
                        <RotateCcw size={15} />
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
