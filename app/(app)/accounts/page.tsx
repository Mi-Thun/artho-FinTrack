import Link from "next/link";
import { BookOpen, Landmark, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
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
  deleteAccount,
  updateAccount,
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
  searchParams: Promise<{ tab?: string; edit?: string; sort?: string; dir?: string; page?: string; pageSize?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const sp = await searchParams;
  const tab = "accounts";
  const editId = sp.edit;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const accountSort = sp.sort === "kind" || sp.sort === "balance" ? sp.sort : "name";

  const [
    accounts,
    accountsTotal,
    accountsBalanceSum,
  ] = await Promise.all([
    db.account.findMany({
      where: { userId },
      orderBy: { [accountSort]: dir },
      skip: tab === "accounts" ? (page - 1) * pageSize : undefined,
      take: tab === "accounts" ? pageSize : undefined,
    }),
    db.account.count({ where: { userId } }),
    db.account.aggregate({ where: { userId }, _sum: { balance: true } }),
  ]);

  const accountExtraParams = { tab: "accounts", sort: accountSort, dir };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        menu={[{ label: "Income ledger", href: "/income-ledger", icon: <BookOpen size={16} /> }]}
        description="Bank accounts, mobile wallets and cash — where your money sits today."
        actions={
          <>
          <Modal label="Add account" title="Add account" openParam="account">
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


    </div>
  );
}
