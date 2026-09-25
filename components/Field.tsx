import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A labelled form field: visible label, optional required marker, the control, an
 * optional hint, and the slot `ValidatedForm` writes inline errors into. Every form input
 * goes through this so Add and Edit dialogs label the same field the same way.
 */
export function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label data-field className={cn("flex min-w-0 flex-col gap-1.5 text-sm font-medium", className)}>
      <span>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        )}
      </span>
      {children}
      <span data-field-error aria-live="polite" className="text-xs font-normal text-danger empty:hidden" />
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}
