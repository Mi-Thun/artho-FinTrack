"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";

/**
 * The Income ledger is now built from income transactions. Entries typed into the old
 * manual ledger are no longer shown or counted; this removes them once the user has
 * their income in Transactions. They're still in any backup taken before.
 */
export async function deleteOldIncomeLedgerEntries() {
  const userId = await requireUserId();
  await db.incomeLedgerEntry.deleteMany({ where: { userId } });
  revalidatePath("/income-ledger");
  revalidatePath("/dashboard");
}
