import Link from "next/link";
import { CalendarRange, Flag, Pencil, SlidersHorizontal, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { projectDepositPlan } from "@/lib/deposit-planner";
import { localiseAmountsInText } from "@/lib/i18n";
import { rateToPercent } from "@/lib/rates";
import { toMonthInput } from "@/lib/dates";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { RowActions } from "@/components/RowActions";
import { InfoHint } from "@/components/InfoHint";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { ProjectionTable } from "@/components/ProjectionTable";
import { EditModal } from "@/components/EditModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import {
  createMilestone,
  deleteMilestone,
  deleteSalaryConfig,
  saveDepositPlanConfig,
  saveSalaryConfig,
  updateMilestone,
  updateSalaryConfig,
} from "./actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function editCancel(href: string) {
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={href} />}>
      Cancel
    </Button>
  );
}

/**
 * The plan modules each sort and paginate independently, so their query params are prefixed
 * rather than sharing one `sort`/`page` pair.
 */
export default async function GoalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const sp = await searchParams;

  const get = (key: string): string | undefined => {
    const v = sp[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const pageOf = (key: string) => Math.max(1, Number(get(key)) || 1);
  const pageSizeOf = (key: string) => ([10, 25, 50, 100].includes(Number(get(key))) ? Number(get(key)) : 25);
  const dirOf = (key: string): "asc" | "desc" => (get(key) === "asc" ? "asc" : "desc");

  const salary = {
    page: pageOf("salaryPage"),
    pageSize: pageSizeOf("salaryPageSize"),
    sort: get("salarySort") === "monthlySalary" ? "monthlySalary" : "year",
    dir: dirOf("salaryDir"),
  };
  const milestone = {
    page: pageOf("milestonePage"),
    pageSize: pageSizeOf("milestonePageSize"),
    sort: get("milestoneSort") === "label" ? "label" : "targetAmount",
    dir: dirOf("milestoneDir"),
  };
  const projection = { page: pageOf("projectionPage"), pageSize: pageSizeOf("projectionPageSize") };
  const planned = { page: pageOf("plannedPage"), pageSize: pageSizeOf("plannedPageSize") };

  // Every in-table link rebuilds the URL from scratch, so each table has to carry the
  // other two tables' state along or navigating one would reset the others.
  const carried: Record<string, string | undefined> = {
    salaryPage: String(salary.page),
    salaryPageSize: String(salary.pageSize),
    salarySort: salary.sort,
    salaryDir: salary.dir,
    milestonePage: String(milestone.page),
    milestonePageSize: String(milestone.pageSize),
    milestoneSort: milestone.sort,
    milestoneDir: milestone.dir,
    projectionPage: String(projection.page),
    projectionPageSize: String(projection.pageSize),
    plannedPage: String(planned.page),
    plannedPageSize: String(planned.pageSize),
  };
  const carryExcept = (...drop: string[]) =>
    Object.fromEntries(Object.entries(carried).filter(([k]) => !drop.includes(k))) as Record<string, string>;

  // The projection is the expensive half of the page and both the milestone table and the
  // projection table read it, so it loads once here.
  const plan = await loadProjection(userId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Goals & projection"
        description="Where your savings are heading, month by month, and when you'll reach each milestone."
        actions={
          <>
        <Modal label="Plan assumptions" title="Plan assumptions" variant="secondary" icon={<SlidersHorizontal size={15} />}>
          <AssumptionsSection userId={userId} />
        </Modal>
        <Modal closeOnNavigate={false} label="Salary plan" title="Salary plan by year" variant="secondary" icon={<CalendarRange size={15} />}>
          <SalarySection
            userId={userId}
            fmt={fmt}
            editId={get("editSalary")}
            page={salary.page}
            pageSize={salary.pageSize}
            sort={salary.sort}
            dir={salary.dir}
            carried={carried}
            carryExcept={carryExcept}
          />
        </Modal>
        <Modal closeOnNavigate={false} label="Milestones" title="Milestones" variant="secondary" icon={<Flag size={15} />}>
          <MilestonesSection
            userId={userId}
            fmt={fmt}
            editId={get("editMilestone")}
            page={milestone.page}
            pageSize={milestone.pageSize}
            sort={milestone.sort}
            dir={milestone.dir}
            carried={carried}
            carryExcept={carryExcept}
            plan={plan}
          />
        </Modal>
          </>
        }
      />

      <ProjectionSection
        page={projection.page}
        pageSize={projection.pageSize}
        plannedPage={planned.page}
        plannedPageSize={planned.pageSize}
        carried={carried}
        plan={plan}
        fmt={fmt}
      />
    </div>
  );
}

/** `/goals` carrying the current state of every table, plus any `extra` params. */
function goalsHref(params: Record<string, string | undefined>, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, ...extra })) {
    if (value) q.set(key, value);
  }
  const s = q.toString();
  return s ? `/goals?${s}` : "/goals";
}

