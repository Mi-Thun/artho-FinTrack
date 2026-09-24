import { ReactNode } from "react";
import { Label } from "@/components/ui/label";

export function EditField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="flex flex-col items-start gap-1 text-xs font-medium text-muted-foreground">
      {label}
      {children}
    </Label>
  );
}
