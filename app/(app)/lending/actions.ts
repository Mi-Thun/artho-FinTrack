"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function num(formData: FormData, key: string): number {
  const n = Number(formData.get(key));
  return Number.isFinite(n) ? n : 0;
}
function optionalDate(formData: FormData, key: string): Date | null {
  const raw = str(formData, key);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createPersonalLoan(formData: FormData) {
  const userId = await requireUserId();
  const counterparty = str(formData, "counterparty");
  const principal = num(formData, "principal");
  const date = optionalDate(formData, "date") ?? new Date();
  if (!counterparty || principal <= 0) return;

  await db.personalLoan.create({
    data: {
      userId,
      counterparty,
      direction: str(formData, "direction") === "BORROWED" ? "BORROWED" : "LENT",
      principal,
      date,
      dueDate: optionalDate(formData, "dueDate"),
      note: str(formData, "note") || null,
    },
  });

  revalidatePath("/lending");
}

export async function recordLoanPayment(formData: FormData) {
  const userId = await requireUserId();
  const personalLoanId = str(formData, "personalLoanId");
  const amount = num(formData, "amount");
  if (!personalLoanId || amount <= 0) return;

  // Confirm ownership before writing a child row.
  const loan = await db.personalLoan.findFirst({ where: { id: personalLoanId, userId }, select: { id: true } });
  if (!loan) return;

  await db.personalLoanPayment.create({
    data: {
      personalLoanId,
      date: optionalDate(formData, "date") ?? new Date(),
      amount,
      note: str(formData, "note") || null,
    },
  });

  revalidatePath("/lending");
}

/** Marks a debt closed even if the arithmetic doesn't balance — informal debts get forgiven. */
export async function settlePersonalLoan(id: string) {
  const userId = await requireUserId();
  await db.personalLoan.updateMany({ where: { id, userId }, data: { settledAt: new Date() } });
  revalidatePath("/lending");
}

export async function reopenPersonalLoan(id: string) {
  const userId = await requireUserId();
  await db.personalLoan.updateMany({ where: { id, userId }, data: { settledAt: null } });
  revalidatePath("/lending");
}

export async function deletePersonalLoan(id: string) {
  const userId = await requireUserId();
  await db.personalLoan.deleteMany({ where: { id, userId } });
  revalidatePath("/lending");
}
