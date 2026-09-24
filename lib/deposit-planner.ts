export interface SalaryYearConfig {
  year: number;
  monthlySalary: number;
  festivalBonusMultiplier: number;
  bonusMonths: number[];
  taxRebate: number;
  annualTax: number;
  monthlyExpense: number;
}

export interface DepositPlanAssumptions {
  startingNetWorth: number;
  startMonth: Date;
  depositUnitSize: number;
  profitRateY1: number;
  profitRateY2: number;
  profitRateY3: number;
  investmentCap: number;
}

export interface ExistingDeposit {
  label: string;
  principal: number;
  openedDate: Date;
  rateY1: number;
  rateY2: number;
  rateY3: number;
  termMonths: number;
}

export interface DpsPlanInput {
  label: string;
  monthlyDeposit: number;
  startMonth: Date;
  tenureMonths: number;
  interestRate: number;
  profitTaxAtSource: number;
}

export interface MilestoneInput {
  targetAmount: number;
  label: string;
}

export interface MilestoneResult extends MilestoneInput {
  reachedAt: Date | null;
}

export interface SimDeposit {
  label: string;
  principal: number;
  openedDate: Date;
  rateY1: number;
  rateY2: number;
  rateY3: number;
}

export interface ProjectionMonth {
  month: Date;
  salary: number;
  bonus: number;
  passiveIncome: number;
  tax: number;
  livingExpense: number;
  netSaved: number;
  spDeposited: number;
  dpsInstallment: number;
  dpsInterest: number;
  dpsMaturityPayout: number;
  uninvestedCash: number;
  totalDeposited: number;
  dpsBalance: number;
  wealth: number;
  capReached: boolean;
}

export interface ProjectionResult {
  months: ProjectionMonth[];
  capReachedAt: Date | null;
  milestones: MilestoneResult[];
  /** Every SP deposit at the end of the simulation window: the input deposits followed by
   *  any the simulation auto-opened as cash crossed the deposit unit size. */
  spDeposits: SimDeposit[];
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/**
 * Calendar-month arithmetic that keeps the day of the month, clamping into shorter
 * months (31 Jan + 1 month → 28 Feb). The projection loop uses `addMonths` instead,
 * which pins to the 1st because it works in whole-month buckets — but a date shown to
 * the user has to fall on the day the bank actually pays.
 */
function addMonthsKeepingDay(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDayOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDayOfTarget));
  return target;
}

/**
 * Whole months elapsed, counting a month only once its day has come round — 14 April to
 * 11 September is four months, not five. `monthsBetween` ignores the day because the
 * projection assigns a payment to the month it lands in; a countdown to the next payment
 * cannot, or it skips the payment still due later this month.
 */
function wholeMonthsBetween(a: Date, b: Date): number {
  const months = monthsBetween(a, b);
  return b.getUTCDate() < a.getUTCDate() ? months - 1 : months;
}

// The bank always pays SP (Sanchayapatra) quarterly interest at the deposit's Year-3
// rate, from the very first quarter — it doesn't step up through Y1/Y2 first — and
// withholds a flat 5% TDS (tax deducted at source) before paying out.
const SP_TDS_RATE = 0.05;

function netOfTds(grossAmount: number): number {
  return grossAmount * (1 - SP_TDS_RATE);
}

/**
 * Sums the net (after 5% TDS) quarterly interest a set of fixed deposits has actually
 * paid out between opening and `asOf`, independent of the forward-looking planner
 * simulation — used for the dashboard's "passive income to date" tile.
 */
export function accruedInterestToDate(deposits: ExistingDeposit[], asOf: Date): number {
  let total = 0;
  for (const d of deposits) {
    const monthsHeld = monthsBetween(d.openedDate, asOf);
    const quartersPaid = Math.floor(monthsHeld / 3);
    const grossQtrInterest = (d.principal * d.rateY3) / 4;
    total += netOfTds(grossQtrInterest) * quartersPaid;
  }
  return total;
}

/**
 * Grows a DPS (recurring monthly deposit) plan's balance from its start month up to
 * (but not including) `asOf`, following the bank's own maturity-value formula: each
 * month's installment lands first, then that month's interest (net of tax) is credited
 * on the resulting balance — so a deposit starts earning the same month it's made.
 * Used both by the forward projection and the dashboard's "DPS balance to date" tile.
 */
