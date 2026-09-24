// Islamic finance mode.
//
// A large share of the Bangladeshi market banks with Islami Bank, Al-Arafah, Social
// Islami and the Islamic windows of conventional banks, where the product is a Mudaraba
// profit-sharing deposit rather than an interest-bearing one. Calling that "interest" in
// the UI is not a cosmetic problem — it misdescribes the contract, and for many users it
// is the reason they won't use the app.
//
// This module is deliberately only a vocabulary and classification layer. It does not
// change any arithmetic: a Mudaraba profit rate and a conventional interest rate are
// modelled identically because they are numerically identical. What changes is what
// things are called, and whether income from a riba source is flagged for purification.

export type FinanceMode = "CONVENTIONAL" | "ISLAMIC";

interface TermPair {
  conventional: string;
  islamic: string;
}

const TERMS = {
  interest: { conventional: "Interest", islamic: "Profit" },
  interestRate: { conventional: "Interest rate", islamic: "Profit rate" },
  interestEarned: { conventional: "Interest earned", islamic: "Profit share" },
  passiveIncome: { conventional: "Passive income", islamic: "Profit income" },
  fixedDeposit: { conventional: "Fixed deposit", islamic: "Mudaraba term deposit" },
  dps: { conventional: "DPS", islamic: "Mudaraba savings scheme" },
  loan: { conventional: "Loan", islamic: "Financing" },
  loanRepayment: { conventional: "Loan repayment", islamic: "Financing repayment" },
  insurance: { conventional: "Insurance", islamic: "Takaful" },
  profitTax: { conventional: "Tax on interest", islamic: "Tax on profit" },
} as const satisfies Record<string, TermPair>;

export type TermKey = keyof typeof TERMS;

/** The label for a concept under the user's finance mode. */
export function term(key: TermKey, mode: FinanceMode): string {
  return mode === "ISLAMIC" ? TERMS[key].islamic : TERMS[key].conventional;
}

/** All term substitutions, for a settings page that shows what the toggle changes. */
export function termTable(mode: FinanceMode): { key: TermKey; label: string; other: string }[] {
  return (Object.keys(TERMS) as TermKey[]).map((key) => ({
    key,
    label: term(key, mode),
    other: term(key, mode === "ISLAMIC" ? "CONVENTIONAL" : "ISLAMIC"),
  }));
}

// ---------------------------------------------------------------------------
// Riba purification
// ---------------------------------------------------------------------------

/**
 * Income sources a user in ISLAMIC mode would typically treat as riba and give away
 * rather than spend — conventional bank interest and government savings-certificate
 * profit. This is a default, not a ruling: the settings page lets it be overridden, and
 * scholars differ on savings certificates in particular.
 */
export const RIBA_SOURCES = ["BANK_INTEREST", "SAVINGS_CERTIFICATE"] as const;
export type RibaSource = (typeof RIBA_SOURCES)[number];

export function isRibaSource(source: string): source is RibaSource {
  return (RIBA_SOURCES as readonly string[]).includes(source);
}

export interface PurificationSummary {
  /** Income identified as riba over the period. */
  ribaIncome: number;
  /** Amount already given away. */
  purified: number;
  /** Still to be given away. */
  outstanding: number;
}

export function summarisePurification(ribaIncome: number, purified: number): PurificationSummary {
  const safeIncome = Math.max(ribaIncome, 0);
  const safePurified = Math.max(purified, 0);
  return {
    ribaIncome: safeIncome,
    purified: safePurified,
    outstanding: Math.max(safeIncome - safePurified, 0),
  };
}

/**
 * In ISLAMIC mode riba income is excluded from spendable income — it is held for
 * purification, not treated as earnings. Net worth still counts it, because the money
 * physically exists and must be given away from somewhere.
 */
export function spendableIncome(totalIncome: number, ribaIncome: number, mode: FinanceMode): number {
  if (mode !== "ISLAMIC") return totalIncome;
  return Math.max(totalIncome - Math.max(ribaIncome, 0), 0);
}
