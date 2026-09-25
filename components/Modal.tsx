"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2, Plus } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { useCloseOnNavigate } from "@/lib/use-close-on-navigate";
import { cn } from "@/lib/utils";
import { isDismissForNestedPopup } from "@/lib/dialog-dismiss";
import { toast } from "@/components/Toaster";
import { runAction } from "@/lib/run-action";
import { ValidatedForm } from "@/components/ValidatedForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetTrigger, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const ModalCloseContext = createContext<() => void>(() => {});

export function useModalClose() {
  return useContext(ModalCloseContext);
}

const DIALOG_WIDTH = {
  compact: "max-w-xl sm:max-w-xl",
  default: "max-w-2xl sm:max-w-2xl",
  wide: "max-w-3xl sm:max-w-3xl",
};

/**
 * A button that opens a form in a centred dialog or, with `presentation="sheet"`, a panel
 * sliding in from the right (full width on phones) — the pattern for Add/Edit forms that
 * benefit from staying beside the list they change.
 */
export function Modal({
  label,
  title,
  description,
  icon,
  variant = "primary",
  size = "default",
  presentation = "dialog",
  closeOnNavigate = true,
  openParam,
  hideTrigger = false,
  children,
}: {
  label: string;
  title: string;
  description?: ReactNode;
  /** Trigger icon. Defaults to "+", which is only right for dialogs that add something. */
  icon?: ReactNode;
  variant?: "primary" | "secondary";
  size?: "compact" | "default" | "wide";
  presentation?: "dialog" | "sheet";
  /**
   * Close when the URL changes (the default, so a redirecting action closes its form).
   * Off for dialogs that host a paginated or sortable list, whose own links change the URL.
   */
  closeOnNavigate?: boolean;
  /**
   * Opens this form when the URL carries `?new=<openParam>` — how the global "+ New" menu
   * and its N shortcut reach a form on another page. The param is removed once handled.
   */
  openParam?: string;
  /** No button of its own: opened only through `openParam` (e.g. from a "⋯" menu link). */
  hideTrigger?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requested = openParam != null && searchParams.get("new") === openParam;
  // Adjust-state-during-render: open once per request, even if already on this page.
  const [handledRequest, setHandledRequest] = useState(false);
  if (requested && !handledRequest) {
    setHandledRequest(true);
    setOpen(true);
  } else if (!requested && handledRequest) {
    setHandledRequest(false);
  }
  useEffect(() => {
    if (!requested) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [requested, searchParams, pathname, router]);
  const hydrated = useHydrated();
  const close = () => setOpen(false);
  useCloseOnNavigate(() => {
    if (closeOnNavigate) close();
  });

  // Disabled until hydrated: before then a click can't open anything, and a button that
  // looks live but ignores the click reads as broken.
  const trigger = (
    <Button variant={variant === "primary" ? "default" : "outline"} disabled={!hydrated} aria-busy={!hydrated} />
  );
  const triggerContent = (
    <>
      {icon ?? <Plus size={15} />}
      {label}
    </>
  );
  const body = <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>;

  if (presentation === "sheet") {
    return (
      <Sheet open={open} onOpenChange={(next, details) => {
        if (!next && isDismissForNestedPopup(details)) return;
        setOpen(next);
      }}>
        {!hideTrigger && <SheetTrigger render={trigger}>{triggerContent}</SheetTrigger>}
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4">{body}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next, details) => {
        if (!next && isDismissForNestedPopup(details)) return;
        setOpen(next);
      }}>
      {!hideTrigger && <DialogTrigger render={trigger}>{triggerContent}</DialogTrigger>}
      <DialogContent className={cn("max-h-[calc(100vh-2rem)] w-full overflow-y-auto", DIALOG_WIDTH[size])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The form inside a Modal: inline validation, stays open with a spinner while the
 * action runs, then closes and (optionally) toasts. Enter submits; Esc closes the modal.
 */
export function ModalForm({
  action,
  className,
  successMessage,
  children,
}: {
  action: (formData: FormData) => void | Promise<void>;
  className?: string;
  /** Toast shown when the action completes, e.g. "Transaction added". */
  successMessage?: string;
  children: ReactNode;
}) {
  const close = useModalClose();
  return (
    <ValidatedForm
      className={className}
      action={async (formData) => {
        if (!(await runAction(() => action(formData)))) return;
        close();
        if (successMessage) toast(successMessage);
      }}
    >
      {children}
    </ValidatedForm>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="sm:min-w-28" disabled={pending} aria-busy={pending || undefined}>
      {pending && <Loader2 size={14} className="animate-spin" />}
      {label}
    </Button>
  );
}

/**
 * The button row every Add/Edit form ends with: primary action right (full width on
 * phones, stacked above Cancel), Cancel beside it. `cancel` is a node so URL-driven edit
 * dialogs can pass a Link. Shows a spinner while the form's action is pending.
 */
export function FormActions({ submitLabel, cancel }: { submitLabel: string; cancel?: ReactNode }) {
  return (
    <div className="mt-2 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
      {cancel}
      <SubmitButton label={submitLabel} />
    </div>
  );
}

/** Cancel for a Modal-hosted form: closes the dialog it sits in. */
export function ModalCancel() {
  const close = useModalClose();
  return (
    <Button type="button" variant="outline" onClick={close}>
      Cancel
    </Button>
  );
}
