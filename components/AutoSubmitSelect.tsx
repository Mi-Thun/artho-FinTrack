"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Select as UiSelect, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/**
 * A themed dropdown that submits its parent form on selection — a native <select>'s
 * replacement, since the browser renders a native <select>'s popup list using
 * OS-level theming that ignores the page's CSS `color-scheme` on some browser/OS
 * combinations, showing an unreadable light popup on this dark theme.
 */
export function AutoSubmitSelect({
  name,
  defaultValue,
  options,
  ariaLabel,
  className,
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  ariaLabel?: string;
  /** Classes for the trigger, e.g. to narrow it below the default width. */
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const labels = new Map(options.map((o) => [o.value, o.label]));
  const initial = defaultValue ?? options[0]?.value;

  return (
    <div ref={rootRef} className="inline-block">
      <UiSelect
        // Remount when the server sends a new default (e.g. prev/next month links),
        // since an uncontrolled Select ignores defaultValue changes after mount.
        key={initial}
        name={name}
        defaultValue={initial}
        // Without this the closed trigger shows the raw value ("2026-09"), not "Sep 2026".
        itemToStringLabel={(value) => labels.get(String(value)) ?? String(value)}
        onValueChange={() => {
          requestAnimationFrame(() => rootRef.current?.closest("form")?.requestSubmit());
        }}
      >
        <SelectTrigger className={cn("min-w-[9rem]", className)} aria-label={ariaLabel}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </UiSelect>
    </div>
  );
}
