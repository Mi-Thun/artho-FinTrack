import Link from "next/link";
import { after } from "next/server";
import { PiggyBank, Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { formatBDT } from "@/lib/currency";
import { dpsBalanceToDate } from "@/lib/deposit-planner";
import { SCHEMES, SCHEME_KEYS, buildCertificatePortfolio } from "@/lib/sanchayapatra";
import { syncUserDataInBackground } from "@/lib/sync";
import { Card } from "@/components/Card";
import { Modal, ModalForm } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditField } from "@/components/EditField";
import { EditModal } from "@/components/EditModal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/Select";
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

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function toMonthInput(d: Date): string {
  return d.toISOString().slice(0, 7);
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
  const today = new Date().toISOString().slice(0, 10);
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
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Label<Input name="label" required /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Monthly deposit<Input name="monthlyDeposit" type="number" step="0.01" required /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Start month<Input name="startMonth" type="month" defaultValue={today.slice(0, 7)} required /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Tenure (months)<Input name="tenureMonths" type="number" required /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Interest rate %<Input name="interestRate" type="number" step="0.01" required /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Tax at source %<Input name="profitTaxAtSource" type="number" step="0.01" /></Label>
                <Button type="submit">Add</Button>
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
                    <TableCell className="text-muted-foreground">{toMonthInput(p.startMonth)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatBDT(toNumber(p.monthlyDeposit))}/mo × {p.tenureMonths}mo @ {(toNumber(p.interestRate) * 100).toFixed(2)}% (
                      {(toNumber(p.profitTaxAtSource) * 100).toFixed(0)}% tax)
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatBDT(balance)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label="Edit" nativeButton={false} render={<Link href={`/deposits?edit=${p.id}`} />}>
                          <Pencil size={15} />
                        </Button>
                        <form action={deleteDpsPlan.bind(null, p.id)}>
                          <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete">
                            <Trash2 size={15} />
                          </Button>
                        </form>
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
                <EditField label="Label">
                  <Input name="label" defaultValue={p.label} required />
                </EditField>
                <EditField label="Monthly deposit">
                  <Input name="monthlyDeposit" type="number" step="0.01" defaultValue={toNumber(p.monthlyDeposit)} required />
                </EditField>
                <EditField label="Start month">
                  <Input name="startMonth" type="month" defaultValue={toMonthInput(p.startMonth)} required />
                </EditField>
                <EditField label="Tenure (months)">
                  <Input name="tenureMonths" type="number" defaultValue={p.tenureMonths} required />
                </EditField>
                <EditField label="Interest rate %">
                  <Input name="interestRate" type="number" step="0.01" defaultValue={toNumber(p.interestRate) * 100} required />
                </EditField>
                <EditField label="Tax at source %">
                  <Input name="profitTaxAtSource" type="number" step="0.01" defaultValue={toNumber(p.profitTaxAtSource) * 100} />
                </EditField>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button variant="secondary" nativeButton={false} render={<Link href="/deposits" />}>
                    Cancel
                  </Button>
                </div>
              </form>
            </EditModal>
          ))}

      <>
          <Card>
            <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
              <StatTile label="Total Invested" value={formatBDT(spPortfolio.totalPrincipal)} />
              <StatTile label="Net Profit to Date" value={formatBDT(spPortfolio.totalNetProfitToDate)} tone="positive" />
              <StatTile label="Source Tax" value={`${(spPortfolio.appliedTaxRate * 100).toFixed(0)}%`} />
              <StatTile label="Live Certificates" value={String(allFixedDeposits.filter((d) => !d.encashedAt).length)} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Source tax is {(spPortfolio.appliedTaxRate * 100).toFixed(0)}% because total investment is{" "}
              {spPortfolio.totalPrincipal > 500000 ? "above" : "at or below"} ৳5,00,000 — it steps from 5% to 10% above
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
                  .map((b) => `${b.schemeLabel} (${formatBDT(b.invested)} of ${formatBDT(b.ceiling!)})`)
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
                <Select
                  name="scheme"
                  defaultValue="PARIWAR"
                  options={[
                    ...SCHEME_KEYS.map((k) => ({ value: k, label: SCHEMES[k].label })),
                    { value: "OTHER", label: "Other / bank FDR" },
                  ]}
                />
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Label<Input name="label" required /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Principal<Input name="principal" type="number" step="0.01" required /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Opened date<Input name="openedDate" type="date" defaultValue={today} required /></Label>
                <Select
                  name="holderType"
                  defaultValue="SINGLE"
                  options={[
                    { value: "SINGLE", label: "Single holder" },
                    { value: "JOINT", label: "Joint holders" },
                  ]}
                />
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Registration number<Input name="registrationNo" /></Label>
                <p className="text-xs text-muted-foreground">
                  Rates and tenure come from the scheme. Choose &ldquo;Other&rdquo; to enter your own below.
                </p>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Rate Y1 %<Input name="rateY1" type="number" step="0.01" /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Rate Y2 %<Input name="rateY2" type="number" step="0.01" /></Label>
                <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">Rate Y3 %<Input name="rateY3" type="number" step="0.01" /></Label>
                <Button type="submit">Add</Button>
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
                  <TableCell className="text-muted-foreground">{toDateInput(d.openedDate)}</TableCell>
                  <TableCell className="text-right font-medium">{formatBDT(toNumber(d.principal))}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {(toNumber(d.rateY1) * 100).toFixed(2)}% / {(toNumber(d.rateY2) * 100).toFixed(2)}% / {(toNumber(d.rateY3) * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {!d.encashedAt && (
                        <form action={encashFixedDeposit.bind(null, d.id)}>
                          <Button type="submit" variant="secondary" size="sm">
                            Encash
                          </Button>
                        </form>
                      )}
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" nativeButton={false} render={<Link href={`/deposits?edit=${d.id}`} />}>
                        <Pencil size={15} />
                      </Button>
                      <form action={deleteFixedDeposit.bind(null, d.id)}>
                        <Button type="submit" variant="ghost" size="icon-sm" aria-label="Delete">
                          <Trash2 size={15} />
                        </Button>
                      </form>
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
                <EditField label="Scheme">
                  <Select
                    name="scheme"
                    defaultValue={d.scheme ?? "OTHER"}
                    options={[
                      ...SCHEME_KEYS.map((k) => ({ value: k, label: SCHEMES[k].label })),
                      { value: "OTHER", label: "Other / bank FDR" },
                    ]}
                  />
                </EditField>
                <EditField label="Label">
                  <Input name="label" defaultValue={d.label} required />
                </EditField>
                <EditField label="Holder">
                  <Select
                    name="holderType"
                    defaultValue={d.holderType}
                    options={[
                      { value: "SINGLE", label: "Single holder" },
                      { value: "JOINT", label: "Joint holders" },
                    ]}
                  />
                </EditField>
                <EditField label="Registration number">
                  <Input name="registrationNo" defaultValue={d.registrationNo ?? ""} />
                </EditField>
                <EditField label="Principal">
                  <Input name="principal" type="number" step="0.01" defaultValue={toNumber(d.principal)} required />
                </EditField>
                <EditField label="Opened date">
                  <Input name="openedDate" type="date" defaultValue={toDateInput(d.openedDate)} required />
                </EditField>
                <EditField label="Rate Y1 %">
                  <Input name="rateY1" type="number" step="0.01" defaultValue={toNumber(d.rateY1) * 100} required />
                </EditField>
                <EditField label="Rate Y2 %">
                  <Input name="rateY2" type="number" step="0.01" defaultValue={toNumber(d.rateY2) * 100} required />
                </EditField>
                <EditField label="Rate Y3 %">
                  <Input name="rateY3" type="number" step="0.01" defaultValue={toNumber(d.rateY3) * 100} required />
                </EditField>
                <div className="flex gap-2">
                  <Button type="submit">Save</Button>
                  <Button variant="secondary" nativeButton={false} render={<Link href="/deposits" />}>
                    Cancel
                  </Button>
                </div>
              </form>
            </EditModal>
          ))}

    </div>
  );
}
