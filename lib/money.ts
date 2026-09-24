import { Prisma } from "@prisma/client";

// Money is stored as Postgres NUMERIC and arrives as a Prisma.Decimal. Converting each
// row to a JS float before summing makes every total an approximation: 0.1 + 0.2 is not
// 0.3 in binary floating point, and the error compounds with row count, so a year of
// transactions can drift a taka off what the same query returns from SQL.
//
// The rule this module exists to enforce: accumulate in Decimal, convert to `number`
// exactly once, at the edge where a value is formatted or handed to a chart. Postgres
// SUM() over NUMERIC is already exact, so aggregate queries need no help — this is for
// the paths that pull rows into JS and add them up there.
//
// Not applied to lib/deposit-planner.ts: that is compound-interest projection over
// decades from estimated rates, where float precision is far below the modelling error.
// Its outputs are rounded at the display boundary like everything else.

export type Money = Prisma.Decimal;

/** Poisha — BDT's minor unit — so amounts round to two decimal places. */
const SCALE = 2;

export const ZERO: Money = new Prisma.Decimal(0);

/** Coerces anything Prisma or a form can hand us into a Decimal. Null/garbage → 0. */
export function money(value: unknown): Money {
  if (value == null) return ZERO;
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === "number") return Number.isFinite(value) ? new Prisma.Decimal(value) : ZERO;
  if (typeof value === "string" || typeof value === "bigint") {
    try {
      return new Prisma.Decimal(value.toString());
    } catch {
      return ZERO;
    }
  }
  // Prisma.Decimal instances from a differently-resolved copy of the client won't pass
  // instanceof, but they do stringify correctly.
  try {
    return new Prisma.Decimal(String(value));
  } catch {
    return ZERO;
  }
}

/** Exact sum. Use instead of `.reduce((s, x) => s + Number(x), 0)`. */
export function sumMoney(values: Iterable<unknown>): Money {
  let total = ZERO;
  for (const value of values) total = total.plus(money(value));
  return total;
}

/** Exact sum of a projection over a collection. */
export function sumBy<T>(items: Iterable<T>, select: (item: T) => unknown): Money {
  let total = ZERO;
  for (const item of items) total = total.plus(money(select(item)));
  return total;
}

/** Rounds to poisha, half away from zero — how a cashier rounds. */
export function roundMoney(value: unknown): Money {
  return money(value).toDecimalPlaces(SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * The one sanctioned exit from Decimal: rounds to poisha and returns a float for
 * formatting, charting, or serialization. Never feed the result back into a sum.
 */
export function toNumber(value: unknown): number {
  return roundMoney(value).toNumber();
}
