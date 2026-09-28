// Rates are stored as fractions (0.1122) and shown in forms as percentages (11.22).
//
// Multiplying or dividing by 100 in binary floating point drifts: 0.1122 * 100 is
// 11.219999999999999, and 11.22 / 100 is 0.11220000000000001. Both directions round
// here so a form never prefills a drifted value and a save never stores one.

/** A stored fractional rate as the percentage a form should show, e.g. 0.1122 → 11.22. */
export function rateToPercent(rate: unknown): number {
  const n = Number(rate);
  if (!Number.isFinite(n)) return 0;
  return Number((n * 100).toFixed(4));
}

/** A typed percentage as the fraction to store, e.g. "11.22" → 0.1122. Null if not a number. */
export function percentToRate(percent: unknown): number | null {
  if (percent == null || String(percent).trim() === "") return null;
  const n = Number(percent);
  if (!Number.isFinite(n)) return null;
  return Number((n / 100).toFixed(6));
}
