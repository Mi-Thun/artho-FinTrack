import { db } from "@/lib/db";
import { applyDueRecurringTransactions } from "@/lib/recurring";

/**
 * Deferred maintenance: materializing recurring transactions that have come due. There
 * is no job runner behind it, so it runs opportunistically while the user is active.
 *
 * Projected SP deposits used to be regenerated here too, writing hypothetical future
 * purchases into FixedDeposit alongside real holdings. Net worth counted them, so a
 * savings plan inflated the user's wealth with money they had never spent. The projection
 * page now computes those figures on the fly instead, and nothing hypothetical is
 * persisted.
 *
 * Two rules keep that from being a write-on-GET hazard:
 *
 *  1. It never runs *during* a page render. Pages schedule it with `after()` so it
 *     executes once the response has been sent — a render, a prefetch, or a retried
 *     request can't stall on maintenance writes, and a failure here can't 500 a page.
 *  2. It is throttled and self-locking. `claimSyncSlot` uses a conditional UPDATE as an
 *     atomic claim, so of N concurrent requests exactly one does the work.
 *
 * Mutations that make new work immediately visible (adding a recurring plan, editing
 * deposit assumptions) call `syncUserDataNow` directly instead — a POST is the right
 * place for a write, and the user sees the result without waiting for the next tick.
 */
const SYNC_INTERVAL_MS = 10 * 60 * 1000;

export interface SyncResult {
  ran: boolean;
  recurringCreated: number;
}

/**
 * Atomically claims the right to sync this user, if the throttle window has elapsed.
 * The `lastSyncedAt` predicate lives in the UPDATE's WHERE clause, so concurrent
 * callers contend in the database and exactly one wins.
 */
async function claimSyncSlot(userId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - SYNC_INTERVAL_MS);
  const claimed = await db.user.updateMany({
    where: {
      id: userId,
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }],
    },
    data: { lastSyncedAt: new Date() },
  });
  return claimed.count > 0;
}

/** Runs maintenance unconditionally. For mutation handlers that need it applied now. */
export async function syncUserDataNow(userId: string): Promise<SyncResult> {
  const recurringCreated = await applyDueRecurringTransactions(userId);
  await db.user.update({ where: { id: userId }, data: { lastSyncedAt: new Date() } });
  return { ran: true, recurringCreated };
}

/**
 * Runs maintenance if the throttle window has elapsed, swallowing failures. Intended to
 * be handed to `after()` from a page — background upkeep must never surface as a
 * request error, and the next tick will retry anyway.
 */
export async function syncUserDataInBackground(userId: string): Promise<SyncResult> {
  try {
    if (!(await claimSyncSlot(userId))) return { ran: false, recurringCreated: 0 };
    const recurringCreated = await applyDueRecurringTransactions(userId);
    return { ran: true, recurringCreated };
  } catch (error) {
    console.error(`[sync] deferred maintenance failed for user ${userId}`, error);
    return { ran: false, recurringCreated: 0 };
  }
}
