import { db } from "@/lib/db";

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function dueDateFor(year: number, monthIndex: number, dayOfMonth: number): Date {
  const clampedDay = Math.min(dayOfMonth, daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, clampedDay));
}

function addMonthsUTC(date: Date, months: number): { year: number; monthIndex: number } {
  const total = date.getUTCFullYear() * 12 + date.getUTCMonth() + months;
  return { year: Math.floor(total / 12), monthIndex: total % 12 };
}

/**
 * Generates any Transaction rows a user's active recurring plans are due for, up to
 * today. Called lazily on page load (Transactions/Dashboard) instead of a background
 * cron, since this app has no job runner — each plan just "catches up" whenever the
 * user is next active, generating one row per elapsed month (capped to avoid a
 * runaway backlog if a plan was left dormant for years).
 */
export async function applyDueRecurringTransactions(userId: string): Promise<void> {
  const now = new Date();
  const plans = await db.recurringTransaction.findMany({ where: { userId, active: true } });
  if (plans.length === 0) return;

  // One query for the latest transaction per plan, instead of a round-trip per plan.
  const lastTxByPlan = await db.transaction.findMany({
    where: { recurringId: { in: plans.map((p) => p.id) } },
    orderBy: { date: "desc" },
    distinct: ["recurringId"],
  });
  const lastDateByPlanId = new Map(lastTxByPlan.map((t) => [t.recurringId as string, t.date]));

  for (const plan of plans) {
    const last = lastDateByPlanId.get(plan.id);

    let year: number;
    let monthIndex: number;
    if (last) {
      const next = addMonthsUTC(last, 1);
      year = next.year;
      monthIndex = next.monthIndex;
    } else {
      year = plan.createdAt.getUTCFullYear();
      monthIndex = plan.createdAt.getUTCMonth();
    }

    const due: Date[] = [];
    for (let i = 0; i < 24; i++) {
      const candidate = dueDateFor(year, monthIndex, plan.dayOfMonth);
      if (candidate > now) break;
      due.push(candidate);
      const next = addMonthsUTC(new Date(Date.UTC(year, monthIndex, 1)), 1);
      year = next.year;
      monthIndex = next.monthIndex;
    }

    for (const date of due) {
      const amount = Number(plan.amount);
      await db.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            userId,
            date,
            amount,
            type: plan.type,
            accountId: plan.accountId,
            categoryId: plan.categoryId,
            note: plan.note,
            recurringId: plan.id,
          },
        });
        if (plan.accountId) {
          await tx.account.updateMany({
            where: { id: plan.accountId, userId },
            data: { balance: { increment: plan.type === "INCOME" ? amount : -amount } },
          });
        }
      });
    }
  }
}
