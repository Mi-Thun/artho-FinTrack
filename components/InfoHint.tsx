"use client";

import { ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A small ⓘ that opens an explanation on click or keyboard. It replaces the paragraphs of
 * helper copy that used to sit above tables: the explanation is one tap away for anyone
 * who wants it and out of the way for everyone else.
 */
export function InfoHint({
  children,
  label = "More information",
  className,
}: {
  children: ReactNode;
  /** Accessible name of the trigger, e.g. "About source tax". */
  label?: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          className,
        )}
      >
        <Info size={14} aria-hidden />
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-relaxed text-muted-foreground" side="top">
        {children}
      </PopoverContent>
    </Popover>
  );
}
