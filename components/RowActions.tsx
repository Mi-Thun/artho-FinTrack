"use client";

import { ReactNode, useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";
import { ConfirmDialog, type ConfirmOptions } from "@/components/ConfirmDialog";
import { toast } from "@/components/Toaster";
import { runAction } from "@/lib/run-action";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction =
  /** Navigate — e.g. an `?edit=` link that opens the row's edit dialog. */
  | { kind: "link"; label: string; href: string; icon?: ReactNode }
  /** Run straight away — for reversible actions like Pause, Reopen, Restore. */
  | { kind: "run"; label: string; action: () => void | Promise<void>; icon?: ReactNode; successMessage?: string }
  /** Ask first — delete, encash, settle. Destructive items are listed last, after a divider. */
  | ({ kind: "confirm"; label: string; icon?: ReactNode } & ConfirmOptions);

/**
 * A row's actions behind one "⋯" button, instead of a strip of icon buttons that only
 * means something if you already know the icons. Confirm actions open their dialog after
 * the menu closes, so the dialog isn't torn down with the menu.
 */
export function RowActions({ label, actions }: { label: string; actions: RowAction[] }) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useHydrated();
  const active = confirming != null ? actions[confirming] : null;

  const safe = actions.filter((a) => !(a.kind === "confirm" && a.tone !== "default"));
  const destructive = actions.filter((a) => a.kind === "confirm" && a.tone !== "default");

  const item = (a: RowAction) => {
    const index = actions.indexOf(a);
    if (a.kind === "link") {
      return (
        <DropdownMenuItem key={index} render={<Link href={a.href} />}>
          {a.icon}
          {a.label}
        </DropdownMenuItem>
      );
    }
    if (a.kind === "run") {
      return (
        <DropdownMenuItem
          key={index}
          onClick={() =>
            startTransition(async () => {
              if ((await runAction(a.action)) && a.successMessage) toast(a.successMessage);
            })
          }
        >
          {a.icon}
          {a.label}
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuItem
        key={index}
        variant={a.tone === "default" ? "default" : "destructive"}
        onClick={() => setConfirming(index)}
      >
        {a.icon}
        {a.label}…
      </DropdownMenuItem>
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              title="Actions"
              disabled={!hydrated || pending}
              aria-busy={pending || undefined}
            />
          }
        >
          <MoreHorizontal size={16} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {safe.map(item)}
          {safe.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
          {destructive.map(item)}
        </DropdownMenuContent>
      </DropdownMenu>
      {active && active.kind === "confirm" && (
        <ConfirmDialog
          {...active}
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
        />
      )}
    </>
  );
}
