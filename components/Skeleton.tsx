import { cn } from "@/lib/utils";

/** A placeholder block while content streams in. Decorative: hidden from assistive tech. */
export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} style={style} />;
}
