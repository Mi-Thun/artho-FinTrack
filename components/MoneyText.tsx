import { cn } from "@/lib/utils";

export type MoneyTone = "neutral" | "income" | "expense" | "auto";

/**
 * An amount on screen: tabular digits, and — for signed amounts — a +/− sign as well as
 * colour, so income vs expense never relies on red/green alone.
 *
 * `money` is the user's formatter (`fmt.money`), so numerals follow their setting.
 * `tone="auto"` colours by sign; "income"/"expense" force the sign and colour.
 */
export function MoneyText({
  value,
  money,
  tone = "neutral",
  signed = false,
  className,
}: {
  value: number;
  money: (value: number) => string;
  tone?: MoneyTone;
  /** Prefix "+" on positive amounts (negatives always show "−"). */
  signed?: boolean;
  className?: string;
}) {
  // +1 income/positive, −1 expense/negative, 0 no direction (plain amount).
  const direction =
    tone === "income" ? 1 : tone === "expense" ? -1 : tone === "auto" ? Math.sign(value) : 0;
  const abs = Math.abs(value);
  const negative = direction < 0 || (direction === 0 && value < 0);
  const sign = abs === 0 ? "" : negative ? "−" : direction > 0 || signed ? "+" : "";

  return (
    <span
      className={cn(
        "tabular-nums whitespace-nowrap",
        direction > 0 && "text-success",
        direction < 0 && "text-danger",
        className,
      )}
    >
      {sign}
      {money(abs)}
    </span>
  );
}
