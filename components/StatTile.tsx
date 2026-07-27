import { ReactNode } from "react";

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  negative: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};

const VALUE_TONE_CLASSES: Record<string, string> = {
  neutral: "",
  positive: "text-emerald-600 dark:text-emerald-400",
  negative: "text-rose-600 dark:text-rose-400",
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
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
          {icon}
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium" style={{ color: "var(--muted)" }}>
          {label}
        </span>
        <span className={`break-words text-lg font-bold tracking-tight sm:text-xl ${VALUE_TONE_CLASSES[tone]}`}>{value}</span>
      </div>
    </div>
  );
}
