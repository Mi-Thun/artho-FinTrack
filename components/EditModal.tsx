import Link from "next/link";
import { X } from "lucide-react";
import { ReactNode } from "react";

/**
 * A popup edit form, server-rendered and open purely based on whether the caller
 * decides to render it (driven by a `?edit=<id>` query param) — no client state.
 * `closeHref` dismisses it by navigating back to the same view without `edit` set.
 */
export function EditModal({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-12 sm:pt-24">
      <Link href={closeHref} className="fixed inset-0 bg-black/50" aria-label="Close" />
      <div className="card relative z-10 w-full max-w-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <Link href={closeHref} className="btn-ghost !px-1.5" aria-label="Close">
            <X size={18} />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
