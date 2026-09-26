"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { parseCsv } from "@/lib/csv";
import { applyDueRecurringTransactions } from "@/lib/recurring";

/**
 * A category only applies to transactions of its own kind. The form already filters the
 * list by type; this keeps a stale or forged pick from filing an expense under Salary.
 */
async function categoryForType(userId: string, categoryId: string | null, type: "INCOME" | "EXPENSE"): Promise<string | null> {
  if (!categoryId) return null;
  const category = await db.category.findFirst({ where: { id: categoryId, userId, kind: type }, select: { id: true } });
  return category?.id ?? null;
}

/** Tax withheld only means something on income; blank, negative or garbage reads as 0. */
function taxFrom(formData: FormData, type: "INCOME" | "EXPENSE"): number {
  if (type !== "INCOME") return 0;
  const n = Number(formData.get("taxWithheld"));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The month income counts toward, from a `YYYY-MM` value. Stored only when it differs from
 * the month the money arrived (null = "the month of the date"), and only on income.
 */
function incomeMonthFrom(raw: unknown, type: "INCOME" | "EXPENSE", date: Date): Date | null {
  if (type !== "INCOME") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  const forMonth = new Date(Date.UTC(Number(match[1]), month - 1, 1));
  const sameAsDate = forMonth.getUTCFullYear() === date.getUTCFullYear() && forMonth.getUTCMonth() === date.getUTCMonth();
  return sameAsDate ? null : forMonth;
}

export async function createTransaction(formData: FormData) {
  const userId = await requireUserId();

  const date = new Date(String(formData.get("date")));
  const amount = Number(formData.get("amount"));
  const type = String(formData.get("type")) === "INCOME" ? "INCOME" : "EXPENSE";
  const accountId = String(formData.get("accountId") || "") || null;
  const categoryId = await categoryForType(userId, String(formData.get("categoryId") || "") || null, type);
  const note = String(formData.get("note") || "") || null;
  const taxWithheld = taxFrom(formData, type);

  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) return;
  const incomeMonth = incomeMonthFrom(formData.get("incomeMonth"), type, date);

  await db.$transaction(async (tx) => {
    await tx.transaction.create({
      data: { userId, date, amount, type, accountId, categoryId, note, taxWithheld, incomeMonth },
    });
    if (accountId) {
      await tx.account.updateMany({
        where: { id: accountId, userId },
        data: { balance: { increment: type === "INCOME" ? amount : -amount } },
      });
    }
  });

  revalidatePath("/transactions");
  revalidatePath("/income-ledger");
  revalidatePath("/dashboard");
}

export async function updateTransaction(id: string, formData: FormData) {
  const userId = await requireUserId();

  const date = new Date(String(formData.get("date")));
  const amount = Number(formData.get("amount"));
  const type = String(formData.get("type")) === "INCOME" ? "INCOME" : "EXPENSE";
  const accountId = String(formData.get("accountId") || "") || null;
  const categoryId = await categoryForType(userId, String(formData.get("categoryId") || "") || null, type);
  const note = String(formData.get("note") || "") || null;
  const returnMonth = String(formData.get("returnMonth") || "");
  const taxWithheld = taxFrom(formData, type);

  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) return;
  const incomeMonth = incomeMonthFrom(formData.get("incomeMonth"), type, date);

  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId) return;

    if (existing.accountId) {
      await tx.account.updateMany({
        where: { id: existing.accountId, userId },
        data: { balance: { increment: existing.type === "INCOME" ? -Number(existing.amount) : Number(existing.amount) } },
      });
    }
    if (accountId) {
      await tx.account.updateMany({
        where: { id: accountId, userId },
        data: { balance: { increment: type === "INCOME" ? amount : -amount } },
      });
    }
    await tx.transaction.update({
      where: { id },
      data: { date, amount, type, accountId, categoryId, note, taxWithheld, incomeMonth },
    });
  });

  revalidatePath("/transactions");
  revalidatePath("/income-ledger");
  revalidatePath("/dashboard");
  redirect(returnMonth ? `/transactions?month=${returnMonth}` : "/transactions");
}

export async function deleteTransaction(id: string) {
  const userId = await requireUserId();

  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId || existing.deletedAt) return;

    if (existing.accountId) {
      await tx.account.updateMany({
        where: { id: existing.accountId, userId },
        data: { balance: { increment: existing.type === "INCOME" ? -Number(existing.amount) : Number(existing.amount) } },
      });
    }
    await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
  });

  revalidatePath("/transactions");
  revalidatePath("/income-ledger");
  revalidatePath("/dashboard");
}

