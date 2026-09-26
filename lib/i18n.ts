// Bangla localisation, including Bengali numerals.
//
// English-only is a real barrier for a large part of the Bangladeshi market, and
// half-localising is worse than not bothering: an app that says "Dashboard" in English
// but "৳১২,৩৪৫" in Bangla numerals reads as broken. So language and numeral system are
// separate settings — plenty of people want Bangla labels with Western digits, or the
// reverse.

export type Language = "EN" | "BN";
export type NumeralSystem = "WESTERN" | "BENGALI";

const BENGALI_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"] as const;

/** Rewrites ASCII digits as Bengali ones, leaving separators and symbols alone. */
export function toBengaliNumerals(input: string): string {
  return input.replace(/[0-9]/g, (d) => BENGALI_DIGITS[Number(d)]);
}

export function toWesternNumerals(input: string): string {
  return input.replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d as (typeof BENGALI_DIGITS)[number])));
}

export function applyNumerals(input: string, numerals: NumeralSystem): string {
  return numerals === "BENGALI" ? toBengaliNumerals(input) : input;
}

// ---------------------------------------------------------------------------
// Dictionary
// ---------------------------------------------------------------------------
// Only strings that appear in navigation, page headers, and shared UI are listed. A key
// with no Bangla entry falls back to English rather than rendering a raw key, so adding
// a string never breaks the Bangla build — it just shows up untranslated until someone
// fills it in.

