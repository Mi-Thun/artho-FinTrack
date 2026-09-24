"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { parseCsv } from "@/lib/csv";
import { applyDueRecurringTransactions } from "@/lib/recurring";

export async function createTransaction(formData: FormData) {
  const userId = await requireUserId();

  const date = new Date(String(formData.get("date")));
  const amount = Number(formData.get("amount"));
  const type = String(formData.get("type")) === "INCOME" ? "INCOME" : "EXPENSE";
  const accountId = String(formData.get("accountId") || "") || null;
  const categoryId = String(formData.get("categoryId") || "") || null;
  const note = String(formData.get("note") || "") || null;

  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) return;

  await db.$transaction(async (tx) => {
    await tx.transaction.create({
      data: { userId, date, amount, type, accountId, categoryId, note },
    });
    if (accountId) {
      await tx.account.updateMany({
        where: { id: accountId, userId },
        data: { balance: { increment: type === "INCOME" ? amount : -amount } },
      });
    }
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

export async function updateTransaction(id: string, formData: FormData) {
  const userId = await requireUserId();

  const date = new Date(String(formData.get("date")));
  const amount = Number(formData.get("amount"));
  const type = String(formData.get("type")) === "INCOME" ? "INCOME" : "EXPENSE";
  const accountId = String(formData.get("accountId") || "") || null;
  const categoryId = String(formData.get("categoryId") || "") || null;
  const note = String(formData.get("note") || "") || null;
  const returnMonth = String(formData.get("returnMonth") || "");

  if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(date.getTime())) return;

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
      data: { date, amount, type, accountId, categoryId, note },
    });
  });

  revalidatePath("/transactions");
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
  revalidatePath("/dashboard");
}

export async function createRecurringTransaction(formData: FormData) {
  const userId = await requireUserId();

  const type = String(formData.get("type")) === "INCOME" ? "INCOME" : "EXPENSE";
  const amount = Number(formData.get("amount"));
  const accountId = String(formData.get("accountId") || "") || null;
  const categoryId = String(formData.get("categoryId") || "") || null;
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
  revalidatePath("/dashboard");
}

export async function deleteRecurringTransaction(id: string) {
  const userId = await requireUserId();
  await db.recurringTransaction.deleteMany({ where: { id, userId } });
  revalidatePath("/transactions");
}

export async function toggleRecurringTransaction(id: string, active: boolean) {
  const userId = await requireUserId();
  await db.recurringTransaction.updateMany({ where: { id, userId }, data: { active } });
  // Re-activating a plan may leave it owing several months; catch it up now.
  if (active) await applyDueRecurringTransactions(userId);
  revalidatePath("/transactions");
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
  revalidatePath("/dashboard");
}

export async function importTransactionsCsv(formData: FormData) {
  const userId = await requireUserId();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return;

  const [header, ...dataRows] = rows;
  const normalized = header.map((h) => h.trim().toLowerCase());
  const dateIdx = normalized.indexOf("date");
  const typeIdx = normalized.indexOf("type");
  const amountIdx = normalized.indexOf("amount");
  const categoryIdx = normalized.indexOf("category");
  const accountIdx = normalized.indexOf("account");
  const noteIdx = normalized.indexOf("note");
  if (dateIdx === -1 || amountIdx === -1) return;

  const [categories, accounts] = await Promise.all([
    db.category.findMany({ where: { userId } }),
    db.account.findMany({ where: { userId } }),
  ]);

  for (const row of dataRows) {
    if (row.length === 0 || (row.length === 1 && row[0] === "")) continue;

    const date = new Date(row[dateIdx]);
    const amount = Number(row[amountIdx]);
    const type = typeIdx !== -1 && row[typeIdx]?.trim().toUpperCase() === "INCOME" ? "INCOME" : "EXPENSE";
    if (Number.isNaN(date.getTime()) || !Number.isFinite(amount) || amount <= 0) continue;

    const categoryName = categoryIdx !== -1 ? row[categoryIdx]?.trim() : "";
    const accountName = accountIdx !== -1 ? row[accountIdx]?.trim() : "";
    const note = noteIdx !== -1 ? row[noteIdx]?.trim() || null : null;
    const category = categoryName ? categories.find((c) => c.name === categoryName && c.kind === type) : undefined;
    const account = accountName ? accounts.find((a) => a.name === accountName) : undefined;

    await db.$transaction(async (tx) => {
      await tx.transaction.create({
        data: { userId, date, amount, type, categoryId: category?.id ?? null, accountId: account?.id ?? null, note },
      });
      if (account) {
        await tx.account.updateMany({
          where: { id: account.id, userId },
          data: { balance: { increment: type === "INCOME" ? amount : -amount } },
        });
      }
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}
