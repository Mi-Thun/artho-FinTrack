import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { localiseAmountsInText } from "@/lib/i18n";
import { getLocalisation } from "@/lib/preferences";
import { rateToPercent } from "@/lib/rates";
import { Card } from "@/components/Card";
import { InfoHint } from "@/components/InfoHint";
import { Pagination } from "@/components/Pagination";
import { ProjectionTable } from "@/components/ProjectionTable";
import { ProjectionChart } from "@/components/charts/ProjectionChart";
import { RowActions } from "@/components/RowActions";
import { createFixedDeposit } from "../investments/actions";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { loadProjection, PlanNeeded } from "./shared";

export default async function GoalsProjectionPage({
  searchParams,
}: {
  searchParams: Promise<{ plannedPage?: string; plannedPageSize?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt, term } = await getLocalisation(userId);
  const sp = await searchParams;
  const pageOf = (v?: string) => Math.max(1, Number(v) || 1);
  const sizeOf = (v?: string) => ([10, 25, 50, 100].includes(Number(v)) ? Number(v) : 25);
  const plannedPage = pageOf(sp.plannedPage);
  const plannedPageSize = sizeOf(sp.plannedPageSize);
  const plan = await loadProjection(userId);
  if (!plan) {
    return (
      <Card id="projection" title="Monthly projection">
        <PlanNeeded />
      </Card>
    );
  }

  const { projection, startingNetWorth } = plan;
  const plannedDeposits = projection.spDeposits.slice(plan.existingDepositCount);

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
  const lastYear = projection.months[projection.months.length - 1];

  return (
    <>
      <Card
        title="Projected accumulated savings"
        description={
          capReachedAt
            ? `Sanchayapatra target of ${fmt.money(a.investmentCap)} reached ${capReachedAt}.`
            : `Sanchayapatra target of ${fmt.money(a.investmentCap)} isn't reached within the projection.`
        }
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
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t pt-4 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Starts</dt>
            <dd className="font-medium">
              {fmt.monthYear(a.startMonth)} with {fmt.money(startingNetWorth)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Sanchayapatra bought in blocks of</dt>
            <dd className="font-medium tabular-nums">{fmt.money(a.depositUnitSize)}</dd>
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
        {lastYear && (
          <p className="mt-3 text-xs text-muted-foreground">
            By {fmt.monthYear(lastYear.month)}: {fmt.money(lastYear.wealth)} accumulated, {fmt.money(lastYear.totalDeposited)} in Sanchayapatra.
          </p>
        )}
      </Card>

      <Card
        id="projection"
        title="Month by month"
        description="Year-end figures; expand a year for its months, and a month for how it was worked out."
        action={
          <InfoHint label="About accumulated savings">
            Accumulated savings is the plan&apos;s starting net worth plus everything saved since. Sanchayapatra held before the
            plan start only counts if it was included in the starting figure, and DPS is excluded until it matures.
          </InfoHint>
        }
      >
        <ProjectionTable rows={rows} language={fmt.language} numerals={fmt.numerals} interestWord={term("interest").toLowerCase()} />
      </Card>

      {plannedDeposits.length > 0 && (
        <Card
          title="Planned Sanchayapatra deposits"
          description="Expected from your plan assumptions and salary plan. A preview only — these aren't real records yet."
          className="border-2 border-dashed ring-0"
          action={<span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-link">Preview</span>}
        >
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plannedDeposits.slice((plannedPage - 1) * plannedPageSize, plannedPage * plannedPageSize).map((deposit) => (
                <TableRow key={`${deposit.label}-${deposit.openedDate.toISOString()}`}>
                  <TableCell primary>{deposit.label}</TableCell>
                  <TableCell label="Opens" className="text-muted-foreground">{fmt.monthYear(deposit.openedDate)}</TableCell>
                  <TableCell label="Principal" className="text-right font-medium tabular-nums">{fmt.money(deposit.principal)}</TableCell>
                  <TableCell label="Rate" className="text-right text-muted-foreground tabular-nums">
                    {fmt.number(rateToPercent(deposit.rateY3), { maximumFractionDigits: 2 })}%
                  </TableCell>
                  <TableCell actions className="text-right">
                    <RowActions
                      label={`Actions for planned ${deposit.label}`}
                      actions={[
                        {
                          kind: "confirm",
                          label: "Convert to real Sanchayapatra",
                          icon: <FilePlus2 size={14} />,
                          tone: "default",
                          confirmLabel: "Add Sanchayapatra",
                          title: "Record this as a real Sanchayapatra?",
                          description: `Adds a ${fmt.money(deposit.principal)} certificate opened ${fmt.day(deposit.openedDate)} at the plan's rate to Investments. Edit it there afterwards to set the scheme.`,
                          action: createFixedDeposit,
                          fields: {
                            label: deposit.label,
                            principal: String(deposit.principal),
                            openedDate: deposit.openedDate.toISOString().slice(0, 10),
                            scheme: "OTHER",
                            holderType: "SINGLE",
                            rateY1: String(rateToPercent(deposit.rateY1)),
                            rateY2: String(rateToPercent(deposit.rateY2)),
                            rateY3: String(rateToPercent(deposit.rateY3)),
                          },
                          successMessage: "Sanchayapatra recorded in Investments",
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={plannedPage}
            pageSize={plannedPageSize}
            total={plannedDeposits.length}
            basePath="/goals"
            pageParam="plannedPage"
            pageSizeParam="plannedPageSize"
            extraParams={{}}
          />
        </Card>
      )}
    </>
  );
}
