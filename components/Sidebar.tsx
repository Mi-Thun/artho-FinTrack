"use client";

import { useState, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeftRight,
  BookOpen,
  ChevronUp,
  CreditCard,
  DatabaseBackup,
  FileText,
  HandCoins,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  PiggyBank,
  Repeat,
  Settings,
  Sun,
  Target,
  User,
  Wallet,
} from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/lib/use-hydrated";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { translate, type Language, type MessageKey } from "@/lib/i18n";


// Labels are message keys, so the sidebar follows the Language setting.
const GROUPS: { label: MessageKey; links: { href: string; label: MessageKey; icon: typeof LayoutDashboard }[] }[] = [
  { label: "nav.overview", links: [{ href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard }] },
  {
    label: "nav.money",
    links: [
      { href: "/transactions", label: "nav.transactions", icon: ArrowLeftRight },
      { href: "/accounts", label: "nav.accounts", icon: Wallet },
      { href: "/budgets", label: "nav.budgets", icon: PieChart },
      { href: "/recurring", label: "nav.recurring", icon: Repeat },
      { href: "/income-ledger", label: "nav.incomeLedger", icon: BookOpen },
    ],
  },
  {
    label: "nav.wealth",
    links: [
      { href: "/investments", label: "nav.investments", icon: PiggyBank },
      { href: "/goals", label: "nav.goalsProjection", icon: Target },
    ],
  },
  { label: "nav.tax", links: [{ href: "/ereturn", label: "nav.ereturn", icon: FileText }] },
  {
    label: "nav.people",
    links: [
      { href: "/lending", label: "nav.lending", icon: HandCoins },
      { href: "/household", label: "nav.household", icon: Home },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** A modified click opens a new tab, so the current one's highlight must not move. */
function opensInThisTab(e: MouseEvent<HTMLAnchorElement>) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function NavContent({ pathname, collapsed, language }: { pathname: string; collapsed: boolean; language: Language }) {
  const t = (key: MessageKey) => translate(key, language);
  // Which item is highlighted follows the *click*, not the committed route: `pathname`
  // only changes once the destination has rendered on the server, so deriving the
  // highlight from it alone left the menu frozen for the whole page load. `selected`
  // runs ahead optimistically and re-syncs whenever the router commits (back/forward,
  // redirects).
  const [selected, setSelected] = useState(pathname);
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setSelected(pathname);
  }

  return (
    <nav aria-label="Main" className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
      {GROUPS.map((group) => (
        <div key={group.label} className="mt-4 first:mt-1">
          {collapsed ? (
            <div className="mx-2 mb-2 border-t border-sidebar-border" aria-hidden />
          ) : (
            <p className="px-3 pb-1 text-xs font-medium text-sidebar-foreground/60">{t(group.label)}</p>
          )}
          <ul className="space-y-0.5">
            {group.links.map(({ href, label: labelKey, icon: Icon }) => {
              const label = t(labelKey);
              const active = isActive(selected, href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? label : undefined}
                    aria-label={collapsed ? label : undefined}
                    onClick={(e) => {
                      if (opensInThisTab(e)) setSelected(href);
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      collapsed && "justify-center px-0",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon size={18} strokeWidth={2} className="shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ThemeOptions({ t }: { t: (key: MessageKey) => string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{t("nav.theme")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={hydrated ? (theme ?? "system") : "system"} onValueChange={(value) => setTheme(String(value))}>
        <DropdownMenuRadioItem value="light">
          <Sun size={16} />
          {t("nav.themeLight")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark">
          <Moon size={16} />
          {t("nav.themeDark")}
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="system">
          <Monitor size={16} />
          {t("nav.themeSystem")}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  );
}

function AccountMenu({
  user,
  collapsed,
  language,
}: {
  user: { name: string | null; email: string | null };
  collapsed: boolean;
  language: Language;
}) {
  const t = (key: MessageKey) => translate(key, language);
  const displayName = user.name ?? user.email ?? "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="shrink-0 border-t border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              aria-label={`Account menu for ${displayName}`}
              className={cn(
                "h-auto w-full gap-2.5 rounded-lg px-2 py-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent",
                collapsed ? "justify-center px-0" : "justify-start",
              )}
            />
          }
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold">
            {initial}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-medium">{displayName}</span>
                {user.email && user.name && <span className="block truncate text-xs text-sidebar-foreground/60">{user.email}</span>}
              </span>
              <ChevronUp size={16} className="shrink-0 text-sidebar-foreground/60" aria-hidden />
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-60">
          <DropdownMenuItem render={<Link href="/profile" />}>
            <User size={16} />
            {t("nav.profile")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings size={16} />
            {t("nav.settings")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/backup" />}>
            <DatabaseBackup size={16} />
            {t("nav.backup")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/subscription" />}>
            <CreditCard size={16} />
            {t("nav.subscription")}
            <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[0.65rem] font-medium text-muted-foreground">{t("nav.soon")}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ThemeOptions t={t} />
          <DropdownMenuSeparator />
          <form action={signOutAction}>
            {/* `nativeButton` because this item really is a <button> — the menu item renders a
                <div> otherwise, and Base UI would add the role and aria attributes a native
                button already carries. */}
            <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
              <LogOut size={16} />
              {t("nav.logout")}
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function Sidebar({
  user,
  defaultCollapsed = false,
  language = "EN",
}: {
  user: { name: string | null; email: string | null };
  defaultCollapsed?: boolean;
  language?: Language;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setDrawerOpen(false);
  }

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <>
      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-4 py-3 md:hidden">
        <Link href="/dashboard" aria-label="WealthFlow — dashboard" className="rounded-lg">
          <Logo className="text-sidebar-foreground" />
        </Link>
        <div className="flex items-center gap-1">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Open menu"
                  className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                />
              }
            >
              <Menu size={22} />
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-72"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-full flex-col">
                <div className="px-5 py-5">
                  <Link
                    href="/dashboard"
                    aria-label="WealthFlow — dashboard"
                    onClick={() => setDrawerOpen(false)}
                    className="inline-block rounded-lg"
                  >
                    <Logo className="text-sidebar-foreground" />
                  </Link>
                </div>
                <NavContent pathname={pathname} collapsed={false} language={language} />
                <AccountMenu user={user} collapsed={false} language={language} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Desktop sidebar: a fixed-height column — the nav scrolls, the account footer never
          moves or clips, and nothing scrolls sideways. */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-150 md:flex",
          collapsed ? "w-[4.5rem]" : "w-64",
        )}
      >
        {collapsed ? (
          // One slot, not two stacked: the logo, which turns into the expand button on
          // hover or keyboard focus. Tapping it on a touch screen expands too.
          <div className="flex justify-center px-4 pt-5 pb-3">
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              aria-expanded={false}
              className="group relative flex h-9 w-10 items-center justify-center rounded-[10px] text-sidebar-foreground/70 outline-none hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Logo
                markOnly
                className="text-sidebar-foreground transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0"
              />
              <PanelLeftOpen
                size={16}
                aria-hidden
                className="absolute opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
              />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 px-4 pt-5 pb-3">
            <Link href="/dashboard" aria-label="WealthFlow — dashboard" className="rounded-lg">
              <Logo className="text-sidebar-foreground" />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={toggleCollapsed}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              aria-expanded
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <PanelLeftClose size={16} />
            </Button>
          </div>
        )}
        <NavContent pathname={pathname} collapsed={collapsed} language={language} />
        <AccountMenu user={user} collapsed={collapsed} language={language} />
      </aside>
    </>
  );
}
