export function formatBDT(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  const sign = n < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
  return `${sign}৳${formatted}`;
}
