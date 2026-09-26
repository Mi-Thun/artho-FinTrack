import { Pause, Play, Repeat, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { MoneyText } from "@/components/MoneyText";
import { RowActions } from "@/components/RowActions";
import { EmptyState } from "@/components/EmptyState";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { TransactionTypeFields } from "@/components/TransactionTypeFields";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { createRecurringTransaction, deleteRecurringTransaction, toggleRecurringTransaction } from "../transactions/actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

/** Recurring transactions: logged automatically each month. Moved out of a Transactions dialog. */
export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string; page?: string; pageSize?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const sp = await searchParams;
  const sort = sp.sort === "type" || sp.sort === "amount" ? sp.sort : "dayOfMonth";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;

  const [recurring, total, categories] = await Promise.all([
    db.recurringTransaction.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.recurringTransaction.count({ where: { userId } }),
    db.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  const addModal = (
    <Modal label="Add recurring" title="Add recurring transaction" openParam="recurring">
      <ModalForm action={createRecurringTransaction} className="flex flex-col gap-3" successMessage="Recurring transaction added">
        <Field label="Amount" required>
          <MoneyInput name="amount" required positive autoFocus />
        </Field>
        <Field label="Day of month" required hint="Logged automatically on this day each month.">
          <Input name="dayOfMonth" type="number" min="1" max="31" required />
        </Field>
        <TransactionTypeFields categories={categories} />
        <Field label="Note">
          <Input name="note" type="text" />
        </Field>
        <FormActions submitLabel="Add recurring" cancel={<ModalCancel />} />
      </ModalForm>
    </Modal>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recurring"
        description="Income and expenses logged automatically every month — salary on the 1st, rent on the 5th."
        actions={addModal}
      />
      <Card>
        {total === 0 ? (
          <EmptyState
            icon={<Repeat size={18} />}
            title="No recurring transactions"
            description="Set up the ones that repeat every month so you don't have to enter them by hand."
          />
        ) : (
        <Table responsive>
          <TableHeader><TableRow>
            <TableHead><SortableHeader label="Type" column="type" currentSort={sort} currentDir={dir} basePath="/recurring" /></TableHead>
            <TableHead className="text-right"><SortableHeader label="Amount" column="amount" currentSort={sort} currentDir={dir} basePath="/recurring" /></TableHead>
            <TableHead><SortableHeader label="Day" column="dayOfMonth" currentSort={sort} currentDir={dir} basePath="/recurring" /></TableHead>
            <TableHead>Category</TableHead><TableHead>Note</TableHead><TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
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
        )}
        <Pagination page={page} pageSize={pageSize} total={total} basePath="/recurring" extraParams={{ sort, dir }} />
      </Card>
    </div>
  );
}
