import { HandCoins, Users, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { lendingTotals, loanStatus, summariseByCounterparty } from "@/lib/personal-loans";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Modal, ModalForm } from "@/components/Modal";
import { Select } from "@/components/Select";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
          <StatTile label="You Owe" value={fmt.money(totals.totalOwedByYou)} tone="negative" />
          <StatTile
            label="Net Position"
            value={fmt.money(totals.netPosition)}
            tone={totals.netPosition >= 0 ? "positive" : "negative"}
          />
          <StatTile
            label="Overdue"
            value={fmt.number(totals.overdueCount)}
            tone={totals.overdueCount > 0 ? "negative" : "neutral"}
            icon={totals.overdueCount > 0 ? <AlertTriangle size={18} /> : undefined}
          />
        </div>
      </Card>

      {people.length > 0 && (
        <Card title="By Person" icon={<Users size={15} />}>
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
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
                Direction
                <Select
                  name="direction"
                  defaultValue="LENT"
                  options={[
                    { value: "LENT", label: "I lent money" },
                    { value: "BORROWED", label: "I borrowed money" },
                  ]}
                />
              </Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
                Person
                <Input name="counterparty" placeholder="e.g. Rahim bhai" required />
              </Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
                Amount
                <Input name="principal" type="number" step="0.01" min="0" required />
              </Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
                Date
                <Input name="date" type="date" required />
              </Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
                Expected back by
                <Input name="dueDate" type="date" />
              </Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
                Note
                <Input name="note" placeholder="Optional" />
              </Label>
              <div className="sm:col-span-2">
                <Button type="submit">Add</Button>
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
                        <form action={settlePersonalLoan.bind(null, s.id!)}>
                          <Button type="submit" variant="secondary" size="sm">
                            Settle
                          </Button>
                        </form>
                      )}
                      <ConfirmDelete
                        action={deletePersonalLoan.bind(null, s.id!)}
                        message={`Delete this record for ${s.counterparty}?`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {openLoans.length > 0 && (
        <Card title="Record a Repayment">
          <form action={recordLoanPayment} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
              Record
              <Select
                name="personalLoanId"
                defaultValue={openLoans[0].id}
                options={openLoans.map((s) => ({
                  value: s.id!,
                  label: `${s.counterparty} — ${s.direction === "LENT" ? "owes" : "owed"} ${fmt.money(s.outstanding)}`,
                }))}
              />
            </Label>
            <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
              Amount
              <Input name="amount" type="number" step="0.01" min="0" required />
            </Label>
            <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
              Date
              <Input name="date" type="date" required />
            </Label>
            <div className="self-end">
              <Button type="submit">Record</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
