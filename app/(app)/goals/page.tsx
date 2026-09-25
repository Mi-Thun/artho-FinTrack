import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { rateToPercent } from "@/lib/rates";
import { Card } from "@/components/Card";
import { InfoHint } from "@/components/InfoHint";
import { Pagination } from "@/components/Pagination";
import { ProjectionTable } from "@/components/ProjectionTable";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { loadProjection, PlanNeeded } from "./shared";

export default async function GoalsProjectionPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; plannedPage?: string; plannedPageSize?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const sp = await searchParams;
  const pageOf = (v?: string) => Math.max(1, Number(v) || 1);
  const sizeOf = (v?: string) => ([10, 25, 50, 100].includes(Number(v)) ? Number(v) : 25);
  const page = pageOf(sp.page);
  const pageSize = sizeOf(sp.pageSize);
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
      tax: m.tax,
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

  return (
    <>
      <Card
        id="projection"
        title="Monthly projection"
        description={capReachedAt ? `SP target reached ${capReachedAt}.` : "SP target not reached within the projection."}
        action={
          <InfoHint label="About accumulated savings">
            Accumulated savings is the plan&apos;s starting net worth plus everything saved since. SP held before the
            plan start only counts if it was included in the starting figure, and DPS is excluded until it matures.
            Click ⓘ on any cell for the month&apos;s breakdown.
          </InfoHint>
        }
      >
        <ProjectionTable rows={rows.slice((page - 1) * pageSize, page * pageSize)} language={fmt.language} numerals={fmt.numerals} />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={rows.length}
          basePath="/goals"
          extraParams={{ plannedPage: String(plannedPage), plannedPageSize: String(plannedPageSize) }}
        />
      </Card>

      {plannedDeposits.length > 0 && (
        <Card
          title="Planned SP deposits"
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
                <TableHead className="text-right">Rates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plannedDeposits.slice((plannedPage - 1) * plannedPageSize, plannedPage * plannedPageSize).map((deposit) => (
                <TableRow key={`${deposit.label}-${deposit.openedDate.toISOString()}`}>
                  <TableCell primary>{deposit.label}</TableCell>
                  <TableCell label="Opens" className="text-muted-foreground">{fmt.monthYear(deposit.openedDate)}</TableCell>
                  <TableCell label="Principal" className="text-right font-medium tabular-nums">{fmt.money(deposit.principal)}</TableCell>
                  <TableCell label="Rates" className="text-right text-muted-foreground tabular-nums">
                    {fmt.number(rateToPercent(deposit.rateY1), { maximumFractionDigits: 2 })}% / {fmt.number(rateToPercent(deposit.rateY2), { maximumFractionDigits: 2 })}% / {fmt.number(rateToPercent(deposit.rateY3), { maximumFractionDigits: 2 })}%
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
            extraParams={{ page: String(page), pageSize: String(pageSize) }}
          />
        </Card>
      )}
    </>
  );
}
