"use client";

import { Select as UiSelect, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

/**
 * A themed dropdown standing in for a plain (non-auto-submitting) native <select> —
 * the browser renders a native <select>'s popup list using OS-level theming that
 * ignores the page's CSS `color-scheme` on some browser/OS combinations, showing an
 * unreadable light popup on this dark theme.
 */
export function Select({
  name,
  defaultValue,
  placeholder,
  options,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  options: { value: string; label: string }[];
}) {
  const labels = new Map(options.map((option) => [option.value, option.label]));

  return (
    // Keyed on the value so that saving new preferences — which re-renders this from the
    // server with a different `defaultValue` — remounts the select on the new default.
    // Base UI reads `defaultValue` once and warns if it changes under an uncontrolled
    // select, and without the remount the trigger would keep showing the stale choice.
    <UiSelect
      key={defaultValue}
      name={name}
      defaultValue={defaultValue}
      itemToStringLabel={(value) => labels.get(String(value)) ?? String(value)}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder ?? "Select…"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </UiSelect>
  );
}
