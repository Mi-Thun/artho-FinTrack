import Link from "next/link";
import { after } from "next/server";
import { ArrowLeftRight, Download, Pencil, PieChart, Plus, Repeat, Trash2, Upload } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue, toDateInput } from "@/lib/dates";
import { syncUserDataInBackground } from "@/lib/sync";
import { transactionMonthKeys } from "@/lib/transaction-stats";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { EntryForm } from "@/components/EntryForm";
import { CsvImportForm } from "@/components/CsvImportForm";
import { RowActions } from "@/components/RowActions";
import { TruncatedNote } from "@/components/TruncatedNote";
import { MoneyText } from "@/components/MoneyText";
import { StatCard } from "@/components/StatCard";
import { Breakdown } from "@/components/Breakdown";
import { EmptyState } from "@/components/EmptyState";
import { MonthPicker } from "@/components/MonthPicker";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditModal } from "@/components/EditModal";
import { accountBalancesForMonth, totalOf } from "@/lib/account-balances";
import { parseMonthKey } from "@/lib/budgets";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  createTransaction,
  deleteTransaction,
  importTransactionsCsv,
  updateTransaction,
} from "./actions";
import { pageSizeFrom } from "@/lib/pagination";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

type SearchParams = {
  month?: string;
  edit?: string;
  sort?: string;
  dir?: string;
  page?: string;
  pageSize?: string;
};

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
  const pageSize = pageSizeFrom(sp.pageSize);

  const [monthKeys, categories, recentCategoryRows] = await Promise.all([
    // One row per month, not one per transaction ever recorded.
    transactionMonthKeys(userId),
    db.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    // Recently used categories, offered as one-tap chips in the entry form.
    db.transaction.findMany({
      where: { userId, deletedAt: null, categoryId: { not: null } },
      select: { categoryId: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  const recentCategoryIds = [...new Set(recentCategoryRows.map((r) => r.categoryId!))];


  const selectedMonth = sp.month && monthKeys.includes(sp.month) ? sp.month : (monthKeys[0] ?? null);

  type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: { category: true } }>;
  let monthTx: TransactionWithRelations[] = [];
  let totalCount = 0;
  let sums: { type: "INCOME" | "EXPENSE"; _sum: { amount: Prisma.Decimal | null } }[] = [];
  let incomeByCategory: { categoryId: string | null; _sum: { amount: Prisma.Decimal | null } }[] = [];

  if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const monthWhere: Prisma.TransactionWhereInput = { userId, deletedAt: null, date: { gte: start, lt: end } };

    [monthTx, totalCount, sums, incomeByCategory] = await Promise.all([
      db.transaction.findMany({
        where: monthWhere,
        include: { category: true },
        orderBy: [{ [sortColumn]: sortDir }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.transaction.count({ where: monthWhere }),
      db.transaction.groupBy({ by: ["type"], where: monthWhere, _sum: { amount: true } }),
      // For the Income card's ⓘ: where the month's income came from.
      db.transaction.groupBy({ by: ["categoryId"], where: { ...monthWhere, type: "INCOME" }, _sum: { amount: true } }),
    ]);
  }

  const income = toNumber(sums.find((s) => s.type === "INCOME")?._sum.amount);
  const expense = toNumber(sums.find((s) => s.type === "EXPENSE")?._sum.amount);
  // What's left of the cash on hand after this month's spending: the Accounts page total
  // for the selected month, less that month's expense.
  const cashOnHand = totalOf(await accountBalancesForMonth(userId, selectedMonth ? parseMonthKey(selectedMonth)! : new Date()));
  const cashLeft = cashOnHand - expense;

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const incomeRows = incomeByCategory
    .map((g) => ({ label: categoryNameById.get(g.categoryId ?? "") ?? "Uncategorised", amount: toNumber(g._sum.amount) }))
    .sort((a, b) => b.amount - a.amount)
    .map((r) => ({ label: r.label, value: fmt.money(r.amount) }));

  const today = todayInputValue();
  const selectedMonthLabel = selectedMonth ? monthLabel(selectedMonth) : "";

  // Every link rebuilds the query; carry the month and sort along.
  const state: Record<string, string | undefined> = {
    month: selectedMonth ?? undefined,
    sort: sortColumn,
    dir: sortDir,
  };
  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...overrides })) if (v) params.set(k, v);
    return `/transactions?${params.toString()}`;
  };
  const returnHref = hrefWith({});

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }));

  // The header copy answers the quick-add link; the empty state's copy doesn't, or both
  // would open at once.
  const addTransactionModal = (openParam?: string) => (
    <Modal label="Add transaction" title="Add transaction" presentation="sheet" openParam={openParam}>
      <EntryForm
        categories={categoryOptions}
        recentCategoryIds={recentCategoryIds}
        today={today}
        transactionAction={createTransaction}
      />
    </Modal>
  );

  // One line per transaction: long notes are cut off (full text on hover).
  const row = (t: TransactionWithRelations) => {
    const kind = t.type === "INCOME" ? "income" : "expense";
    return (
      <TableRow key={t.id}>
        <TableCell label="Date" className="text-muted-foreground">
          {fmt.day(t.date)}
        </TableCell>
        <TableCell primary>
          <span className="font-medium">{t.category?.name ?? "Uncategorised"}</span>
          {t.incomeMonth && <span className="ml-1.5 text-xs text-muted-foreground">for {fmt.monthYear(t.incomeMonth)}</span>}
        </TableCell>
        <TableCell label="Note" className={cn("w-full max-w-0 text-muted-foreground max-sm:flex-nowrap", !t.note && "max-sm:hidden!")}>
          <TruncatedNote note={t.note} />
        </TableCell>
        <TableCell label="Tax" className={cn("text-right text-muted-foreground tabular-nums", !(toNumber(t.taxWithheld) > 0) && "max-sm:hidden!")}>
          {toNumber(t.taxWithheld) > 0 ? fmt.money(toNumber(t.taxWithheld)) : "—"}
        </TableCell>
        <TableCell label="Amount" className="text-right font-medium">
          <MoneyText value={toNumber(t.amount)} money={fmt.money} tone={kind} />
        </TableCell>
        <TableCell actions className="w-10 text-right">
          <RowActions
            label={`Actions for ${kind} of ${fmt.money(toNumber(t.amount))} on ${fmt.day(t.date)}`}
            actions={[
              { kind: "link", label: "Edit", href: hrefWith({ edit: t.id }), icon: <Pencil size={14} /> },
              {
                kind: "confirm",
                label: "Delete",
                icon: <Trash2 size={14} />,
                action: deleteTransaction.bind(null, t.id),
                title: "Delete transaction?",
                description: `Delete this ${fmt.money(toNumber(t.amount))} ${kind} from ${fmt.day(t.date)}?`,
                successMessage: "Transaction deleted",
              },
            ]}
          />
        </TableCell>
      </TableRow>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        picker={selectedMonth && <MonthPicker months={monthKeys} selected={selectedMonth} basePath="/transactions" fmt={fmt} />}
        mobileMenu={[
          {
            label: "Add transaction",
            href: `/transactions?${selectedMonth ? `month=${selectedMonth}&` : ""}new=transaction`,
            icon: <Plus size={16} />,
          },
        ]}
        menu={[
          { label: "Recurring transactions", href: "/recurring", icon: <Repeat size={16} /> },
          { label: "Budgets", href: "/budgets", icon: <PieChart size={16} /> },
          { label: "Import CSV", href: "/transactions?new=import", icon: <Upload size={16} /> },
          { label: "Export CSV", href: "/api/transactions/export", icon: <Download size={16} />, download: true },
        ]}
        actions={
          <>
            <Modal label="Import CSV" title="Import transactions from CSV" openParam="import" hideTrigger>
              <CsvImportForm action={importTransactionsCsv} categoryNames={categories.map((c) => c.name)} />
            </Modal>
            {addTransactionModal("transaction")}
          </>
        }
      />

      {monthKeys.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ArrowLeftRight size={18} />}
            title="No transactions yet"
            description="Add your first income or expense, or import a CSV from your bank."
            action={addTransactionModal()}
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <StatCard
              size="compact"
              label="Income"
              tone="positive"
              value={<MoneyText value={income} money={fmt.money} tone="income" />}
              hint={
                <Breakdown
                  title={`Income in ${selectedMonthLabel}, by category`}
                  rows={incomeRows}
                  total={{ label: "Total income", value: fmt.money(income) }}
                  empty="No income this month."
                />
              }
            />
            <StatCard size="compact" label="Expense" tone="negative" value={<MoneyText value={expense} money={fmt.money} tone="expense" />} />
            <StatCard
              size="compact"
              label="Cash on hand"
              value={<MoneyText value={cashLeft} money={fmt.money} tone="auto" />}
              hint={
                <Breakdown
                  title={`Cash on hand after ${selectedMonthLabel} spending`}
                  rows={[
                    { label: "Cash on hand (Accounts)", value: fmt.money(cashOnHand) },
                    { label: `Expense, ${selectedMonthLabel}`, value: fmt.money(expense), sign: "−" },
                  ]}
                  total={{ label: "Left", value: fmt.money(cashLeft) }}
                />
              }
            />
          </div>

          <Card>
            {monthTx.length === 0 ? (
              <EmptyState title={`No transactions in ${selectedMonthLabel}`} />
            ) : (
              <Table responsive>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortableHeader label="Date" column="date" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={state} />
                    </TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">
                      <SortableHeader label="Amount" column="amount" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={state} />
                    </TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>{monthTx.map((t) => row(t))}</TableBody>
              </Table>
            )}
            <Pagination page={page} pageSize={pageSize} total={totalCount} basePath="/transactions" extraParams={state} />
          </Card>

        </>
      )}

      {editId &&
        monthTx
          .filter((t) => t.id === editId)
          .map((t) => (
            <EditModal key={t.id} title="Edit transaction" closeHref={hrefWith({ edit: undefined })}>
              <EntryForm
                inModal={false}
                categories={categoryOptions}
                recentCategoryIds={recentCategoryIds}
                today={today}
                transactionAction={updateTransaction.bind(null, t.id)}
                submitLabel="Save changes"
                defaults={{
                  type: t.type,
                  amount: toNumber(t.amount),
                  categoryId: t.categoryId,
                  date: toDateInput(t.date),
                  note: t.note ?? "",
                  taxWithheld: toNumber(t.taxWithheld),
                  incomeMonth: t.incomeMonth ? t.incomeMonth.toISOString().slice(0, 7) : undefined,
                }}
                hiddenFields={<input type="hidden" name="returnMonth" value={selectedMonth ?? ""} />}
                cancel={
                  <Button variant="outline" nativeButton={false} render={<Link href={returnHref} />}>
                    Cancel
                  </Button>
                }
              />
            </EditModal>
          ))}
    </div>
  );
}
