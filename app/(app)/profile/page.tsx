import { Download, User } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { Card } from "@/components/Card";
import { RestoreBackupForm } from "@/components/RestoreBackupForm";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { restoreBackup } from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ restore?: string }>;
}) {
  // requireUserId redirects a signed-out visitor rather than rendering an empty shell,
  // and reading the user from the database means a name changed after sign-in shows up
  // without waiting for the JWT to be reissued.
  const userId = await requireUserId();
  const [user, { restore }] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, createdAt: true } }),
    searchParams,
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <Card title="Account Details" icon={<User size={16} />}>
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
            <p className="text-sm font-medium">{user?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
            <p className="text-sm font-medium">{user?.email ?? "—"}</p>
          </div>
        </div>
      </Card>
      <Card title="Data Backup" icon={<Download size={16} />}>
        {restore === "success" && (
          <Alert
            className="mb-4 rounded-lg border-l-4 p-3"
            style={{ background: "var(--status-success-soft)", borderLeftColor: "var(--status-success)" }}
          >
            <AlertDescription className="text-foreground">
              Backup restored successfully. Your data has been replaced with the contents of the file.
            </AlertDescription>
          </Alert>
        )}
        {restore === "error" && (
          <Alert
            className="mb-4 rounded-lg border-l-4 p-3"
            style={{ background: "var(--status-warning-soft)", borderLeftColor: "var(--status-warning)" }}
          >
            <AlertDescription className="text-foreground">
              Could not restore that file. Make sure it&apos;s a valid JSON backup exported from this app.
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Download all your accounts, transactions, budgets, deposits, and other data as a single JSON file.
            </p>
            <Button variant="secondary" className="shrink-0" nativeButton={false} render={<a href="/api/backup" download />}>
              <Download size={14} />
              Download Backup
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Restore from a previously downloaded backup file. This replaces all your current data.
            </p>
            <RestoreBackupForm action={restoreBackup} />
          </div>
        </div>
      </Card>
    </div>
  );
}
