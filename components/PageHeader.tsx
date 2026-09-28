import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
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
  picker,
  mobileMenu,
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
  /** A period picker, on the title's line on every screen. */
  picker?: ReactNode;
  /**
   * Keeps a phone's header to one line — the title, any picker and a "⋯": the action
   * buttons are hidden there and these items, links that open the same forms, lead the
   * "⋯" menu instead.
   */
  mobileMenu?: HeaderMenuItem[];
  /** Controls under the title row. */
  children?: ReactNode;
}) {
  const phoneMenu = [...(mobileMenu ?? []), ...(menu ?? [])];
  // One line on a phone whenever something needs to share it with the title.
  const oneLine = picker != null || mobileMenu != null;
  return (
    <header className="flex flex-col gap-4 border-b pb-5">
      <div className={cn("flex flex-wrap justify-between gap-y-3", oneLine ? "items-center gap-x-2 sm:gap-x-4" : "items-end gap-x-4")}>
        <div className={cn("flex min-w-0 flex-col gap-1", oneLine && "mr-auto")}>
          {back && (
            <Link
              href={back.href}
              className="-ml-1 inline-flex w-fit items-center gap-0.5 rounded text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft size={15} aria-hidden />
              {back.label}
            </Link>
          )}
          <h1 className={cn("font-semibold tracking-tight", picker ? "text-xl sm:text-2xl" : "text-2xl")}>{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {picker}
        {oneLine && phoneMenu.length > 0 && (
          <div className="sm:hidden">
            <HeaderMenu items={phoneMenu} />
          </div>
        )}
        {(actions || (menu && menu.length > 0)) && (
          // On one line these are wide-screen only; the phone "⋯" above stands in. Hidden
          // with CSS, not left out, so a form's dialog can still open from its ?new= link.
          <div className={cn("flex-wrap items-center gap-2", oneLine && phoneMenu.length > 0 ? "hidden sm:flex" : "flex")}>
            {menu && menu.length > 0 && <HeaderMenu items={menu} />}
            {actions}
          </div>
        )}
      </div>
      {children}
    </header>
  );
}
