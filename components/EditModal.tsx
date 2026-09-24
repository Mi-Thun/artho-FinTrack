"use client";

import { useRouter } from "next/navigation";
import { ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * A popup edit form, mounted purely based on whether the caller decides to render it
 * (driven by a `?edit=<id>` query param) — no independent open state of its own.
 * `closeHref` dismisses it by navigating back to the same view without `edit` set.
 */
export function EditModal({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <Dialog open onOpenChange={(next) => !next && router.push(closeHref)}>
      <DialogContent className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
