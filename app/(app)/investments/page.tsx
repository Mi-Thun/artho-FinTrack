import Link from "next/link";
import { after } from "next/server";
import { Banknote, PiggyBank, Pencil, Trash2 } from "lucide-react";
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
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { RowActions } from "@/components/RowActions";
import { MoneyText } from "@/components/MoneyText";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { InfoHint } from "@/components/InfoHint";
import { SpSchemeFields, type SchemeOption } from "@/components/SpSchemeFields";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditModal } from "@/components/EditModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

const SCHEME_OPTIONS: SchemeOption[] = [
  ...SCHEME_KEYS.map((k) => ({
    value: k,
    label: SCHEMES[k].label,
    ratePercent: rateToPercent(SCHEMES[k].annualRate),
    tenureMonths: SCHEMES[k].tenureMonths,
  })),
  { value: "OTHER", label: "Other / bank FDR", ratePercent: null, tenureMonths: null },
];

/** Short scheme names for badges; the full name is in the badge's tooltip. */
const SCHEME_BADGE: Record<string, string> = {
  FIVE_YEAR_BSP: "5-Year",
  THREE_MONTH_PROFIT: "3-Monthly",
  PARIWAR: "Pariwar",
  PENSIONER: "Pensioner",
  POST_OFFICE_FD: "Post Office",
};

