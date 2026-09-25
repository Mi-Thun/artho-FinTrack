import { HandCoins, Users, AlertTriangle, ArrowUpRight, Scale } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { lendingTotals, loanStatus, summariseByCounterparty } from "@/lib/personal-loans";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Input } from "@/components/ui/input";
import { todayInputValue } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  createPersonalLoan,
  deletePersonalLoan,
  recordLoanPayment,
  reopenPersonalLoan,
  settlePersonalLoan,
} from "./actions";

export default async function LendingPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const { show } = await searchParams;
  const includeSettled = show === "all";
  const now = new Date();
  const today = todayInputValue(now);

  const loans = await db.personalLoan.findMany({
    where: { userId },
    include: { payments: true },
    orderBy: { date: "desc" },
  });

  const inputs = loans.map((l) => ({
    id: l.id,
    counterparty: l.counterparty,
    direction: l.direction,
    principal: l.principal,
    date: l.date,
    dueDate: l.dueDate,
    settledAt: l.settledAt,
    payments: l.payments,
  }));

  const totals = lendingTotals(inputs, now);
  const people = summariseByCounterparty(inputs, now);
  const statuses = inputs.map((l) => loanStatus(l, now));
  const visible = statuses.filter((s) => includeSettled || !s.isSettled);
  const openLoans = statuses.filter((s) => !s.isSettled);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<HandCoins size={16} />}
        crumbs={[{ label: "Lending" }]}
        actions={
          <Button variant="secondary" nativeButton={false} render={<a href={includeSettled ? "/lending" : "/lending?show=all"} />}>
            {includeSettled ? "Hide settled" : "Show settled"}
          </Button>
        }
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Owed to You" value={fmt.money(totals.totalOwedToYou)} tone="positive" icon={<HandCoins size={18} />} />
          <StatTile
            label="You Owe"
            value={fmt.money(totals.totalOwedByYou)}
            tone="negative"
            icon={<ArrowUpRight size={18} />}
          />
          <StatTile
            label="Net Position"
            value={fmt.money(totals.netPosition)}
            tone={totals.netPosition >= 0 ? "positive" : "negative"}
            icon={<Scale size={18} />}
          />
          <StatTile
            label="Overdue"
            value={fmt.number(totals.overdueCount)}
            tone={totals.overdueCount > 0 ? "negative" : "neutral"}
            icon={<AlertTriangle size={18} />}
          />
        </div>
      </Card>

      {people.length > 0 && (
        <Card
          title="By Person"
          icon={<Users size={15} />}
          action={
            openLoans.length > 0 ? (
              <Modal label="Record Repayment" title="Record a Repayment">
                <ModalForm action={recordLoanPayment} className="flex flex-col gap-3">
                  <Field label="Record" required>
                    <Select
                      name="personalLoanId"
                      defaultValue={openLoans[0].id}
                      options={openLoans.map((s) => ({
                        value: s.id!,
                        label: `${s.counterparty} — ${s.direction === "LENT" ? "owes" : "owed"} ${fmt.money(s.outstanding)}`,
                      }))}
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Amount" required>
                      <MoneyInput name="amount" required positive />
                    </Field>
                    <Field label="Date" required>
                      <Input name="date" type="date" defaultValue={today} required />
                    </Field>
                  </div>
                  <FormActions submitLabel="Record repayment" cancel={<ModalCancel />} />
                </ModalForm>
              </Modal>
            ) : undefined
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead className="text-right">They owe you</TableHead>
                <TableHead className="text-right">You owe them</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {people.map((p) => (
                <TableRow key={p.counterparty}>
                  <TableCell className="font-medium">{p.counterparty}</TableCell>
                  <TableCell className="text-right">{p.owedToYou > 0 ? fmt.money(p.owedToYou) : "—"}</TableCell>
                  <TableCell className="text-right">{p.owedByYou > 0 ? fmt.money(p.owedByYou) : "—"}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${p.netPosition >= 0 ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"}`}
                  >
                    {fmt.money(p.netPosition)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card
        title={includeSettled ? "All Records" : "Open Records"}
        icon={<HandCoins size={15} />}
        action={
          <Modal label="Add Record" title="Record a Loan">
            <ModalForm action={createPersonalLoan} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Direction" required>
                <Select
                  name="direction"
                  defaultValue="LENT"
                  options={[
                    { value: "LENT", label: "I lent money" },
                    { value: "BORROWED", label: "I borrowed money" },
                  ]}
                />
              </Field>
              <Field label="Person" required>
                <Input name="counterparty" required list="lending-people" autoComplete="off" />
              </Field>
              <Field label="Amount" required>
                <MoneyInput name="principal" required positive />
              </Field>
              <Field label="Date" required>
                <Input name="date" type="date" defaultValue={today} required />
              </Field>
              <Field label="Expected back by">
                <Input name="dueDate" type="date" />
              </Field>
              <Field label="Note">
                <Input name="note" />
              </Field>
              <datalist id="lending-people">
                {people.map((p) => (
                  <option key={p.counterparty} value={p.counterparty} />
                ))}
              </datalist>
              <div className="sm:col-span-2">
                <FormActions submitLabel="Record loan" cancel={<ModalCancel />} />
              </div>
            </ModalForm>
          </Modal>
        }
      >
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing recorded. This is the ledger for informal debts — the ones that otherwise live in your head.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Since</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((s) => (
                <TableRow key={s.id} className={s.isSettled ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{s.counterparty}</TableCell>
                  <TableCell className={s.direction === "LENT" ? "text-[var(--status-success)]" : "text-[var(--status-danger)]"}>
                    {s.direction === "LENT" ? "Lent" : "Borrowed"}
                  </TableCell>
                  <TableCell className="text-right">{fmt.money(s.principal)}</TableCell>
                  <TableCell className="text-right">
                    {fmt.money(s.outstanding)}
                    {s.repaid > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">({s.progressPct.toFixed(0)}% repaid)</span>
                    )}
                  </TableCell>
                  <TableCell className={s.isOverdue ? "text-[var(--status-danger)]" : ""}>
                    {s.ageDays} days
                    {s.isOverdue && <span className="ml-1 text-xs">· {s.daysOverdue}d overdue</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {s.isSettled ? (
                        <form action={reopenPersonalLoan.bind(null, s.id!)}>
                          <Button type="submit" variant="secondary" size="sm">
                            Reopen
                          </Button>
                        </form>
                      ) : (
                        <ConfirmDialog
                          action={settlePersonalLoan.bind(null, s.id!)}
                          title={`Settle with ${s.counterparty}?`}
                          description={
                            s.outstanding > 0
                              ? `${fmt.money(s.outstanding)} is still outstanding. Settling marks the record closed without recording a repayment — use Record Repayment first if money changed hands. You can reopen it later.`
                              : "Marks this record as closed. You can reopen it later."
                          }
                          confirmLabel="Settle"
                          tone="default"
                          triggerLabel="Settle"
                          triggerVariant="secondary"
                        />
                      )}
                      <ConfirmDelete
                        action={deletePersonalLoan.bind(null, s.id!)}
                        label={`Delete record for ${s.counterparty}`}
                        message={`Delete this ${fmt.money(s.principal)} record for ${s.counterparty}, including its repayments? This can't be undone.`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

    </div>
  );
}
