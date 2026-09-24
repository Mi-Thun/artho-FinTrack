"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Delete button with a confirmation step. Deletes here are permanent — unlike
 * transactions, the newer records have no soft-delete — so every one of them asks first.
 */
export function ConfirmDelete({
  action,
  message,
  label = "Delete",
}: {
  action: () => void;
  message: string;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className="inline"
    >
      <Button type="submit" variant="ghost" size="icon-sm" aria-label={label}>
        <Trash2 size={14} />
      </Button>
    </form>
  );
}
