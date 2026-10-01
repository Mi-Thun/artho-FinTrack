"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/Toaster";

/** A value with a button that copies it, for pasting into NBR's eReturn site. */
export function CopyValue({ text, copy, className }: { text: string; copy?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (copy == null) return <span className={cn("tabular-nums text-muted-foreground", className)}>{text}</span>;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(copy!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast("Couldn't copy — select the value and copy it by hand", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      title={`Copy ${copy}`}
      aria-label={`Copy ${text}`}
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left tabular-nums transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      <span className="truncate">{text}</span>
      {copied ? (
        <Check size={13} className="shrink-0 text-success" aria-hidden />
      ) : (
        <Copy size={13} className="shrink-0 text-muted-foreground opacity-60 group-hover:opacity-100" aria-hidden />
      )}
    </button>
  );
}
