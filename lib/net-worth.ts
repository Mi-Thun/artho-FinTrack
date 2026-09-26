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

// Net worth = cash in accounts + SP + DPS − bank loans, as of `cutoff` (cutoff = now for
// today's figure). Account balances are what the user last entered on the Accounts page —
// no transaction moves them — so cash is simply their sum, whatever the cutoff.
//
// Every component is accumulated in Decimal (see lib/money.ts) and rounded to poisha
// only on the way out, so a long transaction history can't drift the total.
export function computeNetWorth(params: {
  /** Real holdings only. Projected purchases must never be passed in — see lib/sync.ts. */
  accounts: { balance: unknown }[];
  fixedDeposits: { openedDate: Date; principal: unknown; encashedAt?: Date | null }[];
  dpsPlanInputs: DpsPlanInput[];
  loans: { startDate: Date; originalAmount: unknown; payments: { date: Date; amount: unknown }[] }[];
  cutoff: Date;
}): NetWorthResult {
  const { accounts, fixedDeposits, dpsPlanInputs, loans, cutoff } = params;

  const cashOnHand = sumBy(accounts, (a) => a.balance);

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
