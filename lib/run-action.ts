"use client";

import { toast } from "@/components/Toaster";

/** Next's redirect()/notFound() work by throwing; those must reach the router untouched. */
function isNavigationSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR"));
}

/**
 * Runs a server action from a client wrapper. A failure (network, database) becomes an
 * error toast and a `false` return — so the dialog stays open with the user's input —
 * instead of an unhandled rejection that swaps the page for the error screen.
 */
export async function runAction(run: () => void | Promise<void>): Promise<boolean> {
  try {
    await run();
    return true;
  } catch (error) {
    if (isNavigationSignal(error)) throw error;
    console.error(error);
    toast("Something went wrong and nothing was saved. Please try again.", "error");
    return false;
  }
}
