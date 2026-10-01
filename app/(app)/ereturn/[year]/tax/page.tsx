import Link from "next/link";
import { Pencil, Receipt, PiggyBank, Trash2 } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { toDateInput } from "@/lib/dates";
import { toNumber } from "@/lib/money";
import { getReturn } from "@/lib/ereturn/load";
import { INVESTMENT_KINDS, TAX_PAYMENT_KINDS } from "@/lib/ereturn/lines";
import { isWithinIncomeYear } from "@/lib/ereturn/rules";
import type { StatementRow } from "@/lib/ereturn/statements";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { EditModal } from "@/components/EditModal";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { RowActions } from "@/components/RowActions";
import { ValidatedForm } from "@/components/ValidatedForm";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { StatementTable } from "@/components/ereturn/StatementTable";
import { InvestmentFields, PaymentFields } from "@/components/ereturn/PaymentFields";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addInvestment,
  addPayment,
  deleteInvestment,
  deletePayment,
  saveTaxAdjustments,
  updateInvestment,
  updatePayment,
} from "../../actions";

export default async function TaxPage({
  params,
  searchParams,
}: {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ payment?: string; investment?: string }>;
}) {
  const userId = await requireUserId();
  const [{ year }, sp] = await Promise.all([params, searchParams]);
  const [{ record, result: r, version }, { fmt }] = await Promise.all([getReturn(userId, year), getLocalisation(userId)]);
  const m = fmt.money;
  const here = `/ereturn/${year}/tax`;
  const pct = (rate: number) => `${fmt.number(rate * 100, { maximumFractionDigits: 1 })}%`;
  const editingPayment = sp.payment ? record.payments.find((p) => p.id === sp.payment) : undefined;
  const editingInvestment = sp.investment ? record.investments.find((i) => i.id === sp.investment) : undefined;
  const cancel = (
    <Button variant="outline" nativeButton={false} render={<Link href={here} />}>
      Cancel
    </Button>
  );

  const t = r.tax;
  const minimumLabel =
    t.minimumTaxBasis === "firstReturn"
      ? "Minimum tax for a first return"
      : new Set(Object.values(r.rules.minimumTax)).size > 1
        ? "Minimum tax for your area"
        : "Minimum tax";
  const computation: StatementRow[] = [
    { label: "Total income", value: m(r.income.total) },
    ...(t.finalTaxIncome > 0
      ? [{ label: "Less Sanchayapatra profit — the tax deducted from it is final (s. 163(11))", value: `−${m(t.finalTaxIncome)}`, sub: true }]
      : []),
    { label: record.resident ? "Tax-free band" : "Non-resident: no tax-free band", value: m(t.threshold), sub: true },
    {
      label: record.resident ? `Tax at the slab rates on ${m(t.regularIncome)}` : `Tax at ${pct(r.rules.nonResidentRate)}`,
      value: m(t.grossTax - t.finalTax),
    },
    ...(t.depositTaxTopUp > 0
      ? [{ label: `Includes ${m(t.depositTaxTopUp)} to reach the tax the bank deducted from interest — a minimum on it`, sub: true }]
      : []),
    ...(t.finalTax > 0 ? [{ label: "Final tax on Sanchayapatra profit (as deducted)", value: m(t.finalTax), sub: true }] : []),
    { no: "12", label: "Gross tax", value: m(t.grossTax), total: true },
    ...(t.firmShareCredit > 0 ? [{ label: "Less tax a firm or AoP already paid on your share (s. 80)", value: `−${m(t.firmShareCredit)}`, sub: true }] : []),
    { label: t.rebateLostToLateFiling ? "Rebate — lost: filed after the due date (s. 174)" : "Rebate — the least of:" },
    {
      label: `${pct(r.rules.rebate.incomePct)} of ${t.finalTaxIncome + r.income.firmShare > 0 ? `${m(t.rebateBase)} (income less final-tax income and firm share)` : "total income"}`,
      value: m(t.rebateByIncome),
      sub: true,
    },
    { label: `${pct(r.rules.rebate.investmentPct)} of eligible investment (${m(t.eligibleInvestment)})`, value: m(t.rebateByInvestment), sub: true },
    { label: "Ceiling", value: m(r.rules.rebate.cap), sub: true },
    { no: "13", label: "Tax rebate", value: m(t.rebate) },
    { no: "14", label: "Net tax after rebate", value: m(t.netTax) },
    { no: "15", label: minimumLabel, value: m(t.minimumTax) },
    { no: "16", label: "Tax payable (higher of 14 and 15)", value: m(t.taxPayable), total: true },
    { no: "17", label: "Surcharge", value: m(t.surcharge) },
    { no: "18", label: "Delay interest, penalty or other", value: m(t.delayInterest) },
    ...(t.lateFiling.charge > 0
      ? [{ label: `Late filing: ${fmt.number(t.lateFiling.months)} month${t.lateFiling.months === 1 ? "" : "s"} after ${fmt.day(t.lateFiling.due)} (s. 174)`, value: m(t.lateFiling.charge), sub: true }]
      : []),
    { no: "19", label: "Total amount payable", value: m(t.totalPayable), total: true },
  ];

  // Source tax from the Income tab still fills the table, so it's "empty" only without either.
  const noPayments = record.payments.length === 0 && r.paid.tdsFinancial === 0;
  const addPaymentModal = (
    <Modal label="Add payment" title="Add a tax payment" variant="secondary">
      <ModalForm action={addPayment.bind(null, record.id)} className="flex flex-col gap-3" successMessage="Payment added">
        <PaymentFields defaults={{ kind: "SALARY_TDS", depositedBy: record.employerName ?? "" }} />
        <FormActions submitLabel="Add payment" cancel={<ModalCancel />} />
      </ModalForm>
    </Modal>
  );
  const addInvestmentModal = (
    <Modal label="Add investment" title="Add a rebatable investment" variant="secondary">
      <ModalForm action={addInvestment.bind(null, record.id)} className="flex flex-col gap-3" successMessage="Investment added">
        <InvestmentFields />
        <FormActions submitLabel="Add investment" cancel={<ModalCancel />} />
      </ModalForm>
    </Modal>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card
          title="Tax computation"
          description={
            r.exactRules
              ? `${r.rules.own ? "Your own copy of" : "Rules from"} ${r.rules.source || `income year ${year}`}.`
              : `No rules for ${year} yet — using ${r.rules.incomeYear}'s, so treat this as an estimate.`
          }
        >
          <StatementTable rows={computation} />
          <p className="mt-3 text-xs">
            <Link href={`/ereturn/rules/${r.exactRules ? year : r.rules.incomeYear}`} className="text-link hover:underline">
              See the rules used
            </Link>
          </p>
        </Card>

        <Card title="Surcharge and penalties" description="Net wealth surcharge is worked out from your assets. Enter anything else NBR has levied.">
          <ValidatedForm key={version()} action={saveTaxAdjustments.bind(null, record.id)} className="flex flex-col gap-3" successMessage="Saved">
            <p className="text-sm text-muted-foreground">
              Net wealth surcharge: {m(t.netWealthSurcharge)}
              {t.netWealthSurchargeRate > 0
                ? ` (${pct(t.netWealthSurchargeRate)} of ${r.rules.surchargeOnRegularTax ? "tax at regular rates" : "tax payable"}, ${m(t.surchargeBase)})`
                : ` — applies above ${m(r.rules.netWealthSurcharge[0]?.above ?? 0)} of net wealth`}
              .
            </p>
            <Field label="Environmental surcharge" hint="For owning more than one motor car.">
              <MoneyInput name="environmentalSurcharge" defaultValue={r.tax.environmentalSurcharge || undefined} />
            </Field>
            <Field label="Other penalty or amount NBR has levied" hint="The late-filing charge is worked out for you; don't add it here.">
              <MoneyInput name="delayInterest" defaultValue={t.otherCharges || undefined} />
            </Field>
            <FormActions submitLabel="Save" />
          </ValidatedForm>
        </Card>
      </div>

      <Card
        title="Rebatable investments"
        description="Schedule 5 — investment made during the income year."
        action={record.investments.length > 0 ? addInvestmentModal : undefined}
      >
        {record.investments.length === 0 ? (
          <EmptyState
            icon={<PiggyBank size={18} />}
            title="No investments claimed"
            description="Sanchayapatra bought, DPS instalments, life insurance premiums, Zakat… paid during the income year earn a rebate."
            action={addInvestmentModal}
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Investment</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {record.investments.map((i) => {
                const outside = i.date && !isWithinIncomeYear(i.date, year);
                return (
                  <TableRow key={i.id}>
                    <TableCell primary className="whitespace-normal">
                      {INVESTMENT_KINDS[i.kind].label}
                      {i.description && <span className="block text-xs font-normal text-muted-foreground">{i.description}</span>}
                    </TableCell>
                    <TableCell label="Date" className={outside ? "text-warning" : "text-muted-foreground"}>
                      {i.date ? fmt.day(i.date) : "—"}
                      {outside && <span className="block text-xs">Outside the income year</span>}
                    </TableCell>
                    <TableCell label="Amount" className="text-right tabular-nums">
                      {m(toNumber(i.amount))}
                    </TableCell>
                    <TableCell actions className="text-right">
                      <RowActions
                        label={`Actions for ${INVESTMENT_KINDS[i.kind].label}`}
                        actions={[
                          { kind: "link", label: "Edit", href: `${here}?investment=${i.id}`, icon: <Pencil size={14} /> },
                          {
                            kind: "confirm",
                            label: "Delete",
                            icon: <Trash2 size={14} />,
                            action: deleteInvestment.bind(null, record.id, i.id),
                            title: "Delete this investment?",
                            description: `Removes the ${m(toNumber(i.amount))} claim from the rebate.`,
                            successMessage: "Investment deleted",
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="font-semibold hover:bg-transparent">
                <TableCell>Eligible total</TableCell>
                <TableCell />
                <TableCell label="Eligible total" className="text-right tabular-nums">
                  {m(r.tax.eligibleInvestment)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>

      <Card
        title="Tax paid"
        description="Your employer's salary TDS challans, advance tax, and tax paid with the return. Tax taken from interest and profit comes from the Income tab."
        action={noPayments ? undefined : addPaymentModal}
      >
        {noPayments ? (
          <EmptyState
            icon={<Receipt size={18} />}
            title="No tax paid recorded"
            description="Add each salary TDS challan your employer gave you — the challan no., date and amount are on it."
            action={addPaymentModal}
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Payment</TableHead>
                <TableHead>Challan</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {record.payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell primary className="whitespace-normal">
                    {TAX_PAYMENT_KINDS[p.kind].label}
                    {(p.note || p.depositedBy) && (
                      <span className="block text-xs font-normal text-muted-foreground">{[p.note, p.depositedBy].filter(Boolean).join(" · ")}</span>
                    )}
                  </TableCell>
                  <TableCell label="Challan" className="text-muted-foreground">
                    {p.reference ?? "—"}
                    {p.date && <span className="block text-xs">{fmt.day(p.date)}</span>}
                  </TableCell>
                  <TableCell label="Amount" className="text-right tabular-nums">
                    {m(toNumber(p.amount))}
                  </TableCell>
                  <TableCell actions className="text-right">
                    <RowActions
                      label={`Actions for challan ${p.reference ?? ""}`}
                      actions={[
                        { kind: "link", label: "Edit", href: `${here}?payment=${p.id}`, icon: <Pencil size={14} /> },
                        {
                          kind: "confirm",
                          label: "Delete",
                          icon: <Trash2 size={14} />,
                          action: deletePayment.bind(null, record.id, p.id),
                          title: "Delete this payment?",
                          description: `Removes the ${m(toNumber(p.amount))} payment from the return.`,
                          successMessage: "Payment deleted",
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {r.paid.tdsFinancial > 0 && (
                <TableRow className="text-muted-foreground">
                  <TableCell primary>
                    Tax deducted from interest and profit
                    <Link href={`/ereturn/${year}/income`} className="block text-xs text-link hover:underline">
                      From the Income tab
                    </Link>
                  </TableCell>
                  <TableCell label="Challan">—</TableCell>
                  <TableCell label="Amount" className="text-right tabular-nums">
                    {m(r.paid.tdsFinancial)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              )}
              <TableRow className="font-semibold hover:bg-transparent">
                <TableCell>Total paid</TableCell>
                <TableCell />
                <TableCell label="Total paid" className="text-right tabular-nums">
                  {m(r.paid.total)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>

      {editingPayment && (
        <EditModal title="Edit payment" closeHref={here}>
          <ValidatedForm action={updatePayment.bind(null, record.id, editingPayment.id)} className="flex flex-col gap-3">
            <PaymentFields
              defaults={{
                kind: editingPayment.kind,
                amount: toNumber(editingPayment.amount),
                reference: editingPayment.reference ?? "",
                date: editingPayment.date ? toDateInput(editingPayment.date) : "",
                depositedBy: editingPayment.depositedBy ?? "",
                bank: editingPayment.bank ?? "",
                branch: editingPayment.branch ?? "",
                note: editingPayment.note ?? "",
              }}
            />
            <FormActions submitLabel="Save changes" cancel={cancel} />
          </ValidatedForm>
        </EditModal>
      )}

      {editingInvestment && (
        <EditModal title="Edit investment" closeHref={here}>
          <ValidatedForm action={updateInvestment.bind(null, record.id, editingInvestment.id)} className="flex flex-col gap-3">
            <InvestmentFields
              defaults={{
                kind: editingInvestment.kind,
                amount: toNumber(editingInvestment.amount),
                date: editingInvestment.date ? toDateInput(editingInvestment.date) : "",
                description: editingInvestment.description ?? "",
              }}
            />
            <FormActions submitLabel="Save changes" cancel={cancel} />
          </ValidatedForm>
        </EditModal>
      )}
    </div>
  );
}
