const TONE_VARS: Record<string, { fg: string; bg: string }> = {
  success: { fg: "var(--status-success)", bg: "var(--status-success-soft)" },
  warning: { fg: "var(--status-warning)", bg: "var(--status-warning-soft)" },
  danger: { fg: "var(--status-danger)", bg: "var(--status-danger-soft)" },
  info: { fg: "var(--status-info)", bg: "var(--status-info-soft)" },
  neutral: { fg: "var(--muted)", bg: "var(--surface-muted)" },
};

export function StatusPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  const { fg, bg } = TONE_VARS[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: fg, background: bg }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: fg }} />
      {label}
    </span>
  );
}
