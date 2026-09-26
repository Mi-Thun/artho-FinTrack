"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { SCHEME_KEYS, schemeDefinition, type CertificateScheme } from "@/lib/sanchayapatra";
import { percentToRate } from "@/lib/rates";

function num(formData: FormData, key: string): number {
  return Number(formData.get(key));
}
function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}


function schemeOf(value: string): CertificateScheme {
  return (SCHEME_KEYS as string[]).includes(value) ? (value as CertificateScheme) : "OTHER";
}

/**
 * SP is Sanchayapatra. A government scheme carries a statutory rate and tenure, used unless
 * the user typed their own: one `rate` for every year (adding a scheme SP), or a rate per
 * year (older forms). The forms now send one `rate`; profit is worked out at year 3.
 */
function ratesFrom(formData: FormData, scheme: CertificateScheme) {
  const definition = schemeDefinition(scheme);
  const typed = (key: string): number | null => percentToRate(str(formData, key));
  const fallback = typed("rate") ?? definition?.annualRate ?? 0;
  return {
    rateY1: typed("rateY1") ?? fallback,
    rateY2: typed("rateY2") ?? fallback,
    rateY3: typed("rateY3") ?? fallback,
    termMonths: num(formData, "termMonths") || definition?.tenureMonths || 36,
  };
}

export async function createFixedDeposit(formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const principal = num(formData, "principal");
  const openedDate = new Date(str(formData, "openedDate"));
  if (!label || !Number.isFinite(principal) || Number.isNaN(openedDate.getTime())) return;

  const scheme = schemeOf(str(formData, "scheme"));

  await db.fixedDeposit.create({
    data: {
      userId,
      label,
      principal,
      openedDate,
      scheme,
      holderType: str(formData, "holderType") === "JOINT" ? "JOINT" : "SINGLE",
      ...ratesFrom(formData, scheme),
    },
  });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
}

export async function updateFixedDeposit(id: string, formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const principal = num(formData, "principal");
  const openedDate = new Date(str(formData, "openedDate"));
  if (!label || !Number.isFinite(principal) || Number.isNaN(openedDate.getTime())) return;

  const scheme = schemeOf(str(formData, "scheme"));

  await db.fixedDeposit.updateMany({
    where: { id, userId },
    data: {
      label,
      principal,
      openedDate,
      scheme,
      holderType: str(formData, "holderType") === "JOINT" ? "JOINT" : "SINGLE",
      ...ratesFrom(formData, scheme),
    },
  });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  redirect("/investments");
}

export async function deleteFixedDeposit(id: string) {
  const userId = await requireUserId();
  await db.fixedDeposit.deleteMany({ where: { id, userId } });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
}


/**
 * Encashing keeps the record — its profit history still belongs on a tax return — but
 * frees the scheme's investment ceiling and stops it counting toward net worth.
 */
export async function encashFixedDeposit(id: string) {
  const userId = await requireUserId();
  await db.fixedDeposit.updateMany({ where: { id, userId }, data: { encashedAt: new Date() } });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
}

export async function reopenFixedDeposit(id: string) {
  const userId = await requireUserId();
  await db.fixedDeposit.updateMany({ where: { id, userId }, data: { encashedAt: null } });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
}

export async function createDpsPlan(formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const monthlyDeposit = num(formData, "monthlyDeposit");
  const startMonthStr = str(formData, "startMonth");
  const startMonth = new Date(startMonthStr.length === 7 ? `${startMonthStr}-01` : startMonthStr);
  const tenureMonths = num(formData, "tenureMonths");
  const interestRate = percentToRate(str(formData, "interestRate")) ?? NaN;
  const profitTaxAtSource = percentToRate(str(formData, "profitTaxAtSource")) ?? 0.1;
  if (!label || !Number.isFinite(interestRate) || !Number.isFinite(monthlyDeposit) || Number.isNaN(startMonth.getTime()) || !Number.isInteger(tenureMonths) || tenureMonths <= 0) {
    return;
  }

  await db.dpsPlan.create({
    data: { userId, label, monthlyDeposit, startMonth, tenureMonths, interestRate, profitTaxAtSource },
  });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
}

export async function updateDpsPlan(id: string, formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const monthlyDeposit = num(formData, "monthlyDeposit");
  const startMonthStr = str(formData, "startMonth");
  const startMonth = new Date(startMonthStr.length === 7 ? `${startMonthStr}-01` : startMonthStr);
  const tenureMonths = num(formData, "tenureMonths");
  const interestRate = percentToRate(str(formData, "interestRate")) ?? NaN;
  const profitTaxAtSource = percentToRate(str(formData, "profitTaxAtSource")) ?? 0.1;
  if (!label || !Number.isFinite(interestRate) || !Number.isFinite(monthlyDeposit) || Number.isNaN(startMonth.getTime()) || !Number.isInteger(tenureMonths) || tenureMonths <= 0) {
    return;
  }

  await db.dpsPlan.updateMany({
    where: { id, userId },
    data: { label, monthlyDeposit, startMonth, tenureMonths, interestRate, profitTaxAtSource },
  });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
  redirect("/investments?tab=dps");
}

export async function deleteDpsPlan(id: string) {
  const userId = await requireUserId();
  await db.dpsPlan.deleteMany({ where: { id, userId } });
  revalidatePath("/investments");
  revalidatePath("/dashboard");
}
