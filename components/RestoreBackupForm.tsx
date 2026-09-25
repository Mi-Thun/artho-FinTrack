"use client";

import { Download, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Field } from "@/components/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Restore wipes every record the user has, so it sits behind the strongest confirmation
 * in the app: pick the file inside the dialog, type REPLACE, and get a one-click chance
 * to download a backup of the current data first.
 */
export function RestoreBackupForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  return (
    <ConfirmDialog
      action={action}
      title="Restore from backup?"
      description="This replaces ALL your current data — accounts, transactions, budgets, deposits and plans — with the contents of the file. It can't be undone."
      confirmLabel="Replace my data"
      confirmText="REPLACE"
      triggerLabel="Import Backup"
      triggerIcon={<Upload size={14} />}
      triggerVariant="secondary"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3 text-sm">
        <span className="text-muted-foreground">Keep a copy of what you have now first.</span>
        <Button variant="outline" size="sm" nativeButton={false} render={<a href="/api/backup" download />}>
          <Download size={14} />
          Download current backup
        </Button>
      </div>
      <Field label="Backup file" required>
        <Input type="file" name="backup" accept=".json,application/json" required />
      </Field>
    </ConfirmDialog>
  );
}
