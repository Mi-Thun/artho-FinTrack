"use client";

import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RestoreBackupForm({ action }: { action: (formData: FormData) => void }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Restoring a backup replaces ALL your current data with the contents of this file. This cannot be undone. Continue?")) {
          e.preventDefault();
        }
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="file" name="backup" accept=".json,application/json" required className="text-sm text-muted-foreground" />
      <Button type="submit" variant="secondary" className="shrink-0">
        <Upload size={14} />
        Import Backup
      </Button>
    </form>
  );
}
