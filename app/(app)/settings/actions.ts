"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";

function pick<T extends string>(value: FormDataEntryValue | null, allowed: readonly T[], fallback: T): T {
  const s = String(value ?? "");
  return (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

export async function savePreferences(formData: FormData) {
  const userId = await requireUserId();

  const data = {
    language: pick(formData.get("language"), ["EN", "BN"] as const, "EN"),
    numerals: pick(formData.get("numerals"), ["WESTERN", "BENGALI"] as const, "WESTERN"),
    financeMode: pick(formData.get("financeMode"), ["CONVENTIONAL", "ISLAMIC"] as const, "CONVENTIONAL"),
  };

  await db.userPreferences.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  // Preferences change formatting on every page, so invalidate the whole tree.
  revalidatePath("/", "layout");
}

export type PinState = { error?: string; success?: string };

/**
 * The app PIN is a second, lighter lock on top of the session — for handing your phone
 * to someone, not for authentication. It is hashed like a password because people reuse
 * PINs across apps and a plaintext one would leak more than this app's data.
 */
export async function setPin(_prev: PinState, formData: FormData): Promise<PinState> {
  const userId = await requireUserId();
  const pin = String(formData.get("pin") ?? "");
  const confirm = String(formData.get("confirmPin") ?? "");

  if (!/^\d{4,8}$/.test(pin)) return { error: "PIN must be 4 to 8 digits." };
  if (pin !== confirm) return { error: "The two PINs don't match." };

  const pinHash = await bcrypt.hash(pin, 10);
  await db.userPreferences.upsert({
    where: { userId },
    create: { userId, pinHash },
    update: { pinHash },
  });

  revalidatePath("/settings");
  return { success: "PIN set." };
}

export async function clearPin() {
  const userId = await requireUserId();
  await db.userPreferences.updateMany({ where: { userId }, data: { pinHash: null } });
  revalidatePath("/settings");
}
