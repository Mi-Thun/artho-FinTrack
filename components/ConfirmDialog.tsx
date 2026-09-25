"use client";

import { ReactNode, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function ConfirmButton({ label, tone, disabled }: { label: string; tone: "danger" | "default"; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={tone === "danger" ? "destructive" : "default"} disabled={disabled || pending}>
      {pending && <Loader2 size={14} className="animate-spin" />}
      {label}
    </Button>
  );
}

/**
 * The confirmation step in front of every destructive action (delete, encash, settle,
 * restore). The action only runs from the dialog's own form, so there is no path that
 * performs it on a single click.
 *
 * `confirmText` adds a type-to-confirm box for actions that can't be undone at all, and
 * `children` render inside the form — for extra inputs such as the backup file.
 */
export function ConfirmDialog({
  action,
  title,
  description,
  confirmLabel = "Delete",
  tone = "danger",
  triggerLabel,
  triggerIcon,
  iconOnly = false,
  triggerVariant = "ghost",
  confirmText,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "default";
  triggerLabel: string;
  triggerIcon?: ReactNode;
  /** Render the trigger as an icon button; `triggerLabel` becomes its accessible name. */
  iconOnly?: boolean;
  triggerVariant?: "ghost" | "secondary" | "outline" | "destructive";
  confirmText?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const hydrated = useHydrated();
  const matches = !confirmText || typed.trim() === confirmText;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={triggerVariant}
            size={iconOnly ? "icon-sm" : "sm"}
            aria-label={iconOnly ? triggerLabel : undefined}
            title={iconOnly ? triggerLabel : undefined}
            disabled={!hydrated}
          />
        }
      >
        {triggerIcon}
        {!iconOnly && triggerLabel}
      </DialogTrigger>
      <DialogContent className="max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          action={async (formData) => {
            await action(formData);
            setOpen(false);
            setTyped("");
          }}
          className="flex flex-col gap-4"
        >
          {children}
          {confirmText && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>
                Type <span className="font-mono font-semibold">{confirmText}</span> to confirm
              </span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
            </label>
          )}
          <DialogFooter className="-mx-4 -mb-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <ConfirmButton label={confirmLabel} tone={tone} disabled={!matches} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
