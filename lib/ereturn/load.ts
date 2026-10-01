import { cache } from "react";
import { notFound } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { computeEReturn, type EReturnInput, type EReturnResult } from "./compute";
import type { LineCode } from "./lines";
import { isIncomeYear, pickRules, type ResolvedEReturnYear } from "./rules";
import { getUserRules, rulesFor } from "./rules-db";

const withChildren = {
  lines: true,
  financialAssets: { orderBy: [{ kind: "asc" }, { openedDate: "asc" }, { createdAt: "asc" }] },
  payments: { orderBy: [{ kind: "asc" }, { date: "asc" }, { createdAt: "asc" }] },
  investments: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.TaxReturnInclude;

export type TaxReturnRecord = Prisma.TaxReturnGetPayload<{ include: typeof withChildren }>;

/** A draft is judged as if filed today; a filed return by its filing date. */
function filedOn(r: TaxReturnRecord): Date {
  if (r.filedAt) return r.filedAt;
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function toComputeInput(r: TaxReturnRecord): EReturnInput {
  return {
    incomeYear: r.incomeYear,
    resident: r.resident,
    benefits: r.benefits,
    dateOfBirth: r.dateOfBirth,
    area: r.area,
    firstReturn: r.firstReturn,
    filedOn: filedOn(r),
    lines: Object.fromEntries(r.lines.map((l) => [l.code as LineCode, toNumber(l.amount)])),
    financialAssets: r.financialAssets.map((a) => ({
      kind: a.kind,
      value: toNumber(a.value),
      income: toNumber(a.income),
      taxDeducted: toNumber(a.taxDeducted),
      openedDate: a.openedDate,
    })),
    payments: r.payments.map((p) => ({ kind: p.kind, amount: toNumber(p.amount) })),
    investments: r.investments.map((i) => ({ kind: i.kind, amount: toNumber(i.amount), date: i.date })),
    previousNetWealth: toNumber(r.previousNetWealth),
    lastYearTaxPaid: toNumber(r.lastYearTaxPaid),
    environmentalSurcharge: toNumber(r.environmentalSurcharge),
    delayInterest: toNumber(r.delayInterest),
  };
}

export interface LoadedReturn {
  record: TaxReturnRecord;
  result: EReturnResult;
  /** Amount and note of each stored line, by code. */
  line: (code: string) => { amount: number; note: string };
  /**
   * Changes whenever a section's saved lines (or, with none given, the return's own
   * fields) change. Forms that stay on the page are keyed by it, so saving remounts them
   * on the new values — while a save elsewhere on the page leaves their unsaved typing be.
   */
  version: (defs?: readonly { code: string }[]) => string;
}

function load(record: TaxReturnRecord, rules: ResolvedEReturnYear): LoadedReturn {
  const byCode = new Map(record.lines.map((l) => [l.code, l]));
  return {
    record,
    result: computeEReturn(toComputeInput(record), rules),
    line: (code) => {
      const l = byCode.get(code);
      return { amount: l ? toNumber(l.amount) : 0, note: l?.note ?? "" };
    },
    version: (defs) => {
      if (!defs) return String(record.updatedAt.getTime());
      const saved = defs.map((d) => byCode.get(d.code)).filter((l) => l != null);
      return `${saved.length}-${Math.max(0, ...saved.map((l) => l.updatedAt.getTime()))}`;
    },
  };
}

/**
 * The user's return for an income year, computed. Cached per request so the layout and
 * the tab it wraps share one query; a missing or malformed year is a 404.
 */
export const getReturn = cache(async (userId: string, incomeYear: string): Promise<LoadedReturn> => {
  if (!isIncomeYear(incomeYear)) notFound();
  const record = await db.taxReturn.findUnique({
    where: { userId_incomeYear: { userId, incomeYear } },
    include: withChildren,
  });
  if (!record) notFound();
  return load(record, await rulesFor(userId, incomeYear));
});

/** Every return the user has, newest year first, computed for the list page. */
export async function listReturns(userId: string): Promise<LoadedReturn[]> {
  const [records, rules] = await Promise.all([
    db.taxReturn.findMany({ where: { userId }, include: withChildren, orderBy: { incomeYear: "desc" } }),
    getUserRules(userId),
  ]);
  return records.map((r) => {
    const resolved = pickRules(rules, r.incomeYear);
    if (!resolved) throw new Error("No tax rules are stored. Apply the database migrations (npm run db:migrate).");
    return load(r, resolved);
  });
}
