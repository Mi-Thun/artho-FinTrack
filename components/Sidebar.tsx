"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  PiggyBank,
  PieChart,
  LogOut,
  Menu,
  X,
  User,
  CreditCard,
  ChevronUp,
} from "lucide-react";
import { signOutAction } from "@/app/(app)/actions";

const ACCOUNTS_TABS = [
  { key: "accounts", label: "Bank / Cash Accounts" },
  { key: "loans", label: "Loans" },
  { key: "purchases", label: "Big Purchases" },
  { key: "ledger", label: "Lifetime Income Ledger" },
];

const DEPOSITS_TABS = [
  { key: "dps", label: "DPS" },
  { key: "deposits", label: "SP" },
  { key: "assumptions", label: "Plan Assumptions" },
  { key: "salary", label: "Salary Plan by Year" },
  { key: "milestones", label: "Milestones" },
  { key: "projection", label: "Monthly Projection" },
];

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, tabs: null as { key: string; label: string }[] | null },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, tabs: null },
  { href: "/budgets", label: "Budgets", icon: PieChart, tabs: null },
  { href: "/accounts", label: "Accounts", icon: Wallet, tabs: ACCOUNTS_TABS },
  { href: "/deposits", label: "Deposits", icon: PiggyBank, tabs: DEPOSITS_TABS },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
        A
      </div>
      <span className="text-base font-semibold text-white">Artho</span>
    </div>
  );
}

export function Sidebar({ user }: { user: { name: string | null; email: string | null } }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const displayName = user.name ?? user.email ?? "Account";
  const initial = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    setOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [accountMenuOpen]);

  const activeTab = searchParams.get("tab");

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950 px-4 py-3 md:hidden">
        <Logo />
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-lg p-2 text-slate-300 hover:bg-slate-900 hover:text-white"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar / drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-y-auto bg-slate-950 text-slate-300 transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <Logo />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-900 hover:text-white md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {LINKS.map(({ href, label, icon: Icon, tabs }) => {
            const active = pathname.startsWith(href);
            const defaultTab = tabs?.[0]?.key;
            return (
              <div key={href} className="relative">
                {active && <span className="absolute -left-3 top-1.5 bottom-1.5 w-1 rounded-r-full bg-indigo-400" />}
                <Link
                  href={href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      active ? "bg-white/15" : ""
                    }`}
                  >
                    <Icon size={17} strokeWidth={2} />
                  </span>
                  {label}
                </Link>
                {active && tabs && (
                  <div className="mt-1 mb-1 ml-4 flex flex-col gap-0.5 border-l border-slate-800 pl-3">
                    {tabs.map((t) => {
                      const isTabActive = (activeTab ?? defaultTab) === t.key;
                      return (
                        <Link
                          key={t.key}
                          href={`${href}?tab=${t.key}`}
                          className={`rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                            isTabActive
                              ? "font-medium text-white"
                              : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
                          }`}
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

        <div ref={accountMenuRef} className="relative border-t border-slate-800/80 p-3">
          {accountMenuOpen && (
            <div className="absolute inset-x-3 bottom-full mb-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 shadow-lg">
              <Link
                href="/profile"
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <User size={18} strokeWidth={2} />
                View Profile
              </Link>
              <Link
                href="/subscription"
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <CreditCard size={18} strokeWidth={2} />
                Subscription
              </Link>
              <div className="border-t border-slate-800">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                  >
                    <LogOut size={18} strokeWidth={2} />
                    Log out
                  </button>
                </form>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setAccountMenuOpen((v) => !v)}
            aria-expanded={accountMenuOpen}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-slate-900"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-semibold text-slate-200">
              {initial}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-medium text-white">{user.name ?? user.email ?? "Account"}</p>
              {user.email && user.name && <p className="truncate text-xs text-slate-500">{user.email}</p>}
            </div>
            <ChevronUp
              size={16}
              className={`shrink-0 text-slate-500 transition-transform ${accountMenuOpen ? "" : "rotate-180"}`}
            />
          </button>
        </div>
      </aside>
    </>
  );
}
