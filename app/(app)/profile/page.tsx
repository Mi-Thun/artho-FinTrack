import Link from "next/link";
import { DatabaseBackup, KeyRound, Pencil, User } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { ValidatedForm } from "@/components/ValidatedForm";
import { Field } from "@/components/Field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FlashToast } from "@/components/Toaster";
import { PageHeader } from "@/components/PageHeader";
import { changePassword, updateProfile } from "./actions";

const PROFILE_ERRORS: Record<string, string> = {
  email: "That email is already in use.",
  password: "Your email wasn't changed — enter your current password to confirm the change.",
};
const PASSWORD_ERRORS: Record<string, string> = {
  current: "Your current password isn't right, so nothing was changed.",
  short: "The new password needs at least 8 characters.",
  mismatch: "The two new passwords don't match.",
};

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <Alert className="mb-4 rounded-lg border-l-4 border-l-warning bg-warning-soft p-3" role="alert">
      <AlertDescription className="text-foreground">{children}</AlertDescription>
    </Alert>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ profileError?: string; profileUpdated?: string; passwordError?: string; passwordChanged?: string }>;
}) {
  // requireUserId redirects a signed-out visitor rather than rendering an empty shell,
  // and reading the user from the database means a name changed after sign-in shows up
  // without waiting for the JWT to be reissued.
  const userId = await requireUserId();
  const [user, { fmt }, { profileError, profileUpdated, passwordError, passwordChanged }] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, createdAt: true } }),
    getLocalisation(userId),
    searchParams,
  ]);
  const displayName = user?.name ?? user?.email ?? "Account";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile" />
      {profileUpdated === "success" && <FlashToast message="Profile updated" clearParam="profileUpdated" />}
      {passwordChanged && <FlashToast message="Password changed" clearParam="passwordChanged" />}

      <Card
        title="Account details"
        icon={<User size={16} />}
        action={
          <Modal label="Edit profile" title="Edit profile" variant="secondary" size="compact" icon={<Pencil size={15} />}>
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
        {profileError && PROFILE_ERRORS[profileError] && <Warning>{PROFILE_ERRORS[profileError]}</Warning>}
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-link"
          >
            {displayName.charAt(0).toUpperCase()}
          </span>
          <dl className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Name</dt>
              <dd className="text-sm font-medium">{user?.name ?? "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">Email</dt>
              <dd className="truncate text-sm font-medium">{user?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Member since</dt>
              <dd className="text-sm font-medium">{user ? fmt.monthYear(user.createdAt) : "—"}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <Card title="Password" icon={<KeyRound size={16} />} description="Use at least 8 characters.">
        {passwordError && PASSWORD_ERRORS[passwordError] && <Warning>{PASSWORD_ERRORS[passwordError]}</Warning>}
        <ValidatedForm action={changePassword} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Current password" required>
            <Input name="currentPassword" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" required>
            <Input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <Field label="Confirm new password" required>
            <Input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
          </Field>
          <div className="sm:col-span-3">
            <FormActions submitLabel="Change password" />
          </div>
        </ValidatedForm>
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
