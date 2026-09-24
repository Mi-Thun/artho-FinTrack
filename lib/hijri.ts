// Hijri (Islamic lunar) calendar conversion.
//
// Ramadan and the two Eids move ~11 days earlier each Gregorian year, and Qurbani falls
// on 10 Dhul-Hijjah — none of which can be expressed as a fixed Gregorian date. This implements the standard
// tabular Islamic calendar (the "Kuwaiti algorithm"), which is arithmetic and therefore
// deterministic and reversible.
//
// IMPORTANT: the tabular calendar can differ from the observed calendar by ±1 day,
// because Bangladesh (like most of the Muslim world) begins a month on local moon
// sighting, announced by the Islamic Foundation. Treat every date here as a planning
// estimate — good enough to know Ramadan is nine weeks away and to save for it, not
// authoritative for when to begin fasting. UI that shows these dates says so.

export interface HijriDate {
  year: number;
  /** 1 = Muharram … 12 = Dhul-Hijjah. */
  month: number;
  day: number;
}

export const HIJRI_MONTH_NAMES = [
  "Muharram",
  "Safar",
  "Rabi al-Awwal",
  "Rabi al-Thani",
  "Jumada al-Awwal",
  "Jumada al-Thani",
  "Rajab",
  "Shaban",
  "Ramadan",
  "Shawwal",
  "Dhul-Qadah",
  "Dhul-Hijjah",
] as const;

export const HIJRI_MONTH_NAMES_BN = [
  "মুহাররম",
  "সফর",
  "রবিউল আউয়াল",
  "রবিউস সানি",
  "জমাদিউল আউয়াল",
  "জমাদিউস সানি",
  "রজব",
  "শাবান",
  "রমজান",
  "শাওয়াল",
  "জিলকদ",
  "জিলহজ",
] as const;

/** Julian Day Number for a Gregorian date (UTC). */
export function gregorianToJdn(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** Inverse of gregorianToJdn. */
export function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  return {
    day: e - Math.floor((153 * m + 2) / 5) + 1,
    month: m + 3 - 12 * Math.floor(m / 10),
    year: 100 * b + d - 4800 + Math.floor(m / 10),
  };
}

export function hijriToJdn(year: number, month: number, day: number): number {
  return (
    Math.floor((11 * year + 3) / 30) +
    354 * year +
    30 * month -
    Math.floor((month - 1) / 2) +
    day +
    1948440 -
    385
  );
}

export function jdnToHijri(jdn: number): HijriDate {
  let l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l) / 5316) * Math.floor((50 * l) / 17719) +
    Math.floor(l / 5670) * Math.floor((43 * l) / 15238);
  l =
    l -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const month = Math.floor((24 * l) / 709);
  const day = l - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;
  return { year, month, day };
}

/** The Hijri date a UTC instant falls on. */
export function toHijri(date: Date): HijriDate {
  return jdnToHijri(gregorianToJdn(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
}

/** The UTC instant a Hijri date begins on. */
export function fromHijri(year: number, month: number, day: number): Date {
  const { year: gy, month: gm, day: gd } = jdnToGregorian(hijriToJdn(year, month, day));
  return new Date(Date.UTC(gy, gm - 1, gd));
}

export function formatHijri(date: HijriDate, language: "EN" | "BN" = "EN"): string {
  const names = language === "BN" ? HIJRI_MONTH_NAMES_BN : HIJRI_MONTH_NAMES;
  return `${date.day} ${names[date.month - 1]} ${date.year} AH`;
}

// ---------------------------------------------------------------------------
// Observances that drive saving behaviour in Bangladesh
// ---------------------------------------------------------------------------

export type ObservanceKey = "RAMADAN_START" | "EID_AL_FITR" | "EID_AL_ADHA" | "ASHURA" | "SHAB_E_BARAT";

export interface Observance {
  key: ObservanceKey;
  label: string;
  labelBn: string;
  hijriMonth: number;
  hijriDay: number;
  /** Why someone saving money cares about this date. */
  note: string;
}

export const OBSERVANCES: Observance[] = [
  {
    key: "SHAB_E_BARAT",
    label: "Shab-e-Barat",
    labelBn: "শবে বরাত",
    hijriMonth: 8,
    hijriDay: 15,
    note: "Charity and family gatherings.",
  },
  {
    key: "RAMADAN_START",
    label: "Ramadan begins",
    labelBn: "রমজান শুরু",
    hijriMonth: 9,
    hijriDay: 1,
    note: "Grocery and iftar spending rises sharply for a month.",
  },
  {
    key: "EID_AL_FITR",
    label: "Eid-ul-Fitr",
    labelBn: "ঈদুল ফিতর",
    hijriMonth: 10,
    hijriDay: 1,
    note: "Clothing, travel, and salami. Usually the largest single outlay of the year.",
  },
  {
    key: "EID_AL_ADHA",
    label: "Eid-ul-Adha",
    labelBn: "ঈদুল আজহা",
    hijriMonth: 12,
    hijriDay: 10,
    note: "Qurbani animal purchase — plan several months ahead.",
  },
  {
    key: "ASHURA",
    label: "Ashura",
    labelBn: "আশুরা",
    hijriMonth: 1,
    hijriDay: 10,
    note: "Charitable giving.",
  },
];

export interface UpcomingObservance extends Observance {
  date: Date;
  hijriYear: number;
  daysAway: number;
}

/**
 * The next occurrence of each observance on or after `from`, soonest first. Checks the
 * current and next two Hijri years so a date late in Dhul-Hijjah still resolves forward.
 */
export function upcomingObservances(from: Date, count = OBSERVANCES.length): UpcomingObservance[] {
  const today = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const currentHijriYear = toHijri(today).year;

  const results: UpcomingObservance[] = [];
  for (const observance of OBSERVANCES) {
    for (let offset = 0; offset <= 2; offset++) {
      const hijriYear = currentHijriYear + offset;
      const date = fromHijri(hijriYear, observance.hijriMonth, observance.hijriDay);
      if (date >= today) {
        results.push({
          ...observance,
          date,
          hijriYear,
          daysAway: Math.round((date.getTime() - today.getTime()) / 86400000),
        });
        break;
      }
    }
  }

  return results.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, count);
}
