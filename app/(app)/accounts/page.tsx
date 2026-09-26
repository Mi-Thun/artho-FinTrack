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
import { EmptyState } from "@/components/EmptyState";
import { EditModal } from "@/components/EditModal";
import { Select } from "@/components/Select";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
        description="What you have in each bank, wallet and cash — a record you update yourself. It isn't used in any other page or total."
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
            hint="The sum of the balances you entered. For viewing only — it isn't counted in net worth or anywhere else."
          />
          {KIND_GROUPS.map((group) => {
            const inGroup = accounts.filter((a) => a.kind === group.kind);
            if (inGroup.length === 0) return null;
            const subtotal = inGroup.reduce((sum, a) => sum + toNumber(a.balance), 0);
            const Icon = group.icon;
            return (
              <section key={group.kind} aria-labelledby={`group-${group.kind}`} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id={`group-${group.kind}`} className="text-base font-semibold">
                    {group.label}
                  </h2>
                  <span className="text-sm text-muted-foreground tabular-nums">{fmt.moneyExact(subtotal)}</span>
                </div>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {inGroup.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-link" aria-hidden>
                        <Icon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="text-lg font-semibold tabular-nums">
                          <MoneyText value={toNumber(a.balance)} money={fmt.moneyExact} />
                        </p>
                      </div>
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
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
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
