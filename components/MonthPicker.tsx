import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Previous / month select / next, driven entirely by the URL so the chosen month
 * survives reloads and sharing. `months` is newest first, as `YYYY-MM` keys.
 */
export function MonthPicker({
  months,
  selected,
  basePath,
  param = "month",
  extraParams = {},
  labelFor,
}: {
  months: string[];
  selected: string;
  basePath: string;
  param?: string;
  extraParams?: Record<string, string | undefined>;
  labelFor: (key: string) => string;
}) {
  const idx = months.indexOf(selected);
  const older = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;
  const newer = idx > 0 ? months[idx - 1] : null;

  const hrefFor = (key: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(extraParams)) if (v) q.set(k, v);
    q.set(param, key);
    return `${basePath}?${q.toString()}`;
  };

  const nav = (key: string | null, label: string, Icon: typeof ChevronLeft) => (
    <Button
      variant="outline"
      size="icon"
      className={cn(!key && "pointer-events-none opacity-40")}
      nativeButton={false}
      render={<Link href={key ? hrefFor(key) : "#"} aria-disabled={!key} aria-label={label} tabIndex={key ? undefined : -1} />}
    >
      <Icon size={16} />
    </Button>
  );

  return (
    <div className="flex items-center gap-2">
      {nav(older, "Previous month", ChevronLeft)}
      <form action={basePath}>
        {Object.entries(extraParams).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <AutoSubmitSelect
          ariaLabel="Month"
          name={param}
          defaultValue={selected}
          options={months.map((key) => ({ value: key, label: labelFor(key) }))}
        />
      </form>
      {nav(newer, "Next month", ChevronRight)}
    </div>
  );
}
