import { describe, expect, it } from "vitest";
import { computeNetWorth } from "./net-worth";

const NOW = new Date(Date.UTC(2026, 5, 15));

function netWorth(overrides: Partial<Parameters<typeof computeNetWorth>[0]> = {}) {
  return computeNetWorth({
    accounts: [],
    fixedDeposits: [],
    dpsPlanInputs: [],
    loans: [],
    cutoff: NOW,
    ...overrides,
  });
}

describe("computeNetWorth", () => {
  it("sums deposits without floating-point drift", () => {
    const fixedDeposits = Array.from({ length: 10 }, () => ({ openedDate: new Date(Date.UTC(2026, 0, 1)), principal: "0.1" }));
    // The naive float sum of ten 0.1s is 0.9999999999999999.
    expect(netWorth({ fixedDeposits }).fixedDepositTotal).toBe(1);
  });

  it("reports assets separately from the loan-netted total", () => {
    const result = netWorth({
      fixedDeposits: [{ openedDate: new Date(Date.UTC(2026, 0, 1)), principal: "100000" }],
      loans: [{ startDate: new Date(Date.UTC(2026, 0, 1)), originalAmount: "40000", payments: [] }],
    });
    expect(result.totalAssets).toBe(100000);
    expect(result.loanRemaining).toBe(40000);
    expect(result.netWorth).toBe(60000);
  });

  it("counts account balances as cash, without floating-point drift", () => {
    const accounts = Array.from({ length: 10 }, () => ({ balance: "0.1" }));
    // The naive float sum of ten 0.1s is 0.9999999999999999.
    const result = netWorth({ accounts });
    expect(result.cashOnHand).toBe(1);
    expect(result.netWorth).toBe(1);
  });

  it("uses the entered balances as they are, whatever the cutoff", () => {
    const result = netWorth({ accounts: [{ balance: "10000" }], cutoff: new Date(Date.UTC(2020, 0, 1)) });
    expect(result.cashOnHand).toBe(10000);
  });

  it("excludes an encashed certificate", () => {
    const result = netWorth({
      fixedDeposits: [
        {
          openedDate: new Date(Date.UTC(2026, 0, 1)),
          principal: "200000",
          encashedAt: new Date(Date.UTC(2026, 3, 1)),
        },
      ],
    });
    expect(result.fixedDepositTotal).toBe(0);
    expect(result.netWorth).toBe(0);
  });

  it("still counts a certificate encashed after the cutoff", () => {
    const result = netWorth({
      fixedDeposits: [
        {
          openedDate: new Date(Date.UTC(2026, 0, 1)),
          principal: "200000",
          // Encashed later than the reconstruction date, so it was still held then.
          encashedAt: new Date(Date.UTC(2026, 11, 1)),
        },
      ],
    });
    expect(result.fixedDepositTotal).toBe(200000);
  });

  it("counts only deposits opened before the cutoff", () => {
    const result = netWorth({
      fixedDeposits: [
        { openedDate: new Date(Date.UTC(2026, 0, 1)), principal: "100000" },
        { openedDate: new Date(Date.UTC(2026, 11, 1)), principal: "500000" },
      ],
    });
    expect(result.fixedDepositTotal).toBe(100000);
  });

  it("nets loan payments made before the cutoff off the outstanding balance", () => {
    const result = netWorth({
      loans: [
        {
          startDate: new Date(Date.UTC(2026, 0, 1)),
          originalAmount: "100000",
          payments: [
            { date: new Date(Date.UTC(2026, 1, 1)), amount: "10000" },
            { date: new Date(Date.UTC(2026, 2, 1)), amount: "15000" },
            // After the cutoff — not yet paid as of the reconstruction date.
            { date: new Date(Date.UTC(2026, 8, 1)), amount: "20000" },
          ],
        },
      ],
    });
    expect(result.loanRemaining).toBe(75000);
  });

  it("does not let an overpaid loan become a negative liability", () => {
    const result = netWorth({
      loans: [
        {
          startDate: new Date(Date.UTC(2026, 0, 1)),
          originalAmount: "10000",
          payments: [{ date: new Date(Date.UTC(2026, 1, 1)), amount: "25000" }],
        },
      ],
    });
    expect(result.loanRemaining).toBe(0);
  });

  it("ignores loans that had not started as of the cutoff", () => {
    const result = netWorth({
      loans: [{ startDate: new Date(Date.UTC(2026, 10, 1)), originalAmount: "50000", payments: [] }],
    });
    expect(result.loanRemaining).toBe(0);
  });

  it("keeps netWorth equal to totalAssets minus loanRemaining", () => {
    const result = netWorth({
      fixedDeposits: [
        { openedDate: new Date(Date.UTC(2026, 0, 1)), principal: "33333.33" },
        { openedDate: new Date(Date.UTC(2026, 0, 1)), principal: "66666.67" },
      ],
      loans: [{ startDate: new Date(Date.UTC(2026, 0, 1)), originalAmount: "10000.01", payments: [] }],
    });
    expect(result.totalAssets).toBe(100000);
    expect(result.netWorth).toBe(89999.99);
  });

  it("takes off expenses and adds income logged after the balance was counted", () => {
    const counted = new Date(Date.UTC(2026, 5, 10, 12));
    const tx = (type: "INCOME" | "EXPENSE", amount: string, createdAt: Date, accountId: string | null = "a") => ({
      accountId,
      amount,
      type,
      date: new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate())),
      createdAt,
    });
    const result = netWorth({
      accounts: [{ id: "a", balance: "50000", lastCountedAt: counted }],
      transactions: [
        tx("EXPENSE", "1000", new Date(Date.UTC(2026, 5, 9))), // before the count: already in the balance
        tx("EXPENSE", "2500", new Date(Date.UTC(2026, 5, 11))),
        tx("INCOME", "500", new Date(Date.UTC(2026, 5, 12))),
        tx("EXPENSE", "300", new Date(Date.UTC(2026, 5, 13)), null), // no account: after every count
        // Logged after the count but dated years earlier: history, already in the balance.
        { accountId: "a", amount: "35000", type: "INCOME" as const, date: new Date(Date.UTC(2023, 4, 10)), createdAt: new Date(Date.UTC(2026, 5, 11)) },
      ],
    });
    expect(result.cashOnHand).toBe(50000);
    expect(result.loggedSinceCount).toBe(-2300);
    expect(result.netWorth).toBe(47700);
  });

  it("ignores transactions dated on or after the cutoff", () => {
    const result = netWorth({
      accounts: [{ id: "a", balance: "1000", lastCountedAt: new Date(Date.UTC(2026, 0, 1)) }],
      transactions: [{ accountId: "a", amount: "200", type: "EXPENSE", date: NOW, createdAt: new Date(Date.UTC(2026, 0, 2)) }],
    });
    expect(result.netWorth).toBe(1000);
  });

  it("keeps counting an expense with no account until every balance is recounted after it", () => {
    const expense = { accountId: null, amount: "3020", type: "EXPENSE" as const, date: new Date(Date.UTC(2026, 8, 26)), createdAt: new Date(Date.UTC(2026, 8, 26, 12)) };
    const cash = { id: "cash", balance: "584", createdAt: new Date(Date.UTC(2026, 8, 26, 7)) };
    // Only the bank was recounted since: the expense may have been paid from cash.
    const bankRecounted = { id: "bank", balance: "79416", createdAt: new Date(Date.UTC(2026, 8, 26, 7)), lastCountedAt: new Date(Date.UTC(2026, 8, 28, 8)) };
    expect(netWorth({ accounts: [cash, bankRecounted], transactions: [expense], cutoff: new Date(Date.UTC(2026, 8, 29)) }).loggedSinceCount).toBe(-3020);
    // Both recounted after it: the balances already include it.
    const cashRecounted = { ...cash, lastCountedAt: new Date(Date.UTC(2026, 8, 28, 9)) };
    expect(netWorth({ accounts: [cashRecounted, bankRecounted], transactions: [expense], cutoff: new Date(Date.UTC(2026, 8, 29)) }).loggedSinceCount).toBe(0);
  });
});
