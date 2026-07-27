import Link from "next/link";
import { LayoutDashboard, Wallet, Coins, PiggyBank, Landmark, TrendingUp, Percent, CreditCard, Bell, ChevronLeft, ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { formatBDT } from "@/lib/currency";
import { accruedInterestToDate, dpsBalanceToDate, nextSpInterestPayment, projectDepositPlan } from "@/lib/deposit-planner";
import { applyDueRecurringTransactions } from "@/lib/recurring";
import { syncProjectedSpDeposits } from "@/lib/sync-sp-deposits";
import { getBudgetProgress } from "@/lib/budgets";
import { CATEGORY_COLORS } from "@/lib/chart-colors";
import { Card } from "@/components/Card";
import { StatTile } from "@/components/StatTile";
import { TrendsChart } from "@/components/TrendsChart";
import { PageHeader } from "@/components/PageHeader";
import { DonutChart } from "@/components/DonutChart";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await requireUserId();
  const now = new Date();
  await applyDueRecurringTransactions(userId);
  await syncProjectedSpDeposits(userId);

  const [accounts, fixedDeposits, dpsPlans, loans, incomeLedger, planConfig, salaryConfigs, milestones, transactions, categories] =
    await Promise.all([
      db.account.findMany({ where: { userId } }),
      db.fixedDeposit.findMany({ where: { userId } }),
      db.dpsPlan.findMany({ where: { userId } }),
      db.loan.findMany({ where: { userId }, include: { payments: true } }),
      db.incomeLedgerEntry.findMany({ where: { userId } }),
      db.depositPlanConfig.findUnique({ where: { userId } }),
      db.salaryConfig.findMany({ where: { userId } }),
      db.milestone.findMany({ where: { userId } }),
      db.transaction.findMany({ where: { userId, deletedAt: null }, orderBy: { date: "asc" } }),
      db.category.findMany({ where: { userId } }),
    ]);

  // Month being viewed: defaults to the real current month. Every stat below is
  // reconstructed as of the END of this month (or "now" if it IS the current month),
  // not just today's live totals — so browsing a past month shows what things
  // actually looked like then.
  const sp = await searchParams;
  const currentMonthKey = monthKey(now);
  const monthKeys = Array.from(new Set([...transactions.map((t) => monthKey(t.date)), currentMonthKey])).sort().reverse();
  const selectedMonth = sp.month && monthKeys.includes(sp.month) ? sp.month : currentMonthKey;
  const isCurrentMonth = selectedMonth === currentMonthKey;
  const [selYear, selMonthNum] = selectedMonth.split("-").map(Number);
  const selectedMonthStart = new Date(Date.UTC(selYear, selMonthNum - 1, 1));
  const selectedMonthEndExclusive = new Date(Date.UTC(selYear, selMonthNum, 1));
  // The cutoff for "as of" reconstruction: real-time precision for the current month,
  // otherwise the instant the selected month ended.
  const cutoff = isCurrentMonth ? now : selectedMonthEndExclusive;

  const idx = monthKeys.indexOf(selectedMonth);
  const olderMonth = idx >= 0 && idx < monthKeys.length - 1 ? monthKeys[idx + 1] : null;
  const newerMonth = idx > 0 ? monthKeys[idx - 1] : null;

  const [budgetProgress, categorySpendThisMonth] = await Promise.all([
    getBudgetProgress(userId, selectedMonthStart),
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, type: "EXPENSE", deletedAt: null, date: { gte: selectedMonthStart, lt: selectedMonthEndExclusive } },
      _sum: { amount: true },
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

  // Reconstruct historical figures "as of" the selected month's cutoff, not just
  // today's live numbers: Account.balance is a running total updated by every
  // transaction as it happens, so to see what it was at an earlier cutoff we undo
  // the effect of every transaction dated at/after that cutoff.
  const liveCashOnHand = accounts.reduce((sum, a) => sum + toNumber(a.balance), 0);
  const futureAccountTx = transactions.filter((t) => t.accountId && t.date >= cutoff);
  const futureAccountNet = futureAccountTx.reduce(
    (sum, t) => sum + (t.type === "INCOME" ? toNumber(t.amount) : -toNumber(t.amount)),
    0,
  );
  const cashOnHand = liveCashOnHand - futureAccountNet;

  const fixedDepositTotal = fixedDeposits.filter((d) => d.openedDate < cutoff).reduce((sum, d) => sum + toNumber(d.principal), 0);
  const dpsBalance = dpsBalanceToDate(dpsPlanInputs, cutoff);
  const loanRemaining = loans
    .filter((l) => l.startDate < cutoff)
    .reduce((sum, l) => {
      const repaid = l.payments.filter((p) => p.date < cutoff).reduce((s, p) => s + toNumber(p.amount), 0);
      return sum + Math.max(toNumber(l.originalAmount) - repaid, 0);
    }, 0);
  const netWorth = cashOnHand + fixedDepositTotal + dpsBalance - loanRemaining;

  const transactionsToDate = transactions.filter((t) => t.date < cutoff);
  const lifetimeIncomeFromLedger = incomeLedger
    .filter((e) => e.date < cutoff)
    .reduce((sum, e) => sum + toNumber(e.amount), 0);
  const lifetimeIncomeFromTransactions = transactionsToDate
    .filter((t) => t.type === "INCOME")
    .reduce((sum, t) => sum + toNumber(t.amount), 0);
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

  const monthlyExpenseTotals = new Map<string, number>();
  for (const t of transactionsToDate) {
    if (t.type !== "EXPENSE") continue;
    const key = `${t.date.getUTCFullYear()}-${t.date.getUTCMonth()}`;
    monthlyExpenseTotals.set(key, (monthlyExpenseTotals.get(key) ?? 0) + toNumber(t.amount));
  }
  const avgMonthlySpend =
    monthlyExpenseTotals.size > 0
      ? Array.from(monthlyExpenseTotals.values()).reduce((a, b) => a + b, 0) / monthlyExpenseTotals.size
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
    ...(nextMilestone ? [{ label: nextMilestone.label, detail: formatBDT(nextMilestone.targetAmount), date: nextMilestone.reachedAt }] : []),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  const overBudget = budgetProgress.filter((b) => b.spent > b.monthlyLimit);

  const trendPoints = Array.from(monthlyExpenseTotals.entries())
    .map(([key, expense]) => {
      const [year, month] = key.split("-").map(Number);
      const income = transactionsToDate
        .filter((t) => t.type === "INCOME" && t.date.getUTCFullYear() === year && t.date.getUTCMonth() === month)
        .reduce((sum, t) => sum + toNumber(t.amount), 0);
      return {
        label: new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        netFlow: income - expense,
        sortKey: year * 12 + month,
      };
    })
    .sort((a, b) => a.sortKey - b.sortKey)
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
      <PageHeader
        icon={<LayoutDashboard size={16} />}
        crumbs={[{ label: "Dashboard" }]}
        description={
          isCurrentMonth
            ? "Your finances at a glance — live, as of today."
            : `Your finances as of the end of ${monthLabel(selectedMonth)} — not today's live numbers.`
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={olderMonth ? `/dashboard?month=${olderMonth}` : "#"}
              aria-disabled={!olderMonth}
              className={`btn-secondary !px-2 ${!olderMonth && "pointer-events-none opacity-30"}`}
            >
              <ChevronLeft size={16} />
            </Link>
            <form action="/dashboard">
              <AutoSubmitSelect
                name="month"
                defaultValue={selectedMonth}
                options={monthKeys.map((key) => ({ value: key, label: monthLabel(key) }))}
              />
            </form>
            <Link
              href={newerMonth ? `/dashboard?month=${newerMonth}` : "#"}
              aria-disabled={!newerMonth}
              className={`btn-secondary !px-2 ${!newerMonth && "pointer-events-none opacity-30"}`}
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
        <Card>
          <StatTile label="Net Worth" value={formatBDT(netWorth)} icon={<Wallet size={18} />} />
        </Card>
        <Card>
          <StatTile label="Cash on Hand" value={formatBDT(cashOnHand)} icon={<Coins size={18} />} />
        </Card>
        <Card>
          <StatTile label="SP" value={formatBDT(fixedDepositTotal)} icon={<PiggyBank size={18} />} />
        </Card>
        <Card>
          <StatTile label="DPS Balance" value={formatBDT(dpsBalance)} icon={<Landmark size={18} />} />
        </Card>
        <Card>
          <StatTile label="Lifetime Income" value={formatBDT(lifetimeIncome)} icon={<TrendingUp size={18} />} />
        </Card>
        <Card>
          <StatTile label="Passive Income to Date" value={formatBDT(passiveIncomeToDate)} icon={<Percent size={18} />} />
        </Card>
        <Card>
          <StatTile label="Avg Monthly Spend" value={formatBDT(avgMonthlySpend)} icon={<CreditCard size={18} />} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Trends — Net Flow (Last 12 Months)">
          <TrendsChart points={trendPoints} />
        </Card>

        <Card title={`Spending by Category (${monthLabel(selectedMonth)})`} className="flex flex-col">
          {categoryBreakdown.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No expenses logged this month yet.
            </p>
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
                      <span style={{ color: "var(--muted)" }}>
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Upcoming" icon={<Bell size={16} />}>
          {reminders.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Nothing due in the near term.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reminders.slice(0, 6).map((r, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{r.label}</span>{" "}
                    <span style={{ color: "var(--muted)" }}>— {r.detail}</span>
                  </div>
                  <span style={{ color: "var(--muted)" }}>
                    {r.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={`Budgets — ${monthLabel(selectedMonth)}`}
          action={
            <Link href="/budgets" className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
              Manage
            </Link>
          }
        >
          {budgetProgress.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No budgets set — <Link href="/budgets" className="text-indigo-600 dark:text-indigo-400">add one</Link>.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {budgetProgress.slice(0, 5).map((b) => {
                const pct = b.monthlyLimit > 0 ? Math.min((b.spent / b.monthlyLimit) * 100, 100) : 0;
                const over = b.spent > b.monthlyLimit;
                return (
                  <div key={b.categoryId}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{b.categoryName}</span>
                      <span className={over ? "text-rose-600 dark:text-rose-400" : ""} style={over ? {} : { color: "var(--muted)" }}>
                        {formatBDT(b.spent)} / {formatBDT(b.monthlyLimit)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-muted)" }}>
                      <div className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-indigo-500"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
              {overBudget.length > 0 && (
                <p className="text-xs text-rose-600 dark:text-rose-400">
                  {overBudget.length} categor{overBudget.length === 1 ? "y is" : "ies are"} over budget this month.
                </p>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
