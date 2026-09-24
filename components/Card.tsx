import { ReactNode } from "react";
import { Card as UiCard, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function Card({
  title,
  icon,
  action,
  children,
  className = "",
  id,
}: {
  title?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Anchor target, so a page of stacked cards can be linked into section by section. */
  id?: string;
}) {
  return (
    <UiCard id={id} className={cn("p-card-pad gap-4", className)}>
      {(title || action) && (
        <CardHeader className="p-0">
          {title && (
            <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {icon}
              {title}
            </CardTitle>
          )}
          {action && <CardAction>{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className="p-0">{children}</CardContent>
    </UiCard>
  );
}
