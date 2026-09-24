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
}: {
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={rootRef} className="inline-block">
      <UiSelect
        name={name}
        defaultValue={defaultValue ?? options[0]?.value}
        onValueChange={() => {
          requestAnimationFrame(() => rootRef.current?.closest("form")?.requestSubmit());
        }}
      >
        <SelectTrigger className="min-w-[9rem]">
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
