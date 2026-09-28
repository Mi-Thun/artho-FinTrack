import Link from "next/link";
import { db } from "@/lib/db";
import { projectDepositPlan } from "@/lib/deposit-planner";
import { spPayoutOf } from "@/lib/sanchayapatra";
import { Button } from "@/components/ui/button";

// Shared by the Goals tabs (projection, plan, salary plan, milestones).

export function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function editCancel(href: string) {
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
      Cancel
    </Button>
  );
}

export type Plan = Awaited<ReturnType<typeof loadProjection>>;

/**
 * The projection every plan-driven section reads from. Returns null until both halves of the
 * plan exist, which is what the empty states below key off.
 */
export async function loadProjection(userId: string) {
  const [planConfig, salaryConfigs, fixedDeposits, dpsPlans, milestones] = await Promise.all([
    db.depositPlanConfig.findUnique({ where: { userId } }),
    db.salaryConfig.findMany({ where: { userId }, orderBy: { year: "asc" } }),
    db.fixedDeposit.findMany({ where: { userId }, orderBy: { openedDate: "asc" } }),
    db.dpsPlan.findMany({ where: { userId }, orderBy: { startMonth: "asc" } }),
    db.milestone.findMany({ where: { userId }, orderBy: { targetAmount: "asc" } }),
  ]);

  if (!planConfig || salaryConfigs.length === 0) return null;

  const startingNetWorth = toNumber(planConfig.startingNetWorth);
  const projection = projectDepositPlan(
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
      monthlyExpense: toNumber(s.monthlyExpense),
    })),
    fixedDeposits.map((d) => ({
      label: d.label,
      principal: toNumber(d.principal),
      openedDate: d.openedDate,
      rateY1: toNumber(d.rateY1),
      rateY2: toNumber(d.rateY2),
      rateY3: toNumber(d.rateY3),
      termMonths: d.termMonths,
      payout: spPayoutOf(d.scheme),
    })),
    milestones.map((m) => ({ targetAmount: toNumber(m.targetAmount), label: m.label })),
    240,
    dpsPlans.map((p) => ({
      label: p.label,
      monthlyDeposit: toNumber(p.monthlyDeposit),
      startMonth: p.startMonth,
      tenureMonths: p.tenureMonths,
      interestRate: toNumber(p.interestRate),
      profitTaxAtSource: toNumber(p.profitTaxAtSource),
    })),
  );

  return {
    projection,
    startingNetWorth,
    existingDepositCount: fixedDeposits.length,
    // For the compact assumptions summary on the projection tab.
    assumptions: {
      startMonth: planConfig.startMonth,
      depositUnitSize: toNumber(planConfig.depositUnitSize),
      investmentCap: toNumber(planConfig.investmentCap),
      profitRateY3: toNumber(planConfig.profitRateY3),
      salaryYears: salaryConfigs.map((s) => s.year),
    },
  };
}

/** Shown wherever a section needs the plan but the plan is not complete yet. */
export function PlanNeeded() {
  return (
    <p className="text-sm text-muted-foreground">
      Fill in the <Link href="/goals/plan" className="font-medium text-link hover:underline">plan assumptions</Link> and at
      least one <Link href="/goals/salary" className="font-medium text-link hover:underline">salary year</Link> to run the
      projection.
    </p>
  );
}
