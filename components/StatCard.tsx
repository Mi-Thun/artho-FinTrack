import { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoHint } from "@/components/InfoHint";

const ICON_TONE: Record<string, string> = {
  neutral: "bg-primary/10 text-link",
  positive: "bg-success-soft text-success",
  negative: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
};

const VALUE_TONE: Record<string, string> = {
  neutral: "",
  positive: "text-success",
  negative: "text-danger",
  warning: "text-warning",
};

/**
 * One headline figure: label, value, and optionally the change since last month, a
 * scope chip ("Lifetime", "Sep 2026") and an explanation behind an ⓘ.
 */
export function StatCard({
  label,
  value,
  icon,
  tone = "neutral",
  hint,
  chip,
  delta,
  size = "default",
  className,
  children,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: "neutral" | "positive" | "negative" | "warning";
  /** Explanation shown behind an ⓘ next to the label. */
  hint?: ReactNode;
  /** Scope of the figure, e.g. "Lifetime" or the selected month. */
  chip?: string;
  /**
   * Change vs the previous period. `good` says whether an increase is good news (income)
   * or bad (spending), which decides the colour; the arrow always follows the sign.
   */
  delta?: { value: number; label: string; good: "up" | "down" };
  size?: "default" | "hero";
  className?: string;
  /** Extra content under the value, e.g. a CTA replacing an empty figure. */
  children?: ReactNode;
}) {
  const deltaGood = delta ? (delta.value >= 0) === (delta.good === "up") : false;
  const DeltaIcon = delta && delta.value < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-xl bg-card p-card-pad ring-1 ring-foreground/10", className)}>
      <div className="flex items-center gap-2">
        {icon && (
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", ICON_TONE[tone])}>{icon}</span>
        )}
        <span className="min-w-0 text-xs font-medium text-balance text-muted-foreground">{label}</span>
        {hint && <InfoHint label={`About ${label}`}>{hint}</InfoHint>}
        {chip && (
          <span className="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
            {chip}
          </span>
        )}
      </div>
      <div
        className={cn(
          "font-semibold tracking-tight tabular-nums break-words",
          size === "hero" ? "text-3xl" : "text-xl",
          VALUE_TONE[tone],
        )}
      >
        {value}
      </div>
      {delta && (
        <div className={cn("flex items-center gap-1 text-xs font-medium", deltaGood ? "text-success" : "text-danger")}>
          <DeltaIcon size={14} aria-hidden />
          <span>{delta.label}</span>
        </div>
      )}
      {children}
    </div>
  );
}
