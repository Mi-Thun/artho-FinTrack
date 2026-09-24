import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// A backup that silently omits half the user's records is worse than no backup — someone
// exports, trusts it, and discovers the gap only after they need it. Every user-owned
// table is listed here; add new models to BOTH this file and restoreBackup in
// app/(app)/profile/actions.ts when the schema grows.
//
// Deliberately excluded:
//   - Household and its members/invites, which belong to several users jointly. Restoring
//     one member's copy would rewrite shared state.
//   - UserPreferences.pinHash, so a backup file never carries a credential.

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
    preferences,
    savingsGoals,
    personalLoans,
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
    db.userPreferences.findUnique({
      where: { userId },
      select: { language: true, numerals: true, financeMode: true },
    }),
    db.savingsGoal.findMany({ where: { userId }, include: { contributions: true } }),
    db.personalLoan.findMany({ where: { userId }, include: { payments: true } }),
  ]);

  const backup = {
    // v1 → v2 added Budget.month. v3 covered the Bangladesh feature set (gold, schemes,
    // lending, goals, reminders) and folded savings certificates into fixedDeposits. v4
    // drops the gold and share holdings with the Assets module and adds the hand-entered
    // tax-return assets. v5 drops the zakat config and payment log with the Calculators
    // module. v6 drops the tax-deduction ledger and hand-entered return assets with the
    // Reports module. v7 drops the reminder list with the Reminders module. Restore
    // still accepts v1 to v6 files, ignoring dropped keys.
    version: 7,
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
    preferences,
    savingsGoals,
    personalLoans,
  };

  const json = JSON.stringify(backup, null, 2);

  const date = new Date().toISOString().slice(0, 10);
  return new Response(json, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="WealthFlow-backup-${date}.json"`,
    },
  });
}
