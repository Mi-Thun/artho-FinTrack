"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * A one-line note that's cut off with an ellipsis when it doesn't fit. The hover title only
 * helps with a mouse, so a note that is actually cut off also opens its full text on tap.
 * Notes that fit stay plain text: nothing to tap, nothing to focus.
 *
 * In a stacked mobile card, `min-w-0 flex-1` lets it shrink beside the cell's label rather
 * than wrap onto a line of its own; pair it with `max-sm:flex-nowrap` on the cell.
 */
export function TruncatedNote({ note, className }: { note: string | null; className?: string }) {
  // A state ref, not useRef: the span remounts inside the popover trigger once it's found
  // to be cut off, and the observer has to follow it there.
  const [el, setEl] = useState<HTMLSpanElement | null>(null);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!el) return;
    const measure = () => setTruncated(el.scrollWidth > el.clientWidth);
    measure();
    // Column width changes with the viewport (rotating a phone, resizing a window).
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, note]);

  const text = (
    <span ref={setEl} className={cn("block min-w-0 flex-1 truncate", className)} title={note ?? undefined}>
      {note ?? "—"}
    </span>
  );

  if (!note || !truncated) return text;

  return (
    <Popover>
      <PopoverTrigger aria-label={`Show full note: ${note}`} className="block w-full min-w-0 flex-1 cursor-pointer text-left max-sm:text-right">
        {text}
      </PopoverTrigger>
      <PopoverContent className="w-auto max-w-[min(20rem,calc(100vw-2rem))] text-sm break-words whitespace-normal" side="top">
        {note}
      </PopoverContent>
    </Popover>
  );
}
