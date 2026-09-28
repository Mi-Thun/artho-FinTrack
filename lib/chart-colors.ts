// Chart series colours are CSS variables (app/globals.css) so light and dark each get
// their own validated steps. Slots are assigned in this fixed order and never cycled:
// a ninth series folds into "Other".
export const SERIES = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
] as const;

/** The neutral for an "Other" bucket — outside the categorical order on purpose. */
export const SERIES_OTHER = "var(--series-other)";