type Fmt = Awaited<ReturnType<typeof getLocalisation>>["fmt"];

type Plan = Awaited<ReturnType<typeof loadProjection>>;

type TableSectionProps = {
  userId: string;
  fmt: Fmt;
  editId: string | undefined;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
  carried: Record<string, string | undefined>;
  carryExcept: (...drop: string[]) => Record<string, string>;
};

async function AssumptionsSection({ userId }: { userId: string }) {
  const planConfig = await db.depositPlanConfig.findUnique({ where: { userId } });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        These drive the monthly projection on this page and the month each milestone is reached.
      </p>
      <ModalForm action={saveDepositPlanConfig} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Starting net worth" required>
            <MoneyInput name="startingNetWorth" defaultValue={planConfig ? toNumber(planConfig.startingNetWorth) : undefined} required allowNegative />
          </Field>
          <Field label="Start month" required>
            <Input name="startMonth" type="month" defaultValue={planConfig ? toMonthInput(planConfig.startMonth) : undefined} required />
          </Field>
          <Field label="Deposit unit size" required hint="SP is bought in blocks of this size.">
            <MoneyInput name="depositUnitSize" defaultValue={planConfig ? toNumber(planConfig.depositUnitSize) : 100000} required positive />
          </Field>
          <Field label="SP target" required hint="Ceiling: ৳30 lakh single, ৳60 lakh joint.">
            <MoneyInput name="investmentCap" defaultValue={planConfig ? toNumber(planConfig.investmentCap) : 3000000} required positive />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Profit rate year 1 (%)" required>
            <Input name="profitRateY1" type="number" step="0.01" min="0" defaultValue={planConfig ? rateToPercent(planConfig.profitRateY1) : undefined} required />
          </Field>
          <Field label="Profit rate year 2 (%)" required>
            <Input name="profitRateY2" type="number" step="0.01" min="0" defaultValue={planConfig ? rateToPercent(planConfig.profitRateY2) : undefined} required />
          </Field>
          <Field label="Profit rate year 3 (%)" required>
            <Input name="profitRateY3" type="number" step="0.01" min="0" defaultValue={planConfig ? rateToPercent(planConfig.profitRateY3) : undefined} required />
          </Field>
        </div>
        <FormActions submitLabel="Save assumptions" cancel={<ModalCancel />} />
      </ModalForm>
    </div>
  );
}

