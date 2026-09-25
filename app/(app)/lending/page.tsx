import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, HandCoins, RotateCcw, Scale, Trash2, Undo2, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { lendingTotals, loanStatus, summariseByCounterparty } from "@/lib/personal-loans";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { MoneyText } from "@/components/MoneyText";
import { RowActions } from "@/components/RowActions";
import { EmptyState } from "@/components/EmptyState";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/input";
import { todayInputValue } from "@/lib/dates";
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

  const filterHref = includeSettled ? "/lending" : "/lending?show=all";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lending"
        description="Informal loans to and from people — the ones that otherwise live in your head."
        actions={
          <>
            {openLoans.length > 0 && (
              <Modal label="Record repayment" title="Record a repayment" variant="secondary" icon={<Undo2 size={15} />}>
                <ModalForm action={recordLoanPayment} className="flex flex-col gap-3" successMessage="Repayment recorded">
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
            )}
            <Modal label="Record a loan" title="Record a loan">
            <ModalForm action={createPersonalLoan} className="grid grid-cols-1 gap-3 sm:grid-cols-2" successMessage="Loan recorded">
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
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Owed to you" icon={<HandCoins size={16} />} tone="positive" value={<MoneyText value={totals.totalOwedToYou} money={fmt.money} />} />
        <StatCard label="You owe" icon={<ArrowUpRight size={16} />} tone="negative" value={<MoneyText value={totals.totalOwedByYou} money={fmt.money} />} />
        <StatCard
          label="Net position"
          icon={<Scale size={16} />}
          tone={totals.netPosition >= 0 ? "positive" : "negative"}
          value={<MoneyText value={totals.netPosition} money={fmt.money} tone="auto" />}
          hint="What you're owed minus what you owe."
        />
        <StatCard
          label="Overdue"
          icon={<AlertTriangle size={16} />}
          tone={totals.overdueCount > 0 ? "warning" : "neutral"}
          value={fmt.number(totals.overdueCount)}
        />
      </div>

      {people.length > 0 && (
        <Card title="By person" icon={<Users size={15} />}>
          <Table responsive>
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
                  <TableCell primary className="font-medium">{p.counterparty}</TableCell>
                  <TableCell label="They owe you" className="text-right tabular-nums">{p.owedToYou > 0 ? fmt.money(p.owedToYou) : "—"}</TableCell>
                  <TableCell label="You owe them" className="text-right tabular-nums">{p.owedByYou > 0 ? fmt.money(p.owedByYou) : "—"}</TableCell>
                  <TableCell label="Net" className="text-right font-medium">
                    <MoneyText value={p.netPosition} money={fmt.money} tone="auto" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card
        title={includeSettled ? "All records" : "Open records"}
        icon={<HandCoins size={15} />}
        action={
          <Link href={filterHref} className="text-sm font-medium text-link hover:underline">
            {includeSettled ? "Hide settled" : "Show settled"}
          </Link>
        }
      >
        {visible.length === 0 ? (
          <EmptyState
            icon={<HandCoins size={18} />}
            title={includeSettled ? "Nothing recorded yet" : "No open loans"}
            description="Record money you lent or borrowed to keep track of who owes what."
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Since</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((s) => (
                <TableRow key={s.id} className={s.isSettled ? "text-muted-foreground" : ""}>
                  <TableCell primary className="font-medium">
                    {s.counterparty}
                    {s.isSettled && <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium">Settled</span>}
                  </TableCell>
                  <TableCell label="Direction">
                    <span className={s.direction === "LENT" ? "text-success" : "text-danger"}>
                      {s.direction === "LENT" ? "↗ Lent" : "↙ Borrowed"}
                    </span>
                  </TableCell>
                  <TableCell label="Amount" className="text-right tabular-nums">{fmt.money(s.principal)}</TableCell>
                  <TableCell label="Outstanding" className="text-right tabular-nums">
                    {fmt.money(s.outstanding)}
                    {s.repaid > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">({s.progressPct.toFixed(0)}% repaid)</span>
                    )}
                  </TableCell>
                  <TableCell label="Since">
                    {fmt.number(s.ageDays)} days
                    {s.isOverdue && (
                      <span className="ml-2 rounded-full bg-warning-soft px-2 py-0.5 text-[0.7rem] font-medium text-warning">
                        {fmt.number(s.daysOverdue)}d overdue
                      </span>
                    )}
                  </TableCell>
                  <TableCell actions className="text-right">
                    <RowActions
                      label={`Actions for ${s.counterparty}`}
                      actions={[
                        s.isSettled
                          ? {
                              kind: "run" as const,
                              label: "Reopen",
                              icon: <RotateCcw size={14} />,
                              action: reopenPersonalLoan.bind(null, s.id!),
                              successMessage: "Record reopened",
                            }
                          : {
                              kind: "confirm" as const,
                              label: "Settle",
                              icon: <CheckCircle2 size={14} />,
                              tone: "default" as const,
                              confirmLabel: "Settle",
                              action: settlePersonalLoan.bind(null, s.id!),
                              title: `Settle with ${s.counterparty}?`,
                              description:
                                s.outstanding > 0
                                  ? `${fmt.money(s.outstanding)} is still outstanding. Settling marks the record closed without recording a repayment — use Record repayment first if money changed hands. You can reopen it later.`
                                  : "Marks this record as closed. You can reopen it later.",
                              successMessage: "Record settled",
                            },
                        {
                          kind: "confirm",
                          label: "Delete",
                          icon: <Trash2 size={14} />,
                          action: deletePersonalLoan.bind(null, s.id!),
                          title: `Delete record for ${s.counterparty}?`,
                          description: `Deletes this ${fmt.money(s.principal)} record and its repayments. This can't be undone.`,
                          successMessage: "Record deleted",
                        },
                      ]}
                    />
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
