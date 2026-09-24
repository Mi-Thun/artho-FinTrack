import Link from "next/link";
import { Target, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { projectDepositPlan } from "@/lib/deposit-planner";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Modal, ModalForm } from "@/components/Modal";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { ProjectionTable } from "@/components/ProjectionTable";
import { EditField } from "@/components/EditField";
import { EditModal } from "@/components/EditModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
function toMonthInput(d: Date): string {
  return d.toISOString().slice(0, 7);
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
        icon={<Target size={16} />}
        crumbs={[{ label: "Goals" }]}
        actions={
          <>
        <Modal label="Plan Assumptions" title="Plan Assumptions" variant="secondary">
          <AssumptionsSection userId={userId} />
        </Modal>
        <Modal label="Salary Plan by Year" title="Salary Plan by Year" variant="secondary">
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
        <Modal label="Milestones" title="Milestones" variant="secondary">
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
      <p className="mb-4 text-sm text-muted-foreground">
        These drive the monthly projection under Deposits and the month each milestone is reached.
      </p>
      <form action={saveDepositPlanConfig} className="flex flex-col gap-3">
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          Starting net worth
          <Input name="startingNetWorth" type="number" step="0.01" defaultValue={planConfig ? toNumber(planConfig.startingNetWorth) : undefined} required />
        </Label>
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          Start month
          <Input name="startMonth" type="month" defaultValue={planConfig ? toMonthInput(planConfig.startMonth) : undefined} required />
        </Label>
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          Deposit unit size
          <Input name="depositUnitSize" type="number" step="0.01" defaultValue={planConfig ? toNumber(planConfig.depositUnitSize) : 100000} required />
        </Label>
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          Profit rate Y1
          <Input name="profitRateY1" type="number" step="0.0001" defaultValue={planConfig ? toNumber(planConfig.profitRateY1) : undefined} required />
        </Label>
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          Profit rate Y2
          <Input name="profitRateY2" type="number" step="0.0001" defaultValue={planConfig ? toNumber(planConfig.profitRateY2) : undefined} required />
        </Label>
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          Profit rate Y3
          <Input name="profitRateY3" type="number" step="0.0001" defaultValue={planConfig ? toNumber(planConfig.profitRateY3) : undefined} required />
        </Label>
        <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
          SP target (30L individual / 60L joint)
          <Input name="investmentCap" type="number" step="0.01" defaultValue={planConfig ? toNumber(planConfig.investmentCap) : 3000000} required />
        </Label>
        <Button type="submit" className="w-full">Save Assumptions</Button>
      </form>
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
      <Card
        id="salary"
        title="Salary Plan by Year"
        action={
          <Modal label="Add Year" title="Add Salary Year">
            <ModalForm action={saveSalaryConfig} className="flex flex-col gap-3">
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Year<Input name="year" type="number" required /></Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Monthly salary<Input name="monthlySalary" type="number" step="0.01" required /></Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Bonus × salary<Input name="festivalBonusMultiplier" type="number" step="0.01" defaultValue={0.5} /></Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Bonus months<Input name="bonusMonths" /></Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Tax rebate<Input name="taxRebate" type="number" step="0.01" defaultValue={0.1} /></Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Annual tax<Input name="annualTax" type="number" step="0.01" required /></Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Expected monthly expense<Input name="monthlyExpense" type="number" step="0.01" /></Label>
              <Button type="submit" className="w-full">Save</Button>
            </ModalForm>
          </Modal>
        }
      >
        <Table>
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
              <TableHead className="text-right">Bonus Months</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {salaryConfigs.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.year}</TableCell>
                <TableCell className="text-right font-medium">{fmt.money(toNumber(s.monthlySalary))}/mo</TableCell>
                <TableCell className="text-right text-muted-foreground">{fmt.money(toNumber(s.monthlyExpense))}/mo</TableCell>
                <TableCell className="text-right text-muted-foreground">bonus months: {s.bonusMonths.join(", ") || "none"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit" nativeButton={false} render={<Link href={goalsHref(carried, { editSalary: s.id })} />}>
                      <Pencil size={15} />
                    </Button>
                    <form action={deleteSalaryConfig.bind(null, s.id)}>
                      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete">
                        <Trash2 size={15} />
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {salaryConfigs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-4 text-center text-muted-foreground">
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
      </Card>

      {editId &&
        salaryConfigs
          .filter((s) => s.id === editId)
          .map((s) => (
            <EditModal key={s.id} title="Edit Salary Year" closeHref={goalsHref(carried)}>
              <form action={updateSalaryConfig.bind(null, s.id)} className="flex flex-col gap-3">
                <EditField label="Year">
                  <Input name="year" type="number" defaultValue={s.year} required />
                </EditField>
                <EditField label="Monthly salary">
                  <Input name="monthlySalary" type="number" step="0.01" defaultValue={toNumber(s.monthlySalary)} required />
                </EditField>
                <EditField label="Bonus × salary">
                  <Input name="festivalBonusMultiplier" type="number" step="0.01" defaultValue={toNumber(s.festivalBonusMultiplier)} />
                </EditField>
                <EditField label="Bonus months">
                  <Input name="bonusMonths" defaultValue={s.bonusMonths.join(",")} placeholder="e.g. 3,9" />
                </EditField>
                <EditField label="Tax rebate">
                  <Input name="taxRebate" type="number" step="0.01" defaultValue={toNumber(s.taxRebate)} />
                </EditField>
                <EditField label="Annual tax">
                  <Input name="annualTax" type="number" step="0.01" defaultValue={toNumber(s.annualTax)} required />
                </EditField>
                <EditField label="Expected monthly expense">
                  <Input name="monthlyExpense" type="number" step="0.01" defaultValue={toNumber(s.monthlyExpense)} />
                </EditField>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button variant="secondary" nativeButton={false} render={<Link href={goalsHref(carried)} />}>
                    Cancel
                  </Button>
                </div>
              </form>
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
    reachedAt: m.reachedAt ? m.reachedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null,
  }));

  return (
    <>
      <Card
        id="milestones"
        title="Milestones"
        action={
          <Modal label="Add Milestone" title="Add Milestone">
            <ModalForm action={createMilestone} className="flex flex-col gap-3">
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Label<Input name="label" required /></Label>
              <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Target amount<Input name="targetAmount" type="number" step="0.01" required /></Label>
              <Button type="submit" className="w-full">Add</Button>
            </ModalForm>
          </Modal>
        }
      >
        {!plan && (
          <div className="mb-4">
            <PlanNeeded />
          </div>
        )}
        <Table>
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
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {milestones.map((m) => {
              const result = milestoneResults.find((r) => r.label === m.label && r.targetAmount === toNumber(m.targetAmount));
              return (
                <TableRow key={m.id}>
                  <TableCell>{m.label}</TableCell>
                  <TableCell className="text-right font-medium">{fmt.money(toNumber(m.targetAmount))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{result?.reachedAt ?? "not reached in projection"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" nativeButton={false} render={<Link href={goalsHref(carried, { editMilestone: m.id })} />}>
                        <Pencil size={15} />
                      </Button>
                      <form action={deleteMilestone.bind(null, m.id)}>
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete">
                          <Trash2 size={15} />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {milestones.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-4 text-center text-muted-foreground">
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
      </Card>

      {editId &&
        milestones
          .filter((m) => m.id === editId)
          .map((m) => (
            <EditModal key={m.id} title="Edit Milestone" closeHref={goalsHref(carried)}>
              <form action={updateMilestone.bind(null, m.id)} className="flex flex-col gap-3">
                <EditField label="Label">
                  <Input name="label" defaultValue={m.label} required />
                </EditField>
                <EditField label="Target amount">
                  <Input name="targetAmount" type="number" step="0.01" defaultValue={toNumber(m.targetAmount)} required />
                </EditField>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button variant="secondary" nativeButton={false} render={<Link href={goalsHref(carried)} />}>
                    Cancel
                  </Button>
                </div>
              </form>
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
      <Card id="projection" title="Monthly Projection">
        <PlanNeeded />
      </Card>
    );
  }

  const { projection, startingNetWorth } = plan;
  const plannedDeposits = projection.spDeposits.slice(plan.existingDepositCount);

  const rows = projection.months.map((m, i) => {
    const prev = projection.months[i - 1];
    return {
      month: m.month.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
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
    ? projection.capReachedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  return (
    <>
      <Card id="projection" title="Monthly Projection">
        {capReachedAt && <p className="mb-3 text-sm text-muted-foreground">SP target reached: {capReachedAt}</p>}
        <ProjectionTable rows={rows.slice((page - 1) * pageSize, page * pageSize)} />
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
        <Card title="Planned (from projection)">
          <p className="mb-4 text-sm text-muted-foreground">
            Future SP deposits expected from the Plan Assumptions and Salary Plan. This is a live preview only; these
            deposits are not real records yet.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Rates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plannedDeposits.slice((plannedPage - 1) * plannedPageSize, plannedPage * plannedPageSize).map((deposit) => (
                <TableRow key={`${deposit.label}-${deposit.openedDate.toISOString()}`}>
                  <TableCell>{deposit.label}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {deposit.openedDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmt.money(deposit.principal)}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {(deposit.rateY1 * 100).toFixed(2)}% / {(deposit.rateY2 * 100).toFixed(2)}% / {(deposit.rateY3 * 100).toFixed(2)}%
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
