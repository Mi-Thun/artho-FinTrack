import { DatabaseBackup, Upload } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { BackupDownload } from "@/components/BackupDownload";
import { RestoreBackupForm } from "@/components/RestoreBackupForm";
import { FlashToast } from "@/components/Toaster";
import { restoreBackup } from "../profile/actions";

export default async function BackupPage({ searchParams }: { searchParams: Promise<{ restore?: string }> }) {
  await requireUserId();
  const { restore } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Backup & restore" description="Keep a copy of your data, or bring one back." />
      {restore === "success" && <FlashToast message="Backup restored — your data now matches the file" clearParam="restore" />}
      {restore === "error" && (
        <FlashToast
          tone="error"
          clearParam="restore"
          message="Couldn't restore that file. Make sure it's a JSON backup exported from WealthFlow."
        />
      )}

      <Card
        title="Download a backup"
        icon={<DatabaseBackup size={16} />}
        description="Everything — accounts, transactions, budgets, investments, plans and lending — in one JSON file."
      >
        <BackupDownload />
      </Card>

      <Card
        title="Restore from a backup"
        icon={<Upload size={16} />}
        description="Replaces all your current data with the file's contents. You'll be asked to confirm, and offered a fresh backup first."
      >
        <RestoreBackupForm action={restoreBackup} />
      </Card>
    </div>
  );
}
