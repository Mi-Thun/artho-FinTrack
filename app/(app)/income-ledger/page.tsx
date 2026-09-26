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
import { Breakdown, type BreakdownRow } from "@/components/Breakdown";
import { RowActions } from "@/components/RowActions";
import { EmptyState } from "@/components/EmptyState";
import { InfoHint } from "@/components/InfoHint";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StackedMonthlyBars, type StackedSeries } from "@/components/charts/StackedMonthlyBars";
import { SERIES, SERIES_OTHER } from "@/lib/chart-colors";
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
 * Income counts in the month it's *for*: `incomeMonth` when set (May's salary paid on
 * 1 June), otherwise the month it arrived.
 */
const forYear = (year: number): Prisma.TransactionWhereInput => ({
  OR: [{ incomeMonth: yearRange(year) }, { incomeMonth: null, date: yearRange(year) }],
});
const monthRange = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
};
const inMonth = (month: string): Prisma.TransactionWhereInput => ({
  OR: [{ incomeMonth: monthRange(month) }, { incomeMonth: null, date: monthRange(month) }],
});
const forMonth = (t: { date: Date; incomeMonth: Date | null }) => t.incomeMonth ?? t.date;

/** Categories beyond this many share the "Other" colour, so no hue is ever cycled. */
const MAX_TYPES = SERIES.length - 1;

/**
 * The Income ledger: every income transaction, with the tax withheld on it — a read-only
 * view. Income is entered once, in Transactions (or imported there), and shows up here;
 * there is deliberately no way to add to the ledger separately, so the two can't drift
 * apart or be counted twice.
 */
