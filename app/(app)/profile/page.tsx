import Link from "next/link";
import { DatabaseBackup, Pencil, User } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlashToast } from "@/components/Toaster";
import { PageHeader } from "@/components/PageHeader";
import { updateProfile } from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ profileError?: string; profileUpdated?: string }>;
}) {
  // requireUserId redirects a signed-out visitor rather than rendering an empty shell,
  // and reading the user from the database means a name changed after sign-in shows up
  // without waiting for the JWT to be reissued.
  const userId = await requireUserId();
  const [user, { profileError, profileUpdated }] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, createdAt: true } }),
    searchParams,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile" description="Your account details." />
      {profileUpdated === "success" && <FlashToast message="Profile updated" clearParam="profileUpdated" />}
      <Card
        title="Account details"
        icon={<User size={16} />}
        action={
          <Modal label="Edit Profile" title="Edit Profile" variant="secondary" size="compact" icon={<Pencil size={15} />}>
            <ModalForm action={updateProfile} className="flex flex-col gap-3">
              <Field label="Name">
                <Input name="name" defaultValue={user?.name ?? ""} autoFocus />
              </Field>
              <Field label="Email" required hint="You sign in with this address.">
                <Input name="email" type="email" defaultValue={user?.email ?? ""} required />
              </Field>
              <Field label="Current password" hint="Required only when changing your email.">
                <Input name="currentPassword" type="password" autoComplete="current-password" />
              </Field>
              <FormActions submitLabel="Save changes" cancel={<ModalCancel />} />
            </ModalForm>
          </Modal>
        }
      >
        {(profileError === "email" || profileError === "password") && (
          <Alert
            className="mb-4 rounded-lg border-l-4 p-3"
            style={{ background: "var(--status-warning-soft)", borderLeftColor: "var(--status-warning)" }}
          >
            <AlertDescription className="text-foreground">
              {profileError === "email"
                ? "That email is already in use."
                : "Your email wasn't changed — enter your current password to confirm the change."}
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Name</p>
            <p className="text-sm font-medium">{user?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Email</p>
            <p className="text-sm font-medium">{user?.email ?? "—"}</p>
          </div>
        </div>
      </Card>
      <Card title="Your data" icon={<DatabaseBackup size={16} />}>
        <p className="text-sm text-muted-foreground">
          Download a full backup or restore one on the{" "}
          <Link href="/backup" className="font-medium text-link hover:underline">
            Backup &amp; restore
          </Link>{" "}
          page.
        </p>
      </Card>
    </div>
  );
}
