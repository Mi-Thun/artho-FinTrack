import { toWesternNumerals } from "@/lib/i18n";

// Turning a document's raw text into something the parsers can read. Pure: the browser
// produces the input (pdf.js text items, or Tesseract's OCR lines) and nothing here
// touches a DOM, a worker or the network.

/** A pdf.js text item — only the fields line building needs. */
export interface TextItem {
  str: string;
  /** pdf.js transform matrix; [4] is x, [5] is y (from the page's bottom). */
  transform: number[];
  width: number;
}

/**
 * pdf.js returns a page as loose text fragments. Fragments at the same height form a
 * line, read left to right, and a visible gap between two becomes a double space — so a
 * table row keeps its columns apart ("Total Interest  :  22").
 */
export function itemsToLines(items: readonly TextItem[]): string[] {
  const rows: { y: number; cells: { x: number; end: number; s: string }[] }[] = [];
  for (const item of items) {
    const s = item.str.trim();
    if (!s) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, cells: [] }));
    row.cells.push({ x, end: x + item.width, s });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    row.cells.sort((a, b) => a.x - b.x);
    let line = "";
    let end: number | null = null;
    for (const c of row.cells) {
      line += end == null ? c.s : (c.x - end > 4 ? "  " : " ") + c.s;
      end = c.end;
    }
    return line;
  });
}

/** Western digits, and the odd characters OCR and PDFs produce ironed out. */
export function normalise(line: string): string {
  return toWesternNumerals(line)
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/ /g, " ");
}

/** "3,00,000.00", "1,597,445.49", "22" → a number; anything else → null. */
export function parseAmount(text: string | undefined | null): number | null {
  if (text == null) return null;
  const cleaned = normalise(text).replace(/[,\s৳]|Tk\.?|BDT/gi, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** Every amount-looking token on a line, in order: "2,921.25  5,845.25" → [2921.25, 5845.25]. */
export function amountsIn(line: string): number[] {
  return [...normalise(line).matchAll(/(?<![\d/-])\d{1,3}(?:,\d{2,3})+(?:\.\d+)?(?![\d/-])|(?<![\d/,.-])\d+\.\d{2}(?![\d/-])/g)].map((m) =>
    Number(m[0].replace(/,/g, "")),
  );
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * A date in any form these documents use — 13-05-2024, 30/06/2026, 30-JUN-2026,
 * 30-August-2026, 2025-07-01, Aug 30, 2026 — as YYYY-MM-DD, or null.
 * Day-first throughout: Bangladeshi documents never put the month first.
 */
export function parseDate(text: string): string | null {
  const t = normalise(text).trim();
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(t);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = /(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s,]+(\d{4})/.exec(t);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = /([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/.exec(t);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return iso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  return null;
}

/** The first date anywhere in `text`. */
export function firstDate(text: string): string | null {
  const t = normalise(text);
  const candidates = t.match(/\d{4}-\d{2}-\d{2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}[-\s][A-Za-z]{3,9}[-\s,]+\d{4}|[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}/g) ?? [];
  for (const c of candidates) {
    const d = parseDate(c);
    if (d) return d;
  }
  return null;
}

/** Most common non-null value — for OCR, where each challan is printed three times. */
export function majority<T extends string | number>(values: readonly (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) if (c > bestCount) [best, bestCount] = [v, c];
  return best;
}

/** "Sonali Bank PLC", "SONALI BANK LTD." → a consistent display name. */
export function bankName(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("sonali")) return "Sonali Bank PLC";
  if (t.includes("city")) return "City Bank PLC";
  if (t.includes("janata")) return "Janata Bank PLC";
  if (t.includes("agrani")) return "Agrani Bank PLC";
  if (t.includes("rupali")) return "Rupali Bank PLC";
  if (t.includes("dutch") || t.includes("dbbl")) return "Dutch-Bangla Bank PLC";
  if (t.includes("brac")) return "BRAC Bank PLC";
  if (t.includes("islami")) return "Islami Bank Bangladesh PLC";
  if (t.includes("post office") || t.includes("ডাকঘর")) return "Post Office";
  if (t.includes("bangladesh bank")) return "Bangladesh Bank";
  return raw.trim();
}

/**
 * The bank a Bangladeshi routing number belongs to: its first three digits are the bank
 * code. Statements often carry the bank's name only in their logo, which is an image.
 */
export function bankFromRouting(routing: string): string | null {
  const codes: Record<string, string> = {
    "200": "Sonali Bank PLC",
    "135": "Janata Bank PLC",
    "010": "Agrani Bank PLC",
    "185": "Rupali Bank PLC",
    "225": "City Bank PLC",
    "090": "Dutch-Bangla Bank PLC",
    "060": "BRAC Bank PLC",
    "125": "Islami Bank Bangladesh PLC",
  };
  return codes[routing.slice(0, 3)] ?? null;
}
