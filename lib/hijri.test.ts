import { describe, expect, it } from "vitest";
import {
  fromHijri,
  gregorianToJdn,
  jdnToGregorian,
  jdnToHijri,
  hijriToJdn,
  toHijri,
  formatHijri,
  upcomingObservances,
  OBSERVANCES,
} from "./hijri";

describe("Julian Day Number round-trips", () => {
  it("converts a known reference date", () => {
    // 1 January 2000 is JDN 2451545.
    expect(gregorianToJdn(2000, 1, 1)).toBe(2451545);
  });

  it("round-trips Gregorian through JDN", () => {
    for (const [y, m, d] of [
      [1970, 1, 1],
      [2000, 2, 29],
      [2026, 7, 31],
      [2100, 12, 31],
    ] as const) {
      expect(jdnToGregorian(gregorianToJdn(y, m, d))).toEqual({ year: y, month: m, day: d });
    }
  });

  it("round-trips Hijri through JDN", () => {
    for (const [y, m, d] of [
      [1400, 1, 1],
      [1447, 9, 1],
      [1450, 12, 10],
    ] as const) {
      expect(jdnToHijri(hijriToJdn(y, m, d))).toEqual({ year: y, month: m, day: d });
    }
  });
});

describe("toHijri / fromHijri", () => {
  it("places the Hijri epoch at 16 July 622 CE", () => {
    // 1 Muharram 1 AH.
    const epoch = fromHijri(1, 1, 1);
    expect(epoch.getUTCFullYear()).toBe(622);
    expect(epoch.getUTCMonth() + 1).toBe(7);
  });

  it("round-trips a Gregorian date through Hijri", () => {
    const date = new Date(Date.UTC(2026, 6, 31));
    const hijri = toHijri(date);
    expect(fromHijri(hijri.year, hijri.month, hijri.day).getTime()).toBe(date.getTime());
  });

  it("puts mid-2026 in the expected Hijri year", () => {
    // 2026 CE spans 1447–1448 AH.
    const hijri = toHijri(new Date(Date.UTC(2026, 6, 31)));
    expect(hijri.year).toBeGreaterThanOrEqual(1447);
    expect(hijri.year).toBeLessThanOrEqual(1448);
    expect(hijri.month).toBeGreaterThanOrEqual(1);
    expect(hijri.month).toBeLessThanOrEqual(12);
    expect(hijri.day).toBeGreaterThanOrEqual(1);
    expect(hijri.day).toBeLessThanOrEqual(30);
  });

  it("advances roughly 354 days per Hijri year", () => {
    const a = fromHijri(1447, 1, 1).getTime();
    const b = fromHijri(1448, 1, 1).getTime();
    const days = (b - a) / 86400000;
    expect(days).toBeGreaterThanOrEqual(353);
    expect(days).toBeLessThanOrEqual(356);
  });
});

describe("formatHijri", () => {
  it("names the month in English and Bangla", () => {
    expect(formatHijri({ year: 1447, month: 9, day: 1 })).toBe("1 Ramadan 1447 AH");
    expect(formatHijri({ year: 1447, month: 9, day: 1 }, "BN")).toBe("1 রমজান 1447 AH");
  });
});

describe("upcomingObservances", () => {
  const from = new Date(Date.UTC(2026, 6, 31));

  it("returns every observance, all in the future, soonest first", () => {
    const upcoming = upcomingObservances(from);
    expect(upcoming).toHaveLength(OBSERVANCES.length);
    for (const o of upcoming) expect(o.date.getTime()).toBeGreaterThanOrEqual(from.getTime());
    for (let i = 1; i < upcoming.length; i++) {
      expect(upcoming[i].date.getTime()).toBeGreaterThanOrEqual(upcoming[i - 1].date.getTime());
    }
  });

  it("reports a non-negative day count consistent with the date", () => {
    for (const o of upcomingObservances(from)) {
      expect(o.daysAway).toBeGreaterThanOrEqual(0);
      expect(o.daysAway).toBe(Math.round((o.date.getTime() - from.getTime()) / 86400000));
    }
  });

  it("puts Eid-ul-Fitr one month after Ramadan begins", () => {
    const byKey = new Map(upcomingObservances(from).map((o) => [o.key, o]));
    const ramadan = byKey.get("RAMADAN_START")!;
    const eid = byKey.get("EID_AL_FITR")!;
    // Same Hijri year: Shawwal 1 is 29–30 days after Ramadan 1.
    if (ramadan.hijriYear === eid.hijriYear) {
      const gap = (eid.date.getTime() - ramadan.date.getTime()) / 86400000;
      expect(gap).toBeGreaterThanOrEqual(29);
      expect(gap).toBeLessThanOrEqual(30);
    }
  });

  it("honours the count limit", () => {
    expect(upcomingObservances(from, 2)).toHaveLength(2);
  });
});
