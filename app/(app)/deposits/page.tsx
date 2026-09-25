import Link from "next/link";
import { after } from "next/server";
import { PiggyBank, Pencil } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { thisMonthInputValue, todayInputValue, toDateInput, toMonthInput } from "@/lib/dates";
import { rateToPercent } from "@/lib/rates";
import { dpsBalanceToDate } from "@/lib/deposit-planner";
import { SCHEMES, SCHEME_KEYS, buildCertificatePortfolio } from "@/lib/sanchayapatra";
import { syncUserDataInBackground } from "@/lib/sync";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { MoneyInput } from "@/components/MoneyInput";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SpSchemeFields, type SchemeOption } from "@/components/SpSchemeFields";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditModal } from "@/components/EditModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/StatTile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  createDpsPlan,
  encashFixedDeposit,
  createFixedDeposit,
  deleteDpsPlan,
  deleteFixedDeposit,
  updateDpsPlan,
  updateFixedDeposit,
} from "./actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

const SCHEME_OPTIONS: SchemeOption[] = [
  ...SCHEME_KEYS.map((k) => ({
    value: k,
    label: SCHEMES[k].label,
    ratePercent: rateToPercent(SCHEMES[k].annualRate),
    tenureMonths: SCHEMES[k].tenureMonths,
  })),
  { value: "OTHER", label: "Other / bank FDR", ratePercent: null, tenureMonths: null },
];

function editCancel() {
  return (
    <Button variant="outline" nativeButton={false} render={<Link href="/deposits" />}>
      Cancel
    </Button>
  );
}

