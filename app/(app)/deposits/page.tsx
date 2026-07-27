import Link from "next/link";
import { PiggyBank, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { formatBDT } from "@/lib/currency";
import { dpsBalanceToDate, projectDepositPlan } from "@/lib/deposit-planner";
import { syncProjectedSpDeposits } from "@/lib/sync-sp-deposits";
import { Card } from "@/components/Card";
import { Modal, ModalForm } from "@/components/Modal";
import { ProjectionTable } from "@/components/ProjectionTable";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditField } from "@/components/EditField";
import { EditModal } from "@/components/EditModal";
import {
  createDpsPlan,
  createFixedDeposit,
  createMilestone,
  deleteDpsPlan,
  deleteFixedDeposit,
  deleteMilestone,
  deleteSalaryConfig,
  saveDepositPlanConfig,
  saveSalaryConfig,
  updateDpsPlan,
  updateFixedDeposit,
  updateMilestone,
  updateSalaryConfig,
} from "./actions";

function toNumber(d: unknown): number {
  return d == null ? 0 : Number(d);
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function toMonthInput(d: Date): string {
  return d.toISOString().slice(0, 7);
}

const TABS = [
  { key: "dps", label: "DPS" },
  { key: "deposits", label: "SP" },
  { key: "assumptions", label: "Plan Assumptions" },
  { key: "salary", label: "Salary Plan by Year" },
  { key: "milestones", label: "Milestones" },
  { key: "projection", label: "Monthly Projection" },
];

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
    plannedPage?: string;
    plannedPageSize?: string;
  }>;
}) {
  const userId = await requireUserId();
  const today = new Date().toISOString().slice(0, 10);
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : "dps";
  const editId = sp.edit;

  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;
  const dir: "asc" | "desc" = sp.dir === "asc" ? "asc" : "desc";

  const plannedPage = Math.max(1, Number(sp.plannedPage) || 1);
  const plannedPageSize = [10, 25, 50, 100].includes(Number(sp.plannedPageSize)) ? Number(sp.plannedPageSize) : 25;

  const dpsSort = sp.sort === "label" || sp.sort === "monthlyDeposit" ? sp.sort : "startMonth";
  const spSort = sp.sort === "label" || sp.sort === "principal" ? sp.sort : "openedDate";
  const salarySort = sp.sort === "monthlySalary" ? sp.sort : "year";
  const milestoneSort = sp.sort === "label" ? sp.sort : "targetAmount";

  await syncProjectedSpDeposits(userId);

  const [
    fixedDeposits,
    fixedDepositsTotal,
    dpsPlans,
    dpsPlansTotal,
    planConfig,
    salaryConfigs,
    salaryConfigsTotal,
    milestones,
    milestonesTotal,
    // Unpaginated copies for the projection engine, which always needs the FULL set
    // regardless of which table page/tab is currently being viewed/sorted.
    allFixedDeposits,
    allDpsPlans,
    allSalaryConfigs,
    allMilestones,
  ] = await Promise.all([
    db.fixedDeposit.findMany({
      where: { userId },
      orderBy: { [spSort]: dir },
      skip: tab === "deposits" ? (page - 1) * pageSize : undefined,
      take: tab === "deposits" ? pageSize : undefined,
    }),
    db.fixedDeposit.count({ where: { userId } }),
    db.dpsPlan.findMany({
      where: { userId },
      orderBy: { [dpsSort]: dir },
      skip: tab === "dps" ? (page - 1) * pageSize : undefined,
      take: tab === "dps" ? pageSize : undefined,
    }),
    db.dpsPlan.count({ where: { userId } }),
    db.depositPlanConfig.findUnique({ where: { userId } }),
    db.salaryConfig.findMany({
      where: { userId },
      orderBy: { [salarySort]: dir },
      skip: tab === "salary" ? (page - 1) * pageSize : undefined,
      take: tab === "salary" ? pageSize : undefined,
    }),
    db.salaryConfig.count({ where: { userId } }),
    db.milestone.findMany({
      where: { userId },
      orderBy: { [milestoneSort]: dir },
      skip: tab === "milestones" ? (page - 1) * pageSize : undefined,
      take: tab === "milestones" ? pageSize : undefined,
    }),
    db.milestone.count({ where: { userId } }),
    db.fixedDeposit.findMany({ where: { userId }, orderBy: { openedDate: "asc" } }),
    db.dpsPlan.findMany({ where: { userId }, orderBy: { startMonth: "asc" } }),
    db.salaryConfig.findMany({ where: { userId }, orderBy: { year: "asc" } }),
    db.milestone.findMany({ where: { userId }, orderBy: { targetAmount: "asc" } }),
  ]);

  const dpsExtraParams = { tab: "dps", sort: dpsSort, dir };
  const spExtraParams = { tab: "deposits", sort: spSort, dir };
  const salaryExtraParams = { tab: "salary", sort: salarySort, dir };
  const milestoneExtraParams = { tab: "milestones", sort: milestoneSort, dir };

  const dpsPlanInputs = allDpsPlans.map((p) => ({
    label: p.label,
    monthlyDeposit: toNumber(p.monthlyDeposit),
    startMonth: p.startMonth,
    tenureMonths: p.tenureMonths,
    interestRate: toNumber(p.interestRate),
    profitTaxAtSource: toNumber(p.profitTaxAtSource),
  }));

  let projectionRows: {
    month: string;
    wealth: number;
    totalDeposited: number;
    dpsBalance: number;
    uninvestedCash: number;
    capReached: boolean;
    prevWealth: number;
    prevUninvestedCash: number;
    salary: number;
    bonus: number;
    passiveIncome: number;
    tax: number;
    livingExpense: number;
    netSaved: number;
    spDeposited: number;
    dpsInstallment: number;
    dpsInterest: number;
    dpsMaturityPayout: number;
    prevDpsBalance: number;
  }[] = [];
  let capReachedAt: string | null = null;
  let milestoneResults: { label: string; targetAmount: number; reachedAt: string | null }[] = [];
  let plannedFutureSpDeposits: { label: string; openedDate: string; principal: number; rateY1: number; rateY2: number; rateY3: number }[] = [];

  if (planConfig && allSalaryConfigs.length > 0) {
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
      allSalaryConfigs.map((s) => ({
        year: s.year,
        monthlySalary: toNumber(s.monthlySalary),
        festivalBonusMultiplier: toNumber(s.festivalBonusMultiplier),
        bonusMonths: s.bonusMonths,
        taxRebate: toNumber(s.taxRebate),
        annualTax: toNumber(s.annualTax),
        monthlyExpense: toNumber(s.monthlyExpense),
      })),
      allFixedDeposits.map((d) => ({
        label: d.label,
        principal: toNumber(d.principal),
        openedDate: d.openedDate,
        rateY1: toNumber(d.rateY1),
        rateY2: toNumber(d.rateY2),
        rateY3: toNumber(d.rateY3),
        termMonths: d.termMonths,
      })),
      allMilestones.map((m) => ({ targetAmount: toNumber(m.targetAmount), label: m.label })),
      240,
      dpsPlanInputs,
    );

    projectionRows = projection.months.map((m, i) => {
      const prev = projection.months[i - 1];
      return {
        month: m.month.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        wealth: m.wealth,
        totalDeposited: m.totalDeposited,
        dpsBalance: m.dpsBalance,
        uninvestedCash: m.uninvestedCash,
        capReached: m.capReached,
        prevWealth: prev ? prev.wealth : planConfig ? toNumber(planConfig.startingNetWorth) : 0,
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
    capReachedAt = projection.capReachedAt
      ? projection.capReachedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : null;
    milestoneResults = projection.milestones.map((m) => ({
      label: m.label,
      targetAmount: m.targetAmount,
      reachedAt: m.reachedAt ? m.reachedAt.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : null,
    }));

    // Everything beyond the deposits we fed in is a future deposit the projection expects
    // to open later — shown as a live preview only, never persisted (materializing future
    // dates as real records would inflate today's net worth before the money exists).
    plannedFutureSpDeposits = projection.spDeposits.slice(allFixedDeposits.length).map((d) => ({
      label: d.label,
      openedDate: d.openedDate.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      principal: d.principal,
      rateY1: d.rateY1,
      rateY2: d.rateY2,
      rateY3: d.rateY3,
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<PiggyBank size={16} />}
        crumbs={[{ label: "Deposits & Investment Planner" }]}
        description="DPS, SP (Sonchoypotro), salary plan, milestones, and the projection to your cap."
      />

      {tab === "dps" && (
        <Card
          title="DPS Plans"
          action={
            <Modal label="Add DPS" title="Add DPS Plan">
              <ModalForm action={createDpsPlan} className="flex flex-col gap-3">
                <input name="label" placeholder="Label" required className="input" />
                <input name="monthlyDeposit" type="number" step="0.01" placeholder="Monthly deposit" required className="input" />
                <input name="startMonth" type="month" defaultValue={today.slice(0, 7)} required className="input" />
                <input name="tenureMonths" type="number" placeholder="Tenure (months)" required className="input" />
                <input name="interestRate" type="number" step="0.01" placeholder="Interest rate % (e.g. 8.75)" required className="input" />
                <input name="profitTaxAtSource" type="number" step="0.01" placeholder="Tax at source % (e.g. 10, blank = 10%)" className="input" />
                <button type="submit" className="btn-primary">
                  Add
                </button>
              </ModalForm>
            </Modal>
          }
        >
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            SP fills up to its cap first each month; DPS installments start once SP is maxed out.
          </p>
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>
                    <SortableHeader label="Label" column="label" currentSort={dpsSort} currentDir={dir} basePath="/deposits" extraParams={dpsExtraParams} />
                  </th>
                  <th>
                    <SortableHeader label="Start" column="startMonth" currentSort={dpsSort} currentDir={dir} basePath="/deposits" extraParams={dpsExtraParams} />
                  </th>
                  <th className="text-right">Terms</th>
                  <th className="text-right">Balance</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
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
                    <tr key={p.id}>
                      <td>{p.label}</td>
                      <td style={{ color: "var(--muted)" }}>{toMonthInput(p.startMonth)}</td>
                      <td className="text-right" style={{ color: "var(--muted)" }}>
                        {formatBDT(toNumber(p.monthlyDeposit))}/mo × {p.tenureMonths}mo @ {(toNumber(p.interestRate) * 100).toFixed(2)}% (
                        {(toNumber(p.profitTaxAtSource) * 100).toFixed(0)}% tax)
                      </td>
                      <td className="text-right font-medium">{formatBDT(balance)}</td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/deposits?tab=dps&edit=${p.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                            <Pencil size={15} />
                          </Link>
                          <form action={deleteDpsPlan.bind(null, p.id)}>
                            <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                              <Trash2 size={15} />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {dpsPlans.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center" style={{ color: "var(--muted)" }}>
                      No DPS plans yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={dpsPlansTotal} basePath="/deposits" extraParams={dpsExtraParams} />
        </Card>
      )}

      {tab === "dps" &&
        editId &&
        dpsPlans
          .filter((p) => p.id === editId)
          .map((p) => (
            <EditModal key={p.id} title="Edit DPS Plan" closeHref="/deposits?tab=dps">
              <form action={updateDpsPlan.bind(null, p.id)} className="flex flex-col gap-3">
                <EditField label="Label">
                  <input name="label" defaultValue={p.label} required className="input" />
                </EditField>
                <EditField label="Monthly deposit">
                  <input name="monthlyDeposit" type="number" step="0.01" defaultValue={toNumber(p.monthlyDeposit)} required className="input" />
                </EditField>
                <EditField label="Start month">
                  <input name="startMonth" type="month" defaultValue={toMonthInput(p.startMonth)} required className="input" />
                </EditField>
                <EditField label="Tenure (months)">
                  <input name="tenureMonths" type="number" defaultValue={p.tenureMonths} required className="input" />
                </EditField>
                <EditField label="Interest rate %">
                  <input name="interestRate" type="number" step="0.01" defaultValue={toNumber(p.interestRate) * 100} required className="input" />
                </EditField>
                <EditField label="Tax at source %">
                  <input
                    name="profitTaxAtSource"
                    type="number"
                    step="0.01"
                    defaultValue={toNumber(p.profitTaxAtSource) * 100}
                    className="input"
                  />
                </EditField>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href="/deposits?tab=dps" className="btn-secondary">
                    Cancel
                  </Link>
                </div>
              </form>
            </EditModal>
          ))}

      {tab === "deposits" && (
        <Card
          title="SP (Sonchoypotro)"
          action={
            <Modal label="Add SP" title="Add SP (Sonchoypotro)">
              <ModalForm action={createFixedDeposit} className="flex flex-col gap-3">
                <input name="label" placeholder="Label" required className="input" />
                <input name="principal" type="number" step="0.01" placeholder="Principal" required className="input" />
                <input name="openedDate" type="date" defaultValue={today} required className="input" />
                <input name="rateY1" type="number" step="0.01" placeholder="Rate Y1 % (e.g. 10.65)" required className="input" />
                <input name="rateY2" type="number" step="0.01" placeholder="Rate Y2 % (e.g. 11.22)" required className="input" />
                <input name="rateY3" type="number" step="0.01" placeholder="Rate Y3 % (e.g. 11.82)" required className="input" />
                <button type="submit" className="btn-primary">
                  Add
                </button>
              </ModalForm>
            </Modal>
          }
        >
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Interest is always paid at the Rate Y3 figure (the bank doesn't step through Y1/Y2 first), net of 5% TDS.
          </p>
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>
                    <SortableHeader label="Label" column="label" currentSort={spSort} currentDir={dir} basePath="/deposits" extraParams={spExtraParams} />
                  </th>
                  <th>
                    <SortableHeader label="Opened" column="openedDate" currentSort={spSort} currentDir={dir} basePath="/deposits" extraParams={spExtraParams} />
                  </th>
                  <th className="text-right">
                    <SortableHeader label="Principal" column="principal" currentSort={spSort} currentDir={dir} basePath="/deposits" extraParams={spExtraParams} />
                  </th>
                  <th className="text-right">Rates</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {fixedDeposits.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.label}
                        {d.source === "PROJECTED" && (
                          <span
                            className="ml-2 rounded px-1.5 py-0.5 text-[0.7rem]"
                            style={{ background: "var(--border)", color: "var(--muted)" }}
                            title="Auto-added by the projection based on Plan Assumptions — edit Plan Assumptions to change it."
                          >
                            auto
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--muted)" }}>{toDateInput(d.openedDate)}</td>
                      <td className="text-right font-medium">{formatBDT(toNumber(d.principal))}</td>
                      <td className="text-right" style={{ color: "var(--muted)" }}>
                        {(toNumber(d.rateY1) * 100).toFixed(2)}% / {(toNumber(d.rateY2) * 100).toFixed(2)}% / {(toNumber(d.rateY3) * 100).toFixed(2)}%
                      </td>
                      <td className="text-right">
                        {d.source === "MANUAL" ? (
                          <div className="flex justify-end gap-1">
                            <Link href={`/deposits?tab=deposits&edit=${d.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                              <Pencil size={15} />
                            </Link>
                            <form action={deleteFixedDeposit.bind(null, d.id)}>
                              <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                                <Trash2 size={15} />
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                ))}
                {fixedDeposits.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center" style={{ color: "var(--muted)" }}>
                      No SPs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={fixedDepositsTotal} basePath="/deposits" extraParams={spExtraParams} />
        </Card>
      )}

      {tab === "deposits" &&
        editId &&
        fixedDeposits
          .filter((d) => d.id === editId && d.source === "MANUAL")
          .map((d) => (
            <EditModal key={d.id} title="Edit SP (Sonchoypotro)" closeHref="/deposits?tab=deposits">
              <form action={updateFixedDeposit.bind(null, d.id)} className="flex flex-col gap-3">
                <EditField label="Label">
                  <input name="label" defaultValue={d.label} required className="input" />
                </EditField>
                <EditField label="Principal">
                  <input name="principal" type="number" step="0.01" defaultValue={toNumber(d.principal)} required className="input" />
                </EditField>
                <EditField label="Opened date">
                  <input name="openedDate" type="date" defaultValue={toDateInput(d.openedDate)} required className="input" />
                </EditField>
                <EditField label="Rate Y1 %">
                  <input name="rateY1" type="number" step="0.01" defaultValue={toNumber(d.rateY1) * 100} required className="input" />
                </EditField>
                <EditField label="Rate Y2 %">
                  <input name="rateY2" type="number" step="0.01" defaultValue={toNumber(d.rateY2) * 100} required className="input" />
                </EditField>
                <EditField label="Rate Y3 %">
                  <input name="rateY3" type="number" step="0.01" defaultValue={toNumber(d.rateY3) * 100} required className="input" />
                </EditField>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href="/deposits?tab=deposits" className="btn-secondary">
                    Cancel
                  </Link>
                </div>
              </form>
            </EditModal>
          ))}

      {tab === "deposits" && plannedFutureSpDeposits.length > 0 && (
        <Card title="Planned (from projection)">
          <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
            Future SP deposits the projection expects to open, based on Plan Assumptions and Salary Plan — a live
            preview only, not yet real. They'll be added automatically once their month arrives.
          </p>
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>Label</th>
                  <th>Opened</th>
                  <th className="text-right">Principal</th>
                  <th className="text-right">Rates</th>
                </tr>
              </thead>
              <tbody>
                {plannedFutureSpDeposits.slice((plannedPage - 1) * plannedPageSize, plannedPage * plannedPageSize).map((d, i) => (
                  <tr key={i}>
                    <td>{d.label}</td>
                    <td style={{ color: "var(--muted)" }}>{d.openedDate}</td>
                    <td className="text-right font-medium">{formatBDT(d.principal)}</td>
                    <td className="text-right" style={{ color: "var(--muted)" }}>
                      {(d.rateY1 * 100).toFixed(2)}% / {(d.rateY2 * 100).toFixed(2)}% / {(d.rateY3 * 100).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={plannedPage}
            pageSize={plannedPageSize}
            total={plannedFutureSpDeposits.length}
            basePath="/deposits"
            extraParams={{ tab: "deposits", page: String(page), pageSize: String(pageSize), sort: spSort, dir }}
            pageParam="plannedPage"
            pageSizeParam="plannedPageSize"
          />
        </Card>
      )}

      {tab === "assumptions" && (
        <Card>
          <form action={saveDepositPlanConfig} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Starting net worth
              <input
                name="startingNetWorth"
                type="number"
                step="0.01"
                defaultValue={planConfig ? toNumber(planConfig.startingNetWorth) : undefined}
                required
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Start month
              <input
                name="startMonth"
                type="month"
                defaultValue={planConfig ? toMonthInput(planConfig.startMonth) : undefined}
                required
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Deposit unit size
              <input
                name="depositUnitSize"
                type="number"
                step="0.01"
                defaultValue={planConfig ? toNumber(planConfig.depositUnitSize) : 100000}
                required
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Profit rate Y1
              <input
                name="profitRateY1"
                type="number"
                step="0.0001"
                defaultValue={planConfig ? toNumber(planConfig.profitRateY1) : undefined}
                required
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Profit rate Y2
              <input
                name="profitRateY2"
                type="number"
                step="0.0001"
                defaultValue={planConfig ? toNumber(planConfig.profitRateY2) : undefined}
                required
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Profit rate Y3
              <input
                name="profitRateY3"
                type="number"
                step="0.0001"
                defaultValue={planConfig ? toNumber(planConfig.profitRateY3) : undefined}
                required
                className="input"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              SP target (30L individual / 60L joint)
              <input
                name="investmentCap"
                type="number"
                step="0.01"
                defaultValue={planConfig ? toNumber(planConfig.investmentCap) : 3000000}
                required
                className="input"
              />
            </label>
            <div className="col-span-2 self-end sm:col-span-4">
              <button type="submit" className="btn-primary">
                Save Assumptions
              </button>
            </div>
          </form>
        </Card>
      )}

      {tab === "salary" && (
        <Card
          title="Salary Plan by Year"
          action={
            <Modal label="Add Year" title="Add Salary Year">
              <ModalForm action={saveSalaryConfig} className="flex flex-col gap-3">
                <input name="year" type="number" placeholder="Year" required className="input" />
                <input name="monthlySalary" type="number" step="0.01" placeholder="Monthly salary" required className="input" />
                <input name="festivalBonusMultiplier" type="number" step="0.01" placeholder="Bonus × salary" defaultValue={0.5} className="input" />
                <input name="bonusMonths" placeholder="Bonus months (e.g. 3,9)" className="input" />
                <input name="taxRebate" type="number" step="0.01" placeholder="Tax rebate" defaultValue={0.1} className="input" />
                <input name="annualTax" type="number" step="0.01" placeholder="Annual tax" required className="input" />
                <input name="monthlyExpense" type="number" step="0.01" placeholder="Expected monthly expense" className="input" />
                <button type="submit" className="btn-primary">
                  Save
                </button>
              </ModalForm>
            </Modal>
          }
        >
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>
                    <SortableHeader label="Year" column="year" currentSort={salarySort} currentDir={dir} basePath="/deposits" extraParams={salaryExtraParams} />
                  </th>
                  <th className="text-right">
                    <SortableHeader label="Salary" column="monthlySalary" currentSort={salarySort} currentDir={dir} basePath="/deposits" extraParams={salaryExtraParams} />
                  </th>
                  <th className="text-right">Expense</th>
                  <th className="text-right">Bonus Months</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {salaryConfigs.map((s) => (
                    <tr key={s.id}>
                      <td>{s.year}</td>
                      <td className="text-right font-medium">{formatBDT(toNumber(s.monthlySalary))}/mo</td>
                      <td className="text-right" style={{ color: "var(--muted)" }}>
                        {formatBDT(toNumber(s.monthlyExpense))}/mo
                      </td>
                      <td className="text-right" style={{ color: "var(--muted)" }}>
                        bonus months: {s.bonusMonths.join(", ") || "none"}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/deposits?tab=salary&edit=${s.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                            <Pencil size={15} />
                          </Link>
                          <form action={deleteSalaryConfig.bind(null, s.id)}>
                            <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                              <Trash2 size={15} />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                ))}
                {salaryConfigs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center" style={{ color: "var(--muted)" }}>
                      No salary years configured — add one to run the projection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={salaryConfigsTotal} basePath="/deposits" extraParams={salaryExtraParams} />
        </Card>
      )}

      {tab === "salary" &&
        editId &&
        salaryConfigs
          .filter((s) => s.id === editId)
          .map((s) => (
            <EditModal key={s.id} title="Edit Salary Year" closeHref="/deposits?tab=salary">
              <form action={updateSalaryConfig.bind(null, s.id)} className="flex flex-col gap-3">
                <EditField label="Year">
                  <input name="year" type="number" defaultValue={s.year} required className="input" />
                </EditField>
                <EditField label="Monthly salary">
                  <input name="monthlySalary" type="number" step="0.01" defaultValue={toNumber(s.monthlySalary)} required className="input" />
                </EditField>
                <EditField label="Bonus × salary">
                  <input
                    name="festivalBonusMultiplier"
                    type="number"
                    step="0.01"
                    defaultValue={toNumber(s.festivalBonusMultiplier)}
                    className="input"
                  />
                </EditField>
                <EditField label="Bonus months">
                  <input name="bonusMonths" defaultValue={s.bonusMonths.join(",")} placeholder="e.g. 3,9" className="input" />
                </EditField>
                <EditField label="Tax rebate">
                  <input name="taxRebate" type="number" step="0.01" defaultValue={toNumber(s.taxRebate)} className="input" />
                </EditField>
                <EditField label="Annual tax">
                  <input name="annualTax" type="number" step="0.01" defaultValue={toNumber(s.annualTax)} required className="input" />
                </EditField>
                <EditField label="Expected monthly expense">
                  <input
                    name="monthlyExpense"
                    type="number"
                    step="0.01"
                    defaultValue={toNumber(s.monthlyExpense)}
                    className="input"
                  />
                </EditField>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href="/deposits?tab=salary" className="btn-secondary">
                    Cancel
                  </Link>
                </div>
              </form>
            </EditModal>
          ))}

      {tab === "milestones" && (
        <Card
          title="Milestones"
          action={
            <Modal label="Add Milestone" title="Add Milestone">
              <ModalForm action={createMilestone} className="flex flex-col gap-3">
                <input name="label" placeholder="Label (e.g. Wealth reaches ৳5,00,000)" required className="input" />
                <input name="targetAmount" type="number" step="0.01" placeholder="Target amount" required className="input" />
                <button type="submit" className="btn-primary">
                  Add
                </button>
              </ModalForm>
            </Modal>
          }
        >
          <div className="overflow-x-auto">
            <table className="table-clean w-full">
              <thead>
                <tr>
                  <th>
                    <SortableHeader label="Label" column="label" currentSort={milestoneSort} currentDir={dir} basePath="/deposits" extraParams={milestoneExtraParams} />
                  </th>
                  <th className="text-right">
                    <SortableHeader label="Target" column="targetAmount" currentSort={milestoneSort} currentDir={dir} basePath="/deposits" extraParams={milestoneExtraParams} />
                  </th>
                  <th className="text-right">Reached</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {milestones.map((m) => {
                  const result = milestoneResults.find((r) => r.label === m.label && r.targetAmount === toNumber(m.targetAmount));
                  return (
                    <tr key={m.id}>
                      <td>{m.label}</td>
                      <td className="text-right font-medium">{formatBDT(toNumber(m.targetAmount))}</td>
                      <td className="text-right" style={{ color: "var(--muted)" }}>
                        {result?.reachedAt ?? "not reached in projection"}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <Link href={`/deposits?tab=milestones&edit=${m.id}`} className="btn-ghost !px-1.5" aria-label="Edit">
                            <Pencil size={15} />
                          </Link>
                          <form action={deleteMilestone.bind(null, m.id)}>
                            <button type="submit" className="btn-ghost !px-1.5" aria-label="Delete">
                              <Trash2 size={15} />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {milestones.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center" style={{ color: "var(--muted)" }}>
                      No milestones set.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={milestonesTotal} basePath="/deposits" extraParams={milestoneExtraParams} />
        </Card>
      )}

      {tab === "milestones" &&
        editId &&
        milestones
          .filter((m) => m.id === editId)
          .map((m) => (
            <EditModal key={m.id} title="Edit Milestone" closeHref="/deposits?tab=milestones">
              <form action={updateMilestone.bind(null, m.id)} className="flex flex-col gap-3">
                <EditField label="Label">
                  <input name="label" defaultValue={m.label} required className="input" />
                </EditField>
                <EditField label="Target amount">
                  <input name="targetAmount" type="number" step="0.01" defaultValue={toNumber(m.targetAmount)} required className="input" />
                </EditField>
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary">
                    Save
                  </button>
                  <Link href="/deposits?tab=milestones" className="btn-secondary">
                    Cancel
                  </Link>
                </div>
              </form>
            </EditModal>
          ))}

      {tab === "projection" && (
        <Card>
          {!planConfig || allSalaryConfigs.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Set plan assumptions and at least one salary year to see a projection.
            </p>
          ) : (
            <>
              {capReachedAt && (
                <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                  SP target reached: {capReachedAt}
                </p>
              )}
              <ProjectionTable rows={projectionRows.slice((page - 1) * pageSize, page * pageSize)} />
              <Pagination
                page={page}
                pageSize={pageSize}
                total={projectionRows.length}
                basePath="/deposits"
                extraParams={{ tab: "projection" }}
              />
            </>
          )}
        </Card>
      )}
    </div>
  );
}
