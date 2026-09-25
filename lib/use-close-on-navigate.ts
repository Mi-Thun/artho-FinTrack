"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Calls `close` when the URL changes. A server action that ends in `redirect()` navigates
 * instead of resolving, so a dialog awaiting it would otherwise stay open on the new page.
 */
export function useCloseOnNavigate(close: () => void) {
  // `new` is the quick-add param that *opens* a form (see Modal's `openParam`); clearing it
  // once the form is open isn't navigating away.
  const params = new URLSearchParams(useSearchParams().toString());
  params.delete("new");
  const url = `${usePathname()}?${params.toString()}`;
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
