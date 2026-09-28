import Link from "next/link";
import { after } from "next/server";
import { Banknote, PiggyBank, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { thisMonthInputValue, todayInputValue, toDateInput, toMonthInput } from "@/lib/dates";
import { rateToPercent } from "@/lib/rates";
import { dpsBalanceToDate, nextSpInterestPayment } from "@/lib/deposit-planner";
import { SCHEMES, SCHEME_KEYS, SOURCE_TAX_THRESHOLD, baseRateOf, buildCertificatePortfolio, spPayoutOf } from "@/lib/sanchayapatra";
import { Breakdown, type BreakdownRow } from "@/components/Breakdown";
import { syncUserDataInBackground } from "@/lib/sync";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { DateInput } from "@/components/DateInput";
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { RowActions } from "@/components/RowActions";
import { MoneyText } from "@/components/MoneyText";
import { StatCard } from "@/components/StatCard";
import { EmptyState } from "@/components/EmptyState";
import { InfoHint } from "@/components/InfoHint";
import { DpsPreview, SpPreview } from "@/components/InvestmentPreview";
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

/** A slab-rated SP's two rates (below and above ৳7.5 lakh), or null for a single-rate one. */
function slabRates(d: { principal: unknown; rateY3: unknown; slabAmount: unknown; slabRate: unknown }) {
  if (d.slabAmount == null || d.slabRate == null) return null;
  const slabRate = toNumber(d.slabRate);
  return { base: baseRateOf(toNumber(d.principal), toNumber(d.rateY3), toNumber(d.slabAmount), slabRate), slab: slabRate };
}

/** Statutory rate/tenure/payout per scheme, for the Add SP live preview. */
const SCHEME_RATES = Object.fromEntries(
  SCHEME_KEYS.map((k) => [k, { rate: SCHEMES[k].annualRate, tenureMonths: SCHEMES[k].tenureMonths, payout: spPayoutOf(k) }]),
);

/** Short scheme names for badges; the full name is in the badge's tooltip. */
const SCHEME_BADGE: Record<string, string> = {
  FIVE_YEAR_BSP: "5-Year",
  THREE_MONTH_PROFIT: "3-Monthly",
  PARIWAR: "Pariwar",
  PENSIONER: "Pensioner",
  POST_OFFICE_FD: "Post Office",
};

function editCancel(href = "/investments") {
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
      Cancel
    </Button>
  );
}

