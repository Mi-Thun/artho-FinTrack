import { ReactNode, Suspense } from "react";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { Toaster } from "@/components/Toaster";
import { LocaleProvider } from "@/components/LocaleProvider";
import { auth } from "@/lib/auth";
import { getPreferences } from "@/lib/preferences";
import { AppSplash } from "@/components/AppSplash";

// The frame below waits on the session and preferences before it can render. Opening the
// app cold, that wait (plus waking the database) left the screen blank for seconds; this
// boundary streams the splash at once and swaps the app in when it is ready. Navigating
// between pages keeps the layout, so the splash only shows on a full load.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AppSplash />}>
      <AppFrame>{children}</AppFrame>
    </Suspense>
  );
}

async function AppFrame({ children }: { children: ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";
  const prefs = session?.user?.id ? await getPreferences(session.user.id) : null;
  const language = prefs?.language ?? "EN";

  return (
    <div className="flex min-h-screen flex-col md:flex-row" style={{ background: "var(--background)" }} lang={language === "BN" ? "bn" : "en"}>
      {/* First tab stop: jump past the navigation to the page itself. */}
      <a
        href="#main"
        className="sr-only z-[200] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <Suspense fallback={null}>
        <Sidebar
          user={{ name: session?.user?.name ?? null, email: session?.user?.email ?? null }}
          defaultCollapsed={sidebarCollapsed}
          language={language}
        />
      </Suspense>
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 overflow-x-hidden px-shell-x py-shell-y outline-none">
        <div className="mx-auto w-full max-w-shell">
          <LocaleProvider language={language} numerals={prefs?.numerals ?? "WESTERN"}>
            {children}
          </LocaleProvider>
        </div>
      </main>
      <Toaster />
    </div>
  );
}
