"use client";

import { ReactNode } from "react";
import { AppSplash } from "@/components/AppSplash";
import { useHydrated } from "@/lib/use-hydrated";

/**
 * The fallback every (app) loading.tsx renders. Opening the app, the layout's splash gave
 * way as soon as the session and preferences arrived, but the page's own queries take a
 * few round trips longer, so a skeleton flashed up between the splash and the content.
 * On that first, server-rendered load this keeps the splash on screen instead, covering
 * the sidebar too, until the page arrives. Once the app is running, navigating between
 * pages shows the page's skeleton as before.
 */
export function RouteLoading({ children }: { children: ReactNode }) {
  return useHydrated() ? children : <AppSplash overlay />;
}
