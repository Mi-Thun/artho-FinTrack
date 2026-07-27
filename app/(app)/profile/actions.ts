"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/current-user";
import { db } from "@/lib/db";

function toDate(v: unknown): Date {
  return new Date(v as string);
}
function toDateOrNull(v: unknown): Date | null {
  return v ? new Date(v as string) : null;
}

export async function restoreBackup(formData: FormData) {
  const userId = await requireUserId();
  const file = formData.get("backup");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/profile?restore=error");
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(await file.text());
  } catch {
    redirect("/profile?restore=error");
  }

  if (!data || typeof data !== "object" || !Array.isArray(data.accounts)) {
    redirect("/profile?restore=error");
  }

  const accounts = (data.accounts as any[]).map((a) => ({
    ...a,
    userId,
    createdAt: toDate(a.createdAt),
    lastCountedAt: toDateOrNull(a.lastCountedAt),
  }));
  const categories = (data.categories as any[] ?? []).map((c) => ({ ...c, userId }));
  const transactions = (data.transactions as any[] ?? []).map((t) => ({
    ...t,
    userId,
    date: toDate(t.date),
    createdAt: toDate(t.createdAt),
    deletedAt: toDateOrNull(t.deletedAt),
  }));
  const recurringTransactions = (data.recurringTransactions as any[] ?? []).map((r) => ({
    ...r,
    userId,
    createdAt: toDate(r.createdAt),
  }));
  const budgets = (data.budgets as any[] ?? []).map((b) => ({ ...b, userId }));
  const salaryConfigs = (data.salaryConfigs as any[] ?? []).map((s) => ({ ...s, userId }));
  const fixedDeposits = (data.fixedDeposits as any[] ?? []).map((f) => ({ ...f, userId, openedDate: toDate(f.openedDate) }));
  const dpsPlans = (data.dpsPlans as any[] ?? []).map((d) => ({ ...d, userId, startMonth: toDate(d.startMonth) }));
  const depositPlanSrc = data.depositPlan as any;
  const depositPlan = depositPlanSrc ? { ...depositPlanSrc, userId, startMonth: toDate(depositPlanSrc.startMonth) } : null;
  const milestones = (data.milestones as any[] ?? []).map((m) => ({ ...m, userId }));
  const loansSrc = (data.loans as any[]) ?? [];
  const loans = loansSrc.map((l) => ({ id: l.id, userId, name: l.name, originalAmount: l.originalAmount, startDate: toDate(l.startDate) }));
  const loanPayments = loansSrc.flatMap((l) => (l.payments ?? []).map((p: any) => ({ id: p.id, loanId: l.id, date: toDate(p.date), amount: p.amount })));
  const bigPurchases = (data.bigPurchases as any[] ?? []).map((b) => ({ ...b, userId, date: toDate(b.date) }));
  const incomeLedger = (data.incomeLedger as any[] ?? []).map((i) => ({ ...i, userId, date: toDate(i.date) }));

  await db.$transaction(
    async (tx) => {
      await tx.loanPayment.deleteMany({ where: { loan: { userId } } });
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.recurringTransaction.deleteMany({ where: { userId } });
      await tx.budget.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.category.deleteMany({ where: { userId } });
      await tx.salaryConfig.deleteMany({ where: { userId } });
      await tx.fixedDeposit.deleteMany({ where: { userId } });
      await tx.dpsPlan.deleteMany({ where: { userId } });
      await tx.depositPlanConfig.deleteMany({ where: { userId } });
      await tx.milestone.deleteMany({ where: { userId } });
      await tx.loan.deleteMany({ where: { userId } });
      await tx.bigPurchase.deleteMany({ where: { userId } });
      await tx.incomeLedgerEntry.deleteMany({ where: { userId } });

      if (accounts.length) await tx.account.createMany({ data: accounts });
      if (categories.length) await tx.category.createMany({ data: categories });
      if (recurringTransactions.length) await tx.recurringTransaction.createMany({ data: recurringTransactions });
      if (transactions.length) await tx.transaction.createMany({ data: transactions });
      if (budgets.length) await tx.budget.createMany({ data: budgets });
      if (salaryConfigs.length) await tx.salaryConfig.createMany({ data: salaryConfigs });
      if (fixedDeposits.length) await tx.fixedDeposit.createMany({ data: fixedDeposits });
      if (dpsPlans.length) await tx.dpsPlan.createMany({ data: dpsPlans });
      if (depositPlan) await tx.depositPlanConfig.create({ data: depositPlan });
      if (milestones.length) await tx.milestone.createMany({ data: milestones });
      if (loans.length) await tx.loan.createMany({ data: loans });
      if (loanPayments.length) await tx.loanPayment.createMany({ data: loanPayments });
      if (bigPurchases.length) await tx.bigPurchase.createMany({ data: bigPurchases });
      if (incomeLedger.length) await tx.incomeLedgerEntry.createMany({ data: incomeLedger });
    },
    { timeout: 30000 },
  );

  revalidatePath("/", "layout");
  redirect("/profile?restore=success");
}
