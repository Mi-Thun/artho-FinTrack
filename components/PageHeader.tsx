import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ReactNode } from "react";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  icon,
  crumbs,
  actions,
}: {
  icon?: ReactNode;
  crumbs: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
      <div className="flex flex-col gap-1">
        <nav className="flex items-center gap-1.5 text-sm font-medium">
          {icon && <span className="mr-1 flex h-6 w-6 items-center justify-center text-muted-foreground">{icon}</span>}
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={14} className="text-muted-foreground" />}
              {c.href ? (
                <Link href={c.href} className="text-muted-foreground transition-colors hover:opacity-80">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
