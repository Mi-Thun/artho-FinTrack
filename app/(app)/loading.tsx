import { CardSkeleton, HeaderSkeleton, StatRowSkeleton } from "@/components/PageSkeleton";

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
      <HeaderSkeleton />
      <StatRowSkeleton />
      <CardSkeleton rows={8} />
    </div>
  );
}
