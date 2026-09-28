"use client";

import { useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY = "wf:lastBackupDownload";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * The Download backup button, plus when it was last used. There's no server-side record of
 * downloads, so "last backup" is remembered per browser — the note says "on this device"
 * rather than implying more than it knows.
 */
export function BackupDownload() {
  const last = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => null,
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        nativeButton={false}
        render={
          <a
            href="/api/backup"
            download
            onClick={() => {
              try {
                localStorage.setItem(KEY, new Date().toISOString());
              } catch {
                // Storage blocked (private mode): the download still works.
              }
              for (const listener of listeners) listener();
            }}
          />
        }
      >
        <Download size={14} />
        Download backup
      </Button>
      <span className="text-xs text-muted-foreground">
        {last
          ? `Last downloaded on this device ${new Date(last).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
          : "No backup downloaded on this device yet"}
      </span>
    </div>
  );
}