export default async function DepositsPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
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
  const { fmt, term } = await getLocalisation(userId);
  const today = todayInputValue();
  const sp = await searchParams;
  const tab = sp.tab === "dps" ? "dps" : "sp";
  const now = new Date();
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
      // Profit is worked out at the year-3 rate, as on the dashboard.
      annualRate: toNumber(d.rateY3),
      termMonths: d.termMonths,
    })),
    new Date(),
  );
  const breachedCeilings = spPortfolio.ceilings.filter((c) => c.isOverCeiling);

  const dpsExtraParams = { dpsSort, dpsDir, spSort, spDir, spPage: String(spPage), spPageSize: String(spPageSize) };
  const spExtraParams = { spSort, spDir, dpsSort, dpsDir, dpsPage: String(dpsPage), dpsPageSize: String(dpsPageSize) };

  const taxPct = rateToPercent(spPortfolio.appliedTaxRate);
  const liveCount = allFixedDeposits.filter((d) => !d.encashedAt).length;
  // What a new SP's slab split counts as already invested: every scheme SP still held.
  // For editing one: only the scheme SPs opened before it, as the save action counts them.
  const spInvestedBefore = (target: (typeof allFixedDeposits)[number]) =>
    allFixedDeposits
      .filter(
        (d) =>
          d.id !== target.id &&
          !d.encashedAt &&
          d.scheme &&
          d.scheme !== "OTHER" &&
          (d.openedDate < target.openedDate || (d.openedDate.getTime() === target.openedDate.getTime() && d.createdAt < target.createdAt)),
      )
      .reduce((sum, d) => sum + toNumber(d.principal), 0);
  const liveSpTotal = allFixedDeposits
    .filter((d) => !d.encashedAt && d.scheme && d.scheme !== "OTHER")
    .reduce((sum, d) => sum + toNumber(d.principal), 0);

  // ── ⓘ breakdowns: the certificates behind each figure, with their actual amounts. ──
  const liveProjections = spPortfolio.projections.filter((p) => !p.isEncashed);
  const investedRows: BreakdownRow[] = liveProjections.map((p) => ({ label: p.label, value: fmt.money(p.principal) }));
  const profitRows: BreakdownRow[] = liveProjections.map((p) => ({
    label: p.payout === "AT_MATURITY" ? `${p.label} · paid at maturity` : p.label,
    value: fmt.money(p.netProfitToDate),
  }));
  const taxRows: BreakdownRow[] = [
    { label: "Total invested, all schemes", value: fmt.money(spPortfolio.totalPrincipal) },
    { label: "10% applies above", value: fmt.money(SOURCE_TAX_THRESHOLD) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Investments"
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
                              <Field label={`${term("interestRate")} (%)`} required>
                                <Input name="interestRate" type="number" step="0.01" min="0" required />
                              </Field>
                              <Field label="Tax at source (%)" hint="Leave blank for 10%.">
                                <Input name="profitTaxAtSource" type="number" step="0.01" min="0" />
                              </Field>
                            </div>
                            <DpsPreview language={fmt.language} numerals={fmt.numerals} />
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
                                <DateInput name="openedDate" defaultValue={today} required />
                              </Field>
                            </div>
                            <SpSchemeFields schemes={SCHEME_OPTIONS} mode="add" />
                            <SpPreview schemeRates={SCHEME_RATES} investedBefore={liveSpTotal} language={fmt.language} numerals={fmt.numerals} />
                            <FormActions submitLabel="Add SP" cancel={<ModalCancel />} />
                          </ModalForm>
                        </Modal>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total invested"
          value={<MoneyText value={spPortfolio.totalPrincipal} money={fmt.money} />}
          hint={
            <Breakdown
              title="Principal in each live certificate"
              rows={investedRows}
              total={{ label: "Total invested", value: fmt.money(spPortfolio.totalPrincipal) }}
              empty="No live certificates."
            />
          }
        />
        <StatCard
          label="Net profit to date"
          tone="positive"
          value={<MoneyText value={spPortfolio.totalNetProfitToDate} money={fmt.money} />}
          hint={
            <Breakdown
              title="Profit so far, by certificate"
              rows={profitRows}
              total={{ label: "Net profit to date", value: fmt.money(spPortfolio.totalNetProfitToDate) }}
              empty="No live certificates."
            />
          }
        />
        <StatCard
          label="Source tax"
          value={`${fmt.number(taxPct)}%`}
          hint={
            <Breakdown
              title="What sets the rate"
              rows={taxRows}
              total={{ label: "Source tax on profit", value: `${fmt.number(taxPct)}%` }}
            />
          }
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

      <nav aria-label="Investment type" className="flex gap-1 border-b">
        {(
          [
            ["sp", `Sanchayapatra (SP) · ${fmt.number(fixedDepositsTotal)}`],
            ["dps", `DPS · ${fmt.number(dpsPlansTotal)}`],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === "sp" ? "/investments" : "/investments?tab=dps"}
            aria-current={tab === key ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors ${
              tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "sp" && (
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
                <TableHead className="text-right">Rate</TableHead>
                <TableHead>Next payout</TableHead>
                <TableHead>Matures</TableHead>
                <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fixedDeposits.map((d) => {
                const scheme = d.scheme && d.scheme !== "OTHER" ? SCHEMES[d.scheme as keyof typeof SCHEMES] : null;
                const slab = slabRates(d);
                const maturity = new Date(
                  Date.UTC(d.openedDate.getUTCFullYear(), d.openedDate.getUTCMonth() + d.termMonths, d.openedDate.getUTCDate()),
                );
                // Same model as the dashboard: profit at the year-3 rate, net of tax — every
                // quarter, or the whole term's profit at maturity for an at-maturity scheme.
                const payout =
                  d.encashedAt || maturity <= now
                    ? null
                    : nextSpInterestPayment(
                        {
                          label: d.label,
                          principal: toNumber(d.principal),
                          openedDate: d.openedDate,
                          rateY1: toNumber(d.rateY1),
                          rateY2: toNumber(d.rateY2),
                          rateY3: toNumber(d.rateY3),
                          termMonths: d.termMonths,
                          payout: spPayoutOf(d.scheme),
                        },
                        now,
                      );
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
                      {fmt.number(rateToPercent(d.rateY3), { maximumFractionDigits: 2 })}%
                      {slab && (
                        <span
                          className="block text-xs"
                          title={`${fmt.money(toNumber(d.principal) - toNumber(d.slabAmount))} at ${fmt.number(rateToPercent(slab.base), { maximumFractionDigits: 2 })}%, ${fmt.money(toNumber(d.slabAmount))} above ৳7.5 lakh at ${fmt.number(rateToPercent(slab.slab), { maximumFractionDigits: 2 })}%`}
                        >
                          {fmt.number(rateToPercent(slab.base), { maximumFractionDigits: 2 })}% / {fmt.number(rateToPercent(slab.slab), { maximumFractionDigits: 2 })}%
                        </span>
                      )}
                    </TableCell>
                    <TableCell label="Next payout" className="whitespace-nowrap">
                      {payout ? (
                        <>
                          <MoneyText value={payout.amount} money={fmt.money} tone="income" className="font-medium" />
                          <span className="block text-xs text-muted-foreground">{fmt.day(payout.date)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell label="Matures" className="whitespace-nowrap text-muted-foreground">
                      {fmt.day(maturity)}
                      {maturity <= now && !d.encashedAt && <span className="block text-xs text-warning">Matured</span>}
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
      )}

      {tab === "dps" && (
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
                  <SortableHeader label="Label" column="label" currentSort={dpsSort} currentDir={dpsDir} basePath="/investments" sortParam="dpsSort" dirParam="dpsDir" extraParams={{ ...dpsExtraParams, tab: "dps" }} />
                </TableHead>
                <TableHead>
                  <SortableHeader label="Start" column="startMonth" currentSort={dpsSort} currentDir={dpsDir} basePath="/investments" sortParam="dpsSort" dirParam="dpsDir" extraParams={{ ...dpsExtraParams, tab: "dps" }} />
                </TableHead>
                <TableHead className="text-right">Terms</TableHead>
                <TableHead>Progress</TableHead>
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
                const notStarted = p.startMonth > now;
                const monthsPaid = notStarted
                  ? 0
                  : Math.min(
                      p.tenureMonths,
                      (now.getUTCFullYear() - p.startMonth.getUTCFullYear()) * 12 + now.getUTCMonth() - p.startMonth.getUTCMonth() + 1,
                    );
                const progress = (monthsPaid / p.tenureMonths) * 100;
                return (
                  <TableRow key={p.id}>
                    <TableCell primary className="font-medium">{p.label}</TableCell>
                    <TableCell label="Start" className="whitespace-nowrap text-muted-foreground">{fmt.monthYear(p.startMonth)}</TableCell>
                    <TableCell label="Terms" className="text-right text-muted-foreground tabular-nums">
                      {fmt.money(toNumber(p.monthlyDeposit))}/mo × {fmt.number(p.tenureMonths)} mo @ {fmt.number(rateToPercent(p.interestRate), { maximumFractionDigits: 2 })}%
                      <span className="ml-1 text-xs">({fmt.number(rateToPercent(p.profitTaxAtSource), { maximumFractionDigits: 2 })}% tax)</span>
                    </TableCell>
                    <TableCell label="Progress" className="min-w-36">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={p.tenureMonths}
                          aria-valuenow={monthsPaid}
                          aria-label={`${monthsPaid} of ${p.tenureMonths} installments`}
                        >
                          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {fmt.number(monthsPaid)}/{fmt.number(p.tenureMonths)}
                        </span>
                      </div>
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
                          { kind: "link", label: "Edit", href: `/investments?tab=dps&edit=${p.id}`, icon: <Pencil size={14} /> },
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
        <Pagination page={dpsPage} pageSize={dpsPageSize} total={dpsPlansTotal} basePath="/investments" pageParam="dpsPage" pageSizeParam="dpsPageSize" extraParams={{ ...dpsExtraParams, tab: "dps" }} />
      </Card>
      )}

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
                    <DateInput name="openedDate" defaultValue={toDateInput(d.openedDate)} required />
                  </Field>
                </div>
                <SpSchemeFields
                  schemes={SCHEME_OPTIONS}
                  mode="edit"
                  defaultScheme={d.scheme ?? "OTHER"}
                  defaultHolder={d.holderType}
                  defaultRates={{
                    y1: rateToPercent(d.rateY1),
                    y2: rateToPercent(d.rateY2),
                    // A slab-rated SP shows the rate below the slab; the blended rate is derived.
                    y3: rateToPercent(slabRates(d)?.base ?? d.rateY3),
                  }}
                  defaultSlabRate={d.slabRate == null ? undefined : rateToPercent(d.slabRate)}
                />
                <SpPreview
                  schemeRates={SCHEME_RATES}
                  investedBefore={spInvestedBefore(d)}
                  termMonths={d.termMonths}
                  language={fmt.language}
                  numerals={fmt.numerals}
                />
                <FormActions submitLabel="Save changes" cancel={editCancel()} />
              </ValidatedForm>
            </EditModal>
          ))}

      {editId &&
        dpsPlans
          .filter((p) => p.id === editId)
          .map((p) => (
            <EditModal key={p.id} title={`Edit ${p.label}`} closeHref="/investments?tab=dps">
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
                  <Field label={`${term("interestRate")} (%)`} required>
                    <Input name="interestRate" type="number" step="0.01" min="0" defaultValue={rateToPercent(p.interestRate)} required />
                  </Field>
                  <Field label="Tax at source (%)">
                    <Input name="profitTaxAtSource" type="number" step="0.01" min="0" defaultValue={rateToPercent(p.profitTaxAtSource)} />
                  </Field>
                </div>
                <FormActions submitLabel="Save changes" cancel={editCancel("/investments?tab=dps")} />
              </ValidatedForm>
            </EditModal>
          ))}
    </div>
  );
}
