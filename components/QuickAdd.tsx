"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, HandCoins, Landmark, PiggyBank, Plus, Receipt, Repeat, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { translate, type Language } from "@/lib/i18n";

// Each item lands on the page that owns the form, with `?new=` telling that page's Modal
// to open (see Modal's `openParam`).
const ITEMS = [
  { label: "Transaction", href: "/transactions?new=transaction", icon: Receipt },
  { label: "Transfer between accounts", href: "/transactions?new=transfer", icon: ArrowLeftRight },
  { label: "Recurring transaction", href: "/recurring?new=recurring", icon: Repeat },
  { label: "Account", href: "/accounts?new=account", icon: Wallet },
  { label: "Sanchayapatra (SP)", href: "/investments?new=sp", icon: Landmark },
  { label: "DPS plan", href: "/investments?new=dps", icon: PiggyBank },
  { label: "Loan record", href: "/lending?new=loan", icon: HandCoins },
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/**
 * The global "+ New" menu. Press N anywhere (outside a text field or open dialog) to open it.
 */
export function QuickAdd({ compact = false, className, language = "EN" }: { compact?: boolean; className?: string; language?: Language }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      // Don't hijack N while a dialog or menu is open.
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            className={cn(compact ? "size-9 p-0" : "w-full justify-start", className)}
            aria-label="New… (N)"
            title="New… (N)"
          />
        }
      >
        <Plus size={16} />
        {!compact && (
          <>
            <span className="flex-1 text-left">{translate("nav.new", language)}</span>
            <kbd className="rounded border border-white/30 px-1.5 text-[0.7rem] font-medium opacity-80">N</kbd>
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" sideOffset={6} className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Add new</DropdownMenuLabel>
          {ITEMS.map(({ label, href, icon: Icon }) => (
            <DropdownMenuItem key={href} onClick={() => router.push(href)}>
              <Icon size={16} />
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
