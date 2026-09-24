import { dpsBalanceToDate, type DpsPlanInput } from "@/lib/deposit-planner";
import { ZERO, money, sumBy, toNumber } from "@/lib/money";

export interface NetWorthResult {
  cashOnHand: number;
  fixedDepositTotal: number;
  dpsBalance: number;
  loanRemaining: number;
  netWorth: number;
  /** Net worth before any loan is netted off — the gross asset side. */
  totalAssets: number;
}

// Account.balance is a running total updated by every transaction as it happens, so to
// see what it was at an earlier cutoff we undo the effect of every transaction dated
// at/after that cutoff. Passing cutoff = now yields today's live net worth.
//
// Every component is accumulated in Decimal (see lib/money.ts) and rounded to poisha
// only on the way out, so a long transaction history can't drift the total.
export function computeNetWorth(params: {
  accounts: { balance: unknown }[];
  transactions: { accountId: string | null; date: Date; type: "INCOME" | "EXPENSE"; amount: unknown }[];
  /** Real holdings only. Projected purchases must never be passed in — see lib/sync.ts. */
  fixedDeposits: { openedDate: Date; principal: unknown; encashedAt?: Date | null }[];
  dpsPlanInputs: DpsPlanInput[];
  loans: { startDate: Date; originalAmount: unknown; payments: { date: Date; amount: unknown }[] }[];
  cutoff: Date;
}): NetWorthResult {
  const { accounts, transactions, fixedDeposits, dpsPlanInputs, loans, cutoff } = params;

  const liveCashOnHand = sumBy(accounts, (a) => a.balance);
  const futureAccountNet = transactions
    .filter((t) => t.accountId && t.date >= cutoff)
    .reduce((sum, t) => (t.type === "INCOME" ? sum.plus(money(t.amount)) : sum.minus(money(t.amount))), ZERO);
  const cashOnHand = liveCashOnHand.minus(futureAccountNet);

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

  const totalAssets = cashOnHand.plus(fixedDepositTotal).plus(dpsBalance);
  const netWorth = totalAssets.minus(loanRemaining);

  return {
    cashOnHand: toNumber(cashOnHand),
    fixedDepositTotal: toNumber(fixedDepositTotal),
    dpsBalance: toNumber(dpsBalance),
    loanRemaining: toNumber(loanRemaining),
    netWorth: toNumber(netWorth),
    totalAssets: toNumber(totalAssets),
  };
}
