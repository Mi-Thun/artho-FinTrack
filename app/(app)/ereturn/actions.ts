"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { money, ZERO } from "@/lib/money";
import { computeEReturn } from "@/lib/ereturn/compute";
import { toComputeInput } from "@/lib/ereturn/load";
import {
  FINANCIAL_ASSET_KINDS,
  FUND_LINES,
  INVESTMENT_KINDS,
  LINE_SECTIONS,
  TAX_PAYMENT_KINDS,
  isKind,
  isLineSection,
} from "@/lib/ereturn/lines";
import { MINIMUM_TAX_AREAS, TAXPAYER_BENEFITS, isIncomeYear, type TaxpayerBenefit } from "@/lib/ereturn/rules";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}
function optional(formData: FormData, key: string): string | null {
  return str(formData, key) || null;
}
/** An amount as an exact Decimal; blank or garbage is 0, negatives are 0. */
function amount(formData: FormData, key: string) {
  const value = money(str(formData, key));
  return value.isNegative() ? ZERO : value;
}
function optionalDate(formData: FormData, key: string): Date | null {
  const raw = str(formData, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The return, if it's the signed-in user's. Every write goes through this. */
async function ownedReturn(returnId: string) {
  const userId = await requireUserId();
  const found = await db.taxReturn.findFirst({ where: { id: returnId, userId }, select: { id: true, incomeYear: true } });
  if (!found) throw new Error("Return not found");
  return found;
}

function refresh(incomeYear: string) {
  revalidatePath("/ereturn");
  revalidatePath(`/ereturn/${incomeYear}`, "layout");
  revalidatePath(`/ereturn-print/${incomeYear}`);
}

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

/**
 * Starts a return for an income year. With `copyFrom`, the earlier return's taxpayer
 * details, assets and liabilities carry over — the things that are still true a year
 * later — and its closing net wealth becomes this year's opening figure. Income, tax and
 * expenses start empty: they're this year's to enter.
 */
export async function createReturn(formData: FormData) {
  const userId = await requireUserId();
  const incomeYear = str(formData, "incomeYear");
  if (!isIncomeYear(incomeYear)) return;

  const existing = await db.taxReturn.findUnique({ where: { userId_incomeYear: { userId, incomeYear } }, select: { id: true } });
  if (existing) redirect(`/ereturn/${incomeYear}`);

  const copyFrom = str(formData, "copyFrom");
  const source =
    copyFrom && isIncomeYear(copyFrom)
      ? await db.taxReturn.findUnique({
          where: { userId_incomeYear: { userId, incomeYear: copyFrom } },
          include: { lines: true, financialAssets: true, payments: true, investments: true },
        })
      : null;

  if (source) {
    const closing = computeEReturn(toComputeInput(source)).wealth;
    // Carry forward what the taxpayer declared owning; the computed net wealth if the
    // statement balanced, else the declared assets less liabilities.
    const previousNetWealth = closing.difference === 0 ? closing.netWealth : closing.assets.total - closing.liabilities.total;
    await db.taxReturn.create({
      data: {
        userId,
        incomeYear,
        name: source.name,
        nid: source.nid,
        tin: source.tin,
        circle: source.circle,
        taxZone: source.taxZone,
        resident: source.resident,
        benefits: source.benefits,
        dateOfBirth: source.dateOfBirth,
        fatherName: source.fatherName,
        spouseName: source.spouseName,
        spouseTin: source.spouseTin,
        address: source.address,
        phone: source.phone,
        email: source.email,
        employerName: source.employerName,
        businessName: source.businessName,
        bin: source.bin,
        area: source.area,
        previousNetWealth,
        lines: {
          create: source.lines
            .filter((l) => l.code.startsWith("asset.") || l.code.startsWith("liability."))
            .map((l) => ({ code: l.code, amount: l.amount, note: l.note })),
        },
        financialAssets: {
          create: source.financialAssets.map((a) => ({
            kind: a.kind,
            institution: a.institution,
            branch: a.branch,
            reference: a.reference,
            description: a.description,
            openedDate: a.openedDate,
            value: a.value,
          })),
        },
      },
    });
  } else {
    // Without an earlier return, the name and email from the account are a start.
    const user = await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
    await db.taxReturn.create({ data: { userId, incomeYear, name: (user?.name ?? "").toUpperCase(), email: user?.email ?? null } });
  }

  refresh(incomeYear);
  redirect(`/ereturn/${incomeYear}`);
}

export async function deleteReturn(returnId: string) {
  const { id, incomeYear } = await ownedReturn(returnId);
  await db.taxReturn.delete({ where: { id } });
  refresh(incomeYear);
  redirect("/ereturn");
}

export async function markFiled(returnId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  await db.taxReturn.update({
    where: { id },
    data: { status: "FILED", filedAt: optionalDate(formData, "filedAt") ?? new Date(), serialNo: optional(formData, "serialNo") },
  });
  refresh(incomeYear);
}

export async function reopenReturn(returnId: string) {
  const { id, incomeYear } = await ownedReturn(returnId);
  await db.taxReturn.update({ where: { id }, data: { status: "DRAFT" } });
  refresh(incomeYear);
}

// ---------------------------------------------------------------------------
// Taxpayer details
// ---------------------------------------------------------------------------

export async function updateTaxpayer(returnId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  const benefits = formData
    .getAll("benefits")
    .map(String)
    .filter((b): b is TaxpayerBenefit => (TAXPAYER_BENEFITS as readonly string[]).includes(b));
  const area = str(formData, "area");
  const tin = str(formData, "tin").replace(/\D/g, "");

  await db.taxReturn.update({
    where: { id },
    data: {
      name: str(formData, "name").toUpperCase(),
      nid: optional(formData, "nid"),
      tin: tin || null,
      circle: optional(formData, "circle"),
      taxZone: optional(formData, "taxZone"),
      resident: str(formData, "resident") !== "NO",
      benefits: [...new Set(benefits)],
      dateOfBirth: optionalDate(formData, "dateOfBirth"),
      fatherName: optional(formData, "fatherName"),
      spouseName: optional(formData, "spouseName"),
      spouseTin: optional(formData, "spouseTin"),
      address: optional(formData, "address"),
      phone: optional(formData, "phone"),
      email: optional(formData, "email"),
      employerName: optional(formData, "employerName"),
      businessName: optional(formData, "businessName"),
      bin: optional(formData, "bin"),
      area: (MINIMUM_TAX_AREAS as readonly string[]).includes(area) ? (area as (typeof MINIMUM_TAX_AREAS)[number]) : undefined,
      serialNo: optional(formData, "serialNo"),
      filedAt: optionalDate(formData, "filedAt"),
    },
  });
  refresh(incomeYear);
}

// ---------------------------------------------------------------------------
// Fixed form lines
// ---------------------------------------------------------------------------

async function writeLines(returnId: string, defs: readonly { code: string; withNote?: boolean }[], formData: FormData) {
  await db.$transaction(
    defs.map((def) => {
      const value = amount(formData, `line:${def.code}`);
      const note = def.withNote ? optional(formData, `note:${def.code}`) : null;
      // A row at zero with nothing to say isn't stored, so a cleared field clears the row.
      if (value.isZero() && !note) return db.taxReturnLine.deleteMany({ where: { returnId, code: def.code } });
      return db.taxReturnLine.upsert({
        where: { returnId_code: { returnId, code: def.code } },
        create: { returnId, code: def.code, amount: value, note },
        update: { amount: value, note },
      });
    }),
  );
}

/** Saves one section's lines — only that section's, so other forms' rows are untouched. */
export async function saveLines(returnId: string, section: string, formData: FormData) {
  if (!isLineSection(section)) return;
  const { id, incomeYear } = await ownedReturn(returnId);
  await writeLines(id, LINE_SECTIONS[section], formData);
  refresh(incomeYear);
}

/** IT-10B's opening position: last year's net wealth, gifts received, and other outgoings. */
export async function saveWealthBasics(returnId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  await db.taxReturn.update({
    where: { id },
    data: { previousNetWealth: amount(formData, "previousNetWealth"), lastYearTaxPaid: amount(formData, "lastYearTaxPaid") },
  });
  await writeLines(id, FUND_LINES, formData);
  refresh(incomeYear);
}

export async function saveTaxAdjustments(returnId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  await db.taxReturn.update({
    where: { id },
    data: { environmentalSurcharge: amount(formData, "environmentalSurcharge"), delayInterest: amount(formData, "delayInterest") },
  });
  refresh(incomeYear);
}

// ---------------------------------------------------------------------------
// Bank accounts, Sanchayapatra and other financial assets
// ---------------------------------------------------------------------------

function financialAssetData(formData: FormData) {
  const kind = str(formData, "kind");
  const institution = str(formData, "institution");
  if (!isKind(FINANCIAL_ASSET_KINDS, kind) || !institution) return null;
  return {
    kind,
    institution,
    branch: optional(formData, "branch"),
    reference: optional(formData, "reference"),
    description: optional(formData, "description"),
    openedDate: optionalDate(formData, "openedDate"),
    value: amount(formData, "value"),
    income: amount(formData, "income"),
    taxDeducted: amount(formData, "taxDeducted"),
  };
}

export async function addFinancialAsset(returnId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  const data = financialAssetData(formData);
  if (!data) return;
  await db.taxFinancialAsset.create({ data: { ...data, returnId: id } });
  refresh(incomeYear);
}

export async function updateFinancialAsset(returnId: string, assetId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  const data = financialAssetData(formData);
  if (!data) return;
  await db.taxFinancialAsset.updateMany({ where: { id: assetId, returnId: id }, data });
  refresh(incomeYear);
  redirect(`/ereturn/${incomeYear}/income`);
}

export async function deleteFinancialAsset(returnId: string, assetId: string) {
  const { id, incomeYear } = await ownedReturn(returnId);
  await db.taxFinancialAsset.deleteMany({ where: { id: assetId, returnId: id } });
  refresh(incomeYear);
}

// ---------------------------------------------------------------------------
// Tax payments (challans)
// ---------------------------------------------------------------------------

function paymentData(formData: FormData) {
  const kind = str(formData, "kind");
  const value = amount(formData, "amount");
  if (!isKind(TAX_PAYMENT_KINDS, kind) || value.isZero()) return null;
  return {
    kind,
    amount: value,
    reference: optional(formData, "reference"),
    date: optionalDate(formData, "date"),
    depositedBy: optional(formData, "depositedBy"),
    bank: optional(formData, "bank"),
    branch: optional(formData, "branch"),
    note: optional(formData, "note"),
  };
}

export async function addPayment(returnId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  const data = paymentData(formData);
  if (!data) return;
  await db.taxPayment.create({ data: { ...data, returnId: id } });
  refresh(incomeYear);
}

export async function updatePayment(returnId: string, paymentId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  const data = paymentData(formData);
  if (!data) return;
  await db.taxPayment.updateMany({ where: { id: paymentId, returnId: id }, data });
  refresh(incomeYear);
  redirect(`/ereturn/${incomeYear}/tax`);
}

export async function deletePayment(returnId: string, paymentId: string) {
  const { id, incomeYear } = await ownedReturn(returnId);
  await db.taxPayment.deleteMany({ where: { id: paymentId, returnId: id } });
  refresh(incomeYear);
}

// ---------------------------------------------------------------------------
// Rebatable investments (Schedule 5)
// ---------------------------------------------------------------------------

function investmentData(formData: FormData) {
  const kind = str(formData, "kind");
  const value = amount(formData, "amount");
  if (!isKind(INVESTMENT_KINDS, kind) || value.isZero()) return null;
  return { kind, amount: value, description: optional(formData, "description"), date: optionalDate(formData, "date") };
}

export async function addInvestment(returnId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  const data = investmentData(formData);
  if (!data) return;
  await db.taxRebateInvestment.create({ data: { ...data, returnId: id } });
  refresh(incomeYear);
}

export async function updateInvestment(returnId: string, investmentId: string, formData: FormData) {
  const { id, incomeYear } = await ownedReturn(returnId);
  const data = investmentData(formData);
  if (!data) return;
  await db.taxRebateInvestment.updateMany({ where: { id: investmentId, returnId: id }, data });
  refresh(incomeYear);
  redirect(`/ereturn/${incomeYear}/tax`);
}

export async function deleteInvestment(returnId: string, investmentId: string) {
  const { id, incomeYear } = await ownedReturn(returnId);
  await db.taxRebateInvestment.deleteMany({ where: { id: investmentId, returnId: id } });
  refresh(incomeYear);
}