function growDpsBalance(plan: DpsPlanInput, upToMonth: Date): number {
  const monthsElapsed = monthsBetween(plan.startMonth, upToMonth);
  if (monthsElapsed < 0) return 0;
  const monthsToSimulate = Math.min(monthsElapsed, plan.tenureMonths);
  let balance = 0;
  for (let m = 0; m < monthsToSimulate; m++) {
    balance += plan.monthlyDeposit;
    const interest = balance * (plan.interestRate / 12);
    const netInterest = interest * (1 - plan.profitTaxAtSource);
    balance += netInterest;
  }
  return balance;
}

/**
 * Sums the current balance (principal + net-of-tax interest already earned) across a
 * set of DPS plans as of `asOf` — used for the dashboard's "DPS balance" tile, without
 * needing the full forward-looking plan assumptions the monthly projection requires.
 */
export function dpsBalanceToDate(plans: DpsPlanInput[], asOf: Date): number {
  return plans.reduce((sum, plan) => sum + growDpsBalance(plan, asOf), 0);
}

/**
 * Finds the next quarterly interest payment date (and net-of-TDS amount) for a fixed
 * deposit from `asOf` — used to power the dashboard's upcoming-events reminders.
 */
export function nextSpInterestPayment(deposit: ExistingDeposit, asOf: Date): { date: Date; amount: number } {
  // Payments fall on the deposit's own day of the month — a certificate opened on the
  // 14th pays on the 14th — so both the elapsed count and the returned date carry the
  // day through rather than collapsing to the 1st.
  const monthsHeld = Math.max(wholeMonthsBetween(deposit.openedDate, asOf), 0);
  const nextQuarterMonths = (Math.floor(monthsHeld / 3) + 1) * 3;
  const date = addMonthsKeepingDay(deposit.openedDate, nextQuarterMonths);
  const grossQtrInterest = (deposit.principal * deposit.rateY3) / 4;
  return { date, amount: netOfTds(grossQtrInterest) };
}

function salaryConfigForYear(configs: SalaryYearConfig[], year: number): SalaryYearConfig | undefined {
  const exact = configs.find((c) => c.year === year);
  if (exact) return exact;
  const candidates = configs.filter((c) => c.year <= year).sort((a, b) => b.year - a.year);
  return candidates[0];
}

/**
 * Ports the DPS sheet's month-by-month projection: accumulate salary + bonus +
 * quarterly deposit interest, net of tax and living expense, into cash; once cash
 * clears the deposit unit size, open a new fixed deposit, until the investment cap
 * is reached.
 */
