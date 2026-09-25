import { ReactNode } from "react";
import { Field } from "@/components/Field";

/** Kept for existing call sites; Add and Edit forms now share the same Field styling. */
export function EditField({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <Field label={label} required={required}>
      {children}
    </Field>
  );
}
