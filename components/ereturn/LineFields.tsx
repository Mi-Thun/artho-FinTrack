import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import type { LineDef } from "@/lib/ereturn/lines";

/**
 * One row per fixed line of a return form: the label on the left, the amount (and, for
 * lines that need one, a description) on the right. Submits `line:<code>` and
 * `note:<code>`, which `saveLines` reads back by the same definitions.
 */
export function LineFields({
  defs,
  value,
  numbered = false,
}: {
  defs: readonly LineDef[];
  value: (code: string) => { amount: number; note: string };
  /** Prefix each label with its serial number, as the NBR form does. */
  numbered?: boolean;
}) {
  return (
    <div className="flex flex-col divide-y">
      {defs.map((def, i) => {
        const current = value(def.code);
        const id = `line-${def.code.replace(/\./g, "-")}`;
        return (
          <div key={def.code} data-field className="grid grid-cols-1 gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[1fr_minmax(0,16rem)] sm:items-start sm:gap-4">
            <label htmlFor={id} className="text-sm font-medium sm:pt-1.5">
              {numbered && <span className="mr-1.5 text-muted-foreground tabular-nums">{i + 1}.</span>}
              {def.label}
              {def.hint && <span className="block text-xs font-normal text-muted-foreground">{def.hint}</span>}
            </label>
            <div className="flex flex-col gap-2">
              <MoneyInput id={id} name={`line:${def.code}`} defaultValue={current.amount || undefined} />
              {def.withNote && (
                <Input
                  name={`note:${def.code}`}
                  defaultValue={current.note}
                  placeholder={def.notePlaceholder}
                  aria-label={`${def.label} — ${def.notePlaceholder ?? "description"}`}
                />
              )}
              <span data-field-error aria-live="polite" className="text-xs text-danger empty:hidden" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
