import { Skeleton } from "@/components/Skeleton";

/**
 * Every page under (app) queries the database and reads the session, so none of them can
 * be prerendered. Without a loading boundary the router has nowhere to commit a
 * navigation to, so a click leaves the *old* page on screen until the new one's server
 * render arrives — the URL, `usePathname`, and therefore the sidebar's open submenu all
 * lag behind the click by the full render time.
 *
 * This fallback gives the transition somewhere to land: the navigation commits at once,
 * the sidebar updates, and the page streams in behind this skeleton. Its shape follows
 * the shared layout — PageHeader, a row of StatCards, then a section card.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl bg-card p-card-pad ring-1 ring-foreground/10">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-32" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-4 rounded-xl bg-card p-card-pad ring-1 ring-foreground/10">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${92 - i * 6}%` }} />
        ))}
      </div>
    </div>
  );
}
