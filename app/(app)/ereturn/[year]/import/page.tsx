import { requireUserId } from "@/lib/current-user";
import { toDateInput } from "@/lib/dates";
import { toNumber } from "@/lib/money";
import { getReturn } from "@/lib/ereturn/load";
import type { ExistingReturn } from "@/lib/ereturn/import/merge";
import { DocumentImport } from "@/components/ereturn/DocumentImport";

export default async function ImportPage({ params }: { params: Promise<{ year: string }> }) {
  const userId = await requireUserId();
  const { year } = await params;
  const { record: r } = await getReturn(userId, year);

  // What the return holds now, so the review can tell new rows from changes.
  const existing: ExistingReturn = {
    profile: Object.fromEntries(
      Object.entries({
        name: r.name,
        nid: r.nid,
        tin: r.tin,
        circle: r.circle,
        taxZone: r.taxZone,
        dateOfBirth: r.dateOfBirth ? toDateInput(r.dateOfBirth) : null,
        fatherName: r.fatherName,
        address: r.address,
        phone: r.phone,
        email: r.email,
        employerName: r.employerName,
        serialNo: r.serialNo,
        filedAt: r.filedAt ? toDateInput(r.filedAt) : null,
      }).filter(([, v]) => v),
    ),
    assets: r.financialAssets.map((a) => ({
      kind: a.kind,
      reference: a.reference,
      institution: a.institution,
      value: toNumber(a.value),
      income: toNumber(a.income),
      taxDeducted: toNumber(a.taxDeducted),
      openedDate: a.openedDate ? toDateInput(a.openedDate) : null,
    })),
    payments: r.payments.map((p) => ({ kind: p.kind, reference: p.reference, amount: toNumber(p.amount), date: p.date ? toDateInput(p.date) : null })),
    lines: Object.fromEntries(r.lines.map((l) => [l.code, toNumber(l.amount)])),
    investments: r.investments.map((i) => ({ kind: i.kind, amount: toNumber(i.amount) })),
    previousNetWealth: toNumber(r.previousNetWealth),
  };

  return <DocumentImport returnId={r.id} incomeYear={year} employerName={r.employerName} existing={existing} />;
}
