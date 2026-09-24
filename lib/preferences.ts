import { cache } from "react";
import { db } from "@/lib/db";
import { createFormatter, type Formatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { term, type FinanceMode, type TermKey } from "@/lib/finance-mode";

export interface Preferences {
  language: Language;
  numerals: NumeralSystem;
  financeMode: FinanceMode;
  hasPin: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  language: "EN",
  numerals: "WESTERN",
  financeMode: "CONVENTIONAL",
  hasPin: false,
};

/**
 * Preferences drive formatting on nearly every page, so this is wrapped in React's
 * `cache` — many components per render ask for them, and they should cost one query.
 */
export const getPreferences = cache(async (userId: string): Promise<Preferences> => {
  const row = await db.userPreferences.findUnique({ where: { userId } });
  if (!row) return DEFAULT_PREFERENCES;
  return {
    language: row.language,
    numerals: row.numerals,
    financeMode: row.financeMode,
    hasPin: row.pinHash != null,
  };
});

export interface Localisation extends Preferences {
  fmt: Formatter;
  /** Label for a financial concept under the user's finance mode. */
  term: (key: TermKey) => string;
}

/** Everything a page needs to render in the user's language, numerals, and finance mode. */
export const getLocalisation = cache(async (userId: string): Promise<Localisation> => {
  const preferences = await getPreferences(userId);
  return {
    ...preferences,
    fmt: createFormatter(preferences.language, preferences.numerals),
    term: (key) => term(key, preferences.financeMode),
  };
});
