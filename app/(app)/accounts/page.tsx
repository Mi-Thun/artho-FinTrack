import Link from "next/link";
import { Landmark, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { formatBDT } from "@/lib/currency";
import { Card } from "@/components/Card";
import { Modal, ModalForm } from "@/components/Modal";
import { EditModal } from "@/components/EditModal";
import { Select } from "@/components/Select";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditField } from "@/components/EditField";
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

const TABS = [
  { key: "accounts", label: "Bank / Cash Accounts" },
  { key: "ledger", label: "Lifetime Income Ledger" },
];

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; edit?: string; sort?: string; dir?: string; page?: string; pageSize?: string }>;
}) {
  const userId = await requireUserId();
  const today = new Date().toISOString().slice(0, 10);
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "accounts";
  const editId = sp.edit;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const accountSort = sp.sort === "kind" || sp.sort === "balance" ? sp.sort : "name";
  const ledgerSort = sp.sort === "amount" || sp.sort === "description" ? sp.sort : "date";

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
      skip: tab === "ledger" ? (page - 1) * pageSize : undefined,
      take: tab === "ledger" ? pageSize : undefined,
    }),
    db.incomeLedgerEntry.count({ where: { userId } }),
  ]);

  const accountExtraParams = { tab: "accounts", sort: accountSort, dir };
  const ledgerExtraParams = { tab: "ledger", sort: ledgerSort, dir };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Landmark size={16} />} crumbs={[{ label: "Accounts" }]} />

      {tab === "accounts" && (
        <Card
          title="Bank / Cash Accounts"
          action={
            <Modal label="Add Account" title="Add Bank / Cash Account">
              <ModalForm action={createAccount} className="flex flex-col gap-3">
                <Input name="name" placeholder="Name" required />
                <Select
                  name="kind"
                  defaultValue="BANK"
                  options={[
                    { value: "BANK", label: "Bank" },
                    { value: "CASH", label: "Cash" },
                    { value: "WALLET", label: "Wallet" },
                  ]}
                />
                <Input name="balance" type="number" step="0.01" placeholder="Balance" required />
                <Button type="submit">Add</Button>
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
                  <TableCell className="text-muted-foreground">{a.kind}</TableCell>
                  <TableCell className="text-right font-medium">{formatBDT(toNumber(a.balance))}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" nativeButton={false} render={<Link href={`/accounts?tab=accounts&edit=${a.id}`} />}>
                        <Pencil size={15} />
                      </Button>
                      <form action={deleteAccount.bind(null, a.id)}>
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete">
                          <Trash2 size={15} />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {accountsTotal > 0 && (
                <TableRow className="font-semibold hover:bg-transparent">
                  <TableCell>Total</TableCell>
                  <TableCell />
                  <TableCell className="text-right">{formatBDT(toNumber(accountsBalanceSum._sum.balance))}</TableCell>
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
                <EditField label="Name">
                  <Input name="name" defaultValue={a.name} required />
                </EditField>
                <EditField label="Kind">
                  <Select
                    name="kind"
                    defaultValue={a.kind}
                    options={[
                      { value: "BANK", label: "Bank" },
                      { value: "CASH", label: "Cash" },
                      { value: "WALLET", label: "Wallet" },
                    ]}
                  />
                </EditField>
                <EditField label="Balance">
                  <Input name="balance" type="number" step="0.01" defaultValue={toNumber(a.balance)} required />
                </EditField>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button variant="secondary" nativeButton={false} render={<Link href="/accounts?tab=accounts" />}>
                    Cancel
                  </Button>
                </div>
              </form>
            </EditModal>
          ))}

      {tab === "ledger" && (
        <Card
          title="Lifetime Income Ledger"
          action={
            <Modal label="Add Entry" title="Add Income Ledger Entry">
              <ModalForm action={createIncomeLedgerEntry} className="flex flex-col gap-3">
                <Input name="date" type="date" defaultValue={today} required />
                <Input name="description" placeholder="Description" required />
                <Input name="amount" type="number" step="0.01" placeholder="Amount" required />
                <Input name="taxWithheld" type="number" step="0.01" placeholder="Tax withheld" />
                <Button type="submit">Add</Button>
              </ModalForm>
            </Modal>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Date" column="date" currentSort={ledgerSort} currentDir={dir} basePath="/accounts" extraParams={ledgerExtraParams} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Description" column="description" currentSort={ledgerSort} currentDir={dir} basePath="/accounts" extraParams={ledgerExtraParams} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Amount" column="amount" currentSort={ledgerSort} currentDir={dir} basePath="/accounts" extraParams={ledgerExtraParams} />
                </TableHead>
                <TableHead className="text-right">Tax Withheld</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {incomeLedger.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>{toDateInput(e.date)}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell className="text-right font-medium">{formatBDT(toNumber(e.amount))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatBDT(toNumber(e.taxWithheld))} tax</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" nativeButton={false} render={<Link href={`/accounts?tab=ledger&edit=${e.id}`} />}>
                        <Pencil size={15} />
                      </Button>
                      <form action={deleteIncomeLedgerEntry.bind(null, e.id)}>
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete">
                          <Trash2 size={15} />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {incomeLedger.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-4 text-center text-muted-foreground">
                    No income ledger entries yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination page={page} pageSize={pageSize} total={incomeLedgerTotal} basePath="/accounts" extraParams={ledgerExtraParams} />
        </Card>
      )}

      {tab === "ledger" &&
        editId &&
        incomeLedger
          .filter((e) => e.id === editId)
          .map((e) => (
            <EditModal key={e.id} title="Edit Income Ledger Entry" closeHref="/accounts?tab=ledger">
              <form action={updateIncomeLedgerEntry.bind(null, e.id)} className="flex flex-col gap-3">
                <EditField label="Date">
                  <Input name="date" type="date" defaultValue={toDateInput(e.date)} required />
                </EditField>
                <EditField label="Description">
                  <Input name="description" defaultValue={e.description} required />
                </EditField>
                <EditField label="Amount">
                  <Input name="amount" type="number" step="0.01" defaultValue={toNumber(e.amount)} required />
                </EditField>
                <EditField label="Tax withheld">
                  <Input name="taxWithheld" type="number" step="0.01" defaultValue={toNumber(e.taxWithheld)} />
                </EditField>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button variant="secondary" nativeButton={false} render={<Link href="/accounts?tab=ledger" />}>
                    Cancel
                  </Button>
                </div>
              </form>
            </EditModal>
          ))}
    </div>
  );
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
