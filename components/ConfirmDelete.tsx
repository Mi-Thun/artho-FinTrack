"use client";

import { Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

/**
 * Icon-only delete button with an in-app confirmation step. Deletes here are permanent —
 * unlike transactions, the newer records have no soft-delete — so every one of them asks
 * first, and says what will happen.
 */
export function ConfirmDelete({
  action,
  message,
  label = "Delete",
  title,
  confirmLabel = "Delete",
}: {
  action: () => void | Promise<void>;
  message: string;
  /** Accessible name of the icon button, e.g. "Delete account Bkash". */
  label?: string;
  title?: string;
  confirmLabel?: string;
}) {
  return (
    <ConfirmDialog
      action={() => action()}
      title={title ?? `${label}?`}
      description={message}
      confirmLabel={confirmLabel}
      triggerLabel={label}
      triggerIcon={<Trash2 size={14} />}
      iconOnly
    />
  );
}
