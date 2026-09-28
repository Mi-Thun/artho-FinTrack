import Link from "next/link";
import { requireUserId } from "@/lib/current-user";
import { localiseAmountsInText } from "@/lib/i18n";
import { getLocalisation } from "@/lib/preferences";
import { rateToPercent } from "@/lib/rates";
import { Card } from "@/components/Card";
import { ProjectionTable } from "@/components/ProjectionTable";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { loadProjection, PlanNeeded } from "./shared";

export default async function GoalsProjectionPage() {
  const userId = await requireUserId();
  const { fmt, term } = await getLocalisation(userId);
  const plan = await loadProjection(userId);
  if (!plan) {
    return (
      <Card id="projection" title="Monthly projection">
        <PlanNeeded />
      </Card>
    );
  }

  const { projection, startingNetWorth } = plan;

  const rows = projection.months.map((m, i) => {
    const prev = projection.months[i - 1];
    return {
      month: fmt.monthYear(m.month),
      year: m.month.getUTCFullYear(),
      wealth: m.wealth,
      totalDeposited: m.totalDeposited,
      dpsBalance: m.dpsBalance,
      uninvestedCash: m.uninvestedCash,
      capReached: m.capReached,
      prevWealth: prev ? prev.wealth : startingNetWorth,
      prevUninvestedCash: prev ? prev.uninvestedCash : 0,
      salary: m.salary,
      bonus: m.bonus,
      passiveIncome: m.passiveIncome,
      livingExpense: m.livingExpense,
      netSaved: m.netSaved,
      spDeposited: m.spDeposited,
      dpsInstallment: m.dpsInstallment,
      dpsInterest: m.dpsInterest,
      dpsMaturityPayout: m.dpsMaturityPayout,
      prevDpsBalance: prev ? prev.dpsBalance : 0,
    };
  });

  const capReachedAt = projection.capReachedAt
    ? fmt.monthYear(projection.capReachedAt)
    : null;

  const chartPoints = projection.months.map((m, i) => ({
    i,
    label: fmt.monthYear(m.month),
    year: m.month.getUTCFullYear(),
    value: m.wealth,
    spDeposited: m.totalDeposited,
  }));
  const monthIndex = (d: Date | null) =>
    d ? projection.months.findIndex((m) => m.month.getUTCFullYear() === d.getUTCFullYear() && m.month.getUTCMonth() === d.getUTCMonth()) : -1;
  const chartMilestones = projection.milestones.map((m) => {
    const idx = monthIndex(m.reachedAt);
    return { label: localiseAmountsInText(m.label, fmt.money), target: m.targetAmount, reachedIndex: idx >= 0 ? idx : null };
  });
  const capIndex = monthIndex(projection.capReachedAt);
  const a = plan.assumptions;

  return (
    <>
      <Card
        title="Projected accumulated savings"
        action={
          <Link href="/goals/plan" className="text-sm font-medium text-link hover:underline">
            Edit plan
          </Link>
        }
      >
        <ProjectionChart
          points={chartPoints}
          milestones={chartMilestones}
          capReached={capIndex >= 0 && capReachedAt ? { index: capIndex, label: capReachedAt } : null}
          language={fmt.language}
          numerals={fmt.numerals}
        />
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-4 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Starts</dt>
            <dd className="font-medium">
              {fmt.monthYear(a.startMonth)} with {fmt.money(startingNetWorth)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Profit rate (year 3)</dt>
            <dd className="font-medium tabular-nums">{fmt.number(rateToPercent(a.profitRateY3), { maximumFractionDigits: 2 })}%</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Salary plan</dt>
            <dd className="font-medium">
              {a.salaryYears.length === 0
                ? "None"
                : `${fmt.number(Math.min(...a.salaryYears), { useGrouping: false })}–${fmt.number(Math.max(...a.salaryYears), { useGrouping: false })}`}
            </dd>
          </div>
        </dl>
      </Card>

      <Card id="projection">
        <ProjectionTable
          rows={rows}
          language={fmt.language}
          numerals={fmt.numerals}
          interestWord={term("interest").toLowerCase()}
          title="Month by month"
          info="Accumulated savings is the plan's starting net worth plus everything saved since. Sanchayapatra held before the plan start only counts if it was included in the starting figure, and DPS is excluded until it matures."
        />
      </Card>
    </>
  );
}
