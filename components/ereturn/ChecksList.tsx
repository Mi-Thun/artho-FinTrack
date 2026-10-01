import Link from "next/link";
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReturnCheck } from "@/lib/ereturn/checks";

const ICONS = {
  error: { icon: AlertCircle, className: "text-danger" },
  warning: { icon: AlertTriangle, className: "text-warning" },
  info: { icon: Info, className: "text-link" },
};

/** The return's checks, each linking to the tab where it's fixed. */
export function ChecksList({ checks, base }: { checks: ReturnCheck[]; base: string }) {
  if (checks.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <CheckCircle2 size={16} aria-hidden />
        Nothing to fix — the return adds up.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y">
      {checks.map((c, i) => {
        const { icon: Icon, className } = ICONS[c.level];
        return (
          <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <Icon size={16} className={cn("mt-0.5 shrink-0", className)} aria-label={c.level} />
            <div className="min-w-0 text-sm">
              <p className="font-medium">
                {c.title}
                {c.tab !== "" && (
                  <Link href={`${base}/${c.tab}`} className="ml-2 text-xs font-normal text-link hover:underline">
                    {c.level === "info" ? "View" : "Fix"}
                  </Link>
                )}
              </p>
              <p className="text-muted-foreground">{c.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
