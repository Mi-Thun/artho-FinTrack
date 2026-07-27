"use server";

import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/categories";

export type RegisterState = { error?: string };

export async function registerUser(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!email || !password) return { error: "Email and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await bcrypt.hash(password, 10);

  await db.user.create({
    data: {
      email,
      passwordHash,
      name: name || null,
      categories: {
        create: [
          ...DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name, kind: "EXPENSE" as const })),
          ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ name, kind: "INCOME" as const })),
        ],
      },
    },
  });

  await signIn("credentials", { email, password, redirectTo: "/dashboard" });

  return {};
}
