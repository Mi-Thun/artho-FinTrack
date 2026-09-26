import Link from "next/link";
import { after } from "next/server";
import { Bell } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { localiseAmountsInText } from "@/lib/i18n";
import { accruedInterestToDate, dpsBalanceToDate, nextSpInterestPayment, projectDepositPlan } from "@/lib/deposit-planner";
import { computeNetWorth } from "@/lib/net-worth";
import { syncUserDataInBackground } from "@/lib/sync";
import { monthlyTotals, transactionMonthKeys } from "@/lib/transaction-stats";
import { getBudgetProgress } from "@/lib/budgets";
import { lendingTotals } from "@/lib/personal-loans";
import { Card } from "@/components/Card";
import { StatCard } from "@/components/StatCard";
import { Breakdown, type BreakdownRow } from "@/components/Breakdown";
import { MoneyText } from "@/components/MoneyText";
import { MonthPicker } from "@/components/MonthPicker";
import { FlowChart, type FlowPoint } from "@/components/charts/FlowChart";
import { CategoryDonut } from "@/components/charts/CategoryDonut";
import { PageHeader } from "@/components/PageHeader";
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
  const { fmt, term } = await getLocalisation(userId);
  const formatBDT = fmt.money;
  const monthLabel = (key: string) => fmt.monthYear(new Date(`${key}-01T00:00:00Z`));
  const now = new Date();

  // Materializing due recurring transactions and regenerating projected SP deposits are
  // writes; doing them inline made every dashboard GET block on them and let a prefetch
  // trigger a mutation. They now run after the response is sent, throttled and
  // self-locking (see lib/sync.ts). Mutations that need the result immediately call
  // syncUserDataNow themselves, so nothing here waits on maintenance.
  after(() => syncUserDataInBackground(userId));

  const [accounts, fixedDeposits, dpsPlans, loans, planConfig, salaryConfigs, milestones, categories, txMonthKeys, personalLoans] =
    await Promise.all([
      db.account.findMany({ where: { userId }, select: { name: true, balance: true }, orderBy: { name: "asc" } }),
      db.fixedDeposit.findMany({ where: { userId } }),
      db.dpsPlan.findMany({ where: { userId } }),
      db.loan.findMany({ where: { userId }, include: { payments: true } }),
      db.depositPlanConfig.findUnique({ where: { userId } }),
      db.salaryConfig.findMany({ where: { userId } }),
      db.milestone.findMany({ where: { userId } }),
      db.category.findMany({ where: { userId } }),
      transactionMonthKeys(userId),
      db.personalLoan.findMany({ where: { userId }, include: { payments: true } }),
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
  const [budgetProgress, categorySpendThisMonth, monthTotals, recentTransactions, incomeByCategoryThisMonth, lifetimeIncomeByCategory] = await Promise.all([
    getBudgetProgress(userId, selectedMonthStart),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "EXPENSE", deletedAt: null, date: { gte: selectedMonthStart, lt: selectedMonthEndExclusive } },
      _sum: { amount: true },
    }),
    monthlyTotals(userId, cutoff),
    db.transaction.findMany({
      where: { userId, deletedAt: null, date: { lt: cutoff } },
      include: { category: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 5,
    }),
    // For the ⓘ breakdowns: this month's and lifetime income by category.
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "INCOME", deletedAt: null, date: { gte: selectedMonthStart, lt: selectedMonthEndExclusive } },
      _sum: { amount: true },
    }),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "INCOME", deletedAt: null, date: { lt: cutoff } },
      _sum: { amount: true },
      _count: true,
    }),
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

  // Figures "as of" the selected month's cutoff, not just today's. Cash is the balances
  // entered on the Accounts page, as they stand (see computeNetWorth).
  const { cashOnHand, fixedDepositTotal, dpsBalance, loanRemaining, netWorth } = computeNetWorth({
    accounts,
    fixedDeposits,
    dpsPlanInputs,
    loans,
    cutoff,
  });
  const previous = computeNetWorth({
    accounts,
    fixedDeposits,
    dpsPlanInputs,
    loans,
    cutoff: selectedMonthStart,
  });

  // Headline net worth = cash + SP + DPS − bank loans (computeNetWorth) + what people owe
  // you − what you owe them (Lending). Both parts are existing figures; this only adds
  // them. Lending records are counted only if they existed by the cutoff.
  const lendingTotalsAsOf = (asOf: Date) =>
    lendingTotals(
      personalLoans
        .filter((l) => l.date < asOf)
        .map((l) => ({
          id: l.id,
          counterparty: l.counterparty,
          direction: l.direction,
          principal: l.principal,
          date: l.date,
          dueDate: l.dueDate,
          settledAt: l.settledAt && l.settledAt < asOf ? l.settledAt : null,
          payments: l.payments.filter((p) => p.date < asOf),
        })),
      asOf,
    );
  const lendingAsOf = (asOf: Date) => lendingTotalsAsOf(asOf).netPosition;
  const lendingNow = lendingTotalsAsOf(cutoff);
  const netLending = lendingNow.netPosition;
  const headlineNetWorth = netWorth + netLending;
  const previousNetWorth = previous.netWorth + lendingAsOf(selectedMonthStart);
  const netWorthChange = headlineNetWorth - previousNetWorth;

  // Income is recorded once, as income transactions (the Income ledger is a view of them).
  const lifetimeIncome = monthTotals.reduce((sum, m) => sum + m.income, 0);

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

  // Average monthly spend, worked out from what's left rather than from logged expenses:
  // everything earned minus everything still owned is what was spent, spread over every
  // month since the first income (monthTotals is oldest first). Both ends move on their
  // own — the first income month from the data, the last is the selected month.
  const firstIncomeMonth = monthTotals.find((m) => m.income > 0)?.monthKey ?? null;
  const spendMonths = firstIncomeMonth
    ? selYear * 12 + selMonthNum - (Number(firstIncomeMonth.slice(0, 4)) * 12 + Number(firstIncomeMonth.slice(5, 7))) + 1
    : 0;
  const spentSinceFirstIncome = lifetimeIncome - headlineNetWorth;
  // Net worth above lifetime income (e.g. savings from before the first income) would
  // make it negative, which isn't a spend.
  const avgMonthlySpend = spendMonths > 0 ? Math.max(0, spentSinceFirstIncome / spendMonths) : 0;

  // ── ⓘ breakdowns: the parts behind each figure, with their actual amounts. ──
  const byAmount = (rows: { name: string; amount: number }[]) => rows.filter((r) => r.amount !== 0).sort((a, b) => b.amount - a.amount);
  const categoryRows = (groups: { categoryId: string | null; _sum: { amount: unknown } }[]): BreakdownRow[] =>
    byAmount(groups.map((g) => ({ name: categoryNameById.get(g.categoryId ?? "") ?? "Uncategorised", amount: toNumber(g._sum.amount) }))).map((r) => ({
      label: r.name,
      value: formatBDT(r.amount),
    }));
  const heldSp = fixedDeposits.filter((d) => d.openedDate < cutoff && (d.encashedAt == null || d.encashedAt >= cutoff));
  const spRows: BreakdownRow[] = heldSp.map((d) => ({ label: d.label, value: formatBDT(toNumber(d.principal)), sub: true }));
  const dpsRows: BreakdownRow[] = dpsPlanInputs
    .map((p) => ({ label: p.label, value: formatBDT(dpsBalanceToDate([p], cutoff)), sub: true }))
    .filter((r) => r.value !== formatBDT(0));
  const accountRows: BreakdownRow[] = accounts.map((a) => ({ label: a.name, value: fmt.moneyExact(toNumber(a.balance)) }));
  const passiveRows: BreakdownRow[] = fixedDeposits
    .map((d) => ({
      label: d.label,
      amount: accruedInterestToDate(
        [{ label: d.label, principal: toNumber(d.principal), openedDate: d.openedDate, rateY1: toNumber(d.rateY1), rateY2: toNumber(d.rateY2), rateY3: toNumber(d.rateY3), termMonths: d.termMonths }],
        cutoff,
      ),
    }))
    .filter((r) => r.amount > 0)
    .map((r) => ({ label: r.label, value: formatBDT(r.amount) }));

  let milestoneList: { label: string; targetAmount: number; reachedAt: Date }[] = [];
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
    milestoneList = upcoming.slice(0, 3);
  }

  // Reminders: next SP interest payments, DPS plans nearing maturity, next milestone.
  const upcomingSpInterest = fixedDeposits
    .filter((d) => !d.encashedAt)
    .map((d) => ({
      label: d.label,
      ...nextSpInterestPayment(
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
    }))
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

  const firstDpsStart = dpsPlans.length
    ? dpsPlans.map((p) => p.startMonth).sort((a, b) => a.getTime() - b.getTime())[0]
    : null;

  const thisMonth = monthTotals.find((m) => m.monthKey === selectedMonth);
  const monthIncome = thisMonth?.income ?? 0;
  const monthExpense = thisMonth?.expense ?? 0;
  const savingsRate = monthIncome > 0 ? ((monthIncome - monthExpense) / monthIncome) * 100 : null;

  // Twelve months ending at the selected one, including months with no transactions —
  // a gap in the data is shown as a gap, not silently dropped.
  const totalsByMonth = new Map(monthTotals.map((m) => [m.monthKey, m]));
  const flowPoints: FlowPoint[] = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(Date.UTC(selYear, selMonthNum - 12 + k, 1));
    const key = monthKey(d);
    const m = totalsByMonth.get(key);
    return {
      label: fmt.monthShort(d),
      fullLabel: fmt.monthYear(d),
      income: m?.income ?? 0,
      expense: m?.expense ?? 0,
      hasData: m != null,
    };
  });

  const categoryBreakdown = categorySpendThisMonth.map((row) => ({
    name: categoryNameById.get(row.categoryId ?? "") ?? "Uncategorised",
    amount: Number(row._sum.amount ?? 0),
  }));

  const payouts = [
    ...upcomingSpInterest.map((r) => ({ label: `SP profit · ${r.label}`, amount: r.amount, date: r.date })),
    ...maturingDpsPlans.map((p) => ({ label: `${p.label} matures`, amount: null as number | null, date: p.maturityDate })),
  ]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 4);

  const overBudget = budgetProgress.filter((b) => b.spent > b.monthlyLimit);
  const changeLabel = `${netWorthChange >= 0 ? "+" : "−"}${formatBDT(Math.abs(netWorthChange))} since ${fmt.monthYear(new Date(Date.UTC(selYear, selMonthNum - 2, 1)))}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard">
        <MonthPicker months={monthKeys} selected={selectedMonth} basePath="/dashboard" labelFor={monthLabel} />
      </PageHeader>

      {/* Hero: net worth first, then this month's flow as a compact three-up row. */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          size="hero"
          label="Net worth"
          chip={monthChip}
          value={<MoneyText value={headlineNetWorth} money={formatBDT} />}
          delta={{ value: netWorthChange, label: changeLabel, good: "up" }}
          hint={
            <Breakdown
              title="How net worth adds up"
              rows={[
                { label: "Cash in accounts", value: formatBDT(cashOnHand), sign: "+" },
                { label: "Sanchayapatra (SP)", value: formatBDT(fixedDepositTotal), sign: "+" },
                { label: "DPS balance", value: formatBDT(dpsBalance), sign: "+" },
                { label: "People owe you", value: formatBDT(lendingNow.totalOwedToYou), sign: "+" },
                { label: "You owe people", value: formatBDT(lendingNow.totalOwedByYou), sign: "−" },
                { label: "Bank loans left", value: formatBDT(loanRemaining), sign: "−" },
              ]}
              total={{ label: "Net worth", value: formatBDT(headlineNetWorth) }}
              note={`${changeLabel}: it was ${formatBDT(previousNetWorth)} at the start of ${monthLabel(selectedMonth)}.`}
            />
          }
        />
        <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:col-span-3">
          <StatCard
            size="compact"
            label="Income"
            chip={monthLabel(selectedMonth)}
            value={<MoneyText value={monthIncome} money={formatBDT} />}
            hint={
              <Breakdown
                title={`Income in ${monthLabel(selectedMonth)}, by category`}
                rows={categoryRows(incomeByCategoryThisMonth)}
                total={{ label: "Total income", value: formatBDT(monthIncome) }}
                empty="No income this month."
                note="By the date it was received."
              />
            }
          />
          <StatCard
            size="compact"
            label="Spending"
            chip={monthLabel(selectedMonth)}
            value={<MoneyText value={monthExpense} money={formatBDT} />}
            hint={
              <Breakdown
                title={`Spending in ${monthLabel(selectedMonth)}, by category`}
                rows={categoryRows(categorySpendThisMonth)}
                total={{ label: "Total spending", value: formatBDT(monthExpense) }}
                empty="No spending this month."
              />
            }
          />
          <StatCard
            size="compact"
            label="Savings rate"
            chip={monthLabel(selectedMonth)}
            value={savingsRate == null ? <span className="text-base text-muted-foreground">No income yet</span> : `${fmt.number(savingsRate, { maximumFractionDigits: 0 })}%`}
            tone={savingsRate == null ? "neutral" : savingsRate >= 0 ? "positive" : "negative"}
            hint={
              <Breakdown
                title={`Savings rate, ${monthLabel(selectedMonth)}`}
                rows={[
                  { label: "Income", value: formatBDT(monthIncome) },
                  { label: "Spending", value: formatBDT(monthExpense), sign: "−" },
                  { label: "Saved", value: formatBDT(monthIncome - monthExpense) },
                ]}
                total={{
                  label: "Saved ÷ income",
                  value: savingsRate == null ? "—" : `${fmt.number(savingsRate, { maximumFractionDigits: 1 })}%`,
                }}
                note={savingsRate == null ? "No income this month, so there's no rate." : undefined}
              />
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Cash on hand"
          chip="Now"
          value={<MoneyText value={cashOnHand} money={formatBDT} />}
          hint={
            <Breakdown
              title="Cash on hand, by account"
              rows={accountRows}
              total={{ label: "Total", value: fmt.moneyExact(cashOnHand) }}
              empty="No accounts yet — add them on the Accounts page."
              note="The balances you last entered on the Accounts page."
            />
          }
        />
        <StatCard
          label="Investments"
          chip={monthChip}
          value={<MoneyText value={fixedDepositTotal + dpsBalance} money={formatBDT} />}
          hint={
            <Breakdown
              title="Investments"
              rows={[
                { label: "Sanchayapatra (SP)", value: formatBDT(fixedDepositTotal) },
                ...spRows,
                { label: "DPS balance", value: formatBDT(dpsBalance), sign: "+" },
                ...dpsRows,
              ]}
              total={{ label: "Total", value: formatBDT(fixedDepositTotal + dpsBalance) }}
              note="SP at the amount invested (certificates held, not encashed); DPS with profit earned so far, after tax."
            />
          }
        >
          {dpsBalance === 0 && firstDpsStart && firstDpsStart > cutoff && (
            <span className="text-xs text-muted-foreground">DPS starts {fmt.monthYear(firstDpsStart)}</span>
          )}
        </StatCard>
        <StatCard
          label={`${term("passiveIncome")} to date`}
          chip="Lifetime"
          value={<MoneyText value={passiveIncomeToDate} money={formatBDT} />}
          hint={
            <Breakdown
              title="SP profit so far, by certificate"
              rows={passiveRows}
              total={{ label: "Total", value: formatBDT(passiveIncomeToDate) }}
              empty="No SP profit paid yet."
              note="Profit paid on each certificate since it opened, after source tax."
            />
          }
        />
        <StatCard
          label="Net lending"
          chip={monthChip}
          value={<MoneyText value={netLending} money={formatBDT} tone="auto" />}
          hint={
            <Breakdown
              title="Net lending"
              rows={[
                { label: "People owe you", value: formatBDT(lendingNow.totalOwedToYou) },
                { label: "You owe people", value: formatBDT(lendingNow.totalOwedByYou), sign: "−" },
              ]}
              total={{ label: "Net", value: formatBDT(netLending) }}
              note={`${fmt.number(lendingNow.openCount)} open record${lendingNow.openCount === 1 ? "" : "s"} on the Lending page.`}
            />
          }
        />
        <StatCard
          label="Lifetime income"
          chip="Lifetime"
          value={<MoneyText value={lifetimeIncome} money={formatBDT} />}
          hint={
            <Breakdown
              title="Lifetime income, by category"
              rows={categoryRows(lifetimeIncomeByCategory)}
              total={{ label: "Total", value: formatBDT(lifetimeIncome) }}
              empty="No income recorded yet."
              note={`${fmt.number(lifetimeIncomeByCategory.reduce((n, g) => n + g._count, 0))} income transactions up to ${monthLabel(selectedMonth)}.`}
            />
          }
        />
        <StatCard
          label="Avg monthly spend"
          chip={firstIncomeMonth ? `Since ${monthLabel(firstIncomeMonth)}` : "All months"}
          value={<MoneyText value={avgMonthlySpend} money={formatBDT} />}
          hint={
            <Breakdown
              title="Average monthly spend"
              rows={[
                { label: "Lifetime income", value: formatBDT(lifetimeIncome) },
                { label: "Net worth", value: formatBDT(headlineNetWorth), sign: "−" },
                { label: "Spent", value: formatBDT(spentSinceFirstIncome) },
                {
                  label: firstIncomeMonth ? `Months, ${monthLabel(firstIncomeMonth)} – ${monthLabel(selectedMonth)}` : "Months",
                  value: fmt.number(spendMonths),
                  sign: "÷",
                },
              ]}
              total={{ label: "Average", value: formatBDT(avgMonthlySpend) }}
              empty="No income recorded yet."
              note="Whatever you earned and no longer have counts as spent. The months run from your first income to this month and update themselves."
            />
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Net flow" description="Income and spending per month; the line is what was left over.">
          <FlowChart points={flowPoints} language={fmt.language} numerals={fmt.numerals} />
        </Card>

        <Card title="Spending by category" description={monthLabel(selectedMonth)}>
          <CategoryDonut categories={categoryBreakdown} language={fmt.language} numerals={fmt.numerals} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Upcoming" icon={<Bell size={16} />}>
          {payouts.length === 0 && milestoneList.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing due in the near term.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {payouts.length > 0 && (
                <section aria-label="Payouts">
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">Payouts</h3>
                  <ul className="flex flex-col gap-2.5">
                    {payouts.map((r, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{r.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmt.relative(r.date, now)} · {fmt.day(r.date)}
                          </p>
                        </div>
                        {r.amount != null && <MoneyText value={r.amount} money={formatBDT} tone="income" className="text-sm font-medium" />}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {milestoneList.length > 0 && (
                <section aria-label="Milestones">
                  <h3 className="mb-2 text-xs font-medium text-muted-foreground">Milestones</h3>
                  <ul className="flex flex-col gap-2.5">
                    {milestoneList.map((m) => (
                      <li key={m.label + m.targetAmount} className="text-sm">
                        <p className="font-medium">{localiseAmountsInText(m.label, formatBDT)}</p>
                        <p className="text-xs text-muted-foreground">
                          Projected {fmt.relative(m.reachedAt, now)} · {fmt.monthYear(m.reachedAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </Card>

        <Card
          title={`Budgets — ${monthLabel(selectedMonth)}`}
          action={
            <Link href="/budgets" className="text-sm font-medium text-link hover:underline">
              Manage
            </Link>
          }
        >
          {budgetProgress.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No limits set — <Link href="/budgets" className="font-medium text-link hover:underline">set one</Link>.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {budgetProgress.slice(0, 5).map((b) => {
                const status = budgetStatus(b.spent, b.monthlyLimit);
                const pct = budgetBarWidth(b.spent, b.monthlyLimit);
                const over = status === "over";
                return (
                  <div key={b.categoryId}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{b.categoryName}</span>
                      <span className={`shrink-0 text-xs tabular-nums ${over ? "font-medium text-danger" : status === "near" ? "text-warning" : "text-muted-foreground"}`}>
                        {over ? `${formatBDT(b.spent - b.monthlyLimit)} over` : `${formatBDT(b.monthlyLimit - b.spent)} left`}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full rounded-full ${BUDGET_BAR_CLASS[status]}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {overBudget.length > 0 && (
                <p className="text-xs text-danger">
                  {fmt.number(overBudget.length)} categor{overBudget.length === 1 ? "y is" : "ies are"} over budget.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Recent transactions"
          action={
            <Link href="/transactions" className="text-sm font-medium text-link hover:underline">
              View all
            </Link>
          }
        >
          {recentTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {recentTransactions.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.category?.name ?? t.note ?? "Uncategorised"}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmt.day(t.date)}
                    </p>
                  </div>
                  <MoneyText
                    value={toNumber(t.amount)}
                    money={formatBDT}
                    tone={t.type === "INCOME" ? "income" : "expense"}
                    className="shrink-0 font-medium"
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
