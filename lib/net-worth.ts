import { dpsBalanceToDate, type DpsPlanInput } from "@/lib/deposit-planner";
import { ZERO, money, sumBy, toNumber } from "@/lib/money";

export interface NetWorthResult {
  fixedDepositTotal: number;
  dpsBalance: number;
  loanRemaining: number;
  netWorth: number;
  /** Net worth before any loan is netted off — the gross asset side. */
  totalAssets: number;
}

// Net worth = SP + DPS − bank loans, as of `cutoff` (cutoff = now for today's figure).
// Account balances are deliberately left out: the Accounts page is a view-only record the
// user keeps by hand and isn't used in any calculation.
//
// Every component is accumulated in Decimal (see lib/money.ts) and rounded to poisha
// only on the way out, so a long transaction history can't drift the total.
export function computeNetWorth(params: {
  /** Real holdings only. Projected purchases must never be passed in — see lib/sync.ts. */
  fixedDeposits: { openedDate: Date; principal: unknown; encashedAt?: Date | null }[];
  dpsPlanInputs: DpsPlanInput[];
  loans: { startDate: Date; originalAmount: unknown; payments: { date: Date; amount: unknown }[] }[];
  cutoff: Date;
}): NetWorthResult {
  const { fixedDeposits, dpsPlanInputs, loans, cutoff } = params;

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

  const totalAssets = fixedDepositTotal.plus(dpsBalance);
  const netWorth = totalAssets.minus(loanRemaining);

  return {
    fixedDepositTotal: toNumber(fixedDepositTotal),
    dpsBalance: toNumber(dpsBalance),
    loanRemaining: toNumber(loanRemaining),
    netWorth: toNumber(netWorth),
    totalAssets: toNumber(totalAssets),
  };
}
