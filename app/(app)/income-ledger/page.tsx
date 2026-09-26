import Link from "next/link";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue } from "@/lib/dates";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { MoneyText } from "@/components/MoneyText";
import { StatCard } from "@/components/StatCard";
import { RowActions } from "@/components/RowActions";
import { EmptyState } from "@/components/EmptyState";
import { InfoHint } from "@/components/InfoHint";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { deleteOldIncomeLedgerEntries } from "./actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

const yearRange = (year: number) => ({ gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) });

/**
 * The Income ledger: every income transaction, with the tax withheld on it — a read-only
 * view. Income is entered once, in Transactions (or imported there), and shows up here;
 * there is deliberately no way to add to the ledger separately, so the two can't drift
 * apart or be counted twice.
 */
export default async function IncomeLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; sort?: string; dir?: string; page?: string; pageSize?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const sp = await searchParams;
  const sort = sp.sort === "amount" ? "amount" : "date";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;

  const base: Prisma.TransactionWhereInput = { userId, type: "INCOME", deletedAt: null };
  const years = (
    await db.$queryRaw<{ year: number }[]>(
      Prisma.sql`SELECT DISTINCT EXTRACT(YEAR FROM "date")::int AS year FROM "Transaction"
                 WHERE "userId" = ${userId} AND "type" = 'INCOME' AND "deletedAt" IS NULL ORDER BY year DESC`,
    )
  ).map((r) => r.year);
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : null;
  const thisYear = Number(todayInputValue().slice(0, 4));
  const where: Prisma.TransactionWhereInput = { ...base, ...(year ? { date: yearRange(year) } : {}) };
  const chartYear = year ?? years[0] ?? thisYear;

  const [entries, total, filteredSums, lifetimeSums, thisYearSums, chartEntries, oldEntries] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { category: true, account: true },
      orderBy: [{ [sort]: dir }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.transaction.count({ where }),
    db.transaction.aggregate({ where, _sum: { amount: true, taxWithheld: true } }),
    db.transaction.aggregate({ where: base, _sum: { amount: true, taxWithheld: true } }),
    db.transaction.aggregate({ where: { ...base, date: yearRange(thisYear) }, _sum: { amount: true, taxWithheld: true } }),
    db.transaction.findMany({ where: { ...base, date: yearRange(chartYear) }, select: { date: true, amount: true, taxWithheld: true } }),
    db.incomeLedgerEntry.count({ where: { userId } }),
  ]);

  // Month by month for the chart year: every month listed, including ones with no income.
  const months = Array.from({ length: 12 }, (_, m) => {
    const d = new Date(Date.UTC(chartYear, m, 1));
    return { date: d, label: fmt.monthShort(d).split(" ")[0], fullLabel: fmt.monthYear(d), value: 0, tax: 0, count: 0 };
  });
  for (const e of chartEntries) {
    const m = months[e.date.getUTCMonth()];
    m.value += toNumber(e.amount);
    m.tax += toNumber(e.taxWithheld);
    m.count++;
  }

  const params = { year: year ? String(year) : undefined, sort, dir };
  const yearLabel = (y: number) => fmt.number(y, { useGrouping: false });
  const addIncome = (
    <Button nativeButton={false} render={<Link href="/transactions?new=transaction" />}>
      <Plus size={15} />
      Add income
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Income ledger"
        description="Every income transaction and the tax withheld on it. Add income in Transactions — it appears here automatically."
        actions={addIncome}
      >
        {years.length > 0 && (
          <form action="/income-ledger" className="flex items-center gap-2">
            <AutoSubmitSelect
              ariaLabel="Year"
              name="year"
              defaultValue={year ? String(year) : ""}
              options={[{ value: "", label: "All years" }, ...years.map((y) => ({ value: String(y), label: yearLabel(y) }))]}
            />
          </form>
        )}
      </PageHeader>

      {oldEntries > 0 && (
        <Alert className="rounded-lg border-l-4 border-l-warning bg-warning-soft p-3">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3 text-foreground">
            <span>
              {fmt.number(oldEntries)} entr{oldEntries === 1 ? "y was" : "ies were"} typed into the old manual ledger. They&apos;re no
              longer shown or counted — the ledger now comes from income transactions. Once your income is in Transactions
              (for example by importing a CSV), remove them.
            </span>
            <ConfirmDialog
              action={deleteOldIncomeLedgerEntries}
              title="Delete the old ledger entries?"
              description={`Removes ${oldEntries} manually typed ledger entries. Your income transactions aren't touched. A backup taken earlier still contains them.`}
              confirmLabel="Delete old entries"
              successMessage="Old ledger entries deleted"
              triggerLabel="Delete old entries"
              triggerIcon={<Trash2 size={14} />}
              triggerVariant="outline"
            />
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Lifetime income" chip="Lifetime" value={<MoneyText value={toNumber(lifetimeSums._sum.amount)} money={fmt.moneyExact} />} />
        <StatCard
          label="Tax withheld"
          chip="Lifetime"
          value={<MoneyText value={toNumber(lifetimeSums._sum.taxWithheld)} money={fmt.money} />}
          hint="Tax deducted at source, as recorded on each income transaction."
        />
        <StatCard
          label="Income this year"
          chip={yearLabel(thisYear)}
          value={<MoneyText value={toNumber(thisYearSums._sum.amount)} money={fmt.moneyExact} />}
        >
          <span className="text-xs text-muted-foreground">{fmt.money(toNumber(thisYearSums._sum.taxWithheld))} tax withheld</span>
        </StatCard>
        {year && (
          <StatCard label="Selected year" chip={yearLabel(year)} value={<MoneyText value={toNumber(filteredSums._sum.amount)} money={fmt.moneyExact} />}>
            <span className="text-xs text-muted-foreground">{fmt.money(toNumber(filteredSums._sum.taxWithheld))} tax withheld</span>
          </StatCard>
        )}
      </div>

      {chartEntries.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <Card title={`Income by month — ${yearLabel(chartYear)}`} className="lg:col-span-3">
            <MonthlyBars points={months} seriesLabel="Income" language={fmt.language} numerals={fmt.numerals} />
          </Card>
          <Card title={`Month by month — ${yearLabel(chartYear)}`} className="lg:col-span-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.fullLabel} className={m.count === 0 ? "text-muted-foreground" : ""}>
                    <TableCell>
                      {m.count > 0 ? (
                        <Link
                          href={`/transactions?month=${m.date.toISOString().slice(0, 7)}&type=INCOME`}
                          className="font-medium text-link hover:underline"
                        >
                          {m.fullLabel}
                        </Link>
                      ) : (
                        m.fullLabel
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.count > 0 ? fmt.moneyExact(m.value) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.tax > 0 ? fmt.money(m.tax) : "—"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold hover:bg-transparent">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.moneyExact(months.reduce((s, m) => s + m.value, 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.money(months.reduce((s, m) => s + m.tax, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      <Card
        title={year ? `Income in ${yearLabel(year)}` : "All income"}
        action={
          <InfoHint label="Where the ledger comes from">
            These are your income transactions. To add, change or remove one, use Transactions — the edit link on each
            row opens it there. Tax withheld is entered on the transaction.
          </InfoHint>
        }
      >
        {total === 0 ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title="No income recorded yet"
            description="Add income in Transactions (with any tax withheld), or import your history as a CSV there."
            action={addIncome}
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Date" column="date" currentSort={sort} currentDir={dir} basePath="/income-ledger" extraParams={params} />
                </TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Amount" column="amount" currentSort={sort} currentDir={dir} basePath="/income-ledger" extraParams={params} />
                </TableHead>
                <TableHead className="text-right">Tax withheld</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell primary className="whitespace-nowrap">
                    {fmt.day(e.date)}
                  </TableCell>
                  <TableCell label="Source" className="whitespace-normal">
                    <span className="font-medium">{e.note ?? e.category?.name ?? "Income"}</span>
                    {e.note && e.category && <span className="block text-xs text-muted-foreground">{e.category.name}</span>}
                  </TableCell>
                  <TableCell label="Account" className="text-muted-foreground">
                    {e.account?.name ?? "—"}
                  </TableCell>
                  <TableCell label="Amount" className="text-right font-medium">
                    {/* Exact to the poisha: interest and SP profit arrive as e.g. ৳2,921.25. */}
                    <MoneyText value={toNumber(e.amount)} money={fmt.moneyExact} />
                  </TableCell>
                  <TableCell label="Tax withheld" className="text-right text-muted-foreground tabular-nums">
                    {toNumber(e.taxWithheld) > 0 ? fmt.moneyExact(toNumber(e.taxWithheld)) : "—"}
                  </TableCell>
                  <TableCell actions className="text-right">
                    <RowActions
                      label={`Actions for income on ${fmt.day(e.date)}`}
                      actions={[
                        {
                          kind: "link",
                          label: "Edit in Transactions",
                          href: `/transactions?month=${e.date.toISOString().slice(0, 7)}&edit=${e.id}`,
                          icon: <Pencil size={14} />,
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/income-ledger" extraParams={params} />
      </Card>
    </div>
  );
}