export default async function IncomeLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; sort?: string; dir?: string; page?: string; pageSize?: string }>;
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
      Prisma.sql`SELECT DISTINCT EXTRACT(YEAR FROM COALESCE("incomeMonth", "date"))::int AS year FROM "Transaction"
                 WHERE "userId" = ${userId} AND "type" = 'INCOME' AND "deletedAt" IS NULL ORDER BY year DESC`,
    )
  ).map((r) => r.year);
  // A month (from the month-by-month table) narrows the entries to income for that month.
  const month = sp.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : null;
  const year = month ? Number(month.slice(0, 4)) : sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : null;
  const thisYear = Number(todayInputValue().slice(0, 4));
  const where: Prisma.TransactionWhereInput = { ...base, ...(month ? inMonth(month) : year ? forYear(year) : {}) };
  const chartYear = year ?? years[0] ?? thisYear;

  const [
    entries,
    total,
    filteredSums,
    lifetimeSums,
    thisYearSums,
    chartEntries,
    oldEntries,
    lifetimeByCategory,
    categories,
    thisYearByCategory,
    filteredByCategory,
    taxByYear,
  ] = await Promise.all([
    db.transaction.findMany({
      where,
      include: { category: true },
      orderBy: [{ [sort]: dir }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.transaction.count({ where }),
    db.transaction.aggregate({ where, _sum: { amount: true, taxWithheld: true } }),
    db.transaction.aggregate({ where: base, _sum: { amount: true, taxWithheld: true } }),
    db.transaction.aggregate({ where: { ...base, ...forYear(thisYear) }, _sum: { amount: true, taxWithheld: true } }),
    db.transaction.findMany({
      where: { ...base, ...forYear(chartYear) },
      select: { date: true, incomeMonth: true, amount: true, taxWithheld: true, categoryId: true },
    }),
    db.incomeLedgerEntry.count({ where: { userId } }),
    db.transaction.groupBy({ by: ["categoryId"], where: base, _sum: { amount: true, taxWithheld: true }, _count: true }),
    db.category.findMany({ where: { userId, kind: "INCOME" }, select: { id: true, name: true } }),
    // For the ⓘ breakdowns.
    db.transaction.groupBy({ by: ["categoryId"], where: { ...base, ...forYear(thisYear) }, _sum: { amount: true, taxWithheld: true }, _count: true }),
    db.transaction.groupBy({ by: ["categoryId"], where, _sum: { amount: true, taxWithheld: true }, _count: true }),
    db.$queryRaw<{ year: number; tax: Prisma.Decimal; count: bigint }[]>(
      Prisma.sql`SELECT EXTRACT(YEAR FROM COALESCE("incomeMonth", "date"))::int AS year, SUM("taxWithheld") AS tax,
                        COUNT(*) FILTER (WHERE "taxWithheld" > 0) AS count
                 FROM "Transaction"
                 WHERE "userId" = ${userId} AND "type" = 'INCOME' AND "deletedAt" IS NULL
                 GROUP BY 1 HAVING SUM("taxWithheld") > 0 ORDER BY 1 DESC`,
    ),
  ]);

  // Income types (categories), largest lifetime first. Colours follow that lifetime order,
  // so a type keeps its colour whichever year is shown; past MAX_TYPES they share "Other".
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const ranked = lifetimeByCategory
    .map((g) => ({ id: g.categoryId ?? "none", total: toNumber(g._sum.amount) }))
    .sort((a, b) => b.total - a.total);
  const seriesKey = new Map<string, string>();
  const allSeries: StackedSeries[] = [];
  ranked.forEach((c, i) => {
    if (i < MAX_TYPES || ranked.length === MAX_TYPES + 1) {
      const key = `s${i}`;
      seriesKey.set(c.id, key);
      allSeries.push({ key, label: categoryName.get(c.id) ?? "Uncategorised", color: SERIES[i] });
    } else {
      seriesKey.set(c.id, "other");
    }
  });
  if ([...seriesKey.values()].includes("other")) allSeries.push({ key: "other", label: "Other", color: SERIES_OTHER });

  // Month by month for the chart year: every month listed, including ones with no income.
  const months = Array.from({ length: 12 }, (_, m) => {
    const d = new Date(Date.UTC(chartYear, m, 1));
    return {
      date: d,
      label: fmt.monthShort(d).split(" ")[0],
      fullLabel: fmt.monthYear(d),
      value: 0,
      tax: 0,
      count: 0,
      byType: {} as Record<string, number>,
    };
  });
  const yearByType = new Map<string, { amount: number; tax: number; count: number }>();
  for (const e of chartEntries) {
    const m = months[forMonth(e).getUTCMonth()];
    const key = seriesKey.get(e.categoryId ?? "none") ?? "other";
    m.value += toNumber(e.amount);
    m.tax += toNumber(e.taxWithheld);
    m.count++;
    m.byType[key] = (m.byType[key] ?? 0) + toNumber(e.amount);
    const t = yearByType.get(key) ?? { amount: 0, tax: 0, count: 0 };
    t.amount += toNumber(e.amount);
    t.tax += toNumber(e.taxWithheld);
    t.count++;
    yearByType.set(key, t);
  }
  // Only the types that appear this year go in the chart and legend.
  const series = allSeries.filter((s) => yearByType.has(s.key));
  const chartPoints = months.map((m) => ({ label: m.label, fullLabel: m.fullLabel, ...m.byType }));
  const yearTotal = months.reduce((sum, m) => sum + m.value, 0);

  // ── ⓘ breakdowns: each total by category, with actual amounts. ──
  type CategoryGroup = { categoryId: string | null; _sum: { amount: unknown; taxWithheld: unknown }; _count: number };
  const byCategory = (groups: CategoryGroup[]): BreakdownRow[] =>
    groups
      .map((g) => ({ name: categoryName.get(g.categoryId ?? "") ?? "Uncategorised", amount: toNumber(g._sum.amount), count: g._count }))
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map((g) => ({ label: `${g.name} (${fmt.number(g.count)})`, value: fmt.moneyExact(g.amount) }));
  const taxByCategory = (groups: CategoryGroup[]): BreakdownRow[] =>
    groups
      .filter((g) => toNumber(g._sum.taxWithheld) > 0)
      .sort((a, b) => toNumber(b._sum.taxWithheld) - toNumber(a._sum.taxWithheld))
      .map((g) => ({ label: categoryName.get(g.categoryId ?? "") ?? "Uncategorised", value: fmt.money(toNumber(g._sum.taxWithheld)), sub: true }));
  const countOf = (groups: CategoryGroup[]) => groups.reduce((n, g) => n + g._count, 0);
  const incomeBreakdown = (title: string, groups: CategoryGroup[], sums: { amount: unknown; taxWithheld: unknown }) => (
    <Breakdown
      title={title}
      rows={[
        ...byCategory(groups),
        ...(toNumber(sums.taxWithheld) > 0
          ? [{ label: "Tax withheld (not deducted from income)", value: fmt.money(toNumber(sums.taxWithheld)) }, ...taxByCategory(groups)]
          : []),
      ]}
      total={{ label: `Total income · ${fmt.number(countOf(groups))} entries`, value: fmt.moneyExact(toNumber(sums.amount)) }}
      empty="No income recorded."
      note="Counted in the month each income is for. Numbers in brackets are how many entries."
    />
  );

  const params = { year: year ? String(year) : undefined, month: month ?? undefined, sort, dir };
  const monthLabel = month ? fmt.monthYear(monthRange(month).gte) : null;
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
              {fmt.number(oldEntries)} {oldEntries === 1 ? "entry was" : "entries were"}{" "}typed into the old manual ledger. They&apos;re no
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
        <StatCard
          label="Lifetime income"
          chip="Lifetime"
          value={<MoneyText value={toNumber(lifetimeSums._sum.amount)} money={fmt.moneyExact} />}
          hint={incomeBreakdown("Lifetime income, by category", lifetimeByCategory, lifetimeSums._sum)}
        />
        <StatCard
          label="Tax withheld"
          chip="Lifetime"
          value={<MoneyText value={toNumber(lifetimeSums._sum.taxWithheld)} money={fmt.money} />}
          hint={
            <Breakdown
              title="Tax withheld, by year"
              rows={taxByYear.map((r) => ({
                label: `${yearLabel(r.year)} (${fmt.number(Number(r.count))} entries)`,
                value: fmt.money(toNumber(r.tax)),
              }))}
              total={{ label: "Total", value: fmt.money(toNumber(lifetimeSums._sum.taxWithheld)) }}
              empty="No tax withheld recorded."
              note="Tax deducted at source, as entered on each income transaction. By the year the income is for."
            />
          }
        />
        <StatCard
          label="Income this year"
          chip={yearLabel(thisYear)}
          value={<MoneyText value={toNumber(thisYearSums._sum.amount)} money={fmt.moneyExact} />}
          hint={incomeBreakdown(`Income in ${yearLabel(thisYear)}, by category`, thisYearByCategory, thisYearSums._sum)}
        >
          <span className="text-xs text-muted-foreground">{fmt.money(toNumber(thisYearSums._sum.taxWithheld))} tax withheld</span>
        </StatCard>
        {year && (
          <StatCard
            label={monthLabel ? "Selected month" : "Selected year"}
            chip={monthLabel ?? yearLabel(year)}
            value={<MoneyText value={toNumber(filteredSums._sum.amount)} money={fmt.moneyExact} />}
            hint={incomeBreakdown(`Income in ${monthLabel ?? yearLabel(year)}, by category`, filteredByCategory, filteredSums._sum)}
          >
            <span className="text-xs text-muted-foreground">{fmt.money(toNumber(filteredSums._sum.taxWithheld))} tax withheld</span>
          </StatCard>
        )}
      </div>

      {chartEntries.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="flex flex-col gap-6 lg:col-span-3">
            <Card title={`Income by month — ${yearLabel(chartYear)}`}>
              <StackedMonthlyBars
                points={chartPoints}
                series={series}
                title={`Income by month and type, ${yearLabel(chartYear)}`}
                language={fmt.language}
                numerals={fmt.numerals}
              />
            </Card>
            <Card title={`By type — ${yearLabel(chartYear)}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Income</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.map((s) => {
                    const t = yearByType.get(s.key)!;
                    return (
                      <TableRow key={s.key}>
                        <TableCell>
                          <span className="flex items-center gap-2">
                            <span aria-hidden className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
                            {s.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt.number(t.count)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt.moneyExact(t.amount)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {yearTotal > 0 ? `${fmt.number(Math.round((t.amount / yearTotal) * 100))}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.tax > 0 ? fmt.money(t.tax) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
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
                    <TableCell className="whitespace-normal">
                      {m.count > 0 ? (
                        <Link
                          href={`/income-ledger?month=${m.date.toISOString().slice(0, 7)}#entries`}
                          aria-current={month === m.date.toISOString().slice(0, 7) ? "true" : undefined}
                          className="font-medium text-link hover:underline"
                        >
                          {m.fullLabel}
                        </Link>
                      ) : (
                        m.fullLabel
                      )}
                      {m.count > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {series
                            .filter((s) => m.byType[s.key])
                            .map((s) => s.label)
                            .join(" · ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.count > 0 ? fmt.moneyExact(m.value) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.tax > 0 ? fmt.money(m.tax) : "—"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold hover:bg-transparent">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.moneyExact(yearTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.money(months.reduce((s, m) => s + m.tax, 0))}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        </div>
      )}

      <Card
        id="entries"
        title={monthLabel ? `Income for ${monthLabel}` : year ? `Income in ${yearLabel(year)}` : "All income"}
        description={
          monthLabel ? (
            <Link href={`/income-ledger?year=${year}`} className="text-link hover:underline">
              Show all of {yearLabel(year!)}
            </Link>
          ) : undefined
        }
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
                    {e.incomeMonth && <span className="block text-xs font-normal text-muted-foreground">for {fmt.monthYear(e.incomeMonth)}</span>}
                  </TableCell>
                  <TableCell label="Source" className="whitespace-normal">
                    <span className="font-medium">{e.note ?? e.category?.name ?? "Income"}</span>
                    {e.note && e.category && <span className="block text-xs text-muted-foreground">{e.category.name}</span>}
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
