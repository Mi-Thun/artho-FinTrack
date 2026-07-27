"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * A self-styled dropdown that submits its parent form on selection — a native
 * <select>'s replacement, since the browser renders a native <select>'s popup list
 * using OS-level theming that ignores the page's CSS `color-scheme` on some
 * browser/OS combinations, showing an unreadable light popup on this dark theme.
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
  const [value, setValue] = useState(defaultValue ?? options[0]?.value ?? "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, [open]);

  const current = options.find((o) => o.value === value);

  function choose(v: string) {
    setValue(v);
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.form?.requestSubmit());
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <input ref={inputRef} type="hidden" name={name} value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input flex min-w-[9rem] items-center justify-between gap-2 text-left"
      >
        <span className="truncate">{current?.label ?? "Select…"}</span>
        <ChevronDown size={14} style={{ color: "var(--muted)" }} />
      </button>
      {open && (
        <div className="card absolute left-0 top-full z-30 mt-1 max-h-64 w-full min-w-max overflow-y-auto !p-1 shadow-lg">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => choose(o.value)}
              className="flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-[var(--surface-muted)]"
            >
              {o.label}
              {o.value === value && <Check size={14} style={{ color: "var(--accent)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
