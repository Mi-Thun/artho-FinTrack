"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { FINANCIAL_ASSET_KINDS, INVESTMENT_KINDS, LINE_SECTIONS, TAX_PAYMENT_KINDS, isKind, type LineCode } from "@/lib/ereturn/lines";
import { PROFILE_FIELDS, type ProfileField, type Proposal } from "@/lib/ereturn/import/types";
import { referenceKey } from "@/lib/ereturn/import/merge";

// Applies what the taxpayer kept on the import review. The documents themselves never
// reach the server — they're read in the browser — so this receives only proposals, and
// treats them as untrusted input: every field is checked before it's written.

const LINE_CODES = new Set<string>(Object.values(LINE_SECTIONS).flatMap((defs) => defs.map((d) => d.code)));

const text = (v: unknown, max = 200): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const amount = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e12 ? v : undefined);
const date = (v: unknown): Date | undefined => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** Only the proposals that are well-formed, reshaped from scratch so nothing extra rides along. */
function validate(input: unknown): Proposal[] {
  if (!Array.isArray(input)) return [];
  const out: Proposal[] = [];
  for (const raw of input.slice(0, 500)) {
    if (typeof raw !== "object" || raw === null) continue;
    const p = raw as Record<string, unknown>;
    switch (p.type) {
      case "profile": {
        const value = text(p.value);
        if (typeof p.field === "string" && Object.hasOwn(PROFILE_FIELDS, p.field) && value) out.push({ type: "profile", field: p.field as ProfileField, value });
        break;
      }
      case "asset": {
        const institution = text(p.institution) ?? "Unknown";
        if (typeof p.kind === "string" && isKind(FINANCIAL_ASSET_KINDS, p.kind))
          out.push({
            type: "asset",
            kind: p.kind,
            institution,
            branch: text(p.branch),
            reference: text(p.reference, 60),
            description: text(p.description),
            openedDate: date(p.openedDate) ? (p.openedDate as string) : undefined,
            value: amount(p.value),
            income: amount(p.income),
            taxDeducted: amount(p.taxDeducted),
          });
        break;
      }
      case "payment": {
        const reference = text(p.reference, 60);
        const value = amount(p.amount);
        if (typeof p.kind === "string" && isKind(TAX_PAYMENT_KINDS, p.kind) && reference && value)
          out.push({
            type: "payment",
            kind: p.kind,
            reference,
            amount: value,
            date: date(p.date) ? (p.date as string) : undefined,
            depositedBy: text(p.depositedBy),
            bank: text(p.bank),
            branch: text(p.branch),
            note: text(p.note),
          });
        break;
      }
      case "line": {
        const value = amount(p.amount);
        if (typeof p.code === "string" && LINE_CODES.has(p.code) && value != null) out.push({ type: "line", code: p.code as LineCode, amount: value, note: text(p.note) });
        break;
      }
      case "investment": {
        const value = amount(p.amount);
        if (typeof p.kind === "string" && isKind(INVESTMENT_KINDS, p.kind) && value) out.push({ type: "investment", kind: p.kind, amount: value, description: text(p.description) });
        break;
      }
      case "previousNetWealth": {
        const value = amount(p.amount);
        if (value != null) out.push({ type: "previousNetWealth", amount: value });
        break;
      }
    }
  }
  return out;
}

export interface ImportOutcome {
  created: number;
  updated: number;
}

/**
 * Writes the kept proposals into the return. Accounts, certificates and challans are
 * matched to rows already there by their number, so importing the same document twice
 * updates rather than duplicates; a figure a document doesn't give is left as it was.
 */
