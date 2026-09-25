import Link from "next/link";
import { BookOpen, Landmark, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue, toDateInput } from "@/lib/dates";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { EditModal } from "@/components/EditModal";
import { Select } from "@/components/Select";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  createAccount,
  createIncomeLedgerEntry,
  deleteAccount,
  deleteIncomeLedgerEntry,
  updateAccount,
  updateIncomeLedgerEntry,
} from "./actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

const KIND_OPTIONS = [
  { value: "BANK", label: "Bank account" },
  { value: "WALLET", label: "Mobile wallet" },
  { value: "CASH", label: "Cash" },
];
const KIND_LABELS: Record<string, string> = { BANK: "Bank", WALLET: "Mobile wallet", CASH: "Cash" };

function editCancel(href: string) {
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
      Cancel
    </Button>
  );
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; edit?: string; sort?: string; dir?: string; page?: string; pageSize?: string; ledgerPage?: string; ledgerPageSize?: string; ledgerSort?: string; ledgerDir?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const today = todayInputValue();
  const sp = await searchParams;
  const tab = "accounts";
  const editId = sp.edit;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";
  const ledgerPage = Math.max(1, Number(sp.ledgerPage) || 1);
  const ledgerPageSize = [10, 25, 50, 100].includes(Number(sp.ledgerPageSize)) ? Number(sp.ledgerPageSize) : 25;
  const ledgerDir: "asc" | "desc" = sp.ledgerDir === "asc" ? "asc" : "desc";

  const accountSort = sp.sort === "kind" || sp.sort === "balance" ? sp.sort : "name";
  const ledgerSort = sp.ledgerSort === "amount" || sp.ledgerSort === "description" ? sp.ledgerSort : "date";

  const [
    accounts,
    accountsTotal,
    accountsBalanceSum,
    incomeLedger,
    incomeLedgerTotal,
  ] = await Promise.all([
    db.account.findMany({
      where: { userId },
      orderBy: { [accountSort]: dir },
      skip: tab === "accounts" ? (page - 1) * pageSize : undefined,
      take: tab === "accounts" ? pageSize : undefined,
    }),
    db.account.count({ where: { userId } }),
    db.account.aggregate({ where: { userId }, _sum: { balance: true } }),
    db.incomeLedgerEntry.findMany({
      where: { userId },
      orderBy: { [ledgerSort]: dir },
      skip: (ledgerPage - 1) * ledgerPageSize,
      take: ledgerPageSize,
    }),
    db.incomeLedgerEntry.count({ where: { userId } }),
  ]);

  const accountExtraParams = { tab: "accounts", sort: accountSort, dir };
  const ledgerExtraParams = { ledgerSort, ledgerDir, sort: accountSort, dir, page: String(page), pageSize: String(pageSize) };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Landmark size={16} />}
        crumbs={[{ label: "Accounts" }]}
        actions={
          <Modal label="Lifetime Income Ledger" title="Lifetime Income Ledger" variant="secondary" size="wide" icon={<BookOpen size={15} />}>
            <LedgerModule
              fmt={fmt}
              today={today}
              ledgerSort={ledgerSort}
              ledgerDir={ledgerDir}
              ledgerPage={ledgerPage}
              ledgerPageSize={ledgerPageSize}
              incomeLedger={incomeLedger}
              incomeLedgerTotal={incomeLedgerTotal}
              ledgerExtraParams={ledgerExtraParams}
            />
          </Modal>
        }
      />

      {tab === "accounts" && (
        <Card
          title="Bank / Cash Accounts"
          action={
            <Modal label="Add Account" title="Add Bank / Cash Account">
              <ModalForm action={createAccount} className="flex flex-col gap-3">
                <Field label="Name" required>
                  <Input name="name" required autoFocus placeholder="e.g. City Bank, Bkash" />
                </Field>
                <Field label="Kind" required>
                  <Select name="kind" defaultValue="BANK" options={KIND_OPTIONS} />
                </Field>
                <Field label="Current balance" required>
                  <MoneyInput name="balance" required allowNegative />
                </Field>
                <FormActions submitLabel="Add account" cancel={<ModalCancel />} />
              </ModalForm>
            </Modal>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Name" column="name" currentSort={accountSort} currentDir={dir} basePath="/accounts" extraParams={accountExtraParams} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Kind" column="kind" currentSort={accountSort} currentDir={dir} basePath="/accounts" extraParams={accountExtraParams} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Balance" column="balance" currentSort={accountSort} currentDir={dir} basePath="/accounts" extraParams={accountExtraParams} />
                </TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.name}</TableCell>
                  <TableCell className="text-muted-foreground">{KIND_LABELS[a.kind] ?? a.kind}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmt.money(toNumber(a.balance))}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit account ${a.name}`} title="Edit" nativeButton={false} render={<Link href={`/accounts?tab=accounts&edit=${a.id}`} />}>
                        <Pencil size={15} />
                      </Button>
                      <ConfirmDelete
                        action={deleteAccount.bind(null, a.id)}
                        label={`Delete account ${a.name}`}
                        message={`Delete ${a.name}? Its transactions are kept but will no longer be linked to an account.`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {accountsTotal > 0 && (
                <TableRow className="font-semibold hover:bg-transparent">
                  <TableCell>Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">{fmt.money(toNumber(accountsBalanceSum._sum.balance))}</TableCell>
                  <TableCell />
                </TableRow>
              )}
              {accountsTotal === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-4 text-center text-muted-foreground">
                    No accounts yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={accountsTotal} basePath="/accounts" extraParams={accountExtraParams} />
        </Card>
      )}

      {tab === "accounts" &&
        editId &&
        accounts
          .filter((a) => a.id === editId)
          .map((a) => (
            <EditModal key={a.id} title="Edit Bank / Cash Account" closeHref="/accounts?tab=accounts">
              <form action={updateAccount.bind(null, a.id)} className="flex flex-col gap-3">
                <Field label="Name" required>
                  <Input name="name" defaultValue={a.name} required />
                </Field>
                <Field label="Kind" required>
                  <Select name="kind" defaultValue={a.kind} options={KIND_OPTIONS} />
                </Field>
                <Field
                  label="Balance"
                  required
                  hint="Editing the balance directly doesn't create a transaction — use it to correct a count, not to record spending."
                >
                  <MoneyInput name="balance" defaultValue={toNumber(a.balance)} required allowNegative />
                </Field>
                <FormActions submitLabel="Save changes" cancel={editCancel("/accounts?tab=accounts")} />
              </form>
            </EditModal>
          ))}

      {editId &&
        incomeLedger
          .filter((e) => e.id === editId)
          .map((e) => (
            <EditModal key={e.id} title="Edit Income Ledger Entry" closeHref="/accounts">
              <form action={updateIncomeLedgerEntry.bind(null, e.id)} className="flex flex-col gap-3">
                <Field label="Date" required>
                  <Input name="date" type="date" defaultValue={toDateInput(e.date)} required />
                </Field>
                <Field label="Description" required>
                  <Input name="description" defaultValue={e.description} required />
                </Field>
                <Field label="Amount" required>
                  <MoneyInput name="amount" defaultValue={toNumber(e.amount)} required />
                </Field>
                <Field label="Tax withheld">
                  <MoneyInput name="taxWithheld" defaultValue={toNumber(e.taxWithheld)} />
                </Field>
                <FormActions submitLabel="Save changes" cancel={editCancel("/accounts")} />
              </form>
            </EditModal>
          ))}
    </div>
  );
}

function LedgerModule({
  fmt,
  today,
  ledgerSort,
  ledgerDir,
  ledgerPage,
  ledgerPageSize,
  incomeLedger,
  incomeLedgerTotal,
  ledgerExtraParams,
}: {
  fmt: Awaited<ReturnType<typeof getLocalisation>>["fmt"];
  today: string;
  ledgerSort: string;
  ledgerDir: "asc" | "desc";
  ledgerPage: number;
  ledgerPageSize: number;
  incomeLedger: { id: string; date: Date; description: string; amount: unknown; taxWithheld: unknown }[];
  incomeLedgerTotal: number;
  ledgerExtraParams: Record<string, string>;
}) {
  return (
    <Card
      title="Lifetime Income Ledger"
      action={
        <Modal label="Add Entry" title="Add Income Ledger Entry" size="compact">
          <ModalForm action={createIncomeLedgerEntry} className="flex flex-col gap-3">
            <Field label="Date" required>
              <Input name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Description" required>
              <Input name="description" required placeholder="e.g. Salary — September" />
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableHeader label="Date" column="date" currentSort={ledgerSort} currentDir={ledgerDir} basePath="/accounts" sortParam="ledgerSort" dirParam="ledgerDir" extraParams={ledgerExtraParams} />
            </TableHead>
            <TableHead>
              <SortableHeader label="Description" column="description" currentSort={ledgerSort} currentDir={ledgerDir} basePath="/accounts" sortParam="ledgerSort" dirParam="ledgerDir" extraParams={ledgerExtraParams} />
            </TableHead>
            <TableHead className="text-right">
              <SortableHeader label="Amount" column="amount" currentSort={ledgerSort} currentDir={ledgerDir} basePath="/accounts" sortParam="ledgerSort" dirParam="ledgerDir" extraParams={ledgerExtraParams} />
            </TableHead>
            <TableHead className="text-right">Tax Withheld</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incomeLedger.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">{fmt.date(e.date, DATE_FORMAT)}</TableCell>
              <TableCell>{e.description}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{fmt.money(toNumber(e.amount))}</TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">{fmt.money(toNumber(e.taxWithheld))}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label="Edit ledger entry" title="Edit" nativeButton={false} render={<Link href={`/accounts?edit=${e.id}`} />}>
                    <Pencil size={15} />
                  </Button>
                  <ConfirmDelete
                    action={deleteIncomeLedgerEntry.bind(null, e.id)}
                    label="Delete ledger entry"
                    message={`Delete "${e.description}" (${fmt.money(toNumber(e.amount))})? This can't be undone.`}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
          {incomeLedger.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-4 text-center text-muted-foreground">No income ledger entries yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Pagination page={ledgerPage} pageSize={ledgerPageSize} total={incomeLedgerTotal} basePath="/accounts" pageParam="ledgerPage" pageSizeParam="ledgerPageSize" extraParams={ledgerExtraParams} />
    </Card>
  );
}
