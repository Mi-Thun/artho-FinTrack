"use client";

import { createContext, ReactNode, useContext, useMemo } from "react";
import { createFormatter, type Formatter, type Language, type NumeralSystem } from "@/lib/i18n";

const LocaleContext = createContext<Formatter>(createFormatter("EN", "WESTERN"));

/** Makes the user's formatter available to client components without prop-drilling. */
export function LocaleProvider({ language, numerals, children }: { language: Language; numerals: NumeralSystem; children: ReactNode }) {
  const fmt = useMemo(() => createFormatter(language, numerals), [language, numerals]);
  return <LocaleContext.Provider value={fmt}>{children}</LocaleContext.Provider>;
}

export function useFormatter(): Formatter {
  return useContext(LocaleContext);
}
