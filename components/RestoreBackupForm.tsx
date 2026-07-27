"use client";

import { Upload } from "lucide-react";

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
      <input
        type="file"
        name="backup"
        accept=".json,application/json"
        required
        className="text-sm"
        style={{ color: "var(--muted)" }}
      />
      <button type="submit" className="btn-secondary shrink-0">
        <Upload size={14} />
        Import Backup
      </button>
    </form>
  );
}
