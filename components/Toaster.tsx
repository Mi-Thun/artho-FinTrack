"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

// A module-level store rather than context: `toast()` has to be callable from any
// client component's event handler or action wrapper without threading a provider hook
// through every form.
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function toast(message: string, tone: ToastTone = "success") {
  const id = nextId++;
  items = [...items.slice(-2), { id, message, tone }];
  emit();
  window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
}

function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const EMPTY: ToastItem[] = [];

function useToasts() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => items,
    () => EMPTY,
  );
}

const TONE: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "border-l-success [&_svg.tone]:text-success" },
  error: { icon: AlertCircle, className: "border-l-danger [&_svg.tone]:text-danger" },
  info: { icon: Info, className: "border-l-info [&_svg.tone]:text-info" },
};

/** Mounted once in the app layout; renders whatever `toast()` has queued. */
export function Toaster() {
  const toasts = useToasts();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-4 z-[100] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-4"
    >
      {toasts.map((t) => {
        const { icon: Icon, className } = TONE[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-l-4 bg-popover px-4 py-3 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2 sm:w-auto sm:min-w-72",
              className,
            )}
          >
            <Icon size={16} className="tone mt-0.5 shrink-0" aria-hidden />
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss notification"
              className="-m-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Shows a toast once on mount — for results a server redirect reports through the URL
 * (`?profileUpdated=success`), which have no client-side action wrapper to call `toast()`.
 */
export function FlashToast({
  message,
  tone = "success",
  clearParam,
}: {
  message: string;
  tone?: ToastTone;
  /** The query param that carried the result; removed afterwards so a reload doesn't repeat the toast. */
  clearParam?: string;
}) {
  // Strict Mode runs effects twice in development; the ref survives that, so it's once.
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast(message, tone);
    if (clearParam) {
      const url = new URL(window.location.href);
      url.searchParams.delete(clearParam);
      window.history.replaceState(window.history.state, "", url);
    }
  }, [message, tone, clearParam]);
  return null;
}
