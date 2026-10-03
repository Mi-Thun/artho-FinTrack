import { AppSplash } from "@/components/AppSplash";

// Where the installed app starts (manifest start_url). Opening it straight on /dashboard
// meant a blank screen while a cold server started; this page is static, so it comes from
// Vercel's edge cache at once, paints the splash, and then moves on to the dashboard. The
// phone keeps the splash on screen until the dashboard starts arriving, and the app
// layout streams the same splash first, so the hand-over doesn't show.
//
// replace() keeps /launch out of history, so Back from the dashboard leaves the app. The
// extra frame lets the splash paint before the navigation starts.
const GO_TO_DASHBOARD = `requestAnimationFrame(function(){setTimeout(function(){location.replace("/dashboard")})})`;

export default function LaunchPage() {
  return (
    <>
      <AppSplash />
      <script dangerouslySetInnerHTML={{ __html: GO_TO_DASHBOARD }} />
      <noscript>
        <meta httpEquiv="refresh" content="0; url=/dashboard" />
      </noscript>
    </>
  );
}
