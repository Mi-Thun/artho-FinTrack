import Link from "next/link";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue, toDateInput } from "@/lib/dates";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { MoneyText } from "@/components/MoneyText";
import { StatCard } from "@/components/StatCard";
import { RowActions } from "@/components/RowActions";
import { EmptyState } from "@/components/EmptyState";
import { InfoHint } from "@/components/InfoHint";
import { MonthlyBars } from "@/components/charts/MonthlyBars";
import { EditModal } from "@/components/EditModal";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { createIncomeLedgerEntry, deleteIncomeLedgerEntry, updateIncomeLedgerEntry } from "../accounts/actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

/**
 * A lifetime record of income received and tax withheld at source — the figures a tax
 * return asks for. Moved out of a dialog on Accounts into a page of its own.
 */
export default async function IncomeLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; edit?: string; sort?: string; dir?: string; page?: string; pageSize?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const sp = await searchParams;
  const sort = sp.sort === "amount" || sp.sort === "description" ? sp.sort : "date";
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;

  // Years that have entries, newest first, for the filter.
  const years = (
    await db.$queryRaw<{ year: number }[]>(
      Prisma.sql`SELECT DISTINCT EXTRACT(YEAR FROM "date")::int AS year FROM "IncomeLedgerEntry" WHERE "userId" = ${userId} ORDER BY year DESC`,
    )
  ).map((r) => r.year);
  const year = sp.year && years.includes(Number(sp.year)) ? Number(sp.year) : null;
  const thisYear = Number(todayInputValue().slice(0, 4));

  const where: Prisma.IncomeLedgerEntryWhereInput = {
    userId,
    ...(year ? { date: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } } : {}),
  };
  const [entries, total, filteredSums, lifetimeSums, thisYearSums] = await Promise.all([
    db.incomeLedgerEntry.findMany({ where, orderBy: { [sort]: dir }, skip: (page - 1) * pageSize, take: pageSize }),
    db.incomeLedgerEntry.count({ where }),
    db.incomeLedgerEntry.aggregate({ where, _sum: { amount: true, taxWithheld: true } }),
    db.incomeLedgerEntry.aggregate({ where: { userId }, _sum: { amount: true, taxWithheld: true } }),
    db.incomeLedgerEntry.aggregate({
      where: { userId, date: { gte: new Date(Date.UTC(thisYear, 0, 1)), lt: new Date(Date.UTC(thisYear + 1, 0, 1)) } },
      _sum: { amount: true },
    }),
  ]);

  // Chart: the selected year, or the latest year with entries when none is selected.
  const chartYear = year ?? years[0] ?? thisYear;
  const chartEntries = await db.incomeLedgerEntry.findMany({
    where: { userId, date: { gte: new Date(Date.UTC(chartYear, 0, 1)), lt: new Date(Date.UTC(chartYear + 1, 0, 1)) } },
    select: { date: true, amount: true },
  });
  const byMonth = Array.from({ length: 12 }, (_, m) => {
    const d = new Date(Date.UTC(chartYear, m, 1));
    return { label: fmt.monthShort(d).split(" ")[0], fullLabel: fmt.monthYear(d), value: 0 };
  });
  for (const e of chartEntries) byMonth[e.date.getUTCMonth()].value += toNumber(e.amount);

  const params = { year: year ? String(year) : undefined, sort, dir };
  const listHref = year ? `/income-ledger?year=${year}` : "/income-ledger";
  const editing = sp.edit ? entries.find((e) => e.id === sp.edit) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Income ledger"
        description="A lifetime record of income received and tax withheld at source."
        actions={
          <Modal label="Add entry" title="Add ledger entry" size="compact" openParam="ledger">
            <ModalForm action={createIncomeLedgerEntry} className="flex flex-col gap-3" successMessage="Ledger entry added">
              <Field label="Date" required>
                <Input name="date" type="date" defaultValue={todayInputValue()} required />
              </Field>
              <Field label="Description" required>
                <Input name="description" required placeholder="e.g. Salary — September" autoFocus />
              </Field>
              <Field label="Amount" required>
                <MoneyInput name="amount" required />
              </Field>
              <Field label="Tax withheld">
                <MoneyInput name="taxWithheld" />
              </Field>
              <FormActions submitLabel="Add entry" cancel={<ModalCancel />} />
            </ModalForm>
          </Modal>
        }
      >
        {years.length > 0 && (
          <form action="/income-ledger" className="flex items-center gap-2">
            <AutoSubmitSelect
              ariaLabel="Year"
              name="year"
              defaultValue={year ? String(year) : ""}
              options={[{ value: "", label: "All years" }, ...years.map((y) => ({ value: String(y), label: fmt.number(y, { useGrouping: false }) }))]}
            />
          </form>
        )}
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Lifetime income" chip="Lifetime" value={<MoneyText value={toNumber(lifetimeSums._sum.amount)} money={fmt.money} />} />
        <StatCard
          label="Tax withheld"
          chip="Lifetime"
          value={<MoneyText value={toNumber(lifetimeSums._sum.taxWithheld)} money={fmt.money} />}
        />
        <StatCard
          label="Income this year"
          chip={fmt.number(thisYear, { useGrouping: false })}
          value={<MoneyText value={toNumber(thisYearSums._sum.amount)} money={fmt.money} />}
        />
        {year && (
          <StatCard
            label="Selected year"
            chip={fmt.number(year, { useGrouping: false })}
            value={<MoneyText value={toNumber(filteredSums._sum.amount)} money={fmt.money} />}
          >
            <span className="text-xs text-muted-foreground">
              {fmt.money(toNumber(filteredSums._sum.taxWithheld))} tax withheld
            </span>
          </StatCard>
        )}
      </div>

      {chartEntries.length > 0 && (
        <Card title={`Income by month — ${fmt.number(chartYear, { useGrouping: false })}`}>
          <MonthlyBars points={byMonth} seriesLabel="Income" language={fmt.language} numerals={fmt.numerals} />
        </Card>
      )}

      <Card
        title={year ? `Entries in ${fmt.number(year, { useGrouping: false })}` : "All entries"}
        action={
          <InfoHint label="How the ledger relates to transactions">
            If you also log salary and bonus as Transactions, they appear in both places. The dashboard&apos;s Lifetime
            income uses this ledger when it has entries and falls back to income transactions otherwise — the two are
            never added together, so nothing is double-counted.
          </InfoHint>
        }
      >
        {total === 0 ? (
          <EmptyState
            icon={<BookOpen size={18} />}
            title="No ledger entries"
            description="Record each salary, bonus or other income with the tax deducted at source."
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Date" column="date" currentSort={sort} currentDir={dir} basePath="/income-ledger" extraParams={params} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Description" column="description" currentSort={sort} currentDir={dir} basePath="/income-ledger" extraParams={params} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Amount" column="amount" currentSort={sort} currentDir={dir} basePath="/income-ledger" extraParams={params} />
                </TableHead>
                <TableHead className="text-right">Tax withheld</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((e) => (
                <TableRow key={e.id}>
                  <TableCell primary className="whitespace-nowrap">{fmt.day(e.date)}</TableCell>
                  <TableCell label="Description">{e.description}</TableCell>
                  <TableCell label="Amount" className="text-right font-medium">
                    <MoneyText value={toNumber(e.amount)} money={fmt.money} />
                  </TableCell>
                  <TableCell label="Tax withheld" className="text-right text-muted-foreground">
                    <MoneyText value={toNumber(e.taxWithheld)} money={fmt.money} />
                  </TableCell>
                  <TableCell actions className="text-right">
                    <RowActions
                      label={`Actions for ledger entry ${e.description}`}
                      actions={[
                        { kind: "link", label: "Edit", href: `${listHref}${year ? "&" : "?"}edit=${e.id}`, icon: <Pencil size={14} /> },
                        {
                          kind: "confirm",
                          label: "Delete",
                          icon: <Trash2 size={14} />,
                          action: deleteIncomeLedgerEntry.bind(null, e.id),
                          title: "Delete ledger entry?",
                          description: `Delete "${e.description}" (${fmt.money(toNumber(e.amount))})? This can't be undone.`,
                          successMessage: "Ledger entry deleted",
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

      {editing && (
        <EditModal title="Edit ledger entry" closeHref={listHref}>
          <ValidatedForm action={updateIncomeLedgerEntry.bind(null, editing.id)} className="flex flex-col gap-3">
            <Field label="Date" required>
              <Input name="date" type="date" defaultValue={toDateInput(editing.date)} required />
            </Field>
            <Field label="Description" required>
              <Input name="description" defaultValue={editing.description} required />
            </Field>
            <Field label="Amount" required>
              <MoneyInput name="amount" defaultValue={toNumber(editing.amount)} required />
            </Field>
            <Field label="Tax withheld">
              <MoneyInput name="taxWithheld" defaultValue={toNumber(editing.taxWithheld)} />
            </Field>
            <FormActions
              submitLabel="Save changes"
              cancel={
                <Button variant="outline" nativeButton={false} render={<Link href={listHref} />}>
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