export function projectDepositPlan(
  assumptions: DepositPlanAssumptions,
  salaryConfigs: SalaryYearConfig[],
  existingDeposits: ExistingDeposit[],
  milestoneInputs: MilestoneInput[] = [],
  maxMonths = 360,
  dpsPlans: DpsPlanInput[] = [],
): ProjectionResult {
  const deposits: SimDeposit[] = existingDeposits.map((d) => ({
    label: d.label,
    principal: d.principal,
    openedDate: d.openedDate,
    rateY1: d.rateY1,
    rateY2: d.rateY2,
    rateY3: d.rateY3,
  }));

  let cash = 0;
  let totalDeposited = deposits.reduce((sum, d) => sum + d.principal, 0);
  let wealth = assumptions.startingNetWorth;
  let capReached = totalDeposited >= assumptions.investmentCap;
  let capReachedAt: Date | null = capReached ? assumptions.startMonth : null;
  const dpsBalances = dpsPlans.map(() => 0);
  const dpsMatured = dpsPlans.map(() => false);

  const months: ProjectionMonth[] = [];
  let depositCounter = deposits.length;

  for (let i = 0; i < maxMonths; i++) {
    const month = addMonths(assumptions.startMonth, i);
    const year = month.getUTCFullYear();
    const monthOfYear = month.getUTCMonth() + 1;

    const salaryConfig = salaryConfigForYear(salaryConfigs, year);
    const salary = salaryConfig?.monthlySalary ?? 0;
    const bonus =
      salaryConfig && salaryConfig.bonusMonths.includes(monthOfYear)
        ? salary * salaryConfig.festivalBonusMultiplier
        : 0;
    const monthlyTaxNet = salaryConfig
      ? (salaryConfig.annualTax / 12) * (1 - salaryConfig.taxRebate)
      : 0;
    const livingExpense = salaryConfig ? salaryConfig.monthlyExpense : 0;

    let passiveIncome = 0;
    for (const d of deposits) {
      const monthsHeld = monthsBetween(d.openedDate, month);
      if (monthsHeld > 0 && monthsHeld % 3 === 0) {
        const grossQtrInterest = (d.principal * d.rateY3) / 4;
        passiveIncome += netOfTds(grossQtrInterest);
      }
    }

    const netSaved = salary + bonus + passiveIncome - monthlyTaxNet - livingExpense;
    cash += netSaved;
    wealth += netSaved;

    let spDeposited = 0;
    if (!capReached) {
      while (cash >= assumptions.depositUnitSize && totalDeposited < assumptions.investmentCap) {
        cash -= assumptions.depositUnitSize;
        totalDeposited += assumptions.depositUnitSize;
        spDeposited += assumptions.depositUnitSize;
        depositCounter += 1;
        deposits.push({
          label: `Deposit ${depositCounter}`,
          principal: assumptions.depositUnitSize,
          openedDate: month,
          rateY1: assumptions.profitRateY1,
          rateY2: assumptions.profitRateY2,
          rateY3: assumptions.profitRateY3,
        });
      }
      if (totalDeposited >= assumptions.investmentCap) {
        capReached = true;
        capReachedAt = month;
      }
    }

    // SP fills up to its cap first (Sanchayapatra has a hard 30L/60L ceiling, so it's
    // the priority while there's still room). DPS only starts pulling its monthly
    // installment once SP is maxed out — a plan's tenure clock runs from whichever is
    // later: its own configured start month, or the month SP actually capped.
    //
    // DPS is illiquid: you pay an installment in every month and get nothing back
    // until the plan matures. So while a plan is accruing, its balance is invisible
    // to net worth (installments leave cash and wealth alike). Only at maturity does
    // the full balance — principal plus every month's compounded interest — get paid
    // out as a lump sum back into cash and wealth.
    let dpsInstallmentThisMonth = 0;
    let dpsInterestThisMonth = 0;
    let dpsMaturityPayoutThisMonth = 0;
    if (capReached && capReachedAt) {
      dpsPlans.forEach((plan, idx) => {
        if (dpsMatured[idx]) return;
        const effectiveStart = plan.startMonth.getTime() > capReachedAt!.getTime() ? plan.startMonth : capReachedAt!;
        const monthsElapsed = monthsBetween(effectiveStart, month);
        if (monthsElapsed < 0) return;
        if (monthsElapsed < plan.tenureMonths) {
          // Bank's maturity-value formula: this month's installment lands first,
          // then interest (net of tax) is credited on the resulting balance.
          const balanceWithInstallment = dpsBalances[idx] + plan.monthlyDeposit;
          const interest = balanceWithInstallment * (plan.interestRate / 12);
          const netInterest = interest * (1 - plan.profitTaxAtSource);
          dpsBalances[idx] = balanceWithInstallment + netInterest;
          dpsInstallmentThisMonth += plan.monthlyDeposit;
          dpsInterestThisMonth += netInterest;
        } else if (monthsElapsed === plan.tenureMonths) {
          dpsMaturityPayoutThisMonth += dpsBalances[idx];
          dpsBalances[idx] = 0;
          dpsMatured[idx] = true;
        }
      });
      cash -= dpsInstallmentThisMonth;
      cash += dpsMaturityPayoutThisMonth;
      wealth -= dpsInstallmentThisMonth;
      wealth += dpsMaturityPayoutThisMonth;
    }

    months.push({
      month,
      salary,
      bonus,
      passiveIncome,
      tax: monthlyTaxNet,
      livingExpense,
      netSaved,
      spDeposited,
      dpsInstallment: dpsInstallmentThisMonth,
      dpsInterest: dpsInterestThisMonth,
      dpsMaturityPayout: dpsMaturityPayoutThisMonth,
      uninvestedCash: cash,
      totalDeposited,
      dpsBalance: dpsBalances.reduce((sum, b) => sum + b, 0),
      wealth,
      capReached,
    });
  }

  const milestones: MilestoneResult[] = milestoneInputs.map((m) => {
    const hit = months.find((mo) => mo.wealth >= m.targetAmount);
    return { ...m, reachedAt: hit ? hit.month : null };
  });

  return { months, capReachedAt, milestones, spDeposits: deposits };
}
