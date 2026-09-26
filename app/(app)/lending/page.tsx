import Link from "next/link";
import { AlertTriangle, ArrowUpRight, CheckCircle2, ChevronRight, HandCoins, RotateCcw, Scale, Trash2, Undo2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { lendingTotals, loanStatus } from "@/lib/personal-loans";
import { todayInputValue } from "@/lib/dates";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { MoneyText } from "@/components/MoneyText";
import { RowActions } from "@/components/RowActions";
import { EmptyState } from "@/components/EmptyState";
import { EditModal } from "@/components/EditModal";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { ValidatedForm } from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { DateInput } from "@/components/DateInput";
import { MoneyInput } from "@/components/MoneyInput";
import { RepaymentAmount } from "@/components/RepaymentAmount";
import { Select } from "@/components/Select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createPersonalLoan, deletePersonalLoan, recordLoanPayment, reopenPersonalLoan, settlePersonalLoan } from "./actions";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

export default async function LendingPage({ searchParams }: { searchParams: Promise<{ show?: string; repay?: string }> }) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const { show, repay } = await searchParams;
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
  const statuses = inputs.map((l) => loanStatus(l, now));
  const openLoans = statuses.filter((s) => !s.isSettled);
  const visible = statuses.filter((s) => includeSettled || !s.isSettled);

  // One list, grouped by person: the net is over open records only.
  const people = [...new Set(visible.map((s) => s.counterparty.trim()))]
    .map((name) => {
      const records = visible.filter((s) => s.counterparty.trim() === name);
      const open = records.filter((s) => !s.isSettled);
      const net = open.reduce((sum, s) => sum + (s.direction === "LENT" ? s.outstanding : -s.outstanding), 0);
      return { name, records, open, net, overdue: open.some((s) => s.isOverdue) };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || Math.abs(b.net) - Math.abs(a.net));
  const knownPeople = [...new Set(statuses.map((s) => s.counterparty.trim()))];

  const repaying = repay ? openLoans.find((s) => s.id === repay) : undefined;
  const listHref = includeSettled ? "/lending?show=all" : "/lending";
  const repayHref = (id: string) => `/lending?${includeSettled ? "show=all&" : ""}repay=${id}`;

  const recordLoan = (openParam?: string) => (
    <Modal label="Record a loan" title="Record a loan" openParam={openParam}>
      <ModalForm action={createPersonalLoan} className="grid grid-cols-1 gap-3 sm:grid-cols-2" successMessage="Loan recorded">
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">
            Direction<span aria-hidden className="ml-0.5 text-danger">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            {(
              [
                ["LENT", "I lent money"],
                ["BORROWED", "I borrowed money"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="cursor-pointer rounded-md px-2 py-1.5 text-center text-sm font-medium text-muted-foreground transition-colors has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <input type="radio" name="direction" value={value} defaultChecked={value === "LENT"} className="sr-only" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Person" required>
          <Input name="counterparty" required list="lending-people" autoComplete="off" autoFocus />
        </Field>
        <Field label="Amount" required>
          <MoneyInput name="principal" required positive />
        </Field>
        <Field label="Date" required>
          <DateInput name="date" defaultValue={today} required />
        </Field>
        <Field label="Expected back by">
          <DateInput name="dueDate" />
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Input name="note" />
        </Field>
        <datalist id="lending-people">
          {knownPeople.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="sm:col-span-2">
          <FormActions submitLabel="Record loan" cancel={<ModalCancel />} />
        </div>
      </ModalForm>
    </Modal>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lending"
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
                        label: `${s.counterparty} — ${s.direction === "LENT" ? "owes you" : "you owe"} ${fmt.money(s.outstanding)}`,
                      }))}
                    />
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Amount" required>
                      <MoneyInput name="amount" required positive />
                    </Field>
                    <Field label="Date" required>
                      <DateInput name="date" defaultValue={today} required />
                    </Field>
                  </div>
                  <FormActions submitLabel="Record repayment" cancel={<ModalCancel />} />
                </ModalForm>
              </Modal>
            )}
            {recordLoan("loan")}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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

      <Card
        title="People"
        description={includeSettled ? "Everyone, including settled records." : "Open records, grouped by person."}
        action={
          <Link href={includeSettled ? "/lending" : "/lending?show=all"} className="text-sm font-medium text-link hover:underline">
            {includeSettled ? "Hide settled" : "Show settled"}
          </Link>
        }
      >
        {people.length === 0 ? (
          <EmptyState
            icon={<HandCoins size={18} />}
            title={includeSettled || statuses.length === 0 ? "Nothing recorded yet" : "No open loans"}
            description="Record money you lent or borrowed to keep track of who owes what."
            action={statuses.length === 0 ? recordLoan() : undefined}
          />
        ) : (
          <ul className="flex flex-col divide-y">
            {people.map((person) => (
              <li key={person.name}>
                <details className="group" open={people.length <= 3}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
                    <ChevronRight size={14} className="shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
                    <span
                      aria-hidden
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-link"
                    >
                      {initials(person.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="truncate">{person.name}</span>
                        {person.overdue && (
                          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[0.7rem] font-medium text-warning">Overdue</span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {fmt.number(person.open.length)} open record{person.open.length === 1 ? "" : "s"}
                        {person.records.length > person.open.length && ` · ${fmt.number(person.records.length - person.open.length)} settled`}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {person.net === 0 ? (
                        <span className="text-sm text-muted-foreground">Even</span>
                      ) : (
                        <>
                          <MoneyText value={Math.abs(person.net)} money={fmt.money} tone={person.net > 0 ? "income" : "expense"} className="font-medium" />
                          <span className="block text-xs text-muted-foreground">{person.net > 0 ? "owes you" : "you owe"}</span>
                        </>
                      )}
                    </span>
                  </summary>
                  <ul className="mb-3 ml-7 flex flex-col gap-2 sm:ml-[4.25rem]">
                    {person.records.map((s) => (
                      <li
                        key={s.id}
                        className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-sm ${s.isSettled ? "opacity-60" : ""}`}
                      >
                        <span className={`w-20 shrink-0 font-medium ${s.direction === "LENT" ? "text-success" : "text-danger"}`}>
                          {s.direction === "LENT" ? "↗ Lent" : "↙ Borrowed"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="tabular-nums">{fmt.money(s.principal)}</span>
                          <span className="text-muted-foreground"> on {fmt.day(s.date)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {s.isSettled
                              ? "Settled"
                              : `${fmt.money(s.outstanding)} outstanding${s.repaid > 0 ? ` · ${fmt.number(s.progressPct, { maximumFractionDigits: 0 })}% repaid` : ""}`}
                            {s.dueDate && !s.isSettled && ` · due ${fmt.day(s.dueDate)}`}
                          </span>
                        </span>
                        {s.isOverdue && (
                          <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[0.7rem] font-medium text-warning">
                            {fmt.number(s.daysOverdue)}d overdue
                          </span>
                        )}
                        <RowActions
                          label={`Actions for ${s.counterparty} ${fmt.money(s.principal)}`}
                          actions={[
                            ...(s.isSettled
                              ? [
                                  {
                                    kind: "run" as const,
                                    label: "Reopen",
                                    icon: <RotateCcw size={14} />,
                                    action: reopenPersonalLoan.bind(null, s.id!),
                                    successMessage: "Record reopened",
                                  },
                                ]
                              : [
                                  { kind: "link" as const, label: "Record repayment", href: repayHref(s.id!), icon: <Undo2 size={14} /> },
                                  {
                                    kind: "confirm" as const,
                                    label: "Settle",
                                    icon: <CheckCircle2 size={14} />,
                                    tone: "default" as const,
                                    confirmLabel: "Settle",
                                    action: settlePersonalLoan.bind(null, s.id!),
                                    title: `Settle with ${s.counterparty}?`,
                                    description:
                                      s.outstanding > 0
                                        ? `${fmt.money(s.outstanding)} is still outstanding. Settling marks the record closed without recording a repayment — record a repayment first if money changed hands. You can reopen it later.`
                                        : "Marks this record as closed. You can reopen it later.",
                                    successMessage: "Record settled",
                                  },
                                ]),
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
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {repaying && (
        <EditModal title={`Repayment ${repaying.direction === "LENT" ? "from" : "to"} ${repaying.counterparty}`} closeHref={listHref}>
          <ValidatedForm action={recordLoanPayment} className="flex flex-col gap-3" successMessage="Repayment recorded">
            <input type="hidden" name="personalLoanId" value={repaying.id!} />
            <p className="text-sm text-muted-foreground">
              {repaying.direction === "LENT" ? "You lent" : "You borrowed"} {fmt.money(repaying.principal)} on {fmt.day(repaying.date)}.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <RepaymentAmount outstanding={repaying.outstanding} outstandingLabel={fmt.money(repaying.outstanding)} />
              <Field label="Date" required>
                <DateInput name="date" defaultValue={today} required />
              </Field>
            </div>
            <FormActions
              submitLabel="Record repayment"
              cancel={
                <Button variant="outline" nativeButton={false} render={<Link href={listHref} />}>
                  Cancel
                </Button>
              }
            />
          </ValidatedForm>
        </EditModal>
      )}
    </div>
  );
}
