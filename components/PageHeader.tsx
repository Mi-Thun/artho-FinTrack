import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ReactNode } from "react";
import { HeaderMenu, type HeaderMenuItem } from "@/components/HeaderMenu";

/**
 * The one header every page uses: title (24/600), a one-line description, then actions —
 * the primary action as a button, secondary navigation-type actions in a "⋯" menu. On
 * narrow screens the action row drops below the title and wraps rather than overflowing.
 */
export function PageHeader({
  title,
  description,
  back,
  actions,
  menu,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** For sub-pages: a link back to the parent page. */
  back?: { href: string; label: string };
  /** Buttons shown inline; put the primary action last so it sits at the right edge. */
  actions?: ReactNode;
  /** Secondary actions that are links (export, related pages) — go into the "⋯" menu. */
  menu?: HeaderMenuItem[];
  /** Controls under the title row, e.g. a month picker. */
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {back && (
            <Link
              href={back.href}
              className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft size={15} aria-hidden />
              {back.label}
            </Link>
          )}
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {(actions || (menu && menu.length > 0)) && (
          <div className="flex flex-wrap items-center gap-2">
            {menu && menu.length > 0 && <HeaderMenu items={menu} />}
            {actions}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
