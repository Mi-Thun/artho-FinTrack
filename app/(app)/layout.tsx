import { ReactNode, Suspense } from "react";
import { cookies } from "next/headers";
import { Sidebar } from "@/components/Sidebar";
import { SIDEBAR_COOKIE } from "@/lib/sidebar";
import { Toaster } from "@/components/Toaster";
import { auth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const sidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <div className="flex min-h-screen flex-col md:flex-row" style={{ background: "var(--background)" }}>
      <Suspense fallback={null}>
        <Sidebar
          user={{ name: session?.user?.name ?? null, email: session?.user?.email ?? null }}
          defaultCollapsed={sidebarCollapsed}
        />
      </Suspense>
      <main className="min-w-0 flex-1 overflow-x-hidden px-shell-x py-shell-y">
        <div className="mx-auto w-full max-w-shell">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
