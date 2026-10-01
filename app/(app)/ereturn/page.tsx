import Link from "next/link";
import { FileText, FolderOpen, Printer, Trash2, Scale } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue } from "@/lib/dates";
import { listReturns } from "@/lib/ereturn/load";
import { returnChecks } from "@/lib/ereturn/checks";
import { assessmentYearOf, incomeYearForDate, incomeYearOf, incomeYearStart } from "@/lib/ereturn/rules";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { InfoHint } from "@/components/InfoHint";
import { RowActions } from "@/components/RowActions";
import { Field } from "@/components/Field";
import { Select } from "@/components/Select";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createReturn, deleteReturn } from "./actions";

/**
 * eReturn: one income tax return per income year, built up from the documents behind it
 * (salary certificate, bank and Sanchayapatra certificates, challans) and laid out like
 * NBR's IT-11GA so it can be copied into the online form or printed.
 */
export default async function EReturnPage() {
  const userId = await requireUserId();
  const [{ fmt }, returns] = await Promise.all([getLocalisation(userId), listReturns(userId)]);

  // Filing season is for the year that has just ended, so that's the default.
  const current = incomeYearForDate(new Date(`${todayInputValue()}T00:00:00Z`));
  const started = new Set(returns.map((r) => r.record.incomeYear));
  const candidates = Array.from({ length: 6 }, (_, i) => incomeYearOf(incomeYearStart(current) - i)).filter((y) => !started.has(y));
  const lastYear = incomeYearOf(incomeYearStart(current) - 1);
  const defaultYear = candidates.includes(lastYear) ? lastYear : candidates[0];

  const startReturn = (openParam?: string) =>
    candidates.length > 0 && (
      <Modal label="Start a return" title="Start a return" size="compact" icon={<FileText size={15} />} openParam={openParam}>
        <ModalForm action={createReturn} className="flex flex-col gap-3">
          <Field label="Income year" required hint="1 July – 30 June. The return is filed in the following assessment year.">
            <Select
              name="incomeYear"
              defaultValue={defaultYear}
              options={candidates.map((y) => ({ value: y, label: `${y} (assessment year ${assessmentYearOf(y)})` }))}
            />
          </Field>
          {returns.length > 0 && (
            <Field label="Start from" hint="Carries over your details, assets and liabilities, and last year's closing net wealth. Income, tax and expenses start empty.">
              <Select
                name="copyFrom"
                defaultValue={returns[0].record.incomeYear}
                options={[
                  ...returns.map((r) => ({ value: r.record.incomeYear, label: `My ${r.record.incomeYear} return` })),
                  { value: "", label: "A blank return" },
                ]}
              />
            </Field>
          )}
          <FormActions submitLabel="Start return" cancel={<ModalCancel />} />
        </ModalForm>
      </Modal>
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="eReturn"
        description="Your income tax return, worked out the way NBR's online form does."
        actions={startReturn("return")}
        menu={[{ label: "Tax rules", href: "/ereturn/rules", icon: <Scale size={16} /> }]}
        mobileMenu={candidates.length > 0 ? [{ label: "Start a return", href: "/ereturn?new=return", icon: <FileText size={16} /> }] : undefined}
      />

      <Card
        title="Returns"
        action={
          <InfoHint label="How eReturn works">
            Each return is for one income year. Enter what your documents show — salary, the bank and Sanchayapatra tax
            certificates, your employer&apos;s TDS challans — and the return works out your income, tax, rebate and the
            assets statement, then checks that it all adds up. eReturn is separate from the rest of the app: nothing here
            changes your transactions or investments.
          </InfoHint>
        }
      >
        {returns.length === 0 ? (
          <EmptyState
            icon={<FileText size={18} />}
            title="No returns yet"
            description="Start with the income year that has just ended — the one you're filing for now."
            action={startReturn()}
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Assessment year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total income</TableHead>
                <TableHead className="text-right">Tax payable</TableHead>
                <TableHead className="text-right">Refund / due</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {returns.map(({ record, result }) => {
                const href = `/ereturn/${record.incomeYear}`;
                const errors = returnChecks(record, result, fmt).filter((c) => c.level === "error").length;
                return (
                  <TableRow key={record.id}>
                    <TableCell primary>
                      <Link href={href} className="font-medium text-link hover:underline">
                        {assessmentYearOf(record.incomeYear)}
                      </Link>
                      <span className="block text-xs text-muted-foreground">Income year {record.incomeYear}</span>
                    </TableCell>
                    <TableCell label="Status">
                      {record.status === "FILED" ? (
                        <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">
                          Filed{record.filedAt ? ` ${fmt.day(record.filedAt)}` : ""}
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Draft</span>
                      )}
                      {errors > 0 && (
                        <span className="ml-2 rounded-full bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger">
                          {fmt.number(errors)} to fix
                        </span>
                      )}
                    </TableCell>
                    <TableCell label="Total income" className="text-right tabular-nums">
                      {fmt.money(result.income.total)}
                    </TableCell>
                    <TableCell label="Tax payable" className="text-right tabular-nums">
                      {fmt.money(result.tax.totalPayable)}
                    </TableCell>
                    <TableCell label="Refund / due" className="text-right tabular-nums">
                      {result.paid.due > 0 ? (
                        <span className="text-danger">{fmt.money(result.paid.due)} due</span>
                      ) : result.paid.excess > 0 ? (
                        <span className="text-success">{fmt.money(result.paid.excess)} excess</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell actions className="text-right">
                      <RowActions
                        label={`Actions for the ${assessmentYearOf(record.incomeYear)} return`}
                        actions={[
                          { kind: "link", label: "Open", href, icon: <FolderOpen size={14} /> },
                          { kind: "link", label: "Print", href: `/ereturn-print/${record.incomeYear}`, icon: <Printer size={14} /> },
                          {
                            kind: "confirm",
                            label: "Delete",
                            icon: <Trash2 size={14} />,
                            action: deleteReturn.bind(null, record.id),
                            title: `Delete the ${assessmentYearOf(record.incomeYear)} return?`,
                            description: "Deletes the return and everything entered for it. This can't be undone.",
                            successMessage: "Return deleted",
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
