import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Most months a dormant plan will catch up on in a single run. */
const MAX_CATCHUP_MONTHS = 24;

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

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Generates any Transaction rows a user's active recurring plans are due for, up to
 * today — one row per elapsed month, capped so a plan left dormant for years doesn't
 * produce a runaway backlog.
 *
 * Reading the last generated date and then writing is a read-modify-write race: two
 * concurrent runs (two tabs, a prefetch racing a navigation) could both conclude a
 * month was ungenerated and both create it, double-counting the account balance. The
 * `@@unique([recurringId, date])` constraint on Transaction makes that impossible at
 * the database level; this function treats the resulting unique violation as "another
 * run already did it" and moves on, so a balance increment can only ever be applied by
 * the run that actually created the row.
 *
 * Returns the number of transactions this run created.
 */
export async function applyDueRecurringTransactions(userId: string): Promise<number> {
  const now = new Date();
  const plans = await db.recurringTransaction.findMany({ where: { userId, active: true } });
  if (plans.length === 0) return 0;

  // One query for the latest transaction per plan, instead of a round-trip per plan.
  const lastTxByPlan = await db.transaction.findMany({
    where: { recurringId: { in: plans.map((p) => p.id) } },
    orderBy: { date: "desc" },
    distinct: ["recurringId"],
    select: { recurringId: true, date: true },
  });
  const lastDateByPlanId = new Map(lastTxByPlan.map((t) => [t.recurringId as string, t.date]));

  let created = 0;

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
    for (let i = 0; i < MAX_CATCHUP_MONTHS; i++) {
      const candidate = dueDateFor(year, monthIndex, plan.dayOfMonth);
      if (candidate > now) break;
      due.push(candidate);
      const next = addMonthsUTC(new Date(Date.UTC(year, monthIndex, 1)), 1);
      year = next.year;
      monthIndex = next.monthIndex;
    }

    for (const date of due) {
      try {
        await db.$transaction(async (tx) => {
          // Creating first means a losing race aborts the whole transaction before the
          // balance is touched — an increment is never applied without its row.
          await tx.transaction.create({
            data: {
              userId,
              date,
              amount: plan.amount,
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
              data: {
                balance: { increment: plan.type === "INCOME" ? plan.amount : plan.amount.negated() },
              },
            });
          }
        });
        created++;
      } catch (error) {
        // Another concurrent run already generated this plan-month. Not an error.
        if (!isUniqueViolation(error)) throw error;
      }
    }
  }

  return created;
}
