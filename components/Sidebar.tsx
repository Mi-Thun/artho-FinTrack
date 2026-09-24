"use client";

import { useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  HandCoins,
  Target,
  Home,
  Settings,
  LogOut,
  Menu,
  User,
  CreditCard,
  ChevronUp,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const TRANSACTIONS_TABS = [
  { key: "transactions", label: "Transactions" },
  { key: "recurring", label: "Recurring Transaction" },
  { key: "budgets", label: "Budgets" },
];

const ACCOUNTS_TABS = [
  { key: "accounts", label: "Bank / Cash Accounts" },
  { key: "ledger", label: "Lifetime Income Ledger" },
];

const DEPOSITS_TABS = [
  { key: "dps", label: "DPS" },
  { key: "deposits", label: "SP (Sanchayapatra)" },
];

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tabs: null as { key: string; label: string }[] | null },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, tabs: TRANSACTIONS_TABS },
  { href: "/accounts", label: "Accounts", icon: Wallet, tabs: ACCOUNTS_TABS },
  { href: "/deposits", label: "Deposits", icon: PiggyBank, tabs: DEPOSITS_TABS },
  { href: "/goals", label: "Goals", icon: Target, tabs: null },
  { href: "/lending", label: "Lending", icon: HandCoins, tabs: null },
  { href: "/household", label: "Household", icon: Home, tabs: null },
];

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  const next = { system: "light", light: "dark", dark: "system" } as const;
  const icons = { system: Monitor, light: Sun, dark: Moon } as const;
  const current = mounted ? ((theme as keyof typeof next) ?? "system") : "system";
  const Icon = icons[current];

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(next[current])}
      aria-label={`Theme: ${current}. Click to switch.`}
      suppressHydrationWarning
      className="shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <Icon size={16} />
    </Button>
  );
}

/** A modified click opens a new tab, so the current one's highlight must not move. */
function opensInThisTab(e: MouseEvent<HTMLAnchorElement>) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function NavContent({ pathname, activeTab }: { pathname: string; activeTab: string | null }) {
  const activeHref = LINKS.find((l) => pathname.startsWith(l.href))?.href ?? null;

  // Which item is highlighted and expanded follows the *click*, not the committed route.
  // `pathname` and `searchParams` only change once the destination has rendered on the
  // server, so deriving the open submenu from them alone left the menu frozen for the
  // whole page load. `selection` runs ahead optimistically and is re-synced below
  // whenever the router does commit — which also covers back/forward and redirects.
  const [selection, setSelection] = useState({ href: activeHref, tab: activeTab });
  const committed = [activeHref, activeTab].join("|");
  const [lastCommitted, setLastCommitted] = useState(committed);
  if (committed !== lastCommitted) {
    setLastCommitted(committed);
    setSelection({ href: activeHref, tab: activeTab });
  }

  return (
    <nav className="flex-1 space-y-0.5 px-3">
      {LINKS.map(({ href, label, icon: Icon, tabs }) => {
        const active = selection.href === href;
        const defaultTab = tabs?.[0]?.key;
        return (
          <div key={href}>
            <Link
              href={href}
              onClick={(e) => {
                if (opensInThisTab(e)) setSelection({ href, tab: null });
              }}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", active && "bg-white/15")}>
                <Icon size={17} strokeWidth={2} />
              </span>
              <span className="flex-1">{label}</span>
              {tabs &&
                (active ? (
                  <ChevronDown size={15} className="shrink-0 opacity-70" />
                ) : (
                  <ChevronRight size={15} className="shrink-0 opacity-70" />
                ))}
            </Link>
            {active && tabs && (
              <div className="mt-0.5 mb-0.5 ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-3">
                {tabs.map((t) => {
                  const isTabActive = (selection.tab ?? defaultTab) === t.key;
                  return (
                    <Link
                      key={t.key}
                      href={`${href}?tab=${t.key}`}
                      onClick={(e) => {
                        if (opensInThisTab(e)) setSelection({ href, tab: t.key });
                      }}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-sm transition-colors",
                        isTabActive
                          ? "font-medium text-sidebar-foreground"
                          : "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground/80",
                      )}
                    >
                      {t.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function AccountFooter({ user }: { user: { name: string | null; email: string | null } }) {
  const displayName = user.name ?? user.email ?? "Account";
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-1 border-t border-sidebar-border p-3">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              className="h-auto flex-1 justify-start gap-2.5 rounded-lg px-2 py-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground"
            />
          }
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-semibold">
            {initial}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{user.name ?? user.email ?? "Account"}</p>
            {user.email && user.name && <p className="truncate text-xs text-sidebar-foreground/50">{user.email}</p>}
          </div>
          <ChevronUp size={16} className="shrink-0 text-sidebar-foreground/50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
          <DropdownMenuItem render={<Link href="/profile" />}>
            <User size={16} strokeWidth={2} />
            View Profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings size={16} strokeWidth={2} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/subscription" />}>
            <CreditCard size={16} strokeWidth={2} />
            Subscription
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <form action={signOutAction}>
            {/* `nativeButton` because this item really is a <button> — the menu item renders a
                <div> otherwise, and Base UI would add the role and aria attributes a native
                button already carries. */}
            <DropdownMenuItem nativeButton render={<button type="submit" className="w-full" />}>
              <LogOut size={16} strokeWidth={2} />
              Log out
            </DropdownMenuItem>
          </form>
        </DropdownMenuContent>
      </DropdownMenu>
      <ThemeToggle />
    </div>
  );
}

export function Sidebar({ user }: { user: { name: string | null; email: string | null } }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  const activeTab = searchParams.get("tab");

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-sidebar-border bg-sidebar px-4 py-3 md:hidden">
        <Logo className="text-sidebar-foreground" />
        <Sheet open={open} onOpenChange={setOpen}>
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
          <SheetContent side="left" showCloseButton={false} className="w-64 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-64">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-full flex-col overflow-y-auto">
              <div className="px-5 py-5">
                <Logo className="text-sidebar-foreground" />
              </div>
              <NavContent pathname={pathname} activeTab={activeTab} />
              <AccountFooter user={user} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 z-30 hidden h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="px-5 py-5">
          <Logo className="text-sidebar-foreground" />
        </div>
        <NavContent pathname={pathname} activeTab={activeTab} />
        <AccountFooter user={user} />
      </aside>
    </>
  );
}
