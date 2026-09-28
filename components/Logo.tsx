import { Playfair_Display } from "next/font/google";
import { cn } from "@/lib/utils";

// The brand's serif, loaded for the logo alone.
const brandSerif = Playfair_Display({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], display: "swap" });

// Metallic fills are fixed, not themed, so the mark reads the same everywhere — except the
// wordmark, whose pale top stops would wash out on a light background, so it deepens there.
const CLIP = "bg-clip-text text-transparent";
const GOLD_WORD =
  "bg-[linear-gradient(135deg,#b8986c_0%,#94764d_55%,#6f5634_100%)] dark:bg-[linear-gradient(135deg,#fcf3d9_0%,#d9c18f_40%,#b8986c_75%,#94764d_100%)]";
const SILVER_WORD =
  "bg-[linear-gradient(135deg,#6b7280_0%,#4b5563_55%,#374151_100%)] dark:bg-[linear-gradient(135deg,#ffffff_0%,#e0e0e0_40%,#a6a6a6_75%,#737373_100%)]";

/**
 * The WealthFlow brand mark and wordmark: an italic white "WF" on a flat orange tile,
 * beside "Wealth" in gold and "Flow" in silver. Drawn in CSS rather than shipped as an
 * image so it stays crisp at small sizes and in both themes.
 */
export function Logo({
  size = "md",
  markOnly = false,
  className,
}: {
  size?: "md" | "lg";
  /** Just the WF tile — for the collapsed sidebar. The name stays for screen readers. */
  markOnly?: boolean;
  className?: string;
}) {
  const large = size === "lg";

  return (
    <div className={cn("flex items-center gap-2.5", brandSerif.className, className)}>
      {/* A flat orange tile with a white monogram. */}
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center",
          // Brand orange, fixed so the mark doesn't shift with the theme.
          "bg-[#eb6834]",
          // Sized so the sidebar's wordmark runs right up to the collapse button; the
          // letters stay small enough to leave a margin of orange all round.
          large ? "h-10 w-11 rounded-[10px] text-[16px]" : "h-9 w-10 rounded-[10px] text-[14px]",
        )}
      >
        {/* Nudged left: the italic leans right, so centring the box alone looks off. */}
        <span className="mr-[0.11em] leading-none font-bold tracking-[-0.055em] text-white italic">WF</span>
      </span>
      <span
        className={cn(
          "leading-none tracking-[-0.017em] dark:drop-shadow-[1px_1px_1px_rgba(0,0,0,0.7)]",
          large ? "text-[30px]" : "text-[26px]",
          markOnly && "sr-only",
        )}
      >
        <span className={cn("font-normal", GOLD_WORD, CLIP)}>Wealth</span>
        <span className={cn("font-bold", SILVER_WORD, CLIP)}>Flow</span>
      </span>
    </div>
  );
}
