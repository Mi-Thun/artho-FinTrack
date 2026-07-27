import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;

  const [
    accounts,
    categories,
    transactions,
    recurringTransactions,
    budgets,
    salaryConfigs,
    fixedDeposits,
    dpsPlans,
    depositPlan,
    milestones,
    loans,
    bigPurchases,
    incomeLedger,
  ] = await Promise.all([
    db.account.findMany({ where: { userId } }),
    db.category.findMany({ where: { userId } }),
    db.transaction.findMany({ where: { userId } }),
    db.recurringTransaction.findMany({ where: { userId } }),
    db.budget.findMany({ where: { userId } }),
    db.salaryConfig.findMany({ where: { userId } }),
    db.fixedDeposit.findMany({ where: { userId } }),
    db.dpsPlan.findMany({ where: { userId } }),
    db.depositPlanConfig.findUnique({ where: { userId } }),
    db.milestone.findMany({ where: { userId } }),
    db.loan.findMany({ where: { userId }, include: { payments: true } }),
    db.bigPurchase.findMany({ where: { userId } }),
    db.incomeLedgerEntry.findMany({ where: { userId } }),
  ]);

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    userId,
    accounts,
    categories,
    transactions,
    recurringTransactions,
    budgets,
    salaryConfigs,
    fixedDeposits,
    dpsPlans,
    depositPlan,
    milestones,
    loans,
    bigPurchases,
    incomeLedger,
  };

  const json = JSON.stringify(backup, null, 2);

  const date = new Date().toISOString().slice(0, 10);
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="artho-backup-${date}.json"`,
    },
  });
}
