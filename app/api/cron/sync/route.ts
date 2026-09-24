import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { syncUserDataNow } from "@/lib/sync";

// Lets a real scheduler drive the deferred maintenance in lib/sync.ts instead of
// relying on users happening to load a page. Point a cron at:
//
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://…/api/cron/sync
//
// Without CRON_SECRET set the endpoint refuses to run at all, so an unconfigured
// deployment can't expose an unauthenticated write.

export const dynamic = "force-dynamic";

/** Batch size for walking the user table — bounded memory regardless of user count. */
const PAGE_SIZE = 100;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(header);
  // timingSafeEqual throws on length mismatch, so check that first.
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  let cursor: string | undefined;
  let usersProcessed = 0;
  let recurringCreated = 0;
  const failures: string[] = [];

  for (;;) {
    const users = await db.user.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true },
    });
    if (users.length === 0) break;

    for (const user of users) {
      try {
        const result = await syncUserDataNow(user.id);
        recurringCreated += result.recurringCreated;
        usersProcessed++;
      } catch (error) {
        // One user's bad data must not stop the run for everyone else.
        console.error(`[cron/sync] failed for user ${user.id}`, error);
        failures.push(user.id);
      }
    }

    cursor = users[users.length - 1].id;
    if (users.length < PAGE_SIZE) break;
  }

  return Response.json({
    usersProcessed,
    recurringCreated,
    failed: failures.length,
    durationMs: Date.now() - started,
  });
}
