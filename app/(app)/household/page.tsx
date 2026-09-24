import { Home, UserPlus, Users } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { computeNetWorth } from "@/lib/net-worth";
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
import { createHousehold, inviteMember, removeMember, revokeInvite } from "./actions";

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
        <PageHeader
          icon={<Home size={16} />}
          crumbs={[{ label: "Household" }]}
        />
        <Card title="Create a Household" icon={<Home size={15} />}>
          <p className="mb-4 text-sm text-muted-foreground">
            Bangladeshi households pool money by default — a salary supports parents, siblings share a flat, a spouse
            runs the grocery budget. A household gives everyone their own login and private records, plus one combined
            net-worth view.
          </p>
          <form action={createHousehold} className="flex flex-wrap items-end gap-3">
            <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
              Household name
              <Input name="name" placeholder="e.g. Rahman family" required className="w-64" />
            </Label>
            <Button type="submit">Create</Button>
          </form>
        </Card>
      </div>
    );
  }

  const household = membership.household;
  const isOwner = membership.role === "OWNER";
  const memberIds = household.members.map((m) => m.userId);

  // Each member's net worth, computed from their own records. Nobody's transactions are
  // exposed — only the totals that make a shared picture meaningful.
  const [accounts, fixedDeposits, dpsPlans, loans] = await Promise.all([
    db.account.findMany({ where: { userId: { in: memberIds } } }),
    db.fixedDeposit.findMany({ where: { userId: { in: memberIds } } }),
    db.dpsPlan.findMany({ where: { userId: { in: memberIds } } }),
    db.loan.findMany({ where: { userId: { in: memberIds } }, include: { payments: true } }),
  ]);

  const perMember = household.members.map((member) => {
    const result = computeNetWorth({
      accounts: accounts.filter((a) => a.userId === member.userId),
      transactions: [],
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
      <PageHeader
        icon={<Home size={16} />}
        crumbs={[{ label: "Household" }, { label: household.name }]}
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Combined Net Worth" value={fmt.money(combinedNetWorth)} icon={<Home size={18} />} />
          <StatTile label="Total Assets" value={fmt.money(combinedAssets)} tone="positive" />
          <StatTile label="Total Debt" value={fmt.money(combinedLoans)} tone={combinedLoans > 0 ? "negative" : "neutral"} />
          <StatTile label="Members" value={fmt.number(household.members.length)} icon={<Users size={18} />} />
        </div>
      </Card>

      <Card
        title="Members"
        icon={<Users size={15} />}
        action={
          isOwner ? (
            <Modal label="Invite" title="Invite a Household Member">
              <ModalForm action={inviteMember} className="flex flex-col gap-3">
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
                  Email address
                  <Input name="email" type="email" required />
                  <span className="text-xs font-normal text-muted-foreground">
                    They need an WealthFlow account with this email. The invite expires in 14 days.
                  </span>
                </Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
                  Role
                  <Select
                    name="role"
                    defaultValue="ADULT"
                    options={[
                      { value: "ADULT", label: "Adult — keeps their own records" },
                      { value: "VIEWER", label: "Viewer — sees the shared totals only" },
                    ]}
                  />
                </Label>
                <Button type="submit">Send invite</Button>
              </ModalForm>
            </Modal>
          ) : undefined
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Assets</TableHead>
              <TableHead className="text-right">Debt</TableHead>
              <TableHead className="text-right">Net Worth</TableHead>
              {isOwner && <TableHead className="text-right">Action</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {perMember.map((m) => (
              <TableRow key={m.member.id}>
                <TableCell className="font-medium">
                  {m.member.user.name ?? m.member.user.email}
                  {m.member.userId === userId && <span className="ml-2 text-xs text-muted-foreground">you</span>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{m.member.role}</TableCell>
                <TableCell className="text-right">{fmt.money(m.totalAssets)}</TableCell>
                <TableCell className="text-right">{fmt.money(m.loanRemaining)}</TableCell>
                <TableCell className="text-right font-medium">{fmt.money(m.netWorth)}</TableCell>
                {isOwner && (
                  <TableCell className="text-right">
                    {m.member.role !== "OWNER" && (
                      <ConfirmDelete
                        action={removeMember.bind(null, m.member.id)}
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
        <Card title="Pending Invites" icon={<UserPlus size={15} />}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Link</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {household.invites.map((invite) => (
                <TableRow key={invite.id}>
                  <TableCell className="font-medium">{invite.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{invite.role}</TableCell>
                  <TableCell>{fmt.date(invite.expiresAt, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    /household/join/{invite.token.slice(0, 12)}…
                  </TableCell>
                  <TableCell className="text-right">
                    <ConfirmDelete action={revokeInvite.bind(null, invite.id)} message={`Revoke the invite to ${invite.email}?`} />
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