export async function restoreTransaction(id: string) {
  const userId = await requireUserId();

  await db.$transaction(async (tx) => {
    const existing = await tx.transaction.findUnique({ where: { id } });
    if (!existing || existing.userId !== userId || !existing.deletedAt) return;

    if (existing.accountId) {
      await tx.account.updateMany({
        where: { id: existing.accountId, userId },
        data: { balance: { increment: existing.type === "INCOME" ? Number(existing.amount) : -Number(existing.amount) } },
      });
    }
    await tx.transaction.update({ where: { id }, data: { deletedAt: null } });
  });

  revalidatePath("/transactions");
  revalidatePath("/income-ledger");
  revalidatePath("/dashboard");
}

export async function createRecurringTransaction(formData: FormData) {
  const userId = await requireUserId();

  const type = String(formData.get("type")) === "INCOME" ? "INCOME" : "EXPENSE";
  const amount = Number(formData.get("amount"));
  const accountId = String(formData.get("accountId") || "") || null;
  const categoryId = await categoryForType(userId, String(formData.get("categoryId") || "") || null, type);
  const note = String(formData.get("note") || "") || null;
  const dayOfMonth = Number(formData.get("dayOfMonth")) || 1;

  if (!Number.isFinite(amount) || amount <= 0 || dayOfMonth < 1 || dayOfMonth > 31) return;

  await db.recurringTransaction.create({
    data: { userId, type, amount, accountId, categoryId, note, dayOfMonth },
  });
  // Generate whatever the new plan is already due for, so the user sees it right away
  // instead of waiting for the next background sync. Idempotent — see lib/recurring.ts.
  await applyDueRecurringTransactions(userId);

  revalidatePath("/transactions");
  revalidatePath("/recurring");
  revalidatePath("/dashboard");
}

export async function deleteRecurringTransaction(id: string) {
  const userId = await requireUserId();
  await db.recurringTransaction.deleteMany({ where: { id, userId } });
  revalidatePath("/transactions");
  revalidatePath("/recurring");
}

export async function toggleRecurringTransaction(id: string, active: boolean) {
  const userId = await requireUserId();
  await db.recurringTransaction.updateMany({ where: { id, userId }, data: { active } });
  // Re-activating a plan may leave it owing several months; catch it up now.
  if (active) await applyDueRecurringTransactions(userId);
  revalidatePath("/transactions");
  revalidatePath("/recurring");
  revalidatePath("/dashboard");
}

export async function bulkDeleteTransactions(formData: FormData) {
  const userId = await requireUserId();
  const ids = formData.getAll("ids").map(String);
  if (ids.length === 0) return;

  await db.$transaction(async (tx) => {
    for (const id of ids) {
      const existing = await tx.transaction.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId || existing.deletedAt) continue;

      if (existing.accountId) {
        await tx.account.updateMany({
          where: { id: existing.accountId, userId },
          data: { balance: { increment: existing.type === "INCOME" ? -Number(existing.amount) : Number(existing.amount) } },
        });
      }
      await tx.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
    }
  });

  revalidatePath("/transactions");
  revalidatePath("/income-ledger");
  revalidatePath("/dashboard");
}

export interface ImportResult {
  imported: number;
  /** Rows already recorded whose category, month and tax were updated from the file. */
  updated: number;
  duplicates: number;
  skipped: number;
  categoriesCreated: number;
}

/**
 * Imports transactions from CSV. Columns: date, type, amount, category, account, note, and
 * an optional tax (tax withheld on income).
 *
 * - Rows that exactly match a transaction already recorded (same date, type, amount and
 *   note) are never added twice. With `updateExisting` on, the recorded one takes the
 *   file's category, income month and tax instead — how a corrected file fixes earlier
 *   imports.
 * - An optional `month` column (YYYY-MM) says which month income is for.
 * - With `createCategories` on, a category name that doesn't exist yet is created for that
 *   type; otherwise the row imports uncategorised.
 * - An account named in the file has its balance moved, like any transaction; rows with no
 *   account (e.g. past income already reflected in today's balances) leave balances alone.
 */
