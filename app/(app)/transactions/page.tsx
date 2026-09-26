import Link from "next/link";
import { after } from "next/server";
import { ArrowLeftRight, Download, Pencil, PieChart, Repeat, RotateCcw, Search, Trash2, Upload, X } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue, toDateInput } from "@/lib/dates";
import { syncUserDataInBackground } from "@/lib/sync";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
import { EntryForm } from "@/components/EntryForm";
import { CsvImportForm } from "@/components/CsvImportForm";
import { RowActions } from "@/components/RowActions";
import { MoneyText } from "@/components/MoneyText";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { MonthPicker } from "@/components/MonthPicker";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditModal } from "@/components/EditModal";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  createTransaction,
  deleteTransaction,
  importTransactionsCsv,
  restoreTransaction,
  updateTransaction,
} from "./actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

type SearchParams = {
  month?: string;
  edit?: string;
  sort?: string;
  dir?: string;
  page?: string;
  pageSize?: string;
  q?: string;
  type?: string;
  category?: string;
  delSort?: string;
  delDir?: string;
  delPage?: string;
  delPageSize?: string;
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
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;
  const q = (sp.q ?? "").trim();
  const typeFilter = sp.type === "INCOME" || sp.type === "EXPENSE" ? sp.type : undefined;

  const deletedSort = sp.delSort === "amount" ? "amount" : "date";
  const deletedDir: "asc" | "desc" = sp.delDir === "asc" ? "asc" : "desc";
  const deletedPage = Math.max(1, Number(sp.delPage) || 1);
  const deletedPageSize = [10, 25, 50, 100].includes(Number(sp.delPageSize)) ? Number(sp.delPageSize) : 25;

  const [dates, categories, recentlyDeleted, recentlyDeletedTotal, recentCategoryRows] = await Promise.all([
    db.transaction.findMany({ where: { userId, deletedAt: null }, select: { date: true }, orderBy: { date: "desc" } }),
    db.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.transaction.findMany({
      where: { userId, deletedAt: { not: null } },
      include: { category: true },
      orderBy: { [deletedSort]: deletedDir },
      skip: (deletedPage - 1) * deletedPageSize,
      take: deletedPageSize,
    }),
    db.transaction.count({ where: { userId, deletedAt: { not: null } } }),
    // Recently used categories, offered as one-tap chips in the entry form.
    db.transaction.findMany({
      where: { userId, deletedAt: null, categoryId: { not: null } },
      select: { categoryId: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);
  const recentCategoryIds = [...new Set(recentCategoryRows.map((r) => r.categoryId!))];
  const categoryFilter = categories.some((c) => c.id === sp.category) ? sp.category : undefined;

  const deletedExtraParams = { delSort: deletedSort, delDir: deletedDir };

  const monthKeys = Array.from(new Set(dates.map((d) => monthKey(d.date)))).sort().reverse();
  const selectedMonth = sp.month && monthKeys.includes(sp.month) ? sp.month : (monthKeys[0] ?? null);

  type TransactionWithRelations = Prisma.TransactionGetPayload<{ include: { category: true } }>;
  let monthTx: TransactionWithRelations[] = [];
  let totalCount = 0;
  let sums: { type: "INCOME" | "EXPENSE"; _sum: { amount: Prisma.Decimal | null } }[] = [];

  if (selectedMonth) {
    const [year, month] = selectedMonth.split("-").map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    const monthWhere: Prisma.TransactionWhereInput = { userId, deletedAt: null, date: { gte: start, lt: end } };
    const listWhere: Prisma.TransactionWhereInput = {
      ...monthWhere,
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(categoryFilter ? { categoryId: categoryFilter } : {}),
      ...(q
        ? {
            OR: [
              { note: { contains: q, mode: "insensitive" } },
              { category: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    [monthTx, totalCount, sums] = await Promise.all([
      db.transaction.findMany({
        where: listWhere,
        include: { category: true },
        orderBy: [{ [sortColumn]: sortDir }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.transaction.count({ where: listWhere }),
      // The summary strip is the whole month, whatever the filters.
      db.transaction.groupBy({ by: ["type"], where: monthWhere, _sum: { amount: true } }),
    ]);
  }

  const income = toNumber(sums.find((s) => s.type === "INCOME")?._sum.amount);
  const expense = toNumber(sums.find((s) => s.type === "EXPENSE")?._sum.amount);
  const net = income - expense;

  const today = todayInputValue();
  const selectedMonthLabel = selectedMonth ? monthLabel(selectedMonth) : "";

  // Every link rebuilds the query; carry the month, sort and filters along.
  const state: Record<string, string | undefined> = {
    month: selectedMonth ?? undefined,
    sort: sortColumn,
    dir: sortDir,
    q: q || undefined,
    type: typeFilter,
    category: categoryFilter,
  };
  const hrefWith = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...overrides })) if (v) params.set(k, v);
    return `/transactions?${params.toString()}`;
  };
  const returnHref = hrefWith({});
  const filtersActive = Boolean(q || typeFilter || categoryFilter);
  const chips = [
    q && { label: `“${q}”`, href: hrefWith({ q: undefined }) },
    typeFilter && { label: typeFilter === "INCOME" ? "Income" : "Expense", href: hrefWith({ type: undefined }) },
    categoryFilter && { label: categories.find((c) => c.id === categoryFilter)?.name ?? "Category", href: hrefWith({ category: undefined }) },
  ].filter(Boolean) as { label: string; href: string }[];

  // Group consecutive rows by day (only meaningful when sorted by date).
  const groups: { key: string; date: Date; rows: TransactionWithRelations[]; net: number }[] = [];
  if (sortColumn === "date") {
    for (const t of monthTx) {
      const key = toDateInput(t.date);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) groups.push((group = { key, date: t.date, rows: [], net: 0 }));
      group.rows.push(t);
      group.net += (t.type === "INCOME" ? 1 : -1) * toNumber(t.amount);
    }
  }

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

  const row = (t: TransactionWithRelations, showDate: boolean) => {
    const kind = t.type === "INCOME" ? "income" : "expense";
    return (
      <TableRow key={t.id}>
        <TableCell primary className="whitespace-normal">
          <span className="font-medium">{t.category?.name ?? "Uncategorised"}</span>
          {t.note && <span className="block text-xs font-normal text-muted-foreground sm:max-w-80 sm:truncate">{t.note}</span>}
          {t.incomeMonth && <span className="block text-xs font-normal text-muted-foreground">for {fmt.monthYear(t.incomeMonth)}</span>}
        </TableCell>
        {showDate && (
          <TableCell label="Date" className="whitespace-nowrap text-muted-foreground">
            {fmt.day(t.date)}
          </TableCell>
        )}
        <TableCell label="Amount" className="text-right font-medium">
          <MoneyText value={toNumber(t.amount)} money={fmt.money} tone={kind} />
          {toNumber(t.taxWithheld) > 0 && (
            <span className="block text-xs font-normal text-muted-foreground">tax {fmt.money(toNumber(t.taxWithheld))}</span>
          )}
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
                description: `Delete this ${fmt.money(toNumber(t.amount))} ${kind} from ${fmt.day(t.date)}? You can restore it from Recently deleted.`,
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
        description="Every income and expense, month by month."
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
      >
        {selectedMonth && <MonthPicker months={monthKeys} selected={selectedMonth} basePath="/transactions" labelFor={monthLabel} />}
      </PageHeader>

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
            <StatCard size="compact" label="Income" chip={selectedMonthLabel} tone="positive" value={<MoneyText value={income} money={fmt.money} tone="income" />} />
            <StatCard size="compact" label="Expense" chip={selectedMonthLabel} tone="negative" value={<MoneyText value={expense} money={fmt.money} tone="expense" />} />
            <StatCard size="compact" label="Net" chip={selectedMonthLabel} value={<MoneyText value={net} money={fmt.money} tone="auto" />} />
          </div>

          <Card title={`${selectedMonthLabel} transactions`}>
            {/* Toolbar: a plain GET form, so filters live in the URL like everything else. */}
            <form action="/transactions" className="mb-3 flex flex-wrap items-center gap-2" role="search">
              <input type="hidden" name="month" value={selectedMonth ?? ""} />
              {sortColumn !== "date" && <input type="hidden" name="sort" value={sortColumn} />}
              {sortDir !== "desc" && <input type="hidden" name="dir" value={sortDir} />}
              <label className="relative min-w-48 flex-1 sm:max-w-72">
                <span className="sr-only">Search notes and categories</span>
                <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input name="q" type="search" defaultValue={q} placeholder="Search" className="pl-8" />
              </label>
              {/* Enter only submits a multi-field form when it has a submit button. */}
              <button type="submit" className="sr-only">
                Search
              </button>
              <AutoSubmitSelect
                ariaLabel="Type"
                name="type"
                defaultValue={typeFilter ?? ""}
                options={[
                  { value: "", label: "All types" },
                  { value: "INCOME", label: "Income" },
                  { value: "EXPENSE", label: "Expense" },
                ]}
              />
              <AutoSubmitSelect
                ariaLabel="Category"
                name="category"
                defaultValue={categoryFilter ?? ""}
                options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </form>
            {chips.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {fmt.number(totalCount)} match{totalCount === 1 ? "" : "es"}:
                </span>
                {chips.map((c) => (
                  <Link
                    key={c.label}
                    href={c.href}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-medium hover:bg-muted/70"
                    aria-label={`Remove filter ${c.label}`}
                  >
                    {c.label}
                    <X size={12} aria-hidden />
                  </Link>
                ))}
                <Link href={`/transactions?month=${selectedMonth}`} className="font-medium text-link hover:underline">
                  Clear all
                </Link>
              </div>
            )}

            {monthTx.length === 0 ? (
              <EmptyState
                title={filtersActive ? "Nothing matches these filters" : `No transactions in ${selectedMonthLabel}`}
                description={filtersActive ? "Try removing a filter." : undefined}
              />
            ) : (
              <Table responsive>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    {sortColumn !== "date" && (
                      <TableHead>
                        <SortableHeader label="Date" column="date" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={state} />
                      </TableHead>
                    )}
                    <TableHead className="text-right">
                      <SortableHeader label="Amount" column="amount" currentSort={sortColumn} currentDir={sortDir} basePath="/transactions" extraParams={state} />
                    </TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                {sortColumn === "date" ? (
                  groups.map((g) => (
                    <TableBody key={g.key}>
                      {/* Day header with the day's net. */}
                      <TableRow className="bg-muted/40 hover:bg-muted/40">
                        <TableCell colSpan={2} className="py-1.5 text-xs font-medium">
                          {fmt.day(g.date)}
                        </TableCell>
                        <TableCell colSpan={2} className="py-1.5 pr-12 text-right text-xs text-muted-foreground">
                          <MoneyText value={g.net} money={fmt.money} tone="auto" />
                        </TableCell>
                      </TableRow>
                      {g.rows.map((t) => row(t, false))}
                    </TableBody>
                  ))
                ) : (
                  <TableBody>{monthTx.map((t) => row(t, true))}</TableBody>
                )}
              </Table>
            )}
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              {sortColumn === "date" ? (
                <Link href={hrefWith({ sort: "amount", dir: "desc" })} className="font-medium text-link hover:underline">
                  Sort by amount
                </Link>
              ) : (
                <Link href={hrefWith({ sort: undefined, dir: undefined })} className="font-medium text-link hover:underline">
                  Group by day
                </Link>
              )}
            </div>
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

      {recentlyDeletedTotal > 0 && (
        <Card title="Recently deleted" description="Restore anything deleted by mistake.">
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
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentlyDeleted.map((t) => (
                <TableRow key={t.id}>
                  <TableCell primary className="whitespace-nowrap">
                    {fmt.day(t.date)}
                  </TableCell>
                  <TableCell label="Category">{t.category?.name ?? "Uncategorised"}</TableCell>
                  <TableCell label="Note" className="text-muted-foreground">
                    {t.note ?? "—"}
                  </TableCell>
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
