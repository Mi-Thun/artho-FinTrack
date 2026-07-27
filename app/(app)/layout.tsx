import { ReactNode, Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { auth } from "@/lib/auth";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col md:flex-row" style={{ background: "var(--background)" }}>
      <Suspense fallback={null}>
        <Sidebar user={{ name: session?.user?.name ?? null, email: session?.user?.email ?? null }} />
      </Suspense>
      <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 sm:px-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
