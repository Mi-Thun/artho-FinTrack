import { Download, User } from "lucide-react";
import { auth } from "@/lib/auth";
import { Card } from "@/components/Card";
import { RestoreBackupForm } from "@/components/RestoreBackupForm";
import { restoreBackup } from "./actions";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ restore?: string }>;
}) {
  const session = await auth();
  const user = session?.user;
  const { restore } = await searchParams;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Profile
      </h1>
      <Card title="Account Details" icon={<User size={16} />}>
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Name
            </p>
            <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              {user?.name ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Email
            </p>
            <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              {user?.email ?? "—"}
            </p>
          </div>
        </div>
      </Card>
      <Card title="Data Backup" icon={<Download size={16} />}>
        {restore === "success" && (
          <p className="callout-warning mb-4" style={{ background: "var(--status-success-soft)", borderLeftColor: "var(--status-success)" }}>
            Backup restored successfully. Your data has been replaced with the contents of the file.
          </p>
        )}
        {restore === "error" && (
          <p className="callout-warning mb-4">
            Could not restore that file. Make sure it&apos;s a valid JSON backup exported from this app.
          </p>
        )}
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Download all your accounts, transactions, budgets, deposits, and other data as a single JSON file.
            </p>
            <a href="/api/backup" download className="btn-secondary shrink-0">
              <Download size={14} />
              Download Backup
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Restore from a previously downloaded backup file. This replaces all your current data.
            </p>
            <RestoreBackupForm action={restoreBackup} />
          </div>
        </div>
      </Card>
    </div>
  );
}
