import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

/**
 * Full-screen loading screen for opening the app: the logo over a sliding bar. Shown
 * while the app layout waits on the session and preferences, then (as `overlay`, over the
 * sidebar) until the first page arrives — see RouteLoading — and by /launch, where the
 * installed app starts. Plain markup and CSS, so it paints before any JavaScript loads.
 */
export function AppSplash({ overlay = false }: { overlay?: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-background px-4",
        // Above the sidebar (z-30); dialogs can't be open yet on a first load.
        overlay && "fixed inset-0 z-40",
      )}
    >
      <Logo size="lg" />
      <div aria-hidden className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div className="splash-bar h-full w-1/3 rounded-full bg-primary" />
      </div>
      <span className="sr-only">Loading WealthFlow</span>
    </div>
  );
}
