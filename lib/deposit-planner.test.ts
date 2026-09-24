import { describe, expect, it } from "vitest";
import { projectDepositPlan, dpsBalanceToDate, nextSpInterestPayment } from "./deposit-planner";

const startMonth = new Date(Date.UTC(2026, 6, 1)); // July 2026

describe("projectDepositPlan", () => {
  it("accumulates net savings into deposits and eventually reaches the investment cap", () => {
    const result = projectDepositPlan(
      {
        startingNetWorth: 200000,
        startMonth,
        depositUnitSize: 100000,
        profitRateY1: 0.1065,
        profitRateY2: 0.1122,
        profitRateY3: 0.1182,
        investmentCap: 600000,
      },
      [{ year: 2026, monthlySalary: 60000, festivalBonusMultiplier: 0.5, bonusMonths: [11], taxRebate: 0.1, annualTax: 12000, monthlyExpense: 3000 }],
      [],
      [],
      120,
    );

    expect(result.capReachedAt).not.toBeNull();
    const last = result.months[result.months.length - 1];
    expect(last.totalDeposited).toBeGreaterThanOrEqual(600000);
    expect(last.capReached).toBe(true);
  });

  it("reports the month a milestone is first crossed", () => {
    const result = projectDepositPlan(
      {
        startingNetWorth: 224604.7,
        startMonth,
        depositUnitSize: 100000,
        profitRateY1: 0.1065,
        profitRateY2: 0.1122,
        profitRateY3: 0.1182,
        investmentCap: 6000000,
      },
      [{ year: 2026, monthlySalary: 60000, festivalBonusMultiplier: 0.5, bonusMonths: [11], taxRebate: 0.1, annualTax: 12000, monthlyExpense: 3000 }],
      [],
      [{ targetAmount: 500000, label: "Half a million" }],
      60,
    );

    const milestone = result.milestones[0];
    expect(milestone.reachedAt).not.toBeNull();
    expect(milestone.reachedAt!.getTime()).toBeGreaterThan(startMonth.getTime());
  });

  it("always pays the Year-3 rate (never Y1/Y2), net of 5% TDS, from the very first quarter", () => {
    const opened = new Date(Date.UTC(2024, 4, 1)); // May 2024
    const result = projectDepositPlan(
      {
        startingNetWorth: 100000,
        startMonth: opened,
        depositUnitSize: 100000,
        profitRateY1: 0.10,
        profitRateY2: 0.20,
        profitRateY3: 0.30,
        investmentCap: 6000000,
      },
      [],
      [
        {
          label: "Deposit 1",
          principal: 100000,
          openedDate: opened,
          rateY1: 0.10,
          rateY2: 0.20,
          rateY3: 0.30,
          termMonths: 36,
        },
      ],
      [],
      16,
    );

    // Quarter at month 3 (still "year 1" by held-duration): the bank always pays the
    // Y3 rate — gross = 100000 * 0.30 / 4 = 7500; net of 5% TDS = 7125.
    const monthIndexFor = (offset: number) => result.months[offset];
    expect(monthIndexFor(3).passiveIncome).toBeCloseTo(7125, 5);

    // Quarter at month 15: same Y3 rate applies — same net amount, no step-up.
    expect(monthIndexFor(15).passiveIncome).toBeCloseTo(7125, 5);
  });

  it("fills SP to its cap before DPS takes any money, then starts DPS the month SP caps", () => {
    const result = projectDepositPlan(
      {
        startingNetWorth: 0,
        startMonth,
        depositUnitSize: 100000,
        profitRateY1: 0.1,
        profitRateY2: 0.1,
        profitRateY3: 0.1,
        investmentCap: 300000,
      },
      [{ year: 2026, monthlySalary: 250000, festivalBonusMultiplier: 0, bonusMonths: [], taxRebate: 0, annualTax: 0, monthlyExpense: 0 }],
      [],
      [],
      3,
      // DPS is "eligible" from month 0, but SP hasn't capped yet — it should sit idle.
      [{ label: "DPS 1", monthlyDeposit: 50000, startMonth, tenureMonths: 12, interestRate: 0, profitTaxAtSource: 0 }],
    );

    const month0 = result.months[0];
    expect(month0.capReached).toBe(false);
    expect(month0.totalDeposited).toBeCloseTo(200000, 5); // two SP units opened, cap not yet hit
    expect(month0.dpsBalance).toBeCloseTo(0, 5); // DPS held back — SP still has room

    const month1 = result.months[1];
    expect(month1.capReached).toBe(true);
    expect(month1.totalDeposited).toBeCloseTo(300000, 5); // SP caps this month
    expect(month1.dpsBalance).toBeCloseTo(50000, 5); // DPS starts the same month SP caps
  });

  it("matches the user's real bank payouts: Y3 rate, net of 5% TDS", () => {
    // Deposit 1: 11.04% Y3 rate. Gross qtr = 100000*0.1104/4 = 2760; net of 5% TDS = 2622.
    const d1 = nextSpInterestPayment(
      { label: "Deposit 1", principal: 100000, openedDate: new Date(Date.UTC(2024, 4, 13)), rateY1: 0.1, rateY2: 0.105, rateY3: 0.1104, termMonths: 36 },
      new Date(Date.UTC(2026, 6, 25)),
    );
    expect(d1.amount).toBeCloseTo(2622, 5);
    // Opened the 13th, so every payment falls on the 13th.
    expect(d1.date.toISOString().slice(0, 10)).toBe("2026-08-13");

    // Deposit 2: 12.30% Y3 rate. Gross qtr = 100000*0.123/4 = 3075; net of 5% TDS = 2921.25.
    const d2 = nextSpInterestPayment(
      { label: "Deposit 2", principal: 100000, openedDate: new Date(Date.UTC(2025, 3, 14)), rateY1: 0.1104, rateY2: 0.1165, rateY3: 0.123, termMonths: 36 },
      new Date(Date.UTC(2026, 6, 25)),
    );
    expect(d2.amount).toBeCloseTo(2921.25, 5);
    expect(d2.date.toISOString().slice(0, 10)).toBe("2026-10-14");
  });

  it("does not skip a payment still due later in the current month", () => {
    // Opened the 14th, asked on the 11th: the 14th of this month is the next payment,
    // not the one a quarter after it.
    const payment = nextSpInterestPayment(
      { label: "Deposit 2", principal: 100000, openedDate: new Date(Date.UTC(2025, 3, 14)), rateY1: 0.1104, rateY2: 0.1165, rateY3: 0.123, termMonths: 36 },
      new Date(Date.UTC(2026, 9, 11)),
    );
    expect(payment.date.toISOString().slice(0, 10)).toBe("2026-10-14");
  });

  it("clamps onto the last day of a shorter month", () => {
    // Opened 31 August; three months on, November has only 30 days.
    const payment = nextSpInterestPayment(
      { label: "Month end", principal: 100000, openedDate: new Date(Date.UTC(2026, 7, 31)), rateY1: 0.1, rateY2: 0.1, rateY3: 0.1, termMonths: 36 },
      new Date(Date.UTC(2026, 8, 15)),
    );
    expect(payment.date.toISOString().slice(0, 10)).toBe("2026-11-30");
  });

  it("keeps DPS out of wealth while it accrues, then pays the full matured balance into cash/wealth at maturity", () => {
    const result = projectDepositPlan(
      {
        startingNetWorth: 0,
        startMonth,
        depositUnitSize: 100000,
        profitRateY1: 0.1,
        profitRateY2: 0.1,
        profitRateY3: 0.1,
        investmentCap: 0, // SP already "capped" at zero, so DPS is free to start immediately
      },
      [],
      [],
      [],
      3,
      [{ label: "DPS 1", monthlyDeposit: 1000, startMonth, tenureMonths: 2, interestRate: 0.12, profitTaxAtSource: 0 }],
    );

    // Bank's formula: installment lands first, then interest is credited on that total.
    // m0: balance = 0+1000 = 1000; interest = 1000*0.01 = 10; balance = 1010.
    // The installment (not the interest) is what leaves wealth while the plan accrues.
    expect(result.months[0].wealth).toBeCloseTo(-1000, 5);
    expect(result.months[0].dpsBalance).toBeCloseTo(1010, 5);

    // m1: balance = 1010+1000 = 2010; interest = 2010*0.01 = 20.1; balance = 2030.1
    expect(result.months[1].wealth).toBeCloseTo(-2000, 5);
    expect(result.months[1].dpsBalance).toBeCloseTo(2030.1, 5);

    // m2: plan matures — full balance (2030.1) is paid out into cash and wealth in one shot
    expect(result.months[2].dpsBalance).toBeCloseTo(0, 5);
    expect(result.months[2].wealth).toBeCloseTo(30.1, 5);
    expect(result.months[2].uninvestedCash).toBeCloseTo(30.1, 5);
  });
});

