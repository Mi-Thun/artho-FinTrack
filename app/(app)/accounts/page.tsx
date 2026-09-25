import Link from "next/link";
import { BookOpen, Landmark, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue, toDateInput } from "@/lib/dates";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { RowActions } from "@/components/RowActions";
import { MoneyText } from "@/components/MoneyText";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
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
        title="Accounts"
        description="Bank accounts, mobile wallets and cash — where your money sits today."
        actions={
          <>
          <Modal
            closeOnNavigate={false}
            label="Income ledger"
            title="Lifetime income ledger"
            description="A lifetime record of income received and tax withheld at source."
            variant="secondary"
            size="wide"
            icon={<BookOpen size={15} />}
          >
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
          <Modal label="Add account" title="Add account">
            <ModalForm action={createAccount} className="flex flex-col gap-3" successMessage="Account added">
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
          </>
        }
      />

      {tab === "accounts" && accountsTotal > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Total across accounts"
            icon={<Landmark size={16} />}
            value={<MoneyText value={toNumber(accountsBalanceSum._sum.balance)} money={fmt.moneyExact} />}
          />
        </div>
      )}

      {tab === "accounts" && (
        <Card title="All accounts">
          {accountsTotal === 0 ? (
            <EmptyState
              icon={<Landmark size={18} />}
              title="No accounts yet"
              description="Add the bank accounts, mobile wallets (Bkash, Nagad, Upay) and cash you track, with today's balance."
            />
          ) : (
          <Table responsive>
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
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell primary>{a.name}</TableCell>
                  <TableCell label="Kind" className="text-muted-foreground">{KIND_LABELS[a.kind] ?? a.kind}</TableCell>
                  <TableCell label="Balance" className="text-right font-medium">
                    <MoneyText value={toNumber(a.balance)} money={fmt.moneyExact} />
                  </TableCell>
                  <TableCell actions className="text-right">
                    <RowActions
                      label={`Actions for ${a.name}`}
                      actions={[
                        { kind: "link", label: "Edit", href: `/accounts?tab=accounts&edit=${a.id}`, icon: <Pencil size={14} /> },
                        {
                          kind: "confirm",
                          label: "Delete",
                          icon: <Trash2 size={14} />,
                          action: deleteAccount.bind(null, a.id),
                          title: `Delete ${a.name}?`,
                          description: `Its transactions are kept but will no longer be linked to an account.`,
                          successMessage: "Account deleted",
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
          <Pagination page={page} pageSize={pageSize} total={accountsTotal} basePath="/accounts" extraParams={accountExtraParams} />
        </Card>
      )}

      {tab === "accounts" &&
        editId &&
        accounts
          .filter((a) => a.id === editId)
          .map((a) => (
            <EditModal key={a.id} title={`Edit ${a.name}`} closeHref="/accounts?tab=accounts">
              <ValidatedForm action={updateAccount.bind(null, a.id)} className="flex flex-col gap-3">
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
              </ValidatedForm>
            </EditModal>
          ))}

      {editId &&
        incomeLedger
          .filter((e) => e.id === editId)
          .map((e) => (
            <EditModal key={e.id} title="Edit ledger entry" closeHref="/accounts">
              <ValidatedForm action={updateIncomeLedgerEntry.bind(null, e.id)} className="flex flex-col gap-3">
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
              </ValidatedForm>
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
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Modal label="Add entry" title="Add ledger entry" size="compact">
          <ModalForm action={createIncomeLedgerEntry} className="flex flex-col gap-3" successMessage="Ledger entry added">
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
      </div>
      <Table responsive>
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
            <TableHead className="text-right">Tax withheld</TableHead>
            <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {incomeLedger.map((e) => (
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
                    { kind: "link", label: "Edit", href: `/accounts?edit=${e.id}`, icon: <Pencil size={14} /> },
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
          {incomeLedger.length === 0 && (
            <TableRow>
              <TableCell empty colSpan={5} className="py-4 text-center text-muted-foreground">No ledger entries yet.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Pagination page={ledgerPage} pageSize={ledgerPageSize} total={incomeLedgerTotal} basePath="/accounts" pageParam="ledgerPage" pageSizeParam="ledgerPageSize" extraParams={ledgerExtraParams} />
    </div>
  );
}
