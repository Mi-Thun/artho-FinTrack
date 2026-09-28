"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { saveAccountBalance } from "@/lib/account-balances";
import { monthKey, monthStart, parseMonthKey } from "@/lib/budgets";

function num(formData: FormData, key: string): number {
  return Number(formData.get(key));
}
function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
/** The month a balance is counted for: the one being viewed, never a future one. */
function monthOf(formData: FormData): Date {
  const current = monthStart(new Date());
  const month = parseMonthKey(str(formData, "month"));
  return month && month <= current ? month : current;
}

export async function createAccount(formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const kind = str(formData, "kind") as "BANK" | "CASH" | "WALLET";
  const balance = num(formData, "balance");
  if (!name || !Number.isFinite(balance)) return;

  // The balance is a count "as of now": net worth adds transactions logged after it. It
  // is also the account's first monthly count, for the month being viewed.
  await db.account.create({
    data: { userId, name, kind, balance, lastCountedAt: new Date(), monthBalances: { create: { month: monthOf(formData), balance } } },
  });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function updateAccount(id: string, formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const kind = str(formData, "kind") as "BANK" | "CASH" | "WALLET";
  const balance = num(formData, "balance");
  if (!name || !Number.isFinite(balance)) return;

  const month = monthOf(formData);
  const existing = await db.account.findFirst({
    where: { id, userId },
    select: { monthBalances: { where: { month: { lte: month } }, orderBy: { month: "desc" }, take: 1, select: { balance: true } } },
  });
  if (!existing) return;
  await db.account.update({ where: { id }, data: { name, kind } });
  // A changed balance is a fresh count for this month; renaming alone saves nothing, so a
  // month still carrying an earlier count keeps carrying it.
  const previous = existing.monthBalances[0];
  if (!previous || Number(previous.balance) !== balance) await saveAccountBalance(id, month, balance);
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  revalidatePath("/transactions");
  redirect(`/accounts?month=${monthKey(month)}`);
}

export async function deleteAccount(id: string) {
  const userId = await requireUserId();
  await db.account.deleteMany({ where: { id, userId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}