export const MESSAGES = {
  // Navigation
  "nav.dashboard": { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  "nav.transactions": { en: "Transactions", bn: "লেনদেন" },
  "nav.budgets": { en: "Budgets", bn: "বাজেট" },
  "nav.accounts": { en: "Accounts", bn: "হিসাব" },
  "nav.deposits": { en: "Deposits", bn: "সঞ্চয়" },
  "nav.goals": { en: "Goals", bn: "লক্ষ্য" },
  "nav.lending": { en: "Lending", bn: "ধার" },
  "nav.household": { en: "Household", bn: "পরিবার" },
  "nav.profile": { en: "Profile", bn: "প্রোফাইল" },
  "nav.settings": { en: "Settings", bn: "সেটিংস" },
  "nav.subscription": { en: "Subscription", bn: "সাবস্ক্রিপশন" },
  "nav.logout": { en: "Log out", bn: "লগ আউট" },

  // Core financial vocabulary
  "term.netWorth": { en: "Net Worth", bn: "নিট সম্পদ" },
  "term.cashOnHand": { en: "Cash on Hand", bn: "নগদ অর্থ" },
  "term.income": { en: "Income", bn: "আয়" },
  "term.expense": { en: "Expense", bn: "ব্যয়" },
  "term.balance": { en: "Balance", bn: "ব্যালেন্স" },
  "term.amount": { en: "Amount", bn: "পরিমাণ" },
  "term.date": { en: "Date", bn: "তারিখ" },
  "term.category": { en: "Category", bn: "খাত" },
  "term.account": { en: "Account", bn: "হিসাব" },
  "term.note": { en: "Note", bn: "মন্তব্য" },
  "term.total": { en: "Total", bn: "মোট" },
  "term.gold": { en: "Gold", bn: "স্বর্ণ" },
  "term.silver": { en: "Silver", bn: "রূপা" },
  "term.tax": { en: "Tax", bn: "কর" },
  "term.loan": { en: "Loan", bn: "ঋণ" },
  "term.savings": { en: "Savings", bn: "সঞ্চয়" },

  // Actions
  "action.add": { en: "Add", bn: "যোগ করুন" },
  "action.edit": { en: "Edit", bn: "সম্পাদনা" },
  "action.delete": { en: "Delete", bn: "মুছুন" },
  "action.save": { en: "Save", bn: "সংরক্ষণ" },
  "action.cancel": { en: "Cancel", bn: "বাতিল" },
  "action.calculate": { en: "Calculate", bn: "হিসাব করুন" },

  // Settings
  "settings.language": { en: "Language", bn: "ভাষা" },
  "settings.numerals": { en: "Numerals", bn: "সংখ্যা" },
  "settings.financeMode": { en: "Finance mode", bn: "অর্থায়ন পদ্ধতি" },
} as const;

export type MessageKey = keyof typeof MESSAGES;

export function translate(key: MessageKey, language: Language): string {
  const entry = MESSAGES[key];
  if (!entry) return key;
  return language === "BN" && entry.bn ? entry.bn : entry.en;
}

/**
 * Rewrites amounts written into free text — "Wealth reaches BDT 6,000,000", "Tk 5,00,000",
 * "৳500000" — through `money`, so a user-typed milestone label reads in the same lakh
 * grouping and numeral system as every other figure on screen.
 */
export function localiseAmountsInText(text: string, money: (value: number) => string): string {
  return text.replace(/(?:BDT|Tk\.?|৳)\s?([0-9০-৯][0-9০-৯,]*(?:\.[0-9০-৯]+)?)/gi, (match, digits: string) => {
    const n = Number(toWesternNumerals(digits).replace(/,/g, ""));
    return Number.isFinite(n) ? money(n) : match;
  });
}

export interface Formatter {
  language: Language;
  numerals: NumeralSystem;
  /** Translate a message key. */
  t: (key: MessageKey) => string;
  /** Format an amount as BDT in the user's numeral system, rounded to whole taka. */
  money: (value: number | string) => string;
  /** Like `money`, but keeps poisha when there are any: ৳6.70, ৳1,20,000. For balances. */
  moneyExact: (value: number | string) => string;
  /** Format a plain number in the user's numeral system. */
  number: (value: number, options?: Intl.NumberFormatOptions) => string;
  /** Format a date in the user's language. */
  date: (value: Date, options?: Intl.DateTimeFormatOptions) => string;
  /** The app's one display format for a calendar day: "26 Sep 2026". */
  day: (value: Date) => string;
  /** A month: "Sep 2026". */
  monthYear: (value: Date) => string;
  /** A month for chart axes: "Sep 26". */
  monthShort: (value: Date) => string;
  /** Short money for chart axes and tight spaces: ৳950, ৳50K, ৳1.2L, ৳3.5Cr. */
  compactMoney: (value: number) => string;
  /** A calendar day relative to `now`: "today", "tomorrow", "in 18 days", "in 5 months", "3 days ago". */
  relative: (value: Date, now: Date) => string;
}

// ICU renders September as "Sept" in en-IN/en-GB; the app standardises on three letters.
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Lakh/crore abbreviation: the units Bangladeshis actually say amounts in. */
function compactDigits(abs: number): string {
  const trim = (n: number) => String(Number(n.toFixed(n >= 10 ? 0 : 1)));
  if (abs >= 1e7) return `${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${trim(abs / 1e3)}K`;
  return String(Math.round(abs));
}

/**
 * Bangladesh groups digits in the South Asian lakh/crore pattern (12,34,567), which
 * `en-IN` produces correctly; `bn-BD` also produces it and gives Bangla month names.
 */
function localeFor(language: Language): string {
  return language === "BN" ? "bn-BD" : "en-IN";
}

export function createFormatter(language: Language, numerals: NumeralSystem): Formatter {
  // Stored dates are UTC midnight of the calendar day, so they're always read in UTC.
  const formatDate = (value: Date, options?: Intl.DateTimeFormatOptions) => {
    const formatted = value.toLocaleDateString(localeFor(language), { timeZone: "UTC", ...options });
    // bn-BD already emits Bengali digits; normalise to whichever system is configured.
    return numerals === "BENGALI" ? toBengaliNumerals(formatted) : toWesternNumerals(formatted);
  };

  return {
    language,
    numerals,
    t: (key) => translate(key, language),
    money: (value) => {
      const n = typeof value === "string" ? Number(value) : value;
      const safe = Number.isFinite(n) ? n : 0;
      const sign = safe < 0 ? "-" : "";
      // Always format the digits with en-IN so grouping is identical in both languages,
      // then transliterate — bn-BD's own output already uses Bengali digits, which would
      // ignore a WESTERN numeral preference.
      const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.abs(safe));
      return `${sign}৳${applyNumerals(formatted, numerals)}`;
    },
    moneyExact: (value) => {
      const n = typeof value === "string" ? Number(value) : value;
      const safe = Number.isFinite(n) ? n : 0;
      const abs = Math.abs(safe);
      const whole = Math.abs(abs - Math.round(abs)) < 0.005;
      const formatted = new Intl.NumberFormat("en-IN", {
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2,
      }).format(abs);
      return `${safe < 0 ? "-" : ""}৳${applyNumerals(formatted, numerals)}`;
    },
    number: (value, options) => {
      const formatted = new Intl.NumberFormat("en-IN", options).format(value);
      return applyNumerals(formatted, numerals);
    },
    date: (value, options) => formatDate(value, options),
    day: (value) =>
      language === "BN"
        ? formatDate(value, { day: "numeric", month: "short", year: "numeric" })
        : applyNumerals(`${value.getUTCDate()} ${MONTHS_EN[value.getUTCMonth()]} ${value.getUTCFullYear()}`, numerals),
    monthYear: (value) =>
      language === "BN"
        ? formatDate(value, { month: "short", year: "numeric" })
        : applyNumerals(`${MONTHS_EN[value.getUTCMonth()]} ${value.getUTCFullYear()}`, numerals),
    monthShort: (value) =>
      language === "BN"
        ? formatDate(value, { month: "short", year: "2-digit" })
        : applyNumerals(`${MONTHS_EN[value.getUTCMonth()]} ${String(value.getUTCFullYear()).slice(2)}`, numerals),
    relative: (value, now) => {
      // Whole calendar days in UTC — stored dates are UTC midnight of the day.
      const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const days = Math.round((dayOf(value) - dayOf(now)) / 86_400_000);
      const n = (x: number) => applyNumerals(String(x), numerals);
      if (days === 0) return "today";
      if (days === 1) return "tomorrow";
      if (days === -1) return "yesterday";
      const abs = Math.abs(days);
      const phrase = abs < 60 ? `${n(abs)} days` : abs < 730 ? `${n(Math.round(abs / 30.44))} months` : `${n(Math.round(abs / 365.25))} years`;
      return days > 0 ? `in ${phrase}` : `${phrase} ago`;
    },
    compactMoney: (value) => {
      const safe = Number.isFinite(value) ? value : 0;
      return `${safe < 0 ? "-" : ""}৳${applyNumerals(compactDigits(Math.abs(safe)), numerals)}`;
    },
  };
}
