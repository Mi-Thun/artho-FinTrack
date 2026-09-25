"use client";

import { useRef } from "react";
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
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  ariaLabel?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const labels = new Map(options.map((o) => [o.value, o.label]));

  return (
    <div ref={rootRef} className="inline-block">
      <UiSelect
        name={name}
        defaultValue={defaultValue ?? options[0]?.value}
        // Without this the closed trigger shows the raw value ("2026-09"), not "Sep 2026".
        itemToStringLabel={(value) => labels.get(String(value)) ?? String(value)}
        onValueChange={() => {
          requestAnimationFrame(() => rootRef.current?.closest("form")?.requestSubmit());
        }}
      >
        <SelectTrigger className="min-w-[9rem]" aria-label={ariaLabel}>
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