export async function importProposals(returnId: string, input: unknown): Promise<ImportOutcome> {
  const userId = await requireUserId();
  const ret = await db.taxReturn.findFirst({
    where: { id: returnId, userId },
    include: { financialAssets: true, payments: true },
  });
  if (!ret) throw new Error("Return not found");
  const proposals = validate(input);
  let created = 0;
  let updated = 0;

  await db.$transaction(async (tx) => {
    // ── Taxpayer details and opening net wealth: one update ──
    const profile: Record<string, string | Date | null> = {};
    for (const p of proposals) {
      if (p.type !== "profile") continue;
      if (p.field === "dateOfBirth" || p.field === "filedAt") profile[p.field] = date(p.value) ?? null;
      else if (p.field === "tin") profile.tin = p.value.replace(/\D/g, "") || null;
      else if (p.field === "name") profile.name = p.value.toUpperCase();
      else profile[p.field] = p.value;
    }
    const wealth = proposals.find((p) => p.type === "previousNetWealth");
    if (Object.keys(profile).length > 0 || wealth) {
      await tx.taxReturn.update({
        where: { id: ret.id },
        data: { ...profile, ...(wealth ? { previousNetWealth: wealth.amount } : {}) },
      });
      updated++;
    }

    // ── Accounts and certificates ──
    for (const p of proposals) {
      if (p.type !== "asset") continue;
      const ref = referenceKey(p.reference);
      const match = ret.financialAssets.find((a) =>
        ref ? referenceKey(a.reference) === ref : a.kind === p.kind && a.institution.toLowerCase() === p.institution.toLowerCase(),
      );
      const fields = {
        kind: p.kind,
        ...(p.branch ? { branch: p.branch } : {}),
        ...(p.description ? { description: p.description } : {}),
        ...(p.openedDate ? { openedDate: date(p.openedDate) } : {}),
        ...(p.value != null ? { value: p.value } : {}),
        ...(p.income != null ? { income: p.income } : {}),
        ...(p.taxDeducted != null ? { taxDeducted: p.taxDeducted } : {}),
      };
      if (match) {
        // Keep a named institution over a return's generic "Sanchayapatra".
        const institution = p.institution !== "Sanchayapatra" && p.institution !== "Unknown" ? { institution: p.institution } : {};
        await tx.taxFinancialAsset.update({ where: { id: match.id }, data: { ...fields, ...institution } });
        updated++;
      } else {
        await tx.taxFinancialAsset.create({ data: { ...fields, returnId: ret.id, institution: p.institution, reference: p.reference ?? null } });
        created++;
      }
    }

    // ── Challans ──
    for (const p of proposals) {
      if (p.type !== "payment") continue;
      const match = ret.payments.find((x) => referenceKey(x.reference) === referenceKey(p.reference));
      const data = {
        kind: p.kind,
        amount: p.amount,
        ...(p.date ? { date: date(p.date) } : {}),
        ...(p.depositedBy ? { depositedBy: p.depositedBy } : {}),
        ...(p.bank ? { bank: p.bank } : {}),
        ...(p.branch ? { branch: p.branch } : {}),
        ...(p.note ? { note: p.note } : {}),
      };
      if (match) {
        await tx.taxPayment.update({ where: { id: match.id }, data });
        updated++;
      } else {
        await tx.taxPayment.create({ data: { ...data, returnId: ret.id, reference: p.reference } });
        created++;
      }
    }

    // ── Form lines ──
    for (const p of proposals) {
      if (p.type !== "line") continue;
      const existing = await tx.taxReturnLine.findUnique({ where: { returnId_code: { returnId: ret.id, code: p.code } } });
      await tx.taxReturnLine.upsert({
        where: { returnId_code: { returnId: ret.id, code: p.code } },
        create: { returnId: ret.id, code: p.code, amount: p.amount, note: p.note ?? null },
        update: { amount: p.amount, ...(p.note ? { note: p.note } : {}) },
      });
      if (existing) updated++;
      else created++;
    }

    // ── Rebate investments: a document gives each kind's total, which replaces that kind ──
    for (const p of proposals) {
      if (p.type !== "investment") continue;
      const removed = await tx.taxRebateInvestment.deleteMany({ where: { returnId: ret.id, kind: p.kind } });
      await tx.taxRebateInvestment.create({ data: { returnId: ret.id, kind: p.kind, amount: p.amount, description: p.description ?? "From imported return" } });
      if (removed.count > 0) updated++;
      else created++;
    }
  });

  revalidatePath("/ereturn");
  revalidatePath(`/ereturn/${ret.incomeYear}`, "layout");
  revalidatePath(`/ereturn-print/${ret.incomeYear}`);
  return { created, updated };
}
