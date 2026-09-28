"use client";

import { RefObject, useEffect, useState } from "react";

/**
 * The current values of the form enclosing `ref`, for live previews. Base UI selects write
 * hidden inputs without firing input events, so this samples on a short interval.
 */
export function useFormValues(ref: RefObject<HTMLElement | null>, intervalMs = 400): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const read = () => {
      const next = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]));
      setValues((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    read();
    const timer = window.setInterval(read, intervalMs);
    return () => window.clearInterval(timer);
  }, [ref, intervalMs]);
  return values;
}
