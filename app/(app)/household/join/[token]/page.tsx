import { redirect } from "next/navigation";
import { Home } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "../../actions";

export default async function JoinHouseholdPage({ params }: { params: Promise<{ token: string }> }) {
  const userId = await requireUserId();
  const { token } = await params;

  const [invite, user] = await Promise.all([
    db.householdInvite.findUnique({ where: { token }, include: { household: true } }),
    db.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);

  if (invite?.acceptedAt) redirect("/household");

  const expired = invite != null && invite.expiresAt < new Date();
  const wrongAccount =
    invite != null && user != null && invite.email.toLowerCase() !== user.email.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Home size={16} />} crumbs={[{ label: "Household" }, { label: "Join" }]} />
      <Card title="Household Invitation" icon={<Home size={15} />}>
        {!invite && <p className="text-sm text-muted-foreground">This invitation link isn&apos;t valid.</p>}
        {invite && expired && (
          <p className="text-sm text-muted-foreground">
            This invitation to {invite.household.name} expired on {invite.expiresAt.toDateString()}. Ask the household
            owner to send a new one.
          </p>
        )}
        {invite && !expired && wrongAccount && (
          <p className="text-sm text-muted-foreground">
            This invitation was sent to <strong>{invite.email}</strong>, but you&apos;re signed in as{" "}
            <strong>{user?.email}</strong>. Sign in with the invited address to accept it.
          </p>
        )}
        {invite && !expired && !wrongAccount && (
          <form action={acceptInvite.bind(null, token)} className="flex flex-col gap-4">
            <p className="text-sm">
              You&apos;ve been invited to join <strong>{invite.household.name}</strong> as a{" "}
              {invite.role.toLowerCase()}. Your own transactions stay private — only totals are shared.
            </p>
            <div>
              <Button type="submit">Join household</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
