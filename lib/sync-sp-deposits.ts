import { db } from "./db";
import { projectDepositPlan } from "./deposit-planner";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

/**
 * Keeps auto-projected SP deposits in sync with the plan: your manually-entered
 * deposits are never touched, but any deposit the projection says should have opened
 * by the current month (given Plan Assumptions + Salary Plan + your manual deposits)
 * is materialized as a real FixedDeposit row (source: PROJECTED) so it shows up
 * everywhere real deposits do. Every call fully recomputes and replaces the PROJECTED
 * set from scratch, so changing Plan Assumptions instantly regenerates them.
 */
export async function syncProjectedSpDeposits(userId: string): Promise<void> {
  const [planConfig, salaryConfigs, manualDeposits, existingProjected] = await Promise.all([
    db.depositPlanConfig.findUnique({ where: { userId } }),
    db.salaryConfig.findMany({ where: { userId } }),
    db.fixedDeposit.findMany({ where: { userId, source: "MANUAL" } }),
    db.fixedDeposit.findMany({ where: { userId, source: "PROJECTED" }, orderBy: { openedDate: "asc" } }),
  ]);

  if (!planConfig || salaryConfigs.length === 0) {
    if (existingProjected.length > 0) await db.fixedDeposit.deleteMany({ where: { userId, source: "PROJECTED" } });
    return;
  }

  const now = new Date();
  const monthsToNow = monthsBetween(planConfig.startMonth, now);
  if (monthsToNow < 0) {
    if (existingProjected.length > 0) await db.fixedDeposit.deleteMany({ where: { userId, source: "PROJECTED" } });
    return;
  }

  const result = projectDepositPlan(
    {
      startingNetWorth: toNumber(planConfig.startingNetWorth),
      startMonth: planConfig.startMonth,
      depositUnitSize: toNumber(planConfig.depositUnitSize),
      profitRateY1: toNumber(planConfig.profitRateY1),
      profitRateY2: toNumber(planConfig.profitRateY2),
      profitRateY3: toNumber(planConfig.profitRateY3),
      investmentCap: toNumber(planConfig.investmentCap),
    },
    salaryConfigs.map((s) => ({
      year: s.year,
      monthlySalary: toNumber(s.monthlySalary),
      festivalBonusMultiplier: toNumber(s.festivalBonusMultiplier),
      bonusMonths: s.bonusMonths,
      taxRebate: toNumber(s.taxRebate),
      annualTax: toNumber(s.annualTax),
      monthlyExpense: toNumber(s.monthlyExpense),
    })),
    manualDeposits.map((d) => ({
      label: d.label,
      principal: toNumber(d.principal),
      openedDate: d.openedDate,
      rateY1: toNumber(d.rateY1),
      rateY2: toNumber(d.rateY2),
      rateY3: toNumber(d.rateY3),
      termMonths: d.termMonths,
    })),
    [],
    monthsToNow + 1,
  );

  const projectedNew = result.spDeposits.slice(manualDeposits.length);

  const unchanged =
    projectedNew.length === existingProjected.length &&
    projectedNew.every((d, i) => {
      const existing = existingProjected[i];
      return (
        d.principal === toNumber(existing.principal) &&
        d.openedDate.getTime() === existing.openedDate.getTime() &&
        d.rateY1 === toNumber(existing.rateY1) &&
        d.rateY2 === toNumber(existing.rateY2) &&
        d.rateY3 === toNumber(existing.rateY3)
      );
    });
  if (unchanged) return;

  await db.$transaction([
    db.fixedDeposit.deleteMany({ where: { userId, source: "PROJECTED" } }),
    ...projectedNew.map((d, i) =>
      db.fixedDeposit.create({
        data: {
          userId,
          label: `Deposit ${manualDeposits.length + i + 1} (auto)`,
          principal: d.principal,
          openedDate: d.openedDate,
          rateY1: d.rateY1,
          rateY2: d.rateY2,
          rateY3: d.rateY3,
          termMonths: 36,
          source: "PROJECTED",
        },
      }),
    ),
  ]);
}