function editCancel() {
  return (
    <Button variant="outline" nativeButton={false} render={<Link href="/investments" />}>
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

  const taxPct = rateToPercent(spPortfolio.appliedTaxRate);
  const liveCount = allFixedDeposits.filter((d) => !d.encashedAt).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Investments"
        description="Sanchayapatra (SP) certificates and DPS plans."
        actions={
          <>
            <Modal label="Add DPS" title="Add DPS plan" variant="secondary" openParam="dps">
                          <ModalForm action={createDpsPlan} className="flex flex-col gap-3" successMessage="DPS plan added">
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
            <Modal label="Add SP" title="Add Sanchayapatra (SP)" openParam="sp">
                          <ModalForm action={createFixedDeposit} className="flex flex-col gap-3" successMessage="SP added">
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
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total invested" value={<MoneyText value={spPortfolio.totalPrincipal} money={fmt.money} />} />
        <StatCard
          label="Net profit to date"
          tone="positive"
          value={<MoneyText value={spPortfolio.totalNetProfitToDate} money={fmt.money} />}
          hint="Profit paid or accrued on your certificates so far, after source tax."
        />
        <StatCard
          label="Source tax"
          value={`${fmt.number(taxPct)}%`}
          hint={`Source tax is ${taxPct}% because your total SP investment is ${spPortfolio.totalPrincipal > 500000 ? "above" : "at or below"} ${fmt.money(500000)}. It steps from 5% to 10% above that, assessed across every scheme together.`}
        />
        <StatCard label="Live certificates" value={fmt.number(liveCount)} />
      </div>

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
        title="Sanchayapatra (SP)"
        action={
          <InfoHint label="About SP profit">
            SP and Sanchayapatra are the same thing — this is the one place they live. Profit is paid at the year-3 rate
            (the issuer doesn&apos;t step through years 1 and 2 first), net of source tax.
          </InfoHint>
        }
      >
        {fixedDepositsTotal === 0 ? (
          <EmptyState
            icon={<PiggyBank size={18} />}
            title="No SPs yet"
            description="Add a Sanchayapatra certificate or bank FDR to track its profit, tax and maturity."
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Label" column="label" currentSort={spSort} currentDir={spDir} basePath="/investments" sortParam="spSort" dirParam="spDir" extraParams={spExtraParams} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Opened" column="openedDate" currentSort={spSort} currentDir={spDir} basePath="/investments" sortParam="spSort" dirParam="spDir" extraParams={spExtraParams} />
                </TableHead>
                <TableHead className="text-right">
                  <SortableHeader label="Principal" column="principal" currentSort={spSort} currentDir={spDir} basePath="/investments" sortParam="spSort" dirParam="spDir" extraParams={spExtraParams} />
                </TableHead>
                <TableHead className="text-right">Rate (Y1 / Y2 / Y3)</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fixedDeposits.map((d) => {
                const scheme = d.scheme && d.scheme !== "OTHER" ? SCHEMES[d.scheme as keyof typeof SCHEMES] : null;
                return (
                  <TableRow key={d.id} className={d.encashedAt ? "text-muted-foreground" : ""}>
                    <TableCell primary className="whitespace-normal">
                      <span className="font-medium">{d.label}</span>
                      {scheme && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground" title={`${scheme.label} — ${scheme.eligibility}`}>
                          {SCHEME_BADGE[d.scheme!] ?? scheme.label}
                        </span>
                      )}
                      {d.encashedAt && (
                        <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium">Encashed</span>
                      )}
                    </TableCell>
                    <TableCell label="Opened" className="whitespace-nowrap text-muted-foreground">{fmt.day(d.openedDate)}</TableCell>
                    <TableCell label="Principal" className="text-right font-medium">
                      <MoneyText value={toNumber(d.principal)} money={fmt.money} />
                    </TableCell>
                    <TableCell label="Rate" className="text-right text-muted-foreground tabular-nums">
                      {fmt.number(rateToPercent(d.rateY1), { maximumFractionDigits: 2 })}% / {fmt.number(rateToPercent(d.rateY2), { maximumFractionDigits: 2 })}% / {fmt.number(rateToPercent(d.rateY3), { maximumFractionDigits: 2 })}%
                    </TableCell>
                    <TableCell actions className="text-right">
                      <RowActions
                        label={`Actions for ${d.label}`}
                        actions={[
                          { kind: "link", label: "Edit", href: `/investments?edit=${d.id}`, icon: <Pencil size={14} /> },
                          ...(d.encashedAt
                            ? []
                            : [
                                {
                                  kind: "confirm" as const,
                                  label: "Encash",
                                  icon: <Banknote size={14} />,
                                  tone: "default" as const,
                                  confirmLabel: "Encash",
                                  action: encashFixedDeposit.bind(null, d.id),
                                  title: `Encash ${d.label}?`,
                                  description: `Marks ${fmt.money(toNumber(d.principal))} as encashed today. It stops counting toward net worth and frees the scheme's investment ceiling; its profit history is kept for tax.`,
                                  successMessage: "Marked as encashed",
                                },
                              ]),
                          {
                            kind: "confirm",
                            label: "Delete",
                            icon: <Trash2 size={14} />,
                            action: deleteFixedDeposit.bind(null, d.id),
                            title: `Delete ${d.label}?`,
                            description: `Deletes this ${fmt.money(toNumber(d.principal))} certificate and its profit history. To record that you cashed it, use Encash instead. This can't be undone.`,
                            successMessage: "SP deleted",
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
        <Pagination page={spPage} pageSize={spPageSize} total={fixedDepositsTotal} basePath="/investments" pageParam="spPage" pageSizeParam="spPageSize" extraParams={spExtraParams} />
      </Card>

      <Card
        title="DPS plans"
        action={
          <InfoHint label="About DPS in the plan">
            In the projection, SP fills up to its cap first each month; DPS installments start once SP is maxed out.
          </InfoHint>
        }
      >
        {dpsPlansTotal === 0 ? (
          <EmptyState
            icon={<PiggyBank size={18} />}
            title="No DPS plans yet"
            description="Add a deposit pension scheme to track its monthly installments and balance."
          />
        ) : (
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <SortableHeader label="Label" column="label" currentSort={dpsSort} currentDir={dpsDir} basePath="/investments" sortParam="dpsSort" dirParam="dpsDir" extraParams={dpsExtraParams} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Start" column="startMonth" currentSort={dpsSort} currentDir={dpsDir} basePath="/investments" sortParam="dpsSort" dirParam="dpsDir" extraParams={dpsExtraParams} />
                </TableHead>
                <TableHead className="text-right">Terms</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
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
                const notStarted = p.startMonth > new Date();
                return (
                  <TableRow key={p.id}>
                    <TableCell primary className="font-medium">{p.label}</TableCell>
                    <TableCell label="Start" className="whitespace-nowrap text-muted-foreground">{fmt.monthYear(p.startMonth)}</TableCell>
                    <TableCell label="Terms" className="text-right text-muted-foreground tabular-nums">
                      {fmt.money(toNumber(p.monthlyDeposit))}/mo × {fmt.number(p.tenureMonths)} mo @ {fmt.number(rateToPercent(p.interestRate), { maximumFractionDigits: 2 })}%
                      <span className="ml-1 text-xs">({fmt.number(rateToPercent(p.profitTaxAtSource), { maximumFractionDigits: 2 })}% tax)</span>
                    </TableCell>
                    <TableCell label="Balance" className="text-right font-medium">
                      {notStarted ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          Starts {fmt.monthYear(p.startMonth)}
                        </span>
                      ) : (
                        <MoneyText value={balance} money={fmt.money} />
                      )}
                    </TableCell>
                    <TableCell actions className="text-right">
                      <RowActions
                        label={`Actions for ${p.label}`}
                        actions={[
                          { kind: "link", label: "Edit", href: `/investments?edit=${p.id}`, icon: <Pencil size={14} /> },
                          {
                            kind: "confirm",
                            label: "Delete",
                            icon: <Trash2 size={14} />,
                            action: deleteDpsPlan.bind(null, p.id),
                            title: `Delete ${p.label}?`,
                            description: "It will disappear from net worth and the projection. This can't be undone.",
                            successMessage: "DPS plan deleted",
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
        <Pagination page={dpsPage} pageSize={dpsPageSize} total={dpsPlansTotal} basePath="/investments" pageParam="dpsPage" pageSizeParam="dpsPageSize" extraParams={dpsExtraParams} />
      </Card>

      {editId &&
        fixedDeposits
          .filter((d) => d.id === editId)
          .map((d) => (
            <EditModal key={d.id} title={`Edit ${d.label}`} closeHref="/investments">
              <ValidatedForm action={updateFixedDeposit.bind(null, d.id)} className="flex flex-col gap-3">
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
              </ValidatedForm>
            </EditModal>
          ))}

      {editId &&
        dpsPlans
          .filter((p) => p.id === editId)
          .map((p) => (
            <EditModal key={p.id} title={`Edit ${p.label}`} closeHref="/investments">
              <ValidatedForm action={updateDpsPlan.bind(null, p.id)} className="flex flex-col gap-3">
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
              </ValidatedForm>
            </EditModal>
          ))}
    </div>
  );
}