export default async function DepositsPage({
  searchParams,
}: {
  searchParams: Promise<{
    edit?: string;
    sort?: string;
    dir?: string;
    page?: string;
    pageSize?: string;
    dpsPage?: string;
    dpsPageSize?: string;
    dpsSort?: string;
    dpsDir?: string;
    spPage?: string;
    spPageSize?: string;
    spSort?: string;
    spDir?: string;
  }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const today = todayInputValue();
  const sp = await searchParams;
  const editId = sp.edit;

  const dpsPage = Math.max(1, Number(sp.dpsPage ?? sp.page) || 1);
  const dpsPageSize = [10, 25, 50, 100].includes(Number(sp.dpsPageSize ?? sp.pageSize)) ? Number(sp.dpsPageSize ?? sp.pageSize) : 25;
  const spPage = Math.max(1, Number(sp.spPage ?? sp.page) || 1);
  const spPageSize = [10, 25, 50, 100].includes(Number(sp.spPageSize ?? sp.pageSize)) ? Number(sp.spPageSize ?? sp.pageSize) : 25;
  const dpsDir: "asc" | "desc" = (sp.dpsDir ?? sp.dir) === "asc" ? "asc" : "desc";
  const spDir: "asc" | "desc" = (sp.spDir ?? sp.dir) === "asc" ? "asc" : "desc";

  const dpsSort = sp.dpsSort === "label" || sp.dpsSort === "monthlyDeposit" ? sp.dpsSort : "startMonth";
  const spSort = sp.spSort === "label" || sp.spSort === "principal" ? sp.spSort : "openedDate";

  // Deferred maintenance runs after the response, not during it — see lib/sync.ts. The
  // actions that change plan assumptions re-sync synchronously, so edits made on this
  // page are reflected as soon as it re-renders.
  after(() => syncUserDataInBackground(userId));

  const [
    fixedDeposits,
    fixedDepositsTotal,
    dpsPlans,
    dpsPlansTotal,
    // Unpaginated copies for portfolio calculations, which always need the FULL set
    // regardless of which table page/tab is currently being viewed/sorted.
    allFixedDeposits,
  ] = await Promise.all([
    db.fixedDeposit.findMany({
      where: { userId },
      orderBy: { [spSort]: spDir },
      skip: (spPage - 1) * spPageSize,
      take: spPageSize,
    }),
    db.fixedDeposit.count({ where: { userId } }),
    db.dpsPlan.findMany({
      where: { userId },
      orderBy: { [dpsSort]: dpsDir },
      skip: (dpsPage - 1) * dpsPageSize,
      take: dpsPageSize,
    }),
    db.dpsPlan.count({ where: { userId } }),
    db.fixedDeposit.findMany({ where: { userId }, orderBy: { openedDate: "asc" } }),
  ]);

  // SP *is* Sanchayapatra — "SP" is just the common short form. One list, one table;
  // the scheme registry adds the statutory rate, per-holder ceiling, and source tax that
  // a plain bank FDR doesn't have.
  const spPortfolio = buildCertificatePortfolio(
    allFixedDeposits.map((d) => ({
      id: d.id,
      scheme: d.scheme ?? "OTHER",
      label: d.label,
      principal: d.principal,
      purchaseDate: d.openedDate,
      holderType: d.holderType,
      encashedAt: d.encashedAt,
    })),
    new Date(),
  );
  const breachedCeilings = spPortfolio.ceilings.filter((c) => c.isOverCeiling);

  const dpsExtraParams = { dpsSort, dpsDir, spSort, spDir, spPage: String(spPage), spPageSize: String(spPageSize) };
  const spExtraParams = { spSort, spDir, dpsSort, dpsDir, dpsPage: String(dpsPage), dpsPageSize: String(dpsPageSize) };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<PiggyBank size={16} />}
        crumbs={[{ label: "Deposits & Investment Planner" }]}
      />

      <Card
          title="DPS Plans"
          action={
            <Modal label="Add DPS" title="Add DPS Plan">
              <ModalForm action={createDpsPlan} className="flex flex-col gap-3">
                <Field label="Label" required>
                  <Input name="label" required autoFocus />
                </Field>
                <Field label="Monthly deposit" required>
                  <MoneyInput name="monthlyDeposit" required positive />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Start month" required>
                    <Input name="startMonth" type="month" defaultValue={thisMonthInputValue()} required />
                  </Field>
                  <Field label="Tenure (months)" required>
                    <Input name="tenureMonths" type="number" min="1" step="1" required />
                  </Field>
                  <Field label="Interest rate (%)" required>
                    <Input name="interestRate" type="number" step="0.01" min="0" required />
                  </Field>
                  <Field label="Tax at source (%)" hint="Leave blank for 10%.">
                    <Input name="profitTaxAtSource" type="number" step="0.01" min="0" />
                  </Field>
                </div>
                <FormActions submitLabel="Add DPS" cancel={<ModalCancel />} />
              </ModalForm>
            </Modal>
          }
        >
          <p className="mb-4 text-sm text-muted-foreground">
            SP fills up to its cap first each month; DPS installments start once SP is maxed out.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Label" column="label" currentSort={dpsSort} currentDir={dpsDir} basePath="/deposits" sortParam="dpsSort" dirParam="dpsDir" extraParams={dpsExtraParams} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Start" column="startMonth" currentSort={dpsSort} currentDir={dpsDir} basePath="/deposits" sortParam="dpsSort" dirParam="dpsDir" extraParams={dpsExtraParams} />
                </TableHead>
                <TableHead className="text-right">Terms</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dpsPlans.map((p) => {
                const balance = dpsBalanceToDate(
                  [
                    {
                      label: p.label,
                      monthlyDeposit: toNumber(p.monthlyDeposit),
                      startMonth: p.startMonth,
                      tenureMonths: p.tenureMonths,
                      interestRate: toNumber(p.interestRate),
                      profitTaxAtSource: toNumber(p.profitTaxAtSource),
                    },
                  ],
                  new Date(),
                );
                return (
                  <TableRow key={p.id}>
                    <TableCell>{p.label}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{fmt.date(p.startMonth, { month: "short", year: "numeric" })}</TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {fmt.money(toNumber(p.monthlyDeposit))}/mo × {p.tenureMonths}mo @ {rateToPercent(p.interestRate)}% (
                      {rateToPercent(p.profitTaxAtSource)}% tax)
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{fmt.money(balance)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit DPS ${p.label}`} title="Edit" nativeButton={false} render={<Link href={`/deposits?edit=${p.id}`} />}>
                          <Pencil size={15} />
                        </Button>
                        <ConfirmDelete
                          action={deleteDpsPlan.bind(null, p.id)}
                          label={`Delete DPS ${p.label}`}
                          message={`Delete the DPS plan "${p.label}"? It will disappear from net worth and the projection. This can't be undone.`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {dpsPlans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-4 text-center text-muted-foreground">
                    No DPS plans yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination page={dpsPage} pageSize={dpsPageSize} total={dpsPlansTotal} basePath="/deposits" pageParam="dpsPage" pageSizeParam="dpsPageSize" extraParams={dpsExtraParams} />
        </Card>

      {editId &&
        dpsPlans
          .filter((p) => p.id === editId)
          .map((p) => (
            <EditModal key={p.id} title="Edit DPS Plan" closeHref="/deposits">
              <form action={updateDpsPlan.bind(null, p.id)} className="flex flex-col gap-3">
                <Field label="Label" required>
                  <Input name="label" defaultValue={p.label} required />
                </Field>
                <Field label="Monthly deposit" required>
                  <MoneyInput name="monthlyDeposit" defaultValue={toNumber(p.monthlyDeposit)} required positive />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Start month" required>
                    <Input name="startMonth" type="month" defaultValue={toMonthInput(p.startMonth)} required />
                  </Field>
                  <Field label="Tenure (months)" required>
                    <Input name="tenureMonths" type="number" min="1" step="1" defaultValue={p.tenureMonths} required />
                  </Field>
                  <Field label="Interest rate (%)" required>
                    <Input name="interestRate" type="number" step="0.01" min="0" defaultValue={rateToPercent(p.interestRate)} required />
                  </Field>
                  <Field label="Tax at source (%)">
                    <Input name="profitTaxAtSource" type="number" step="0.01" min="0" defaultValue={rateToPercent(p.profitTaxAtSource)} />
                  </Field>
                </div>
                <FormActions submitLabel="Save changes" cancel={editCancel()} />
              </form>
            </EditModal>
          ))}

      <>
          <Card>
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Total Invested" value={fmt.money(spPortfolio.totalPrincipal)} />
              <StatTile label="Net Profit to Date" value={fmt.money(spPortfolio.totalNetProfitToDate)} tone="positive" />
              <StatTile label="Source Tax" value={`${(spPortfolio.appliedTaxRate * 100).toFixed(0)}%`} />
              <StatTile label="Live Certificates" value={fmt.number(allFixedDeposits.filter((d) => !d.encashedAt).length)} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Source tax is {(spPortfolio.appliedTaxRate * 100).toFixed(0)}% because total investment is{" "}
              {spPortfolio.totalPrincipal > 500000 ? "above" : "at or below"} {fmt.money(500000)} — it steps from 5% to 10% above
              that, assessed across every scheme together.
            </p>
          </Card>

          {breachedCeilings.length > 0 && (
            <Alert
              className="rounded-lg border-l-4 p-3"
              style={{ background: "var(--status-danger-soft)", borderLeftColor: "var(--status-danger)" }}
            >
              <AlertDescription className="text-foreground">
                <strong>Investment ceiling exceeded.</strong>{" "}
                {breachedCeilings
                  .map((b) => `${b.schemeLabel} (${fmt.money(b.invested)} of ${fmt.money(b.ceiling!)})`)
                  .join("; ")}
                . Purchases above the ceiling can be refused, or the excess refunded without profit.
              </AlertDescription>
            </Alert>
          )}

        <Card
          title="SP (Sanchayapatra)"
          action={
            <Modal label="Add SP" title="Add SP (Sanchayapatra)">
              <ModalForm action={createFixedDeposit} className="flex flex-col gap-3">
                <Field label="Label" required>
                  <Input name="label" required autoFocus placeholder="e.g. Pariwar — Sonali" />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Principal" required>
                    <MoneyInput name="principal" required positive />
                  </Field>
                  <Field label="Opened date" required>
                    <Input name="openedDate" type="date" defaultValue={today} required />
                  </Field>
                </div>
                <SpSchemeFields schemes={SCHEME_OPTIONS} mode="add" />
                <Field label="Registration number">
                  <Input name="registrationNo" />
                </Field>
                <FormActions submitLabel="Add SP" cancel={<ModalCancel />} />
              </ModalForm>
            </Modal>
          }
        >
          <p className="mb-4 text-sm text-muted-foreground">
            SP and Sanchayapatra are the same thing — this is the one place they live. Profit is paid at the Rate Y3
            figure (the issuer doesn&apos;t step through Y1/Y2 first), net of source tax.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Label" column="label" currentSort={spSort} currentDir={spDir} basePath="/deposits" sortParam="spSort" dirParam="spDir" extraParams={spExtraParams} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Opened" column="openedDate" currentSort={spSort} currentDir={spDir} basePath="/deposits" sortParam="spSort" dirParam="spDir" extraParams={spExtraParams} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Principal" column="principal" currentSort={spSort} currentDir={spDir} basePath="/deposits" sortParam="spSort" dirParam="spDir" extraParams={spExtraParams} />
                </TableHead>
                <TableHead className="text-right">Rates</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fixedDeposits.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    {d.label}
                    {d.scheme && d.scheme !== "OTHER" && (
                      <span
                        className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[0.7rem] text-muted-foreground"
                        title={SCHEMES[d.scheme as keyof typeof SCHEMES].eligibility}
                      >
                        {SCHEMES[d.scheme as keyof typeof SCHEMES].label}
                      </span>
                    )}
                    {d.encashedAt && (
                      <span className="ml-2 text-[0.7rem] text-muted-foreground">encashed</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{fmt.date(d.openedDate, DATE_FORMAT)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmt.money(toNumber(d.principal))}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {rateToPercent(d.rateY1).toFixed(2)}% / {rateToPercent(d.rateY2).toFixed(2)}% / {rateToPercent(d.rateY3).toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!d.encashedAt && (
                        <ConfirmDialog
                          action={encashFixedDeposit.bind(null, d.id)}
                          title={`Encash ${d.label}?`}
                          description={`Marks ${fmt.money(toNumber(d.principal))} as encashed today. It stops counting toward net worth and frees the scheme's investment ceiling; its profit history is kept for tax.`}
                          confirmLabel="Encash"
                          tone="default"
                          triggerLabel="Encash"
                          triggerVariant="secondary"
                        />
                      )}
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit SP ${d.label}`} title="Edit" nativeButton={false} render={<Link href={`/deposits?edit=${d.id}`} />}>
                        <Pencil size={15} />
                      </Button>
                      <ConfirmDelete
                        action={deleteFixedDeposit.bind(null, d.id)}
                        label={`Delete SP ${d.label}`}
                        message={`Delete "${d.label}" (${fmt.money(toNumber(d.principal))}) and its profit history? To record that you cashed it, use Encash instead. This can't be undone.`}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {fixedDeposits.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-4 text-center text-muted-foreground">
                    No SPs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pagination page={spPage} pageSize={spPageSize} total={fixedDepositsTotal} basePath="/deposits" pageParam="spPage" pageSizeParam="spPageSize" extraParams={spExtraParams} />
        </Card>
        </>

      {editId &&
        fixedDeposits
          .filter((d) => d.id === editId)
          .map((d) => (
            <EditModal key={d.id} title="Edit SP (Sanchayapatra)" closeHref="/deposits">
              <form action={updateFixedDeposit.bind(null, d.id)} className="flex flex-col gap-3">
                <Field label="Label" required>
                  <Input name="label" defaultValue={d.label} required />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Principal" required>
                    <MoneyInput name="principal" defaultValue={toNumber(d.principal)} required positive />
                  </Field>
                  <Field label="Opened date" required>
                    <Input name="openedDate" type="date" defaultValue={toDateInput(d.openedDate)} required />
                  </Field>
                </div>
                <SpSchemeFields
                  schemes={SCHEME_OPTIONS}
                  mode="edit"
                  defaultScheme={d.scheme ?? "OTHER"}
                  defaultHolder={d.holderType}
                  defaultRates={{ y1: rateToPercent(d.rateY1), y2: rateToPercent(d.rateY2), y3: rateToPercent(d.rateY3) }}
                />
                <Field label="Registration number">
                  <Input name="registrationNo" defaultValue={d.registrationNo ?? ""} />
                </Field>
                <FormActions submitLabel="Save changes" cancel={editCancel()} />
              </form>
            </EditModal>
          ))}

    </div>
  );
}
