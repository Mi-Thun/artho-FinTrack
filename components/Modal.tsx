"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Plus } from "lucide-react";
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
  variant = "primary",
  size = "default",
  children,
}: {
  label: string;
  title: string;
  variant?: "primary" | "secondary";
  size?: "compact" | "default" | "wide";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [nestedOpen, setNestedOpen] = useState(false);
  const notifyParent = useContext(NestedModalContext);
  const close = () => setOpen(false);

  useEffect(() => {
    notifyParent(open);
    return () => notifyParent(false);
  }, [notifyParent, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={variant === "primary" ? "default" : "secondary"}>
            <Plus size={15} />
            {label}
          </Button>
        }
      />
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
