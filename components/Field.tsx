import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A labelled form field: visible label, optional required marker, the control, and an
 * optional hint underneath. Every form input goes through this so Add and Edit dialogs
 * label the same field the same way.
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
    <label className={cn("flex min-w-0 flex-col gap-1.5 text-sm font-medium", className)}>
      <span>
        {label}
        {required && (
          <span aria-hidden className="ml-0.5 text-destructive">
            *
          </span>
        )}
      </span>
      {children}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}
