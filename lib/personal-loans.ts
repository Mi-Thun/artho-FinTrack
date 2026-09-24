import { ZERO, money, toNumber } from "@/lib/money";

// Informal lending — "dhar". Money lent to a cousin, borrowed from a colleague until
// payday, the 50,000 that went to a friend's medical bill three years ago. It is a
// universal part of Bangladeshi household finance and no mainstream app tracks it, so
// people keep it in their heads and lose track.
//
// Modelled separately from Loan (bank/institutional) because there is no interest, no
// schedule, and often no due date — what matters is who owes whom, how much is left,
// and how long it has been outstanding.

export type LendingDirection = "LENT" | "BORROWED";

export interface PersonalLoanInput {
  id?: string;
  counterparty: string;
  direction: LendingDirection;
  principal: unknown;
  date: Date;
  dueDate?: Date | null;
  settledAt?: Date | null;
  payments: { date: Date; amount: unknown }[];
}

export interface PersonalLoanStatus {
  id?: string;
  counterparty: string;
  direction: LendingDirection;
  principal: number;
  repaid: number;
  outstanding: number;
  date: Date;
  dueDate: Date | null;
  /** Explicitly settled, or fully repaid. */
  isSettled: boolean;
  /** Past its due date with a balance outstanding. */
  isOverdue: boolean;
  /** Whole days since the money changed hands. */
  ageDays: number;
  /** Days past due; 0 when not overdue or no due date. */
  daysOverdue: number;
  progressPct: number;
}

export function loanStatus(loan: PersonalLoanInput, asOf: Date): PersonalLoanStatus {
  const principal = money(loan.principal);
  const repaid = loan.payments.reduce((sum, p) => sum.plus(money(p.amount)), ZERO);
  const rawOutstanding = principal.minus(repaid);
  // Overpayment settles the debt; it doesn't create a negative one.
  const outstanding = rawOutstanding.isNegative() ? ZERO : rawOutstanding;

  const outstandingNumber = toNumber(outstanding);
  const principalNumber = toNumber(principal);
  const isSettled = loan.settledAt != null || outstandingNumber <= 0;

  const dueDate = loan.dueDate ?? null;
  const isOverdue = !isSettled && dueDate != null && asOf > dueDate;

  return {
    id: loan.id,
    counterparty: loan.counterparty,
    direction: loan.direction,
    principal: principalNumber,
    repaid: toNumber(repaid),
    outstanding: outstandingNumber,
    date: loan.date,
    dueDate,
    isSettled,
    isOverdue,
    ageDays: Math.max(Math.floor((asOf.getTime() - loan.date.getTime()) / 86400000), 0),
    daysOverdue: isOverdue && dueDate ? Math.floor((asOf.getTime() - dueDate.getTime()) / 86400000) : 0,
    progressPct: principalNumber > 0 ? Math.min((toNumber(repaid) / principalNumber) * 100, 100) : 0,
  };
}

export interface CounterpartySummary {
  counterparty: string;
  /** Positive: they owe you. Negative: you owe them. */
  netPosition: number;
  owedToYou: number;
  owedByYou: number;
  openLoans: number;
}

/**
 * Nets each person down to a single number. Someone you've both lent to and borrowed
 * from should show one figure, not two rows that need mental arithmetic.
 */
export function summariseByCounterparty(loans: PersonalLoanInput[], asOf: Date): CounterpartySummary[] {
  const byName = new Map<string, CounterpartySummary>();

  for (const loan of loans) {
    const status = loanStatus(loan, asOf);
    if (status.isSettled) continue;

    const key = loan.counterparty.trim();
    const entry = byName.get(key) ?? {
      counterparty: key,
      netPosition: 0,
      owedToYou: 0,
      owedByYou: 0,
      openLoans: 0,
    };

    if (status.direction === "LENT") entry.owedToYou += status.outstanding;
    else entry.owedByYou += status.outstanding;

    entry.openLoans += 1;
    entry.netPosition = entry.owedToYou - entry.owedByYou;
    byName.set(key, entry);
  }

  return [...byName.values()].sort((a, b) => Math.abs(b.netPosition) - Math.abs(a.netPosition));
}

export interface LendingTotals {
  totalOwedToYou: number;
  totalOwedByYou: number;
  netPosition: number;
  overdueCount: number;
  openCount: number;
}

export function lendingTotals(loans: PersonalLoanInput[], asOf: Date): LendingTotals {
  let owedToYou = ZERO;
  let owedByYou = ZERO;
  let overdueCount = 0;
  let openCount = 0;

  for (const loan of loans) {
    const status = loanStatus(loan, asOf);
    if (status.isSettled) continue;
    openCount++;
    if (status.isOverdue) overdueCount++;
    if (status.direction === "LENT") owedToYou = owedToYou.plus(money(status.outstanding));
    else owedByYou = owedByYou.plus(money(status.outstanding));
  }

  return {
    totalOwedToYou: toNumber(owedToYou),
    totalOwedByYou: toNumber(owedByYou),
    netPosition: toNumber(owedToYou.minus(owedByYou)),
    overdueCount,
    openCount,
  };
}