export async function importTransactionsCsv(formData: FormData): Promise<ImportResult | undefined> {
  const userId = await requireUserId();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  const createCategories = formData.get("createCategories") === "on";
  const updateExisting = formData.get("updateExisting") === "on";

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return;

  const [header, ...dataRows] = rows;
  const normalized = header.map((h) => h.trim().toLowerCase());
  const col = (name: string) => normalized.indexOf(name);
  const dateIdx = col("date");
  const typeIdx = col("type");
  const amountIdx = col("amount");
  const categoryIdx = col("category");
  const accountIdx = col("account");
  const noteIdx = col("note");
  const taxIdx = col("tax") !== -1 ? col("tax") : col("taxwithheld");
  const monthIdx = col("month") !== -1 ? col("month") : col("incomemonth");
  if (dateIdx === -1 || amountIdx === -1) return;

  const [categories, accounts, existing] = await Promise.all([
    db.category.findMany({ where: { userId } }),
    db.account.findMany({ where: { userId } }),
    db.transaction.findMany({ where: { userId, deletedAt: null }, select: { id: true, date: true, type: true, amount: true, note: true } }),
  ]);
  const key = (date: Date, type: string, amount: number, note: string | null) =>
    `${date.toISOString().slice(0, 10)}|${type}|${amount.toFixed(2)}|${note ?? ""}`;
  const seen = new Map(existing.map((t) => [key(t.date, t.type, Number(t.amount), t.note), t.id as string | null]));
  const result: ImportResult = { imported: 0, updated: 0, duplicates: 0, skipped: 0, categoriesCreated: 0 };

  for (const row of dataRows) {
    if (row.length === 0 || (row.length === 1 && row[0].trim() === "")) continue;

    const date = new Date(row[dateIdx]);
    const amount = Number(row[amountIdx]);
    const type = typeIdx !== -1 && row[typeIdx]?.trim().toUpperCase() === "INCOME" ? "INCOME" : "EXPENSE";
    if (Number.isNaN(date.getTime()) || !Number.isFinite(amount) || amount <= 0) {
      result.skipped++;
      continue;
    }

    const categoryName = categoryIdx !== -1 ? row[categoryIdx]?.trim() : "";
    const accountName = accountIdx !== -1 ? row[accountIdx]?.trim() : "";
    const note = noteIdx !== -1 ? row[noteIdx]?.trim() || null : null;
    const rawTax = taxIdx !== -1 ? Number(row[taxIdx]) : 0;
    const taxWithheld = type === "INCOME" && Number.isFinite(rawTax) && rawTax > 0 ? rawTax : 0;

    const incomeMonth = monthIdx !== -1 ? incomeMonthFrom(row[monthIdx], type, date) : null;

    let category = categoryName ? categories.find((c) => c.name === categoryName && c.kind === type) : undefined;
    if (!category && categoryName && createCategories) {
      category = await db.category.create({ data: { userId, name: categoryName, kind: type } });
      categories.push(category);
      result.categoriesCreated++;
    }
    const account = accountName ? accounts.find((a) => a.name === accountName) : undefined;

    const k = key(date, type, amount, note);
    if (seen.has(k)) {
      const existingId = seen.get(k);
      if (updateExisting && existingId) {
        // Only the descriptive fields: amount, date and account (and so balances) stay put.
        await db.transaction.updateMany({
          where: { id: existingId, userId },
          data: { categoryId: category?.id ?? null, incomeMonth, taxWithheld },
        });
        result.updated++;
      } else {
        result.duplicates++;
      }
      continue;
    }
    // A duplicate *within* the file is still only added once.
    seen.set(k, null);

    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: { userId, date, amount, type, categoryId: category?.id ?? null, accountId: account?.id ?? null, note, taxWithheld, incomeMonth },
      });
      if (account) {
        await tx.account.updateMany({
          where: { id: account.id, userId },
          data: { balance: { increment: type === "INCOME" ? amount : -amount } },
        });
      }
    });
    result.imported++;
  }

  revalidatePath("/transactions");
  revalidatePath("/income-ledger");
  revalidatePath("/dashboard");
  return result;
}

/**
 * Moves money between two of the user's accounts. Only the two balances change — no
 * income or expense is recorded (see the Transfer model for why).
 */
export async function createTransfer(formData: FormData) {
  const userId = await requireUserId();
  const date = new Date(String(formData.get("date")));
  const amount = Number(formData.get("amount"));
  const fromAccountId = String(formData.get("fromAccountId") || "");
  const toAccountId = String(formData.get("toAccountId") || "");
  const note = String(formData.get("note") || "") || null;

  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) return;
  if (!fromAccountId || !toAccountId || fromAccountId === toAccountId) return;

  // Both accounts must be this user's; otherwise a forged id could move someone else's money.
  const owned = await db.account.count({ where: { userId, id: { in: [fromAccountId, toAccountId] } } });
  if (owned !== 2) return;

  await db.$transaction(async (tx) => {
    await tx.transfer.create({ data: { userId, date, amount, fromAccountId, toAccountId, note } });
    await tx.account.updateMany({ where: { id: fromAccountId, userId }, data: { balance: { decrement: amount } } });
    await tx.account.updateMany({ where: { id: toAccountId, userId }, data: { balance: { increment: amount } } });
  });

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

/** Deletes a transfer and moves the money back. */
export async function deleteTransfer(id: string) {
  const userId = await requireUserId();

  await db.$transaction(async (tx) => {
    const existing = await tx.transfer.findFirst({ where: { id, userId } });
    if (!existing) return;
    if (existing.fromAccountId) {
      await tx.account.updateMany({ where: { id: existing.fromAccountId, userId }, data: { balance: { increment: existing.amount } } });
    }
    if (existing.toAccountId) {
      await tx.account.updateMany({ where: { id: existing.toAccountId, userId }, data: { balance: { decrement: existing.amount } } });
    }
    await tx.transfer.delete({ where: { id } });
  });

  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}
