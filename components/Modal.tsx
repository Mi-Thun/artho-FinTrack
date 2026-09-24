"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ModalCloseContext = createContext<() => void>(() => {});

export function useModalClose() {
  return useContext(ModalCloseContext);
}

export function Modal({
  label,
  title,
  variant = "primary",
  children,
}: {
  label: string;
  title: string;
  variant?: "primary" | "secondary";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

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
      <DialogContent className="w-full max-w-xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
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
