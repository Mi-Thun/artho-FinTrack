import { Home, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { computeNetWorth } from "@/lib/net-worth";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { MoneyText } from "@/components/MoneyText";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { Select } from "@/components/Select";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { createHousehold, inviteMember, openInvite, removeMember, revokeInvite } from "./actions";

const ROLE_LABELS: Record<string, string> = { OWNER: "Owner", ADULT: "Adult", VIEWER: "Viewer" };

function toNum(value: unknown): number {
  return value == null ? 0 : Number(value);
}

export default async function HouseholdPage() {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const now = new Date();

  const membership = await db.householdMember.findFirst({
    where: { userId },
    include: {
      household: {
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true } } } },
          invites: { where: { acceptedAt: null } },
        },
      },
    },
  });

  if (!membership) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Household" />
        <Card>
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1">
              <h2 className="text-base font-semibold">One picture for the whole family</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                A salary supports parents, siblings share a flat, a spouse runs the bazar budget. A household keeps
                everyone&apos;s records private and adds one combined net-worth view.
              </p>
              <ol className="mt-4 flex flex-col gap-3">
                {[
                  ["Create the household", "You become its owner."],
                  ["Invite members by email", "Each needs their own WealthFlow account; invites last 14 days."],
                  ["See the combined picture", "Assets, debts and net worth per member — never their transactions."],
                ].map(([title, text], i) => (
                  <li key={title} className="flex gap-3 text-sm">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-link">
                      {fmt.number(i + 1)}
                    </span>
                    <span>
                      <span className="font-medium">{title}</span>
                      <span className="block text-muted-foreground">{text}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-5 lg:w-80">
              <section className="rounded-lg border p-4">
                <h3 className="mb-3 text-sm font-semibold">Create a household</h3>
                <form action={createHousehold} className="flex flex-col gap-3">
                  <Field label="Household name" required>
                    <Input name="name" required placeholder="e.g. Rahman family" />
                  </Field>
                  <Button type="submit">Create household</Button>
                </form>
              </section>
              <section className="rounded-lg border p-4">
                <h3 className="mb-3 text-sm font-semibold">Join with an invite</h3>
                <form action={openInvite} className="flex flex-col gap-3">
                  <Field label="Invite code or link" required hint="Ask the household owner for the link they created.">
                    <Input name="code" required placeholder="/household/join/…" autoComplete="off" />
                  </Field>
                  <Button type="submit" variant="outline">
                    Continue
                  </Button>
                </form>
              </section>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const household = membership.household;
  const isOwner = membership.role === "OWNER";
  const memberIds = household.members.map((m) => m.userId);

  // Each member's net worth, computed from their own records. Nobody's transactions are
  // exposed — only the totals that make a shared picture meaningful.
  const [accounts, fixedDeposits, dpsPlans, loans, transactions] = await Promise.all([
    db.account.findMany({ where: { userId: { in: memberIds }, closedFrom: null } }),
    db.fixedDeposit.findMany({ where: { userId: { in: memberIds } } }),
    db.dpsPlan.findMany({ where: { userId: { in: memberIds } } }),
    db.loan.findMany({ where: { userId: { in: memberIds } }, include: { payments: true } }),
    // Only amounts and timing, to adjust each member's balances (see computeNetWorth).
    db.transaction.findMany({
      where: { userId: { in: memberIds }, deletedAt: null },
      select: { userId: true, accountId: true, amount: true, type: true, date: true, createdAt: true },
    }),
  ]);

  const perMember = household.members.map((member) => {
    const result = computeNetWorth({
      accounts: accounts.filter((a) => a.userId === member.userId),
      transactions: transactions.filter((t) => t.userId === member.userId),
      fixedDeposits: fixedDeposits.filter((d) => d.userId === member.userId),
      dpsPlanInputs: dpsPlans
        .filter((p) => p.userId === member.userId)
        .map((p) => ({
          label: p.label,
          monthlyDeposit: toNum(p.monthlyDeposit),
          startMonth: p.startMonth,
          tenureMonths: p.tenureMonths,
          interestRate: toNum(p.interestRate),
          profitTaxAtSource: toNum(p.profitTaxAtSource),
        })),
      loans: loans.filter((l) => l.userId === member.userId),
      cutoff: now,
    });
    return { member, ...result };
  });

  const combinedNetWorth = perMember.reduce((sum, m) => sum + m.netWorth, 0);
  const combinedAssets = perMember.reduce((sum, m) => sum + m.totalAssets, 0);
  const combinedLoans = perMember.reduce((sum, m) => sum + m.loanRemaining, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={household.name} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Combined net worth" icon={<Home size={16} />} value={<MoneyText value={combinedNetWorth} money={fmt.money} />} />
        <StatCard label="Total assets" tone="positive" value={<MoneyText value={combinedAssets} money={fmt.money} />} />
        <StatCard label="Total debt" tone={combinedLoans > 0 ? "negative" : "neutral"} value={<MoneyText value={combinedLoans} money={fmt.money} />} />
        <StatCard label="Members" icon={<Users size={16} />} value={fmt.number(household.members.length)} />
      </div>

      <Card
        title="Members"
        icon={<Users size={15} />}
        action={
          isOwner ? (
            <Modal label="Invite member" title="Invite a household member">
              <ModalForm action={inviteMember} className="flex flex-col gap-3" successMessage="Invite created">
                <Field
                  label="Email address"
                  required
                  hint="They need a WealthFlow account with this email. The invite expires in 14 days."
                >
                  <Input name="email" type="email" required />
                </Field>
                <Field label="Role" required>
                  <Select
                    name="role"
                    defaultValue="ADULT"
                    options={[
                      { value: "ADULT", label: "Adult — keeps their own records" },
                      { value: "VIEWER", label: "Viewer — sees the shared totals only" },
                    ]}
                  />
                </Field>
                <FormActions submitLabel="Send invite" cancel={<ModalCancel />} />
              </ModalForm>
            </Modal>
          ) : undefined
        }
      >
        <Table responsive>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Assets</TableHead>
              <TableHead className="text-right">Debt</TableHead>
              <TableHead className="text-right">Net worth</TableHead>
              {isOwner && <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {perMember.map((m) => (
              <TableRow key={m.member.id}>
                <TableCell primary className="font-medium">
                  {m.member.user.name ?? m.member.user.email}
                  {m.member.userId === userId && <span className="ml-2 text-xs text-muted-foreground">you</span>}
                </TableCell>
                <TableCell label="Role" className="text-sm text-muted-foreground">{ROLE_LABELS[m.member.role] ?? m.member.role}</TableCell>
                <TableCell label="Assets" className="text-right tabular-nums">{fmt.money(m.totalAssets)}</TableCell>
                <TableCell label="Debt" className="text-right tabular-nums">{fmt.money(m.loanRemaining)}</TableCell>
                <TableCell label="Net worth" className="text-right font-medium tabular-nums">{fmt.money(m.netWorth)}</TableCell>
                {isOwner && (
                  <TableCell actions className="text-right">
                    {m.member.role !== "OWNER" && (
                      <ConfirmDelete
                        action={removeMember.bind(null, m.member.id)}
                        label={`Remove ${m.member.user.name ?? m.member.user.email}`}
                        confirmLabel="Remove"
                        message={`Remove ${m.member.user.name ?? m.member.user.email} from the household? Their own data is untouched.`}
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {isOwner && household.invites.length > 0 && (
        <Card title="Pending invites" icon={<UserPlus size={15} />}>
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {household.invites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell primary className="font-medium">{invite.email}</TableCell>
                  <TableCell label="Role" className="text-sm text-muted-foreground">{ROLE_LABELS[invite.role] ?? invite.role}</TableCell>
                  <TableCell label="Expires">{fmt.day(invite.expiresAt)}</TableCell>
                  <TableCell label="Link" className="font-mono text-xs text-muted-foreground">
                    /household/join/{invite.token.slice(0, 12)}…
                  </TableCell>
                  <TableCell actions className="text-right">
                    <ConfirmDelete
                      action={revokeInvite.bind(null, invite.id)}
                      label={`Revoke invite to ${invite.email}`}
                      confirmLabel="Revoke"
                      message={`Revoke the invite to ${invite.email}? The join link stops working.`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="mt-3 text-xs text-muted-foreground">
            Email delivery isn&apos;t wired up yet — send the join link yourself for now. The invitee must be signed in
            with the invited email address for it to work.
          </p>
        </Card>
      )}
    </div>
  );
}
