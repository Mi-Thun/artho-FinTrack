import Link from "next/link";
import { Landmark, Pencil, Trash2 } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { toDateInput } from "@/lib/dates";
import { sumBy, toNumber } from "@/lib/money";
import { getReturn } from "@/lib/ereturn/load";
import { FINANCIAL_ASSET_KINDS, OTHER_INCOME_LINES, SALARY_LINES } from "@/lib/ereturn/lines";
import { isWithinIncomeYear } from "@/lib/ereturn/rules";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { EditModal } from "@/components/EditModal";
import { InfoHint } from "@/components/InfoHint";
import { RowActions } from "@/components/RowActions";
import { ValidatedForm } from "@/components/ValidatedForm";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { LineFields } from "@/components/ereturn/LineFields";
import { FinancialAssetFields } from "@/components/ereturn/FinancialAssetFields";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addFinancialAsset, deleteFinancialAsset, saveLines, updateFinancialAsset } from "../../actions";

export default async function IncomePage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const userId = await requireUserId();
  const [{ year }, { edit }] = await Promise.all([params, searchParams]);
  const [{ record, result: r, line, version }, { fmt }] = await Promise.all([getReturn(userId, year), getLocalisation(userId)]);
  const m = fmt.money;
  const here = `/ereturn/${year}/income`;
  const assets = record.financialAssets;
  const editing = edit ? assets.find((a) => a.id === edit) : undefined;

  const addAsset = (
    <Modal label="Add" title="Add an account or certificate" variant="secondary" size="default">
      <ModalForm action={addFinancialAsset.bind(null, record.id)} className="flex flex-col gap-3" successMessage="Added">
        <FinancialAssetFields />
        <FormActions submitLabel="Add" cancel={<ModalCancel />} />
      </ModalForm>
    </Modal>
  );

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Salary"
        description="Schedule 1(b) — from your employer's salary certificate for the year."
        action={
          <InfoHint label="About the salary exemption">
            A third of your salary, up to {m(r.rules.salaryExemption.cap)}, is tax-free under Part 1 of the Sixth Schedule;
            the rest is income from employment. Enter the totals for the whole year, before tax was deducted — the TDS
            challans go on the Tax &amp; rebate tab.
          </InfoHint>
        }
      >
        <ValidatedForm key={version(SALARY_LINES)} action={saveLines.bind(null, record.id, "salary")} className="flex flex-col gap-4" successMessage="Salary saved">
          <LineFields defs={SALARY_LINES} value={line} numbered />
          <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Total salary</dt>
              <dd className="font-semibold tabular-nums">{m(r.salary.gross)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Exempt</dt>
              <dd className="font-semibold tabular-nums">{m(r.salary.exempt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Taxable</dt>
              <dd className="font-semibold tabular-nums">{m(r.salary.taxable)}</dd>
            </div>
          </dl>
          <FormActions submitLabel="Save salary" />
        </ValidatedForm>
      </Card>

      <Card
        title="Bank accounts and Sanchayapatra"
        description="Each account's interest and each certificate's profit is income from financial assets; the tax taken at source counts as tax paid; the 30 June balance goes to your assets."
        action={assets.length > 0 ? addAsset : undefined}
      >
        {assets.length === 0 ? (
          <EmptyState
            icon={<Landmark size={18} />}
            title="No accounts or certificates yet"
            description="Add every bank account and Sanchayapatra you held during the year, with the figures from each bank's tax certificate."
            action={addAsset}
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Account or certificate</TableHead>
                <TableHead className="text-right">Interest / profit</TableHead>
                <TableHead className="text-right">Tax deducted</TableHead>
                <TableHead className="text-right">Value on 30 June</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.map((a) => {
                const boughtThisYear = a.kind === "SANCHAYAPATRA" && a.openedDate && isWithinIncomeYear(a.openedDate, year);
                return (
                  <TableRow key={a.id}>
                    <TableCell primary className="whitespace-normal">
                      <span className="font-medium">{a.institution}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {[FINANCIAL_ASSET_KINDS[a.kind].label, a.reference, a.openedDate ? `issued ${fmt.day(a.openedDate)}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                        {boughtThisYear && <span className="ml-1 text-success">· bought this year</span>}
                      </span>
                    </TableCell>
                    <TableCell label="Interest / profit" className="text-right tabular-nums">
                      {fmt.moneyExact(toNumber(a.income))}
                    </TableCell>
                    <TableCell label="Tax deducted" className="text-right tabular-nums">
                      {fmt.moneyExact(toNumber(a.taxDeducted))}
                    </TableCell>
                    <TableCell label="Value on 30 June" className="text-right tabular-nums">
                      {fmt.moneyExact(toNumber(a.value))}
                    </TableCell>
                    <TableCell actions className="text-right">
                      <RowActions
                        label={`Actions for ${a.institution}`}
                        actions={[
                          { kind: "link", label: "Edit", href: `${here}?edit=${a.id}`, icon: <Pencil size={14} /> },
                          {
                            kind: "confirm",
                            label: "Delete",
                            icon: <Trash2 size={14} />,
                            action: deleteFinancialAsset.bind(null, record.id, a.id),
                            title: `Delete ${a.institution}${a.reference ? ` ${a.reference}` : ""}?`,
                            description: "Removes it from this return — its income, tax and value.",
                            successMessage: "Deleted",
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-semibold hover:bg-transparent">
                <TableCell>Total</TableCell>
                <TableCell label="Interest / profit" className="text-right tabular-nums">
                  {m(r.income.financialAssets)}
                </TableCell>
                <TableCell label="Tax deducted" className="text-right tabular-nums">
                  {m(r.paid.tdsFinancial)}
                </TableCell>
                <TableCell label="Value on 30 June" className="text-right tabular-nums">
                  {m(toNumber(sumBy(assets, (a) => a.value)))}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>

      <Card title="Other income" description="IT-11GA heads 2–10, and any other income that's exempt from tax.">
        <ValidatedForm key={version(OTHER_INCOME_LINES)} action={saveLines.bind(null, record.id, "otherIncome")} className="flex flex-col gap-4" successMessage="Other income saved">
          <LineFields defs={OTHER_INCOME_LINES} value={line} />
          <FormActions submitLabel="Save other income" />
        </ValidatedForm>
      </Card>

      {editing && (
        <EditModal title={`Edit ${editing.institution}`} closeHref={here}>
          <ValidatedForm action={updateFinancialAsset.bind(null, record.id, editing.id)} className="flex flex-col gap-3">
            <FinancialAssetFields
              defaults={{
                kind: editing.kind,
                institution: editing.institution,
                branch: editing.branch ?? "",
                reference: editing.reference ?? "",
                description: editing.description ?? "",
                openedDate: editing.openedDate ? toDateInput(editing.openedDate) : "",
                value: toNumber(editing.value),
                income: toNumber(editing.income),
                taxDeducted: toNumber(editing.taxDeducted),
              }}
            />
            <FormActions
              submitLabel="Save changes"
              cancel={
                <Button variant="outline" nativeButton={false} render={<Link href={here} />}>
                  Cancel
                </Button>
              }
            />
          </ValidatedForm>
        </EditModal>
      )}
    </div>
  );
}
