import { describe, expect, it } from "vitest";
import { lendingTotals, loanStatus, summariseByCounterparty, type PersonalLoanInput } from "./personal-loans";

const ASOF = new Date(Date.UTC(2026, 6, 31));

function loan(overrides: Partial<PersonalLoanInput> = {}): PersonalLoanInput {
  return {
    counterparty: "Rahim",
    direction: "LENT",
    principal: 50000,
    date: new Date(Date.UTC(2026, 0, 1)),
    payments: [],
    ...overrides,
  };
}

describe("loanStatus", () => {
  it("nets payments off the principal", () => {
    const status = loanStatus(loan({ payments: [{ date: new Date(), amount: 20000 }] }), ASOF);
    expect(status.repaid).toBe(20000);
    expect(status.outstanding).toBe(30000);
    expect(status.progressPct).toBeCloseTo(40, 5);
  });

  it("treats full repayment as settled", () => {
    const status = loanStatus(loan({ payments: [{ date: new Date(), amount: 50000 }] }), ASOF);
    expect(status.outstanding).toBe(0);
    expect(status.isSettled).toBe(true);
  });

  it("never reports a negative balance after overpayment", () => {
    const status = loanStatus(loan({ payments: [{ date: new Date(), amount: 80000 }] }), ASOF);
    expect(status.outstanding).toBe(0);
    expect(status.progressPct).toBe(100);
  });

  it("honours an explicit settlement even with a balance left", () => {
    const status = loanStatus(loan({ settledAt: new Date() }), ASOF);
    expect(status.outstanding).toBe(50000);
    expect(status.isSettled).toBe(true);
    expect(status.isOverdue).toBe(false);
  });

  it("flags an unpaid loan past its due date", () => {
    const status = loanStatus(loan({ dueDate: new Date(Date.UTC(2026, 5, 1)) }), ASOF);
    expect(status.isOverdue).toBe(true);
    expect(status.daysOverdue).toBe(60);
  });

  it("is not overdue without a due date", () => {
    expect(loanStatus(loan(), ASOF).isOverdue).toBe(false);
    expect(loanStatus(loan(), ASOF).daysOverdue).toBe(0);
  });

  it("reports how long the money has been out", () => {
    expect(loanStatus(loan(), ASOF).ageDays).toBe(211);
  });
});

describe("summariseByCounterparty", () => {
  it("nets lending and borrowing with the same person into one position", () => {
    const summary = summariseByCounterparty(
      [
        loan({ counterparty: "Karim", direction: "LENT", principal: 30000 }),
        loan({ counterparty: "Karim", direction: "BORROWED", principal: 10000 }),
      ],
      ASOF,
    );
    expect(summary).toHaveLength(1);
    expect(summary[0].owedToYou).toBe(30000);
    expect(summary[0].owedByYou).toBe(10000);
    expect(summary[0].netPosition).toBe(20000);
    expect(summary[0].openLoans).toBe(2);
  });

  it("excludes settled loans", () => {
    const summary = summariseByCounterparty([loan({ settledAt: new Date() })], ASOF);
    expect(summary).toHaveLength(0);
  });

  it("orders by the size of the position", () => {
    const summary = summariseByCounterparty(
      [
        loan({ counterparty: "Small", principal: 1000 }),
        loan({ counterparty: "Big", principal: 900000 }),
      ],
      ASOF,
    );
    expect(summary[0].counterparty).toBe("Big");
  });

  it("treats a negative net position as significant as a positive one", () => {
    const summary = summariseByCounterparty(
      [
        loan({ counterparty: "Owed", direction: "BORROWED", principal: 500000 }),
        loan({ counterparty: "Lent", direction: "LENT", principal: 1000 }),
      ],
      ASOF,
    );
    expect(summary[0].counterparty).toBe("Owed");
    expect(summary[0].netPosition).toBe(-500000);
  });
});

describe("lendingTotals", () => {
  it("splits the two directions and nets them", () => {
    const totals = lendingTotals(
      [
        loan({ direction: "LENT", principal: 70000 }),
        loan({ direction: "BORROWED", principal: 25000 }),
      ],
      ASOF,
    );
    expect(totals.totalOwedToYou).toBe(70000);
    expect(totals.totalOwedByYou).toBe(25000);
    expect(totals.netPosition).toBe(45000);
    expect(totals.openCount).toBe(2);
  });

  it("counts overdue loans", () => {
    const totals = lendingTotals(
      [
        loan({ dueDate: new Date(Date.UTC(2026, 1, 1)) }),
        loan({ dueDate: new Date(Date.UTC(2027, 1, 1)) }),
      ],
      ASOF,
    );
    expect(totals.overdueCount).toBe(1);
  });

  it("is all zeros with no open loans", () => {
    expect(lendingTotals([], ASOF)).toEqual({
      totalOwedToYou: 0,
      totalOwedByYou: 0,
      netPosition: 0,
      overdueCount: 0,
      openCount: 0,
    });
  });
});
