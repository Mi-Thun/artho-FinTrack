"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/** Invites expire so a leaked link doesn't grant access to household finances forever. */
const INVITE_TTL_DAYS = 14;

export async function createHousehold(formData: FormData) {
  const userId = await requireUserId();
  const name = str(formData, "name");
  if (!name) return;

  // One household per user for now — creating a second would silently orphan the first.
  const existing = await db.householdMember.findFirst({ where: { userId } });
  if (existing) return;

  await db.household.create({
    data: { name, members: { create: { userId, role: "OWNER" } } },
  });

  revalidatePath("/household");
}

async function requireOwner(userId: string) {
  return db.householdMember.findFirst({ where: { userId, role: "OWNER" }, select: { householdId: true } });
}

export async function inviteMember(formData: FormData) {
  const userId = await requireUserId();
  const owner = await requireOwner(userId);
  if (!owner) return;

  const email = str(formData, "email").toLowerCase();
  if (!email) return;

  await db.householdInvite.create({
    data: {
      householdId: owner.householdId,
      email,
      role: str(formData, "role") === "VIEWER" ? "VIEWER" : "ADULT",
      token: randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86400000),
    },
  });

  revalidatePath("/household");
}

export async function revokeInvite(id: string) {
  const userId = await requireUserId();
  const owner = await requireOwner(userId);
  if (!owner) return;
  await db.householdInvite.deleteMany({ where: { id, householdId: owner.householdId } });
  revalidatePath("/household");
}

export async function removeMember(id: string) {
  const userId = await requireUserId();
  const owner = await requireOwner(userId);
  if (!owner) return;

  // The owner cannot remove themselves — that would leave the household unadministrable.
  await db.householdMember.deleteMany({
    where: { id, householdId: owner.householdId, role: { not: "OWNER" } },
  });

  revalidatePath("/household");
}

/** Accepting an invite is how a second user joins; matched on the signed-in user's email. */
export async function acceptInvite(token: string) {
  const userId = await requireUserId();
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return;

  const invite = await db.householdInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) return;
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) return;

  await db.$transaction([
    db.householdMember.upsert({
      where: { householdId_userId: { householdId: invite.householdId, userId } },
      create: { householdId: invite.householdId, userId, role: invite.role },
      update: { role: invite.role },
    }),
    db.householdInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);

  revalidatePath("/household");
}
