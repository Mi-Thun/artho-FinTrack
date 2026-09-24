import { ReactNode } from "react";

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-primary/10 text-primary",
  positive: "text-[var(--status-success)]",
  negative: "text-[var(--status-danger)]",
};

const ICON_TONE_CLASSES: Record<string, string> = {
  neutral: "bg-primary/10 text-primary",
  positive: "bg-[var(--status-success-soft)] text-[var(--status-success)]",
  negative: "bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
};

export function StatTile({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon?: ReactNode;
  tone?: "neutral" | "positive" | "negative";
}) {
  return (
    <div className="flex items-start gap-3">
      {icon && (
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${ICON_TONE_CLASSES[tone]}`}>
          {icon}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Wraps rather than truncates: six tiles across a 1280px row leave no space for
            a label like "Passive Income to Date", and a clipped label reads as a bug. */}
        <span className="text-xs font-medium text-balance text-muted-foreground">{label}</span>
        <span className={`break-words text-lg font-bold tracking-tight sm:text-xl ${tone !== "neutral" ? TONE_CLASSES[tone] : ""}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
