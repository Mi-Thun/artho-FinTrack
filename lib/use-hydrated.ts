"use client";

import { useSyncExternalStore } from "react";

/**
 * False during SSR and the hydration pass, true once React owns the DOM. Buttons whose
 * whole behaviour is client-side (opening a dialog) render disabled until then, so a
 * click in the first moments after navigation is visibly not-yet-ready instead of
 * silently doing nothing.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
