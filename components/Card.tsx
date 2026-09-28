import { ReactNode } from "react";
import { Card as UiCard, CardContent, CardHeader, CardTitle, CardAction, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * A titled section of a page. Titles are sentence case, 16/600 — the old grey ALL-CAPS
 * headers read as a second, competing page title.
 *
 * Don't give a card inside a dialog the dialog's own title; leave `title` off instead.
 */
export function Card({
  title,
  description,
  icon,
  action,
  children,
  className = "",
  id,
}: {
  title?: string;
  description?: ReactNode;
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
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              {icon && <span className="text-muted-foreground">{icon}</span>}
              {title}
            </CardTitle>
          )}
          {description && <CardDescription>{description}</CardDescription>}
          {action && <CardAction className="flex flex-wrap items-center justify-end gap-2">{action}</CardAction>}
        </CardHeader>
      )}
      <CardContent className="p-0">{children}</CardContent>
    </UiCard>
  );
}