describe("dpsBalanceToDate", () => {
  it("compounds net-of-tax interest monthly on top of the running installments", () => {
    const plan = {
      label: "DPS 1",
      monthlyDeposit: 1000,
      startMonth,
      tenureMonths: 12,
      interestRate: 0.12, // 1%/month
      profitTaxAtSource: 0,
    };
    const asOf = new Date(Date.UTC(2026, 8, 1)); // 2 months after start

    // Bank's formula: installment lands first, then interest is credited on that total.
    // m0: balance = 0+1000 = 1000; interest = 1000*0.01 = 10; balance = 1010
    // m1: balance = 1010+1000 = 2010; interest = 2010*0.01 = 20.1; balance = 2030.1
    expect(dpsBalanceToDate([plan], asOf)).toBeCloseTo(2030.1, 5);
  });

  it("matches the bank's own maturity-value calculator for a real DPS plan (5000/mo, 120mo, 9.5%)", () => {
    const plan = {
      label: "City",
      monthlyDeposit: 5000,
      startMonth,
      tenureMonths: 120,
      interestRate: 0.095,
      profitTaxAtSource: 0,
    };
    const asOf = new Date(Date.UTC(2036, 6, 1)); // 120 months after start

    // Bank's spreadsheet (Maturity-Value-Calculator) formula for 5000/mo @ 9.5% over
    // 120 months: gross maturity ≈ 10,03,283.69 taka.
    expect(dpsBalanceToDate([plan], asOf)).toBeCloseTo(1003283.69, 0);
  });

  it("stops accruing once the tenure is over", () => {
    const plan = {
      label: "DPS 1",
      monthlyDeposit: 1000,
      startMonth,
      tenureMonths: 2,
      interestRate: 0,
      profitTaxAtSource: 0,
    };
    const wellPastMaturity = new Date(Date.UTC(2028, 0, 1));
    expect(dpsBalanceToDate([plan], wellPastMaturity)).toBeCloseTo(2000, 5);
  });
});
