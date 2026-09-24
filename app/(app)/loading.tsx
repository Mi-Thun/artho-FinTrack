/**
 * Every page under (app) queries the database and reads the session, so none of them can
 * be prerendered. Without a loading boundary the router has nowhere to commit a
 * navigation to, so a click leaves the *old* page on screen until the new one's server
 * render arrives — the URL, `usePathname`, and therefore the sidebar's open submenu all
 * lag behind the click by the full render time.
 *
 * This fallback gives the transition somewhere to land: the navigation commits at once,
 * the sidebar updates, and the page streams in behind this skeleton.
 */
export default function Loading() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-muted" />
          <div className="h-4 w-40 rounded bg-muted" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-muted" />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-card-pad">
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="mt-3 h-6 w-28 rounded bg-muted" />
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl border bg-card p-card-pad">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-4 rounded bg-muted" style={{ width: `${90 - i * 6}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
