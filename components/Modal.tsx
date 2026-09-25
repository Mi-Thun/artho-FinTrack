"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Plus } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ModalCloseContext = createContext<() => void>(() => {});
const NestedModalContext = createContext<(open: boolean) => void>(() => {});

export function useModalClose() {
  return useContext(ModalCloseContext);
}

export function Modal({
  label,
  title,
  icon,
  variant = "primary",
  size = "default",
  children,
}: {
  label: string;
  title: string;
  /** Trigger icon. Defaults to "+", which is only right for dialogs that add something. */
  icon?: ReactNode;
  variant?: "primary" | "secondary";
  size?: "compact" | "default" | "wide";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [nestedOpen, setNestedOpen] = useState(false);
  const notifyParent = useContext(NestedModalContext);
  const hydrated = useHydrated();
  const close = () => setOpen(false);

  useEffect(() => {
    notifyParent(open);
    return () => notifyParent(false);
  }, [notifyParent, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          // Disabled until hydrated: before then a click can't open anything, and a
          // button that looks live but ignores the click reads as broken.
          <Button variant={variant === "primary" ? "default" : "secondary"} disabled={!hydrated} aria-busy={!hydrated} />
        }
      >
        {icon ?? <Plus size={15} />}
        {label}
      </DialogTrigger>
      <DialogContent
        className={`max-h-[calc(100vh-2rem)] w-full overflow-y-auto transition-[filter] duration-100 ${
          size === "wide" ? "max-w-3xl sm:max-w-3xl" : size === "compact" ? "max-w-xl sm:max-w-xl" : "max-w-2xl sm:max-w-2xl"
        } ${nestedOpen ? "blur-[2px]" : ""}`}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ModalCloseContext.Provider value={close}>
          <NestedModalContext.Provider value={setNestedOpen}>{children}</NestedModalContext.Provider>
        </ModalCloseContext.Provider>
      </DialogContent>
    </Dialog>
  );
}

export function ModalForm({
  action,
  className,
  children,
}: {
  action: (formData: FormData) => void;
  className?: string;
  children: ReactNode;
}) {
  const close = useModalClose();
  return (
    <form action={action} onSubmit={() => close()} className={className}>
      {children}
    </form>
  );
}

/**
 * The button row every Add/Edit form ends with: primary action full-width on mobile,
 * Cancel beside it. `cancel` is a node so edit forms (URL-driven) can pass a Link.
 */
export function FormActions({ submitLabel, cancel }: { submitLabel: string; cancel?: ReactNode }) {
  return (
    <div className="mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {cancel}
      <Button type="submit" className="sm:min-w-28">
        {submitLabel}
      </Button>
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
