import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { toCsvField } from "@/lib/csv";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const transactions = await db.transaction.findMany({
    where: { userId, deletedAt: null },
    include: { account: true, category: true },
    orderBy: { date: "desc" },
  });

  // Same columns the importer reads, so an export re-imports cleanly (duplicates skipped).
  const header = ["date", "type", "amount", "category", "account", "note", "tax"];
  const lines = [header.join(",")];
  for (const t of transactions) {
    lines.push(
      [
        t.date.toISOString().slice(0, 10),
        t.type,
        String(t.amount),
        t.category?.name ?? "",
        t.account?.name ?? "",
        t.note ?? "",
        Number(t.taxWithheld) > 0 ? String(t.taxWithheld) : "",
      ]
        .map(toCsvField)
        .join(","),
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="transactions.csv"',
    },
  });
}
