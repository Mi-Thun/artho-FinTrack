"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { Plus, X } from "lucide-react";

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
    <>
      <button type="button" onClick={() => setOpen(true)} className={variant === "primary" ? "btn-primary" : "btn-secondary"}>
        <Plus size={15} />
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-12 sm:pt-24">
          <div className="fixed inset-0 bg-black/50" onClick={close} aria-hidden="true" />
          <div className="card relative z-10 w-full max-w-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{title}</h2>
              <button type="button" onClick={close} className="btn-ghost !px-1.5" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <ModalCloseContext.Provider value={close}>{children}</ModalCloseContext.Provider>
          </div>
        </div>
      )}
    </>
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
