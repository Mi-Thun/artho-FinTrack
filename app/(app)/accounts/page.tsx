import Link from "next/link";
import { Banknote, Landmark, Pencil, Smartphone, Trash2 } from "lucide-react";
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
import { Breakdown } from "@/components/Breakdown";
import { EmptyState } from "@/components/EmptyState";
import { EditModal } from "@/components/EditModal";
import { Select } from "@/components/Select";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
const KIND_GROUPS = [
  { kind: "BANK", label: "Bank accounts", icon: Landmark },
  { kind: "WALLET", label: "Mobile wallets", icon: Smartphone },
  { kind: "CASH", label: "Cash", icon: Banknote },
] as const;

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
  searchParams: Promise<{ edit?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const { edit: editId } = await searchParams;

  // People have a handful of accounts, not pages of them: fetch all, grouped by kind below.
  const [accounts, accountsBalanceSum] = await Promise.all([
    db.account.findMany({ where: { userId }, orderBy: { name: "asc" } }),
    db.account.aggregate({ where: { userId }, _sum: { balance: true } }),
  ]);
  const accountsTotal = accounts.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
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

      {accountsTotal === 0 ? (
        <Card>
          <EmptyState
            icon={<Landmark size={18} />}
            title="No accounts yet"
            description="Add the bank accounts, mobile wallets (Bkash, Nagad, Upay) and cash you want to keep an eye on, with what's in each."
          />
        </Card>
      ) : (
        <>
          <StatCard
            size="hero"
            className="sm:max-w-sm"
            label="Total across accounts"
            icon={<Landmark size={16} />}
            value={<MoneyText value={toNumber(accountsBalanceSum._sum.balance)} money={fmt.moneyExact} />}
            hint={
              <Breakdown
                title="Total, by type"
                rows={KIND_GROUPS.filter((g) => accounts.some((a) => a.kind === g.kind)).map((g) => ({
                  label: g.label,
                  value: fmt.moneyExact(accounts.filter((a) => a.kind === g.kind).reduce((sum, a) => sum + toNumber(a.balance), 0)),
                }))}
                total={{ label: "Total", value: fmt.moneyExact(toNumber(accountsBalanceSum._sum.balance)) }}
              />
            }
          />
          <Card>
            <Table responsive>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Banks, then wallets, then cash; A–Z within each. */}
                {KIND_GROUPS.flatMap((group) =>
                  accounts
                    .filter((a) => a.kind === group.kind)
                    .map((a) => {
                      const Icon = group.icon;
                      return (
                        <TableRow key={a.id}>
                          <TableCell primary>
                            <span className="flex items-center gap-2 font-medium">
                              <Icon size={15} className="shrink-0 text-muted-foreground" aria-hidden />
                              {a.name}
                            </span>
                          </TableCell>
                          <TableCell label="Type" className="text-muted-foreground">
                            {KIND_OPTIONS.find((k) => k.value === a.kind)?.label}
                          </TableCell>
                          <TableCell label="Balance" className="text-right font-medium tabular-nums">
                            <MoneyText value={toNumber(a.balance)} money={fmt.moneyExact} />
                          </TableCell>
                          <TableCell actions className="text-right">
                            <RowActions
                              label={`Actions for ${a.name}`}
                              actions={[
                                { kind: "link", label: "Edit", href: `/accounts?edit=${a.id}`, icon: <Pencil size={14} /> },
                                {
                                  kind: "confirm",
                                  label: "Delete",
                                  icon: <Trash2 size={14} />,
                                  action: deleteAccount.bind(null, a.id),
                                  title: `Delete ${a.name}?`,
                                  description: "Removes this account and its balance. Nothing else changes.",
                                  successMessage: "Account deleted",
                                },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                      );
                    }),
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {editId &&
        accounts
          .filter((a) => a.id === editId)
          .map((a) => (
            <EditModal key={a.id} title={`Edit ${a.name}`} closeHref="/accounts">
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
                  hint="Update it whenever you check, e.g. at the start of each month. Nothing else changes it."
                >
                  <MoneyInput name="balance" defaultValue={toNumber(a.balance)} required allowNegative />
                </Field>
                <FormActions submitLabel="Save changes" cancel={editCancel("/accounts")} />
              </ValidatedForm>
            </EditModal>
          ))}


    </div>
  );
}
