"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Calls `close` when the URL changes. A server action that ends in `redirect()` navigates
 * instead of resolving, so a dialog awaiting it would otherwise stay open on the new page.
 */
export function useCloseOnNavigate(close: () => void) {
  const url = `${usePathname()}?${useSearchParams().toString()}`;
  const lastUrl = useRef(url);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (lastUrl.current === url) return;
    lastUrl.current = url;
    closeRef.current();
  }, [url]);
}
