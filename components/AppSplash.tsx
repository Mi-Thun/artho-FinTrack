import { Logo } from "@/components/Logo";

/**
 * Full-screen loading screen for opening the app: the logo over a sliding bar. Shown
 * while the app layout waits on the session and preferences, and by /launch, where the
 * installed app starts. Plain markup and CSS, so it paints before any JavaScript loads.
 */
export function AppSplash() {
  return (
    <div role="status" className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-6 bg-background px-4">
      <Logo size="lg" />
      <div aria-hidden className="h-1 w-40 overflow-hidden rounded-full bg-muted">
        <div className="splash-bar h-full w-1/3 rounded-full bg-primary" />
      </div>
      <span className="sr-only">Loading WealthFlow</span>
    </div>
  );
}
