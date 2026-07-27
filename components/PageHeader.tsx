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
  description,
  actions,
}: {
  icon?: ReactNode;
  crumbs: Crumb[];
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-topbar">
      <div className="flex flex-col gap-1">
        <nav className="flex items-center gap-1.5 text-sm font-medium">
          {icon && (
            <span className="mr-1 flex h-6 w-6 items-center justify-center" style={{ color: "var(--muted)" }}>
              {icon}
            </span>
          )}
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={14} style={{ color: "var(--muted)" }} />}
              {c.href ? (
                <Link href={c.href} className="transition-colors hover:opacity-80" style={{ color: "var(--muted)" }}>
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
        {description && (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
