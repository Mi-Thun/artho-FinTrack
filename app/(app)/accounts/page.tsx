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
import {
  addLoanPayment,
  createAccount,
  createBigPurchase,
  createIncomeLedgerEntry,
  createLoan,
  deleteAccount,
  deleteBigPurchase,
  deleteIncomeLedgerEntry,
  deleteLoan,
  updateAccount,
  updateBigPurchase,
  updateIncomeLedgerEntry,
  updateLoan,
} from "./actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

const TABS = [
  { key: "accounts", label: "Bank / Cash Accounts" },
  { key: "loans", label: "Loans" },
  { key: "purchases", label: "Big Purchases" },
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
  const purchaseSort = sp.sort === "item" || sp.sort === "amount" ? sp.sort : "date";
  const ledgerSort = sp.sort === "amount" || sp.sort === "description" ? sp.sort : "date";

  const [
    accounts,
    accountsTotal,
    accountsBalanceSum,
    loans,
    bigPurchases,
    bigPurchasesTotal,
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
    db.loan.findMany({ where: { userId }, include: { payments: true }, orderBy: { startDate: "desc" } }),
    db.bigPurchase.findMany({
      where: { userId },
      orderBy: { [purchaseSort]: dir },
      skip: tab === "purchases" ? (page - 1) * pageSize : undefined,
      take: tab === "purchases" ? pageSize : undefined,
    }),
    db.bigPurchase.count({ where: { userId } }),
    db.incomeLedgerEntry.findMany({
      where: { userId },
      orderBy: { [ledgerSort]: dir },
      skip: tab === "ledger" ? (page - 1) * pageSize : undefined,
      take: tab === "ledger" ? pageSize : undefined,
    }),
    db.incomeLedgerEntry.count({ where: { userId } }),
  ]);

  const accountExtraParams = { tab: "accounts", sort: accountSort, dir };
  const purchaseExtraParams = { tab: "purchases", sort: purchaseSort, dir };
  const ledgerExtraParams = { tab: "ledger", sort: ledgerSort, dir };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Landmark size={16} />} crumbs={[{ label: "Accounts" }]} description="Balances, loans, big purchases, and your lifetime income ledger." />

      {tab === "accounts" && (
        <Card
          title="Bank / Cash Accounts"
          action={
            <Modal label="Add Account" title="Add Bank / Cash Account">
              <ModalForm action={createAccount} className="flex flex-col gap-3">
                <input name="name" placeholder="Name" required className="input" />
                <Select
                  name="kind"
                  defaultValue="BANK"
                  options={[
                    { value: "BANK", label: "Bank" },
                    { value: "CASH", label: "Cash" },
                    { value: "WALLET", label: "Wallet" },
                  ]}
                />
                <input name="balance" type="number" step="0.01" placeholder="Balance" required className="input" />
                <button type="submit" className="btn-primary">
                  Add
                </button>
              </ModalForm>
            </Modal>
          }
        >
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>
                    <SortableHeader label="Name" column="name" currentSort={accountSort} currentDir={dir} basePath="/accounts" extraParams={accountExtraParams} />
                  </th>
                  <th>
                    <SortableHeader label="Kind" column="kind" currentSort={accountSort} currentDir={dir} basePath="/accounts" extraParams={accountExtraParams} />
                  </th>
                  <th className="text-right">
                    <SortableHeader label="Balance" column="balance" currentSort={accountSort} currentDir={dir} basePath="/accounts" extraParams={accountExtraParams} />
                  </th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td style={{ color: "var(--muted)" }}>
                      {a.kind}
                    </td>
                    <td className="text-right font-medium">
                      {formatBDT(toNumber(a.balance))}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/accounts?tab=accounts&edit=${a.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                          <Pencil size={15} />
                        </Link>
                        <form action={deleteAccount.bind(null, a.id)}>
                          <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                            <Trash2 size={15} />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {accountsTotal > 0 && (
                  <tr className="font-semibold">
                    <td>Total</td>
                    <td />
                    <td className="text-right">{formatBDT(toNumber(accountsBalanceSum._sum.balance))}</td>
                    <td />
                  </tr>
                )}
                {accountsTotal === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center" style={{ color: "var(--muted)" }}>
                      No accounts yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                  <input name="name" defaultValue={a.name} required className="input" />
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
                  <input name="balance" type="number" step="0.01" defaultValue={toNumber(a.balance)} required className="input" />
                </EditField>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href="/accounts?tab=accounts" className="btn-secondary">
                    Cancel
                  </Link>
                </div>
              </form>
            </EditModal>
          ))}

      {tab === "loans" && (
        <Card
          title="Loans"
          action={
            <Modal label="Add Loan" title="Add Loan">
              <ModalForm action={createLoan} className="flex flex-col gap-3">
                <input name="name" placeholder="Loan name" required className="input" />
                <input name="originalAmount" type="number" step="0.01" placeholder="Original amount" required className="input" />
                <input name="startDate" type="date" defaultValue={today} required className="input" />
                <button type="submit" className="btn-primary">
                  Add Loan
                </button>
              </ModalForm>
            </Modal>
          }
        >
          <div className="flex flex-col gap-4">
            {loans.map((l) => {
              const repaid = l.payments.reduce((s, p) => s + toNumber(p.amount), 0);
              const remaining = Math.max(toNumber(l.originalAmount) - repaid, 0);

              return (
                <div key={l.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-medium">{l.name}</span>{" "}
                      <span style={{ color: "var(--muted)" }}>
                        — {formatBDT(remaining)} remaining of {formatBDT(toNumber(l.originalAmount))}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Link href={`/accounts?tab=loans&edit=${l.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                        <Pencil size={15} />
                      </Link>
                      <form action={deleteLoan.bind(null, l.id)}>
                        <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                          <Trash2 size={15} />
                        </button>
                      </form>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Modal label="Record Payment" title={`Record Payment — ${l.name}`} variant="secondary">
                      <ModalForm action={addLoanPayment} className="flex flex-col gap-3">
                        <input type="hidden" name="loanId" value={l.id} />
                        <input name="date" type="date" defaultValue={today} required className="input" />
                        <input name="amount" type="number" step="0.01" placeholder="Payment amount" required className="input" />
                        <button type="submit" className="btn-primary">
                          Record Payment
                        </button>
                      </ModalForm>
                    </Modal>
                  </div>
                </div>
              );
            })}
            {loans.length === 0 && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No loans tracked.
              </p>
            )}
          </div>
        </Card>
      )}

      {tab === "loans" &&
        editId &&
        loans
          .filter((l) => l.id === editId)
          .map((l) => (
            <EditModal key={l.id} title="Edit Loan" closeHref="/accounts?tab=loans">
              <form action={updateLoan.bind(null, l.id)} className="flex flex-col gap-3">
                <EditField label="Name">
                  <input name="name" defaultValue={l.name} required className="input" />
                </EditField>
                <EditField label="Original amount">
                  <input name="originalAmount" type="number" step="0.01" defaultValue={toNumber(l.originalAmount)} required className="input" />
                </EditField>
                <EditField label="Start date">
                  <input name="startDate" type="date" defaultValue={toDateInput(l.startDate)} required className="input" />
                </EditField>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href="/accounts?tab=loans" className="btn-secondary">
                    Cancel
                  </Link>
                </div>
              </form>
            </EditModal>
          ))}

      {tab === "purchases" && (
        <Card
          title="Big Purchases"
          action={
            <Modal label="Add Purchase" title="Add Big Purchase">
              <ModalForm action={createBigPurchase} className="flex flex-col gap-3">
                <input name="item" placeholder="Item" required className="input" />
                <input name="amount" type="number" step="0.01" placeholder="Amount" required className="input" />
                <input name="date" type="date" defaultValue={today} required className="input" />
                <button type="submit" className="btn-primary">
                  Add
                </button>
              </ModalForm>
            </Modal>
          }
        >
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>
                    <SortableHeader label="Item" column="item" currentSort={purchaseSort} currentDir={dir} basePath="/accounts" extraParams={purchaseExtraParams} />
                  </th>
                  <th>
                    <SortableHeader label="Date" column="date" currentSort={purchaseSort} currentDir={dir} basePath="/accounts" extraParams={purchaseExtraParams} />
                  </th>
                  <th className="text-right">
                    <SortableHeader label="Amount" column="amount" currentSort={purchaseSort} currentDir={dir} basePath="/accounts" extraParams={purchaseExtraParams} />
                  </th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {bigPurchases.map((p) => (
                  <tr key={p.id}>
                    <td>{p.item}</td>
                    <td style={{ color: "var(--muted)" }}>{toDateInput(p.date)}</td>
                    <td className="text-right font-medium">{formatBDT(toNumber(p.amount))}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/accounts?tab=purchases&edit=${p.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                          <Pencil size={15} />
                        </Link>
                        <form action={deleteBigPurchase.bind(null, p.id)}>
                          <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                            <Trash2 size={15} />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {bigPurchases.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center" style={{ color: "var(--muted)" }}>
                      No big purchases recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={bigPurchasesTotal} basePath="/accounts" extraParams={purchaseExtraParams} />
        </Card>
      )}

      {tab === "purchases" &&
        editId &&
        bigPurchases
          .filter((p) => p.id === editId)
          .map((p) => (
            <EditModal key={p.id} title="Edit Big Purchase" closeHref="/accounts?tab=purchases">
              <form action={updateBigPurchase.bind(null, p.id)} className="flex flex-col gap-3">
                <EditField label="Item">
                  <input name="item" defaultValue={p.item} required className="input" />
                </EditField>
                <EditField label="Amount">
                  <input name="amount" type="number" step="0.01" defaultValue={toNumber(p.amount)} required className="input" />
                </EditField>
                <EditField label="Date">
                  <input name="date" type="date" defaultValue={toDateInput(p.date)} required className="input" />
                </EditField>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href="/accounts?tab=purchases" className="btn-secondary">
                    Cancel
                  </Link>
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
                <input name="date" type="date" defaultValue={today} required className="input" />
                <input name="description" placeholder="Description" required className="input" />
                <input name="amount" type="number" step="0.01" placeholder="Amount" required className="input" />
                <input name="taxWithheld" type="number" step="0.01" placeholder="Tax withheld" className="input" />
                <button type="submit" className="btn-primary">
                  Add
                </button>
              </ModalForm>
            </Modal>
          }
        >
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>
                    <SortableHeader
                      label="Date"
                      column="date"
                      currentSort={ledgerSort}
                      currentDir={dir}
                      basePath="/accounts"
                      extraParams={ledgerExtraParams}
                    />
                  </th>
                  <th>
                    <SortableHeader
                      label="Description"
                      column="description"
                      currentSort={ledgerSort}
                      currentDir={dir}
                      basePath="/accounts"
                      extraParams={ledgerExtraParams}
                    />
                  </th>
                  <th className="text-right">
                    <SortableHeader
                      label="Amount"
                      column="amount"
                      currentSort={ledgerSort}
                      currentDir={dir}
                      basePath="/accounts"
                      extraParams={ledgerExtraParams}
                    />
                  </th>
                  <th className="text-right">
                    Tax Withheld
                  </th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {incomeLedger.map((e) => (
                  <tr key={e.id}>
                    <td>{toDateInput(e.date)}</td>
                    <td>{e.description}</td>
                    <td className="text-right font-medium">{formatBDT(toNumber(e.amount))}</td>
                    <td className="text-right" style={{ color: "var(--muted)" }}>
                      {formatBDT(toNumber(e.taxWithheld))} tax
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link href={`/accounts?tab=ledger&edit=${e.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                          <Pencil size={15} />
                        </Link>
                        <form action={deleteIncomeLedgerEntry.bind(null, e.id)}>
                          <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                            <Trash2 size={15} />
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
                {incomeLedger.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center" style={{ color: "var(--muted)" }}>
                      No income ledger entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={incomeLedgerTotal}
            basePath="/accounts"
            extraParams={ledgerExtraParams}
          />
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
                  <input name="date" type="date" defaultValue={toDateInput(e.date)} required className="input" />
                </EditField>
                <EditField label="Description">
                  <input name="description" defaultValue={e.description} required className="input" />
                </EditField>
                <EditField label="Amount">
                  <input name="amount" type="number" step="0.01" defaultValue={toNumber(e.amount)} required className="input" />
                </EditField>
                <EditField label="Tax withheld">
                  <input name="taxWithheld" type="number" step="0.01" defaultValue={toNumber(e.taxWithheld)} className="input" />
                </EditField>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href="/accounts?tab=ledger" className="btn-secondary">
                    Cancel
                  </Link>
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
