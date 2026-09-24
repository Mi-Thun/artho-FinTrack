"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUserId } from "@/lib/current-user";
import { db } from "@/lib/db";
import { monthStart } from "@/lib/budgets";
import { money } from "@/lib/money";

// Backups are user-supplied files, so every field is read out explicitly rather than
// spread wholesale into `createMany` — a spread would let an edited file set columns the
// restore has no business touching, and it silently breaks whenever the schema changes.
// Explicit mapping also lets older backups (v1, written before budgets carried a month)
// be upgraded on the way in instead of rejected.

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter(isRow) : [];
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function formString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function updateProfile(formData: FormData) {
  const userId = await requireUserId();
  const name = formString(formData, "name");
  const email = formString(formData, "email").toLowerCase();

  if (!email || !email.includes("@")) return;

  const existing = await db.user.findFirst({
    where: { email, id: { not: userId } },
    select: { id: true },
  });
  if (existing) {
    redirect("/profile?profileError=email");
  }

  await db.user.update({
    where: { id: userId },
    data: { name: name || null, email },
  });

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  redirect("/profile?profileUpdated=success");
}

function int(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) ? n : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function date(value: unknown, fallback: Date = new Date()): Date {
  if (value == null) return fallback;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function dateOrNull(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function txType(value: unknown): "INCOME" | "EXPENSE" {
  return value === "INCOME" ? "INCOME" : "EXPENSE";
}

function accountKind(value: unknown): "BANK" | "CASH" | "WALLET" {
  return value === "CASH" || value === "WALLET" ? value : "BANK";
}

const CERTIFICATE_SCHEMES = [
  "FIVE_YEAR_BSP",
  "THREE_MONTH_PROFIT",
  "PARIWAR",
  "PENSIONER",
  "POST_OFFICE_FD",
  "OTHER",
] as const;
type CertificateSchemeValue = (typeof CERTIFICATE_SCHEMES)[number];

/** Null means a plain bank FDR rather than a government scheme. */
function certificateScheme(value: unknown): CertificateSchemeValue | null {
  return (CERTIFICATE_SCHEMES as readonly string[]).includes(value as string)
    ? (value as CertificateSchemeValue)
    : null;
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value as string) ? (value as T) : fallback;
}

/** Drops later rows that would collide on a unique constraint. */
function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Hands every restored row a new id, and keeps the file's relations pointing at it.
 *
 * The ids in a backup are only unique within the account it was exported from, while the
 * restore can only delete rows belonging to `userId`. Reusing them meant a file from
 * another account — or another database — collided with rows that account still owns and
 * failed the whole transaction on the primary key (P2002). Ids are opaque and nothing
 * outside the file references them, so the cheapest correct answer is to mint new ones
 * and rewrite each reference through the same map that renamed its target.
 *
 * One map covers every table: ids are cuids, unique across tables and not just within
 * one, so a reference can be resolved without knowing which table it points into.
 */
function freshIds() {
  const assigned = new Map<string, string>();
  return {
    /** The new id for the row the file called `oldId`. */
    of(oldId: string): string {
      if (!oldId) return randomUUID();
      let id = assigned.get(oldId);
      if (!id) {
        id = randomUUID();
        assigned.set(oldId, id);
      }
      return id;
    },
    /** Where a reference to `oldId` now points, or null when the file never defined it. */
    ref(oldId: string | null): string | null {
      return oldId ? (assigned.get(oldId) ?? null) : null;
    },
  };
}

export async function restoreBackup(formData: FormData) {
  const userId = await requireUserId();
  const file = formData.get("backup");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/profile?restore=error");
  }

  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    redirect("/profile?restore=error");
  }

  if (!isRow(data) || !Array.isArray(data.accounts)) {
    redirect("/profile?restore=error");
  }

  const currentMonth = monthStart(new Date());
  const ids = freshIds();

  const accounts = rows(data.accounts).map((a) => ({
    id: ids.of(str(a.id)),
    userId,
    name: str(a.name, "Account"),
    kind: accountKind(a.kind),
    balance: money(a.balance),
    lastCountedAt: dateOrNull(a.lastCountedAt),
    createdAt: date(a.createdAt),
  }));

  const categories = rows(data.categories).map((c) => ({
    id: ids.of(str(c.id)),
    userId,
    name: str(c.name, "Uncategorized"),
    kind: txType(c.kind),
  }));

  const recurringTransactions = rows(data.recurringTransactions).map((r) => ({
    id: ids.of(str(r.id)),
    userId,
    type: txType(r.type),
    amount: money(r.amount),
    accountId: ids.ref(strOrNull(r.accountId)),
    categoryId: ids.ref(strOrNull(r.categoryId)),
    note: strOrNull(r.note),
    dayOfMonth: int(r.dayOfMonth, 1),
    active: bool(r.active, true),
    createdAt: date(r.createdAt),
  }));

  // A backup taken before the (recurringId, date) uniqueness fix can contain the very
  // duplicates that constraint exists to prevent; keep the first of each.
  const transactions = dedupe(
    rows(data.transactions).map((t) => ({
      id: ids.of(str(t.id)),
      userId,
      accountId: ids.ref(strOrNull(t.accountId)),
      categoryId: ids.ref(strOrNull(t.categoryId)),
      date: date(t.date),
      amount: money(t.amount),
      type: txType(t.type),
      note: strOrNull(t.note),
      recurringId: ids.ref(strOrNull(t.recurringId)),
      deletedAt: dateOrNull(t.deletedAt),
      createdAt: date(t.createdAt),
    })),
    (t) => (t.recurringId ? `${t.recurringId}|${t.date.toISOString()}` : `id:${t.id}`),
  );

  // v1 backups predate month-scoped budgets — those limits were "the limit, forever",
  // which is exactly what anchoring them to the current month preserves going forward.
  const budgets = dedupe(
    rows(data.budgets).map((b) => ({
      id: ids.of(str(b.id)),
      userId,
      // A budget whose category didn't survive the file has nothing left to limit.
      categoryId: ids.ref(strOrNull(b.categoryId)) ?? "",
      month: b.month ? monthStart(date(b.month, currentMonth)) : currentMonth,
      monthlyLimit: money(b.monthlyLimit),
    })),
    (b) => `${b.categoryId}|${b.month.toISOString()}`,
  ).filter((b) => b.categoryId !== "");

  const salaryConfigs = rows(data.salaryConfigs).map((s) => ({
    id: ids.of(str(s.id)),
    userId,
    year: int(s.year, new Date().getUTCFullYear()),
    monthlySalary: money(s.monthlySalary),
    festivalBonusMultiplier: money(s.festivalBonusMultiplier),
    bonusMonths: Array.isArray(s.bonusMonths)
      ? s.bonusMonths.map((m) => int(m, 0)).filter((m) => m >= 1 && m <= 12)
      : [],
    taxRebate: money(s.taxRebate),
    annualTax: money(s.annualTax),
    monthlyExpense: money(s.monthlyExpense),
  }));

  // v3 folded savings certificates into this table and dropped `source`. Older files
  // carry a `source` field, which is simply ignored — every row in a backup is a real
  // holding, and projected ones are no longer persisted at all.
  const fixedDeposits = rows(data.fixedDeposits).map((f) => ({
    id: ids.of(str(f.id)),
    userId,
    label: str(f.label, "Deposit"),
    principal: money(f.principal),
    openedDate: date(f.openedDate),
    rateY1: money(f.rateY1),
    rateY2: money(f.rateY2),
    rateY3: money(f.rateY3),
    termMonths: int(f.termMonths, 36),
    scheme: certificateScheme(f.scheme),
    holderType: f.holderType === "JOINT" ? ("JOINT" as const) : ("SINGLE" as const),
    registrationNo: strOrNull(f.registrationNo),
    encashedAt: dateOrNull(f.encashedAt),
    note: strOrNull(f.note),
  }));

  const dpsPlans = rows(data.dpsPlans).map((d) => ({
    id: ids.of(str(d.id)),
    userId,
    label: str(d.label, "DPS"),
    monthlyDeposit: money(d.monthlyDeposit),
    startMonth: date(d.startMonth),
    tenureMonths: int(d.tenureMonths, 12),
    interestRate: money(d.interestRate),
    profitTaxAtSource: money(d.profitTaxAtSource),
  }));

  const planSrc = isRow(data.depositPlan) ? data.depositPlan : null;
  const depositPlan = planSrc
    ? {
        userId,
        startingNetWorth: money(planSrc.startingNetWorth),
        startMonth: date(planSrc.startMonth),
        depositUnitSize: money(planSrc.depositUnitSize),
        profitRateY1: money(planSrc.profitRateY1),
        profitRateY2: money(planSrc.profitRateY2),
        profitRateY3: money(planSrc.profitRateY3),
        investmentCap: money(planSrc.investmentCap),
      }
    : null;

  const milestones = rows(data.milestones).map((m) => ({
    id: ids.of(str(m.id)),
    userId,
    targetAmount: money(m.targetAmount),
    label: str(m.label, "Milestone"),
  }));

  const loanRows = rows(data.loans);
  const loans = loanRows.map((l) => ({
    id: ids.of(str(l.id)),
    userId,
    name: str(l.name, "Loan"),
    originalAmount: money(l.originalAmount),
    startDate: date(l.startDate),
  }));
  const loanPayments = loanRows.flatMap((l) => {
    const loanId = ids.ref(strOrNull(l.id));
    if (!loanId) return [];
    return rows(l.payments).map((p) => ({
      id: ids.of(str(p.id)),
      loanId,
      date: date(p.date),
      amount: money(p.amount),
    }));
  });

  const bigPurchases = rows(data.bigPurchases).map((b) => ({
    id: ids.of(str(b.id)),
    userId,
    item: str(b.item, "Purchase"),
    amount: money(b.amount),
    date: date(b.date),
  }));

  const incomeLedger = rows(data.incomeLedger).map((i) => ({
    id: ids.of(str(i.id)),
    userId,
    date: date(i.date),
    description: str(i.description, ""),
    amount: money(i.amount),
    taxWithheld: money(i.taxWithheld),
  }));

  // ---- Bangladesh feature set (v3 backups) --------------------------------
  // Older files simply have none of these keys, and `rows()` yields [] for a missing
  // key, so a v1 or v2 backup restores exactly as it always did.

  const preferencesSrc = isRow(data.preferences) ? data.preferences : null;
  const preferences = preferencesSrc
    ? {
        userId,
        language: pick(preferencesSrc.language, ["EN", "BN"] as const, "EN"),
        numerals: pick(preferencesSrc.numerals, ["WESTERN", "BENGALI"] as const, "WESTERN"),
        financeMode: pick(preferencesSrc.financeMode, ["CONVENTIONAL", "ISLAMIC"] as const, "CONVENTIONAL"),
      }
    : null;

  // v3 files carry metalHoldings and stockHoldings from the removed Assets module, and
  // v4 and earlier carry zakatConfig and zakatPayments from the removed Calculators
  // module. Those keys are read by nothing now, so such a backup restores without them.

  const goalSrc = rows(data.savingsGoals);
  const savingsGoals = goalSrc.map((g) => ({
    id: ids.of(str(g.id)),
    userId,
    name: str(g.name, "Goal"),
    templateKey: strOrNull(g.templateKey),
    targetAmount: money(g.targetAmount),
    targetDate: dateOrNull(g.targetDate),
    note: strOrNull(g.note),
    archivedAt: dateOrNull(g.archivedAt),
  }));
  const goalContributions = goalSrc.flatMap((g) => {
    const goalId = ids.ref(strOrNull(g.id));
    if (!goalId) return [];
    return rows(g.contributions).map((c) => ({
      id: ids.of(str(c.id)),
      goalId,
      date: date(c.date),
      amount: money(c.amount),
      note: strOrNull(c.note),
    }));
  });

  const personalLoanSrc = rows(data.personalLoans);
  const personalLoans = personalLoanSrc.map((l) => ({
    id: ids.of(str(l.id)),
    userId,
    counterparty: str(l.counterparty, "Unknown"),
    direction: l.direction === "BORROWED" ? ("BORROWED" as const) : ("LENT" as const),
    principal: money(l.principal),
    date: date(l.date),
    dueDate: dateOrNull(l.dueDate),
    note: strOrNull(l.note),
    settledAt: dateOrNull(l.settledAt),
  }));
  const personalLoanPayments = personalLoanSrc.flatMap((l) => {
    const personalLoanId = ids.ref(strOrNull(l.id));
    if (!personalLoanId) return [];
    return rows(l.payments).map((pmt) => ({
      id: ids.of(str(pmt.id)),
      personalLoanId,
      date: date(pmt.date),
      amount: money(pmt.amount),
      note: strOrNull(pmt.note),
    }));
  });

  await db.$transaction(
    async (tx) => {
      await tx.goalContribution.deleteMany({ where: { goal: { userId } } });
      await tx.savingsGoal.deleteMany({ where: { userId } });
      await tx.personalLoanPayment.deleteMany({ where: { personalLoan: { userId } } });
      await tx.personalLoan.deleteMany({ where: { userId } });
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

      if (savingsGoals.length) await tx.savingsGoal.createMany({ data: savingsGoals });
      if (goalContributions.length) await tx.goalContribution.createMany({ data: goalContributions });
      if (personalLoans.length) await tx.personalLoan.createMany({ data: personalLoans });
      if (personalLoanPayments.length) await tx.personalLoanPayment.createMany({ data: personalLoanPayments });

      // 1:1 config rows are upserted rather than created — the user may already have them.
      if (preferences) {
        await tx.userPreferences.upsert({
          where: { userId },
          create: preferences,
          update: preferences,
        });
      }
    },
    { timeout: 30000 },
  );

  revalidatePath("/", "layout");
  redirect("/profile?restore=success");
}
