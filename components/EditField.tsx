import { ReactNode } from "react";

export function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
      {label}
      {children}
    </label>
  );
}
