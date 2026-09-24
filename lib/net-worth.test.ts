import { describe, expect, it } from "vitest";
import { computeNetWorth } from "./net-worth";

const NOW = new Date(Date.UTC(2026, 5, 15));

function netWorth(overrides: Partial<Parameters<typeof computeNetWorth>[0]> = {}) {
  return computeNetWorth({
    accounts: [],
    transactions: [],
    fixedDeposits: [],
    dpsPlanInputs: [],
    loans: [],
    cutoff: NOW,
    ...overrides,
  });
}

describe("computeNetWorth", () => {
  it("sums account balances without floating-point drift", () => {
    const accounts = Array.from({ length: 10 }, () => ({ balance: "0.1" }));
    // The naive float sum of ten 0.1s is 0.9999999999999999.
    expect(netWorth({ accounts }).cashOnHand).toBe(1);
  });

  it("reports assets separately from the loan-netted total", () => {
    const result = netWorth({
      accounts: [{ balance: "100000" }],
      loans: [{ startDate: new Date(Date.UTC(2026, 0, 1)), originalAmount: "40000", payments: [] }],
    });
    expect(result.totalAssets).toBe(100000);
    expect(result.loanRemaining).toBe(40000);
    expect(result.netWorth).toBe(60000);
  });

  it("undoes transactions dated at or after the cutoff to reconstruct an earlier balance", () => {
    const result = netWorth({
      accounts: [{ balance: "10000" }],
      transactions: [
        // Future income that has already been added to the running balance.
        { accountId: "a1", date: new Date(Date.UTC(2026, 6, 1)), type: "INCOME", amount: "2000" },
        // Future expense already deducted from it.
        { accountId: "a1", date: new Date(Date.UTC(2026, 6, 2)), type: "EXPENSE", amount: "500" },
      ],
    });
    // 10,000 live − (2,000 − 500) of future net = 8,500 as of the cutoff.
    expect(result.cashOnHand).toBe(8500);
  });

  it("ignores transactions dated before the cutoff — they are already baked into the balance", () => {
    const result = netWorth({
      accounts: [{ balance: "10000" }],
      transactions: [{ accountId: "a1", date: new Date(Date.UTC(2026, 4, 1)), type: "INCOME", amount: "2000" }],
    });
    expect(result.cashOnHand).toBe(10000);
  });

  it("excludes an encashed certificate — its money already sits in an account", () => {
    const result = netWorth({
      accounts: [{ balance: "50000" }],
      fixedDeposits: [
        {
          openedDate: new Date(Date.UTC(2026, 0, 1)),
          principal: "200000",
          encashedAt: new Date(Date.UTC(2026, 3, 1)),
        },
      ],
    });
    expect(result.fixedDepositTotal).toBe(0);
    expect(result.netWorth).toBe(50000);
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
      accounts: [{ balance: "33333.33" }],
      fixedDeposits: [{ openedDate: new Date(Date.UTC(2026, 0, 1)), principal: "66666.67" }],
      loans: [{ startDate: new Date(Date.UTC(2026, 0, 1)), originalAmount: "10000.01", payments: [] }],
    });
    expect(result.totalAssets).toBe(100000);
    expect(result.netWorth).toBe(89999.99);
  });
});
