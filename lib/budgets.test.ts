import { describe, expect, it } from "vitest";
import { monthKey, monthStart, parseMonthKey } from "./budgets";

describe("monthStart", () => {
  it("snaps to the first instant of the month in UTC", () => {
    const result = monthStart(new Date(Date.UTC(2026, 6, 23, 18, 45, 12)));
    expect(result.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("is idempotent", () => {
    const first = monthStart(new Date(Date.UTC(2026, 6, 23)));
    expect(monthStart(first).getTime()).toBe(first.getTime());
  });
});

describe("monthKey", () => {
  it("zero-pads single-digit months", () => {
    expect(monthKey(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01");
    expect(monthKey(new Date(Date.UTC(2026, 11, 1)))).toBe("2026-12");
  });
});

describe("parseMonthKey", () => {
  it("round-trips with monthKey", () => {
    const month = monthStart(new Date(Date.UTC(2026, 6, 23)));
    expect(parseMonthKey(monthKey(month))!.getTime()).toBe(month.getTime());
  });

  it("rejects anything that isn't YYYY-MM", () => {
    expect(parseMonthKey("2026-7")).toBeNull();
    expect(parseMonthKey("2026")).toBeNull();
    expect(parseMonthKey("2026-07-01")).toBeNull();
    expect(parseMonthKey("garbage")).toBeNull();
    expect(parseMonthKey("")).toBeNull();
    expect(parseMonthKey(undefined)).toBeNull();
    expect(parseMonthKey(null)).toBeNull();
  });

  it("rejects out-of-range months rather than rolling them over", () => {
    expect(parseMonthKey("2026-00")).toBeNull();
    expect(parseMonthKey("2026-13")).toBeNull();
  });
});
