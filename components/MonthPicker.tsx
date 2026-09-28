import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";
import type { Formatter } from "@/lib/i18n";

/**
 * Year select / month select, driven entirely by the URL so the chosen
 * month survives reloads and sharing. `months` is newest first, as `YYYY-MM` keys.
 *
 * Year and month are separate so a few years of history isn't one long list to scroll.
 * Each year option carries the month to land on (the same calendar month if that year
 * has it, else its newest), so picking a year is still a plain GET with no client routing.
 */
export function MonthPicker({
  months,
  selected,
  basePath,
  param = "month",
  extraParams = {},
  fmt,
}: {
  months: string[];
  selected: string;
  basePath: string;
  param?: string;
  extraParams?: Record<string, string | undefined>;
  fmt: Pick<Formatter, "monthName" | "year">;
}) {
  const dateOf = (key: string) => new Date(`${key}-01T00:00:00Z`);
  const [selectedYear, selectedMonthNum] = selected.split("-");
  const years = [...new Set(months.map((key) => key.slice(0, 4)))].sort();
  const yearOptions = years.map((year) => {
    const inYear = months.filter((key) => key.startsWith(`${year}-`));
    const target =
      year === selectedYear ? selected : (inYear.find((key) => key.endsWith(`-${selectedMonthNum}`)) ?? inYear[0]);
    return { value: target, label: fmt.year(dateOf(target)) };
  });
  // Calendar order within the year reads better than newest first.
  const monthOptions = months
    .filter((key) => key.startsWith(`${selectedYear}-`))
    .sort()
    .map((key) => ({ value: key, label: fmt.monthName(dateOf(key)) }));

  const select = (ariaLabel: string, options: { value: string; label: string }[]) => (
    <form action={basePath}>
      {Object.entries(extraParams).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <AutoSubmitSelect ariaLabel={ariaLabel} name={param} defaultValue={selected} options={options} className="min-w-[5.5rem]" />
    </form>
  );

  return (
    <div className="flex items-center gap-2">
      {select("Year", yearOptions)}
      {select("Month", monthOptions)}
    </div>
  );
}
