import { cn } from "@/lib/utils";

/**
 * The WealthFlow brand mark and wordmark.
 *
 * The mark is the taka sign on a gradient squircle. Every figure in the app is BDT, so ৳
 * says what the product is at a glance, and it stays legible at 32px where a drawn glyph
 * would turn to mush. Its colours are fixed rather than themed — a mark that changes hue
 * with the theme stops being a mark — while the wordmark inherits the surrounding text
 * colour so it sits correctly on the sidebar, the mobile bar, or a bare auth page.
 */
export function Logo({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const large = size === "lg";

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        aria-hidden
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden",
          // The inset top highlight and the coloured drop shadow do the work a flat fill
          // can't: they give the tile an edge against a light card and a dark one alike.
          "bg-[linear-gradient(145deg,#8f92f7_0%,#4f46e5_52%,#6d28d9_100%)]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.32),0_3px_8px_-2px_rgba(79,70,229,0.5)]",
          large ? "h-9 w-9 rounded-xl text-[19px]" : "h-8 w-8 rounded-[10px] text-[17px]",
        )}
      >
        <span className="pointer-events-none absolute -top-4 -left-3 h-8 w-10 rotate-[-20deg] rounded-full bg-white/25 blur-[7px]" />
        <span className="relative leading-none font-semibold text-white">৳</span>
      </span>
      <span className={cn("font-semibold tracking-tight", large ? "text-lg" : "text-[17px]")}>WealthFlow</span>
    </div>
  );
}
