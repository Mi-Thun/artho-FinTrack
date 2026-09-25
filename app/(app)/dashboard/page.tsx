import Link from "next/link";
import { after } from "next/server";
import { Bell } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { localiseAmountsInText } from "@/lib/i18n";
import { accruedInterestToDate, nextSpInterestPayment, projectDepositPlan } from "@/lib/deposit-planner";
import { computeNetWorth } from "@/lib/net-worth";
import { syncUserDataInBackground } from "@/lib/sync";
import { accountTransactionsFrom, monthlyTotals, transactionMonthKeys } from "@/lib/transaction-stats";
import { getBudgetProgress } from "@/lib/budgets";
import { CATEGORY_COLORS } from "@/lib/chart-colors";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { MoneyText } from "@/components/MoneyText";
import { MonthPicker } from "@/components/MonthPicker";
import { TrendsChart } from "@/components/TrendsChart";
import { PageHeader } from "@/components/PageHeader";
import { DonutChart } from "@/components/DonutChart";
import { BUDGET_BAR_CLASS, budgetBarWidth, budgetStatus } from "@/components/BudgetRow";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}


export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const formatBDT = fmt.money;
  const monthLabel = (key: string) => fmt.monthYear(new Date(`${key}-01T00:00:00Z`));
  const now = new Date();

  // Materializing due recurring transactions and regenerating projected SP deposits are
  // writes; doing them inline made every dashboard GET block on them and let a prefetch
  // trigger a mutation. They now run after the response is sent, throttled and
  // self-locking (see lib/sync.ts). Mutations that need the result immediately call
  // syncUserDataNow themselves, so nothing here waits on maintenance.
  after(() => syncUserDataInBackground(userId));

  const [accounts, fixedDeposits, dpsPlans, loans, incomeLedger, planConfig, salaryConfigs, milestones, categories, txMonthKeys] =
    await Promise.all([
      db.account.findMany({ where: { userId } }),
      db.fixedDeposit.findMany({ where: { userId } }),
      db.dpsPlan.findMany({ where: { userId } }),
      db.loan.findMany({ where: { userId }, include: { payments: true } }),
      db.incomeLedgerEntry.findMany({ where: { userId } }),
      db.depositPlanConfig.findUnique({ where: { userId } }),
      db.salaryConfig.findMany({ where: { userId } }),
      db.milestone.findMany({ where: { userId } }),
      db.category.findMany({ where: { userId } }),
      transactionMonthKeys(userId),
    ]);

  // Month being viewed: defaults to the real current month. Every stat below is
  // reconstructed as of the END of this month (or "now" if it IS the current month),
  // not just today's live totals — so browsing a past month shows what things
  // actually looked like then.
  const sp = await searchParams;
  const currentMonthKey = monthKey(now);
  const monthKeys = Array.from(new Set([...txMonthKeys, currentMonthKey])).sort().reverse();
  const selectedMonth = sp.month && monthKeys.includes(sp.month) ? sp.month : currentMonthKey;
  const isCurrentMonth = selectedMonth === currentMonthKey;
  // Figures reconstructed as of the selected month carry its name; lifetime ones say so.
  const monthChip = isCurrentMonth ? "Now" : monthLabel(selectedMonth);
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const selectedMonthStart = new Date(Date.UTC(selYear, selMonthNum - 1, 1));
  const selectedMonthEndExclusive = new Date(Date.UTC(selYear, selMonthNum, 1));
  // The cutoff for "as of" reconstruction: real-time precision for the current month,
  // otherwise the instant the selected month ended.
  const cutoff = isCurrentMonth ? now : selectedMonthEndExclusive;


  // Rolled up in Postgres rather than by pulling every transaction into memory — see
  // lib/transaction-stats.ts. `monthTotals` is one row per month and doubles as the
  // source for lifetime income, the trend series, and the average-spend figure.
  const [budgetProgress, categorySpendThisMonth, monthTotals, futureAccountTransactions] = await Promise.all([
    getBudgetProgress(userId, selectedMonthStart),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "EXPENSE", deletedAt: null, date: { gte: selectedMonthStart, lt: selectedMonthEndExclusive } },
      _sum: { amount: true },
    }),
    monthlyTotals(userId, cutoff),
    accountTransactionsFrom(userId, cutoff),
  ]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const dpsPlanInputs = dpsPlans.map((p) => ({
    label: p.label,
    monthlyDeposit: toNumber(p.monthlyDeposit),
    startMonth: p.startMonth,
    tenureMonths: p.tenureMonths,
    interestRate: toNumber(p.interestRate),
    profitTaxAtSource: toNumber(p.profitTaxAtSource),
  }));

  // Reconstruct historical figures "as of" the selected month's cutoff, not just
  // today's live numbers — see computeNetWorth for how the cutoff reconstruction works.
  const { cashOnHand, fixedDepositTotal, dpsBalance } = computeNetWorth({
    accounts,
    transactions: futureAccountTransactions,
    fixedDeposits,
    dpsPlanInputs,
    loans,
    cutoff,
  });

  const lifetimeIncomeFromLedger = incomeLedger
    .filter((e) => e.date < cutoff)
    .reduce((sum, e) => sum + toNumber(e.amount), 0);
  const lifetimeIncomeFromTransactions = monthTotals.reduce((sum, m) => sum + m.income, 0);
  // The income ledger and income transactions are alternate ways of tracking the same
  // money (a lifetime deposit log vs. day-to-day entries) — summing both double-counts,
  // so prefer the ledger (the more complete lifetime record) when it has entries.
  const lifetimeIncome = lifetimeIncomeFromLedger > 0 ? lifetimeIncomeFromLedger : lifetimeIncomeFromTransactions;

  const passiveIncomeToDate = accruedInterestToDate(
    fixedDeposits.map((d) => ({
      label: d.label,
      principal: toNumber(d.principal),
      openedDate: d.openedDate,
      rateY1: toNumber(d.rateY1),
      rateY2: toNumber(d.rateY2),
      rateY3: toNumber(d.rateY3),
      termMonths: d.termMonths,
    })),
    cutoff,
  );

  // Months with no activity at all don't appear in monthTotals, so the average is over
  // months the user actually transacted in — same as before.
  const monthsWithActivity = monthTotals.filter((m) => m.expense > 0);
  const avgMonthlySpend =
    monthsWithActivity.length > 0
      ? monthsWithActivity.reduce((sum, m) => sum + m.expense, 0) / monthsWithActivity.length
      : 0;

  let nextMilestone: { label: string; targetAmount: number; reachedAt: Date } | null = null;
  if (planConfig) {
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
        taxRebate: toNumber(s.taxRebate),
        annualTax: toNumber(s.annualTax),
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
      })),
      milestones.map((m) => ({ targetAmount: toNumber(m.targetAmount), label: m.label })),
      240,
      dpsPlanInputs,
    );
    const upcoming = projection.milestones
      .filter((m): m is typeof m & { reachedAt: Date } => m.reachedAt !== null && m.reachedAt > now)
      .sort((a, b) => a.reachedAt.getTime() - b.reachedAt.getTime());
    if (upcoming[0]) nextMilestone = upcoming[0];
  }

  // Reminders: next SP interest payments, DPS plans nearing maturity, next milestone.
  const upcomingSpInterest = fixedDeposits
    .map((d) =>
      nextSpInterestPayment(
        {
          label: d.label,
          principal: toNumber(d.principal),
          openedDate: d.openedDate,
          rateY1: toNumber(d.rateY1),
          rateY2: toNumber(d.rateY2),
          rateY3: toNumber(d.rateY3),
          termMonths: d.termMonths,
        },
        now,
      ),
    )
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 3);

  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const maturingDpsPlans = dpsPlans
    .map((p) => ({
      label: p.label,
      maturityDate: new Date(Date.UTC(p.startMonth.getUTCFullYear(), p.startMonth.getUTCMonth() + p.tenureMonths, p.startMonth.getUTCDate())),
    }))
    .filter((p) => p.maturityDate >= now && p.maturityDate <= ninetyDaysFromNow)
    .sort((a, b) => a.maturityDate.getTime() - b.maturityDate.getTime());

  const reminders = [
    ...upcomingSpInterest.map((r) => ({
      label: "SP interest payment",
      detail: formatBDT(r.amount),
      date: r.date,
    })),
    ...maturingDpsPlans.map((p) => ({
      label: `${p.label} matures`,
      detail: "DPS plan complete",
      date: p.maturityDate,
    })),
    ...(nextMilestone
      ? [
          {
            label: localiseAmountsInText(nextMilestone.label, formatBDT),
            detail: `accumulated savings reach ${formatBDT(nextMilestone.targetAmount)}`,
            date: nextMilestone.reachedAt,
          },
        ]
      : []),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const overBudget = budgetProgress.filter((b) => b.spent > b.monthlyLimit);

  // monthTotals already comes back oldest-first, one row per month.
  const trendPoints = monthTotals
    .map((m) => {
      const [year, month] = m.monthKey.split("-").map(Number);
      return {
        label: new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        netFlow: m.income - m.expense,
      };
    })
    .slice(-12);

  const categoryBreakdown = categorySpendThisMonth
    .map((row, i) => ({
      name: categoryNameById.get(row.categoryId ?? "") ?? "Uncategorized",
      amount: Number(row._sum.amount ?? 0),
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
  const categoryBreakdownTotal = categoryBreakdown.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description={`Where your money stands${isCurrentMonth ? " today" : ` at the end of ${monthLabel(selectedMonth)}`}.`}>
        <MonthPicker months={monthKeys} selected={selectedMonth} basePath="/dashboard" labelFor={monthLabel} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Cash on hand" chip={monthChip} value={<MoneyText value={cashOnHand} money={formatBDT} />} />
        <StatCard label="Sanchayapatra (SP)" chip={monthChip} value={<MoneyText value={fixedDepositTotal} money={formatBDT} />} />
        <StatCard
          label="DPS balance"
          chip={monthChip}
          value={<MoneyText value={dpsBalance} money={formatBDT} />}
          hint="Installments paid plus interest accrued so far. It stays locked until the plan matures."
        />
        <StatCard label="Lifetime income" chip="Lifetime" value={<MoneyText value={lifetimeIncome} money={formatBDT} />} />
        <StatCard
          label="Passive income to date"
          chip="Lifetime"
          value={<MoneyText value={passiveIncomeToDate} money={formatBDT} />}
          hint="Profit accrued on your SP certificates, after source tax."
        />
        <StatCard
          label="Avg monthly spend"
          chip="All months"
          value={<MoneyText value={avgMonthlySpend} money={formatBDT} />}
          hint="Average over months that had at least one expense."
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Upcoming" icon={<Bell size={16} />}>
          {reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due in the near term.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reminders.slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{r.label}</span>{" "}
                    <span className="text-muted-foreground">— {r.detail}</span>
                  </div>
                  <span className="shrink-0 text-muted-foreground tabular-nums">{fmt.day(r.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={`Budgets — ${monthLabel(selectedMonth)}`}
          action={
            <Link href="/budgets" className="text-sm font-medium text-link hover:underline">
              Manage budgets
            </Link>
          }
        >
          {budgetProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No budgets set — <Link href="/budgets" className="font-medium text-link hover:underline">add one</Link>.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {budgetProgress.slice(0, 5).map((b) => {
                const status = budgetStatus(b.spent, b.monthlyLimit);
                const pct = budgetBarWidth(b.spent, b.monthlyLimit);
                const over = status === "over";
                return (
                  <div key={b.categoryId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{b.categoryName}</span>
                      <span className={`tabular-nums ${over ? "font-medium text-[var(--status-danger)]" : "text-muted-foreground"}`}>
                        {formatBDT(b.spent)} / {formatBDT(b.monthlyLimit)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${BUDGET_BAR_CLASS[status]}`} style={{ width: `${pct}%` }} />
                    </div>
                    {over && (
                      <p className="mt-1 text-xs text-[var(--status-danger)]">Over by {formatBDT(b.spent - b.monthlyLimit)}</p>
                    )}
                  </div>
                );
              })}
              {overBudget.length > 0 && (
                <p className="text-xs text-destructive">
                  {overBudget.length} categor{overBudget.length === 1 ? "y is" : "ies are"} over budget this month.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Net flow" description="Income minus expenses, last 12 months.">
          <TrendsChart points={trendPoints} language={fmt.language} numerals={fmt.numerals} />
        </Card>

        <Card title="Spending by category" description={monthLabel(selectedMonth)} className="flex flex-col">
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No expenses logged this month yet.</p>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-8 sm:flex-row">
              <DonutChart
                segments={categoryBreakdown.map((c) => ({ label: c.name, value: c.amount, color: c.color }))}
                centerLabel={formatBDT(categoryBreakdownTotal)}
                size={220}
              />
              <div className="flex w-full max-w-xs flex-col gap-4 sm:w-auto sm:min-w-[16rem]">
                {categoryBreakdown.map((c) => {
                  const pct = categoryBreakdownTotal > 0 ? (c.amount / categoryBreakdownTotal) * 100 : 0;
                  return (
                    <div key={c.name} className="flex items-center justify-between gap-6 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
                        {c.name}
                      </span>
                      <span className="text-muted-foreground">
                        {formatBDT(c.amount)} · {pct.toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