async function SalarySection({ userId, fmt, editId, page, pageSize, sort, dir, carried, carryExcept }: TableSectionProps) {
  const [salaryConfigs, total] = await Promise.all([
    db.salaryConfig.findMany({
      where: { userId },
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.salaryConfig.count({ where: { userId } }),
  ]);

  return (
    <>
      {/* No card title: the dialog hosting this list is already titled. */}
      <div id="salary" className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Modal label="Add year" title="Add salary year">
            <ModalForm action={saveSalaryConfig} className="grid grid-cols-1 gap-3 sm:grid-cols-2" successMessage="Salary year added">
              <Field label="Year" required>
                <Input name="year" type="number" step="1" required autoFocus />
              </Field>
              <Field label="Monthly salary" required>
                <MoneyInput name="monthlySalary" required />
              </Field>
              <Field label="Bonus × salary" hint="e.g. 0.5 for half a month's salary.">
                <Input name="festivalBonusMultiplier" type="number" step="0.01" min="0" defaultValue={0.5} />
              </Field>
              <Field label="Bonus months" hint="Month numbers, comma-separated, e.g. 3,9.">
                <Input name="bonusMonths" placeholder="3,9" />
              </Field>
              <Field label="Tax rebate" hint="Fraction of tax refunded, e.g. 0.1.">
                <Input name="taxRebate" type="number" step="0.01" min="0" defaultValue={0.1} />
              </Field>
              <Field label="Annual tax" required>
                <MoneyInput name="annualTax" required />
              </Field>
              <Field label="Expected monthly expense" className="sm:col-span-2">
                <MoneyInput name="monthlyExpense" />
              </Field>
              <div className="sm:col-span-2">
                <FormActions submitLabel="Add year" cancel={<ModalCancel />} />
              </div>
            </ModalForm>
          </Modal>
        </div>
        <Table responsive>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader
                  label="Year"
                  column="year"
                  currentSort={sort}
                  currentDir={dir}
                  basePath="/goals"
                  sortParam="salarySort"
                  dirParam="salaryDir"
                  extraParams={carryExcept("salarySort", "salaryDir")}
                />
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader
                  label="Salary"
                  column="monthlySalary"
                  currentSort={sort}
                  currentDir={dir}
                  basePath="/goals"
                  sortParam="salarySort"
                  dirParam="salaryDir"
                  extraParams={carryExcept("salarySort", "salaryDir")}
                />
              </TableHead>
              <TableHead className="text-right">Expense</TableHead>
              <TableHead className="text-right">Bonus months</TableHead>
              <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salaryConfigs.map((s) => (
              <TableRow key={s.id}>
                <TableCell primary className="tabular-nums">{s.year}</TableCell>
                <TableCell label="Salary" className="text-right font-medium tabular-nums">{fmt.money(toNumber(s.monthlySalary))}/mo</TableCell>
                <TableCell label="Expense" className="text-right text-muted-foreground tabular-nums">{fmt.money(toNumber(s.monthlyExpense))}/mo</TableCell>
                <TableCell label="Bonus months" className="text-right text-muted-foreground">{s.bonusMonths.map((m) => MONTHS[m - 1]).join(", ") || "None"}</TableCell>
                <TableCell actions className="text-right">
                  <RowActions
                    label={`Actions for salary year ${s.year}`}
                    actions={[
                      { kind: "link", label: "Edit", href: goalsHref(carried, { editSalary: s.id }), icon: <Pencil size={14} /> },
                      {
                        kind: "confirm",
                        label: "Delete",
                        icon: <Trash2 size={14} />,
                        action: deleteSalaryConfig.bind(null, s.id),
                        title: `Delete the ${s.year} salary plan?`,
                        description: `The projection will reuse the nearest other year's figures for ${s.year}.`,
                        successMessage: "Salary year deleted",
                      },
                    ]}
                  />
                </TableCell>
              </TableRow>
            ))}
            {salaryConfigs.length === 0 && (
              <TableRow>
                <TableCell empty colSpan={5} className="py-4 text-center text-muted-foreground">
                  No salary years configured — add one to run the projection.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          basePath="/goals"
          pageParam="salaryPage"
          pageSizeParam="salaryPageSize"
          extraParams={carryExcept("salaryPage", "salaryPageSize")}
        />
      </div>

      {editId &&
        salaryConfigs
          .filter((s) => s.id === editId)
          .map((s) => (
            <EditModal key={s.id} title={`Edit ${s.year} salary`} closeHref={goalsHref(carried)}>
              <ValidatedForm action={updateSalaryConfig.bind(null, s.id)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Year" required>
                  <Input name="year" type="number" step="1" defaultValue={s.year} required />
                </Field>
                <Field label="Monthly salary" required>
                  <MoneyInput name="monthlySalary" defaultValue={toNumber(s.monthlySalary)} required />
                </Field>
                <Field label="Bonus × salary" hint="e.g. 0.5 for half a month's salary.">
                  <Input name="festivalBonusMultiplier" type="number" step="0.01" min="0" defaultValue={toNumber(s.festivalBonusMultiplier)} />
                </Field>
                <Field label="Bonus months" hint="Month numbers, comma-separated, e.g. 3,9.">
                  <Input name="bonusMonths" defaultValue={s.bonusMonths.join(",")} placeholder="3,9" />
                </Field>
                <Field label="Tax rebate" hint="Fraction of tax refunded, e.g. 0.1.">
                  <Input name="taxRebate" type="number" step="0.01" min="0" defaultValue={toNumber(s.taxRebate)} />
                </Field>
                <Field label="Annual tax" required>
                  <MoneyInput name="annualTax" defaultValue={toNumber(s.annualTax)} required />
                </Field>
                <Field label="Expected monthly expense" className="sm:col-span-2">
                  <MoneyInput name="monthlyExpense" defaultValue={toNumber(s.monthlyExpense)} />
                </Field>
                <div className="sm:col-span-2">
                  <FormActions submitLabel="Save changes" cancel={editCancel(goalsHref(carried))} />
                </div>
              </ValidatedForm>
            </EditModal>
          ))}
    </>
  );
}

/**
 * The projection every plan-driven section reads from. Returns null until both halves of the
 * plan exist, which is what the empty states below key off.
 */
async function loadProjection(userId: string) {
  const [planConfig, salaryConfigs, fixedDeposits, dpsPlans, milestones] = await Promise.all([
    db.depositPlanConfig.findUnique({ where: { userId } }),
    db.salaryConfig.findMany({ where: { userId }, orderBy: { year: "asc" } }),
    db.fixedDeposit.findMany({ where: { userId }, orderBy: { openedDate: "asc" } }),
    db.dpsPlan.findMany({ where: { userId }, orderBy: { startMonth: "asc" } }),
    db.milestone.findMany({ where: { userId }, orderBy: { targetAmount: "asc" } }),
  ]);

  if (!planConfig || salaryConfigs.length === 0) return null;

  const startingNetWorth = toNumber(planConfig.startingNetWorth);
  const projection = projectDepositPlan(
    {
      startingNetWorth: toNumber(planConfig.startingNetWorth),
      startMonth: planConfig.startMonth,
      depositUnitSize: toNumber(planConfig.depositUnitSize),
      profitRateY1: toNumber(planConfig.profitRateY1),
      profitRateY2: toNumber(planConfig.profitRateY2),
      profitRateY3: toNumber(planConfig.profitRateY3),
      investmentCap: toNumber(planConfig.investmentCap),
    },
    salaryConfigs.map((s) => ({
      year: s.year,
      monthlySalary: toNumber(s.monthlySalary),
      festivalBonusMultiplier: toNumber(s.festivalBonusMultiplier),
      bonusMonths: s.bonusMonths,
      taxRebate: toNumber(s.taxRebate),
      annualTax: toNumber(s.annualTax),
      monthlyExpense: toNumber(s.monthlyExpense),
    })),
    fixedDeposits.map((d) => ({
      label: d.label,
      principal: toNumber(d.principal),
      openedDate: d.openedDate,
      rateY1: toNumber(d.rateY1),
      rateY2: toNumber(d.rateY2),
      rateY3: toNumber(d.rateY3),
      termMonths: d.termMonths,
    })),
    milestones.map((m) => ({ targetAmount: toNumber(m.targetAmount), label: m.label })),
    240,
    dpsPlans.map((p) => ({
      label: p.label,
      monthlyDeposit: toNumber(p.monthlyDeposit),
      startMonth: p.startMonth,
      tenureMonths: p.tenureMonths,
      interestRate: toNumber(p.interestRate),
      profitTaxAtSource: toNumber(p.profitTaxAtSource),
    })),
  );

  return { projection, startingNetWorth, existingDepositCount: fixedDeposits.length };
}

/** Shown wherever a section needs the plan but the plan is not complete yet. */
function PlanNeeded() {
  return (
    <p className="text-sm text-muted-foreground">
      Fill in <Link href="#assumptions" className="underline">plan assumptions</Link> and at least one{" "}
      <Link href="#salary" className="underline">salary year</Link> above to run the projection.
    </p>
  );
}

async function MilestonesSection({
  userId,
  fmt,
  editId,
  page,
  pageSize,
  sort,
  dir,
  carried,
  carryExcept,
  plan,
}: TableSectionProps & { plan: Plan }) {
  // "Reached" is not stored — it falls out of the projection, which the page loads once
  // and hands to both this section and the projection table below.
  const [milestones, total] = await Promise.all([
    db.milestone.findMany({
      where: { userId },
      orderBy: { [sort]: dir },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.milestone.count({ where: { userId } }),
  ]);


  const milestoneResults = (plan?.projection.milestones ?? []).map((m) => ({
    label: m.label,
    targetAmount: m.targetAmount,
    reachedAt: m.reachedAt ? fmt.monthYear(m.reachedAt) : null,
  }));

  return (
    <>
      <div id="milestones" className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Modal label="Add milestone" title="Add milestone">
            <ModalForm action={createMilestone} className="flex flex-col gap-3" successMessage="Milestone added">
              <Field label="Label" required>
                <Input name="label" required autoFocus placeholder="e.g. Emergency fund" />
              </Field>
              <Field label="Target amount" required hint="Reached when accumulated savings in the projection hit this amount.">
                <MoneyInput name="targetAmount" required positive />
              </Field>
              <FormActions submitLabel="Add milestone" cancel={<ModalCancel />} />
            </ModalForm>
          </Modal>
        </div>
        {!plan && (
          <div className="mb-4">
            <PlanNeeded />
          </div>
        )}
        <Table responsive>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader
                  label="Label"
                  column="label"
                  currentSort={sort}
                  currentDir={dir}
                  basePath="/goals"
                  sortParam="milestoneSort"
                  dirParam="milestoneDir"
                  extraParams={carryExcept("milestoneSort", "milestoneDir")}
                />
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader
                  label="Target"
                  column="targetAmount"
                  currentSort={sort}
                  currentDir={dir}
                  basePath="/goals"
                  sortParam="milestoneSort"
                  dirParam="milestoneDir"
                  extraParams={carryExcept("milestoneSort", "milestoneDir")}
                />
              </TableHead>
              <TableHead className="text-right">Reached</TableHead>
              <TableHead className="w-10"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {milestones.map((m) => {
              const result = milestoneResults.find((r) => r.label === m.label && r.targetAmount === toNumber(m.targetAmount));
              return (
                <TableRow key={m.id}>
                  <TableCell primary className="whitespace-normal">{localiseAmountsInText(m.label, fmt.money)}</TableCell>
                  <TableCell label="Target" className="text-right font-medium whitespace-nowrap tabular-nums">{fmt.money(toNumber(m.targetAmount))}</TableCell>
                  <TableCell label="Reached" className="text-right text-muted-foreground">{result?.reachedAt ?? "Not reached"}</TableCell>
                  <TableCell actions className="text-right">
                    <RowActions
                      label={`Actions for milestone ${m.label}`}
                      actions={[
                        { kind: "link", label: "Edit", href: goalsHref(carried, { editMilestone: m.id }), icon: <Pencil size={14} /> },
                        {
                          kind: "confirm",
                          label: "Delete",
                          icon: <Trash2 size={14} />,
                          action: deleteMilestone.bind(null, m.id),
                          title: "Delete milestone?",
                          description: `Delete "${localiseAmountsInText(m.label, fmt.money)}"?`,
                          successMessage: "Milestone deleted",
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
            {milestones.length === 0 && (
              <TableRow>
                <TableCell empty colSpan={4} className="py-4 text-center text-muted-foreground">
                  No milestones set.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          basePath="/goals"
          pageParam="milestonePage"
          pageSizeParam="milestonePageSize"
          extraParams={carryExcept("milestonePage", "milestonePageSize")}
        />
      </div>

      {editId &&
        milestones
          .filter((m) => m.id === editId)
          .map((m) => (
            <EditModal key={m.id} title="Edit milestone" closeHref={goalsHref(carried)}>
              <ValidatedForm action={updateMilestone.bind(null, m.id)} className="flex flex-col gap-3">
                <Field label="Label" required>
                  <Input name="label" defaultValue={m.label} required />
                </Field>
                <Field label="Target amount" required>
                  <MoneyInput name="targetAmount" defaultValue={toNumber(m.targetAmount)} required positive />
                </Field>
                <FormActions submitLabel="Save changes" cancel={editCancel(goalsHref(carried))} />
              </ValidatedForm>
            </EditModal>
          ))}
    </>
  );
}

function ProjectionSection({
  page,
  pageSize,
  plannedPage,
  plannedPageSize,
  carried,
  plan,
  fmt,
}: {
  page: number;
  pageSize: number;
  plannedPage: number;
  plannedPageSize: number;
  carried: Record<string, string | undefined>;
  plan: Plan;
  fmt: Fmt;
}) {
  if (!plan) {
    return (
      <Card id="projection" title="Monthly projection">
        <PlanNeeded />
      </Card>
    );
  }

  const { projection, startingNetWorth } = plan;
  const plannedDeposits = projection.spDeposits.slice(plan.existingDepositCount);

  const rows = projection.months.map((m, i) => {
    const prev = projection.months[i - 1];
    return {
      month: fmt.monthYear(m.month),
      wealth: m.wealth,
      totalDeposited: m.totalDeposited,
      dpsBalance: m.dpsBalance,
      uninvestedCash: m.uninvestedCash,
      capReached: m.capReached,
      prevWealth: prev ? prev.wealth : startingNetWorth,
      prevUninvestedCash: prev ? prev.uninvestedCash : 0,
      salary: m.salary,
      bonus: m.bonus,
      passiveIncome: m.passiveIncome,
      tax: m.tax,
      livingExpense: m.livingExpense,
      netSaved: m.netSaved,
      spDeposited: m.spDeposited,
      dpsInstallment: m.dpsInstallment,
      dpsInterest: m.dpsInterest,
      dpsMaturityPayout: m.dpsMaturityPayout,
      prevDpsBalance: prev ? prev.dpsBalance : 0,
    };
  });

  const capReachedAt = projection.capReachedAt
    ? fmt.monthYear(projection.capReachedAt)
    : null;

  return (
    <>
      <Card
        id="projection"
        title="Monthly projection"
        description={capReachedAt ? `SP target reached ${capReachedAt}.` : "SP target not reached within the projection."}
        action={
          <InfoHint label="About accumulated savings">
            Accumulated savings is the plan&apos;s starting net worth plus everything saved since. SP held before the
            plan start only counts if it was included in the starting figure, and DPS is excluded until it matures.
            Click ⓘ on any cell for the month&apos;s breakdown.
          </InfoHint>
        }
      >
        <ProjectionTable rows={rows.slice((page - 1) * pageSize, page * pageSize)} language={fmt.language} numerals={fmt.numerals} />
        <Pagination
          page={page}
          pageSize={pageSize}
          total={rows.length}
          basePath="/goals"
          pageParam="projectionPage"
          pageSizeParam="projectionPageSize"
          extraParams={carried}
        />
      </Card>

      {plannedDeposits.length > 0 && (
        <Card
          title="Planned SP deposits"
          description="Expected from your plan assumptions and salary plan. A preview only — these aren't real records yet."
          className="border-2 border-dashed ring-0"
          action={<span className="rounded-full bg-info-soft px-2 py-0.5 text-xs font-medium text-link">Preview</span>}
        >
          <Table responsive>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Opens</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Rates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plannedDeposits.slice((plannedPage - 1) * plannedPageSize, plannedPage * plannedPageSize).map((deposit) => (
                <TableRow key={`${deposit.label}-${deposit.openedDate.toISOString()}`}>
                  <TableCell primary>{deposit.label}</TableCell>
                  <TableCell label="Opens" className="text-muted-foreground">{fmt.monthYear(deposit.openedDate)}</TableCell>
                  <TableCell label="Principal" className="text-right font-medium tabular-nums">{fmt.money(deposit.principal)}</TableCell>
                  <TableCell label="Rates" className="text-right text-muted-foreground tabular-nums">
                    {fmt.number(rateToPercent(deposit.rateY1), { maximumFractionDigits: 2 })}% / {fmt.number(rateToPercent(deposit.rateY2), { maximumFractionDigits: 2 })}% / {fmt.number(rateToPercent(deposit.rateY3), { maximumFractionDigits: 2 })}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Pagination
            page={plannedPage}
            pageSize={plannedPageSize}
            total={plannedDeposits.length}
            basePath="/goals"
            pageParam="plannedPage"
            pageSizeParam="plannedPageSize"
            extraParams={carried}
          />
        </Card>
      )}
    </>
  );
}
