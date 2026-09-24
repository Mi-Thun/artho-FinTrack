"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";

function num(formData: FormData, key: string): number {
  return Number(formData.get(key));
}
function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export async function createAccount(formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const kind = str(formData, "kind") as "BANK" | "CASH" | "WALLET";
  const balance = num(formData, "balance");
  if (!name || !Number.isFinite(balance)) return;

  await db.account.create({ data: { userId, name, kind, balance } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function updateAccount(id: string, formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const kind = str(formData, "kind") as "BANK" | "CASH" | "WALLET";
  const balance = num(formData, "balance");
  if (!name || !Number.isFinite(balance)) return;

  await db.account.updateMany({ where: { id, userId }, data: { name, kind, balance } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  redirect("/accounts?tab=accounts");
}

export async function deleteAccount(id: string) {
  const userId = await requireUserId();
  await db.account.deleteMany({ where: { id, userId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function createIncomeLedgerEntry(formData: FormData) {
  const userId = await requireUserId();
  const description = str(formData, "description");
  const amount = num(formData, "amount");
  const taxWithheld = num(formData, "taxWithheld") || 0;
  const date = new Date(str(formData, "date"));
  if (!description || !Number.isFinite(amount) || Number.isNaN(date.getTime())) return;

  await db.incomeLedgerEntry.create({ data: { userId, description, amount, taxWithheld, date } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function updateIncomeLedgerEntry(id: string, formData: FormData) {
  const userId = await requireUserId();
  const description = str(formData, "description");
  const amount = num(formData, "amount");
  const taxWithheld = num(formData, "taxWithheld") || 0;
  const date = new Date(str(formData, "date"));
  if (!description || !Number.isFinite(amount) || Number.isNaN(date.getTime())) return;

  await db.incomeLedgerEntry.updateMany({ where: { id, userId }, data: { description, amount, taxWithheld, date } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  redirect("/accounts");
}

export async function deleteIncomeLedgerEntry(id: string) {
  const userId = await requireUserId();
  await db.incomeLedgerEntry.deleteMany({ where: { id, userId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}
