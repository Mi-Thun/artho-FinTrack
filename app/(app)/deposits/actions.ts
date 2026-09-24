"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { SCHEME_KEYS, schemeDefinition, type CertificateScheme } from "@/lib/sanchayapatra";

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
 * SP is Sanchayapatra. A government scheme carries a statutory rate and tenure, so those
 * are used unless the user has typed their own — which they must for "Other / bank FDR",
 * where no statutory rate exists.
 */
function ratesFrom(formData: FormData, scheme: CertificateScheme) {
  const definition = schemeDefinition(scheme);
  const typed = (key: string): number | null => {
    const raw = str(formData, key);
    if (raw === "") return null;
    const n = Number(raw) / 100;
    return Number.isFinite(n) ? n : null;
  };
  const fallback = definition?.annualRate ?? 0;
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
      registrationNo: str(formData, "registrationNo") || null,
      ...ratesFrom(formData, scheme),
    },
  });
  revalidatePath("/deposits");
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
      registrationNo: str(formData, "registrationNo") || null,
      ...ratesFrom(formData, scheme),
    },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
  redirect("/deposits");
}

export async function deleteFixedDeposit(id: string) {
  const userId = await requireUserId();
  await db.fixedDeposit.deleteMany({ where: { id, userId } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}


/**
 * Encashing keeps the record — its profit history still belongs on a tax return — but
 * frees the scheme's investment ceiling and stops it counting toward net worth.
 */
export async function encashFixedDeposit(id: string) {
  const userId = await requireUserId();
  await db.fixedDeposit.updateMany({ where: { id, userId }, data: { encashedAt: new Date() } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function reopenFixedDeposit(id: string) {
  const userId = await requireUserId();
  await db.fixedDeposit.updateMany({ where: { id, userId }, data: { encashedAt: null } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function createDpsPlan(formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const monthlyDeposit = num(formData, "monthlyDeposit");
  const startMonthStr = str(formData, "startMonth");
  const startMonth = new Date(startMonthStr.length === 7 ? `${startMonthStr}-01` : startMonthStr);
  const tenureMonths = num(formData, "tenureMonths");
  const interestRate = num(formData, "interestRate") / 100;
  const profitTaxAtSourceStr = str(formData, "profitTaxAtSource");
  const profitTaxAtSource = profitTaxAtSourceStr === "" ? 0.1 : Number(profitTaxAtSourceStr) / 100;
  if (!label || !Number.isFinite(monthlyDeposit) || Number.isNaN(startMonth.getTime()) || !Number.isInteger(tenureMonths) || tenureMonths <= 0) {
    return;
  }

  await db.dpsPlan.create({
    data: { userId, label, monthlyDeposit, startMonth, tenureMonths, interestRate, profitTaxAtSource },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}

export async function updateDpsPlan(id: string, formData: FormData) {
  const userId = await requireUserId();
  const label = str(formData, "label");
  const monthlyDeposit = num(formData, "monthlyDeposit");
  const startMonthStr = str(formData, "startMonth");
  const startMonth = new Date(startMonthStr.length === 7 ? `${startMonthStr}-01` : startMonthStr);
  const tenureMonths = num(formData, "tenureMonths");
  const interestRate = num(formData, "interestRate") / 100;
  const profitTaxAtSourceStr = str(formData, "profitTaxAtSource");
  const profitTaxAtSource = profitTaxAtSourceStr === "" ? 0.1 : Number(profitTaxAtSourceStr) / 100;
  if (!label || !Number.isFinite(monthlyDeposit) || Number.isNaN(startMonth.getTime()) || !Number.isInteger(tenureMonths) || tenureMonths <= 0) {
    return;
  }

  await db.dpsPlan.updateMany({
    where: { id, userId },
    data: { label, monthlyDeposit, startMonth, tenureMonths, interestRate, profitTaxAtSource },
  });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
  redirect("/deposits");
}

export async function deleteDpsPlan(id: string) {
  const userId = await requireUserId();
  await db.dpsPlan.deleteMany({ where: { id, userId } });
  revalidatePath("/deposits");
  revalidatePath("/dashboard");
}
