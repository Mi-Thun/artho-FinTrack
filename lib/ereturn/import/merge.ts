import type { FinancialAssetKind, InvestmentKind, TaxPaymentKind } from "../lines";
import { SOURCE_RANK, type ParsedDocument, type ProfileField, type Proposal } from "./types";

// Several documents often describe the same thing — an account appears in its statement,
// its tax certificate and last year's return. Merging keeps one proposal per thing, each
// field taken from the most authoritative document that has it, and compares the result
// with what the return already holds so the review shows only real changes as selected.

/** What the return already contains, as plain data the browser can compare against. */
export interface ExistingReturn {
  profile: Partial<Record<ProfileField, string>>;
  assets: { kind: FinancialAssetKind; reference: string | null; institution: string; value: number; income: number; taxDeducted: number; openedDate: string | null }[];
  payments: { kind: TaxPaymentKind; reference: string | null; amount: number; date: string | null }[];
  lines: Record<string, number>;
  investments: { kind: InvestmentKind; amount: number }[];
  previousNetWealth: number;
}

export type ReviewStatus = "new" | "update" | "same";

export interface ReviewItem {
  key: string;
  proposal: Proposal;
  /** File names it came from. */
  sources: string[];
  /** Any of its figures came from OCR. */
  ocr: boolean;
  status: ReviewStatus;
}

/** Account and registration numbers compared by their digits and dashes only. */
export function referenceKey(reference: string | null | undefined): string {
  return (reference ?? "").replace(/[^\dA-Za-z-]/g, "").toUpperCase();
}

function keyOf(p: Proposal): string {
  switch (p.type) {
    case "profile":
      return `profile:${p.field}`;
    case "asset":
      return `asset:${referenceKey(p.reference) || `${p.kind}:${p.institution.toLowerCase()}`}`;
    case "payment":
      return `payment:${referenceKey(p.reference)}`;
    case "line":
      return `line:${p.code}`;
    case "investment":
      return `investment:${p.kind}`;
    case "previousNetWealth":
      return "previousNetWealth";
  }
}

const same = (a: number | undefined | null, b: number | undefined | null) => a == null || b == null || Math.abs(a - b) < 0.005;

function statusOf(p: Proposal, existing: ExistingReturn): ReviewStatus {
  switch (p.type) {
    case "profile": {
      const current = existing.profile[p.field];
      if (!current) return "new";
      return current.trim().toLowerCase() === p.value.trim().toLowerCase() ? "same" : "update";
    }
    case "asset": {
      const ref = referenceKey(p.reference);
      const match = existing.assets.find((a) =>
        ref ? referenceKey(a.reference) === ref : a.kind === p.kind && a.institution.toLowerCase() === p.institution.toLowerCase(),
      );
      if (!match) return "new";
      const unchanged =
        same(p.value, match.value) &&
        same(p.income, match.income) &&
        same(p.taxDeducted, match.taxDeducted) &&
        (p.openedDate == null || p.openedDate === match.openedDate);
      return unchanged ? "same" : "update";
    }
    case "payment": {
      const match = existing.payments.find((x) => referenceKey(x.reference) === referenceKey(p.reference));
      if (!match) return "new";
      return same(p.amount, match.amount) && (p.date == null || p.date === match.date) ? "same" : "update";
    }
    case "line": {
      const current = existing.lines[p.code];
      if (current == null) return "new";
      return same(current, p.amount) ? "same" : "update";
    }
    case "investment": {
      const rows = existing.investments.filter((i) => i.kind === p.kind);
      if (rows.length === 0) return "new";
      return same(
        rows.reduce((s, i) => s + i.amount, 0),
        p.amount,
      )
        ? "same"
        : "update";
    }
    case "previousNetWealth":
      return existing.previousNetWealth === 0 ? "new" : same(existing.previousNetWealth, p.amount) ? "same" : "update";
  }
}

/** Fields of the higher-ranked proposal win; the lower one only fills gaps. */
function combine(high: Proposal, low: Proposal): Proposal {
  if (high.type === "asset" && low.type === "asset") {
    const merged = { ...high };
    for (const [k, v] of Object.entries(low)) {
      if (v != null && (merged as Record<string, unknown>)[k] == null) (merged as Record<string, unknown>)[k] = v;
    }
    // A named bank beats the generic "Sanchayapatra" placeholder a return uses.
    if (merged.institution === "Sanchayapatra" && low.institution !== "Sanchayapatra") merged.institution = low.institution;
    return merged;
  }
  if (high.type === "payment" && low.type === "payment") {
    return { ...low, ...Object.fromEntries(Object.entries(high).filter(([, v]) => v != null)) } as Proposal;
  }
  return high;
}

export function mergeDocuments(docs: readonly { fileName: string; parsed: ParsedDocument }[], existing: ExistingReturn): ReviewItem[] {
  const byKey = new Map<string, { proposal: Proposal; rank: number; sources: string[]; ocr: boolean }>();
  // Highest-ranked documents first, so each key starts from its best source.
  const ranked = docs
    .flatMap((d) =>
      d.parsed.proposals.map((proposal) => ({
        proposal,
        fileName: d.fileName,
        ocr: d.parsed.ocr,
        // Text beats a scan of the same thing: OCR can misread a digit.
        rank: (d.parsed.rankOverride ?? SOURCE_RANK[d.parsed.kind]) - (d.parsed.ocr ? 0.5 : 0),
      })),
    )
    .sort((a, b) => b.rank - a.rank);

  for (const { proposal, fileName, ocr, rank } of ranked) {
    const key = keyOf(proposal);
    const found = byKey.get(key);
    if (!found) {
      byKey.set(key, { proposal, rank, sources: [fileName], ocr });
      continue;
    }
    found.proposal = combine(found.proposal, proposal);
    if (!found.sources.includes(fileName)) found.sources.push(fileName);
    // OCR matters only if an OCR document is the one supplying the figures.
    found.ocr = found.ocr && ocr;
  }

  const order: Proposal["type"][] = ["profile", "previousNetWealth", "asset", "payment", "line", "investment"];
  return [...byKey.entries()]
    .map(([key, v]) => ({ key, proposal: v.proposal, sources: v.sources, ocr: v.ocr, status: statusOf(v.proposal, existing) }))
    .sort((a, b) => order.indexOf(a.proposal.type) - order.indexOf(b.proposal.type));
}
