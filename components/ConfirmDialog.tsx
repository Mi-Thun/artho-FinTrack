"use client";

import { ReactNode, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { useCloseOnNavigate } from "@/lib/use-close-on-navigate";
import { toast } from "@/components/Toaster";
import { runAction } from "@/lib/run-action";
import { isDismissForNestedPopup } from "@/lib/dialog-dismiss";
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

export interface ConfirmOptions {
  action: (formData: FormData) => void | Promise<void>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "default";
  /** Type-to-confirm text for actions that can't be undone at all. */
  confirmText?: string;
  /** Toast shown once the action completes. */
  successMessage?: string;
}

/**
 * The confirmation step in front of every destructive action (delete, encash, settle,
 * restore). The action only runs from the dialog's own form, so there is no path that
 * performs it on a single click.
 *
 * Uncontrolled, it renders its own trigger button. Controlled (`open`/`onOpenChange`), it
 * has no trigger — that's how a row's "⋯" menu opens it after the menu has closed.
 * `children` render inside the form, for extra inputs such as the backup file.
 */
export function ConfirmDialog({
  action,
  title,
  description,
  confirmLabel = "Delete",
  tone = "danger",
  confirmText,
  successMessage,
  triggerLabel,
  triggerIcon,
  iconOnly = false,
  triggerVariant = "ghost",
  open: controlledOpen,
  onOpenChange,
  children,
}: ConfirmOptions & {
  triggerLabel?: string;
  triggerIcon?: ReactNode;
  /** Render the trigger as an icon button; `triggerLabel` becomes its accessible name. */
  iconOnly?: boolean;
  triggerVariant?: "ghost" | "secondary" | "outline" | "destructive";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const hydrated = useHydrated();
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next) setTyped("");
  };
  useCloseOnNavigate(() => {
    if (open) setOpen(false);
  });
  const matches = !confirmText || typed.trim() === confirmText;

  return (
    <Dialog open={open} onOpenChange={(next, details) => {
        if (!next && isDismissForNestedPopup(details)) return;
        setOpen(next);
      }}>
      {controlledOpen === undefined && triggerLabel && (
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
      )}
      <DialogContent className="max-w-md sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          action={async (formData) => {
            if (!(await runAction(() => action(formData)))) return;
            setOpen(false);
            if (successMessage) toast(successMessage);
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
