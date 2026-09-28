import { dpsBalanceToDate, type DpsPlanInput } from "@/lib/deposit-planner";
import { ZERO, money, sumBy, toNumber } from "@/lib/money";

export interface NetWorthResult {
  cashOnHand: number;
  /** Income − expenses logged since each account balance was last saved (see below). */
  loggedSinceCount: number;
  fixedDepositTotal: number;
  dpsBalance: number;
  loanRemaining: number;
  netWorth: number;
  /** Net worth before any loan is netted off — the gross asset side. */
  totalAssets: number;
}

// Net worth = cash in accounts + SP + DPS − bank loans, as of `cutoff` (cutoff = now for
// today's figure). Account balances are what the user last entered on the Accounts page —
// no transaction moves them. Transactions logged *after* a balance was saved aren't in it
// yet, so they're added on top (income) or taken off (expenses) until the next recount.
//
// Every component is accumulated in Decimal (see lib/money.ts) and rounded to poisha
// only on the way out, so a long transaction history can't drift the total.
export function computeNetWorth(params: {
  /** Real holdings only. Projected purchases must never be passed in — see lib/sync.ts. */
  accounts: { id?: string; balance: unknown; lastCountedAt?: Date | null; createdAt?: Date }[];
  /**
   * Logged income and expenses. One counts when it was recorded after its account's
   * balance was saved (and isn't dated before that day). One with no account could have
   * come from any of them, so it counts until *every* balance has been saved after it.
   */
  transactions?: { accountId: string | null; amount: unknown; type: "INCOME" | "EXPENSE"; date: Date; createdAt: Date }[];
  fixedDeposits: { openedDate: Date; principal: unknown; encashedAt?: Date | null }[];
  dpsPlanInputs: DpsPlanInput[];
  loans: { startDate: Date; originalAmount: unknown; payments: { date: Date; amount: unknown }[] }[];
  cutoff: Date;
}): NetWorthResult {
  const { accounts, fixedDeposits, dpsPlanInputs, loans, transactions = [], cutoff } = params;

  const cashOnHand = sumBy(accounts, (a) => a.balance);

  // When each balance was last counted: the save time, or — for a balance never re-saved —
  // when the account was created. Not updatedAt: a data copy or migration rewrites that.
  const countedAt = new Map(accounts.map((a) => [a.id, a.lastCountedAt ?? a.createdAt ?? null]));
  const allCountedBy = [...countedAt.values()].reduce<Date | null>((min, d) => (d && (!min || d < min) ? d : min), null);
  const loggedSinceCount = sumBy(
    transactions.filter((t) => {
      if (t.date >= cutoff) return false;
      const anchor = t.accountId && countedAt.has(t.accountId) ? countedAt.get(t.accountId)! : allCountedBy;
      if (anchor == null) return true;
      // Logged after the count, and dated from the count's day on. A back-dated entry
      // (history typed in later) is money the counted balance already reflects.
      const countDay = Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
      return t.createdAt > anchor && t.date.getTime() >= countDay;
    }),
    (t) => (t.type === "INCOME" ? money(t.amount) : money(t.amount).negated()),
  );

  // Opened before the cutoff, and not yet encashed as of it — an encashed certificate's
  // money has already moved into an account, so counting both would double it.
  const fixedDepositTotal = sumBy(
    fixedDeposits.filter((d) => d.openedDate < cutoff && (d.encashedAt == null || d.encashedAt >= cutoff)),
    (d) => d.principal,
  );
  const dpsBalance = money(dpsBalanceToDate(dpsPlanInputs, cutoff));

  const loanRemaining = loans
    .filter((l) => l.startDate < cutoff)
    .reduce((sum, l) => {
      const repaid = sumBy(
        l.payments.filter((p) => p.date < cutoff),
        (p) => p.amount,
      );
      const outstanding = money(l.originalAmount).minus(repaid);
      // A loan can't go negative from overpayment.
      return sum.plus(outstanding.isNegative() ? ZERO : outstanding);
    }, ZERO);

  const totalAssets = cashOnHand.plus(loggedSinceCount).plus(fixedDepositTotal).plus(dpsBalance);
  const netWorth = totalAssets.minus(loanRemaining);

  return {
    cashOnHand: toNumber(cashOnHand),
    loggedSinceCount: toNumber(loggedSinceCount),
    fixedDepositTotal: toNumber(fixedDepositTotal),
    dpsBalance: toNumber(dpsBalance),
    loanRemaining: toNumber(loanRemaining),
    netWorth: toNumber(netWorth),
    totalAssets: toNumber(totalAssets),
  };
}
