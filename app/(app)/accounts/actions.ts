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

export async function createLoan(formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const originalAmount = num(formData, "originalAmount");
  const startDate = new Date(str(formData, "startDate"));
  if (!name || !Number.isFinite(originalAmount) || Number.isNaN(startDate.getTime())) return;

  await db.loan.create({ data: { userId, name, originalAmount, startDate } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function updateLoan(id: string, formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  const originalAmount = num(formData, "originalAmount");
  const startDate = new Date(str(formData, "startDate"));
  if (!name || !Number.isFinite(originalAmount) || Number.isNaN(startDate.getTime())) return;

  await db.loan.updateMany({ where: { id, userId }, data: { name, originalAmount, startDate } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
  redirect("/accounts?tab=loans");
}

export async function deleteLoan(id: string) {
  const userId = await requireUserId();
  await db.loan.deleteMany({ where: { id, userId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function addLoanPayment(formData: FormData) {
  const userId = await requireUserId();
  const loanId = str(formData, "loanId");
  const amount = num(formData, "amount");
  const date = new Date(str(formData, "date"));
  if (!loanId || !Number.isFinite(amount) || Number.isNaN(date.getTime())) return;

  const loan = await db.loan.findUnique({ where: { id: loanId } });
  if (!loan || loan.userId !== userId) return;

  await db.loanPayment.create({ data: { loanId, amount, date } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}

export async function createBigPurchase(formData: FormData) {
  const userId = await requireUserId();
  const item = str(formData, "item");
  const amount = num(formData, "amount");
  const date = new Date(str(formData, "date"));
  if (!item || !Number.isFinite(amount) || Number.isNaN(date.getTime())) return;

  await db.bigPurchase.create({ data: { userId, item, amount, date } });
  revalidatePath("/accounts");
}

export async function updateBigPurchase(id: string, formData: FormData) {
  const userId = await requireUserId();
  const item = str(formData, "item");
  const amount = num(formData, "amount");
  const date = new Date(str(formData, "date"));
  if (!item || !Number.isFinite(amount) || Number.isNaN(date.getTime())) return;

  await db.bigPurchase.updateMany({ where: { id, userId }, data: { item, amount, date } });
  revalidatePath("/accounts");
  redirect("/accounts?tab=purchases");
}

export async function deleteBigPurchase(id: string) {
  const userId = await requireUserId();
  await db.bigPurchase.deleteMany({ where: { id, userId } });
  revalidatePath("/accounts");
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
  redirect("/accounts?tab=ledger");
}

export async function deleteIncomeLedgerEntry(id: string) {
  const userId = await requireUserId();
  await db.incomeLedgerEntry.deleteMany({ where: { id, userId } });
  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}
