import { Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { Card } from "@/components/Card";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Field } from "@/components/Field";
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { RowActions } from "@/components/RowActions";
import { SortableHeader } from "@/components/SortableHeader";
import { Pagination } from "@/components/Pagination";
import { EditModal } from "@/components/EditModal";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { deleteSalaryConfig, saveSalaryConfig, updateSalaryConfig } from "../actions";
import { editCancel, MONTHS, toNumber } from "../shared";

export default async function GoalsSalaryPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; sort?: string; dir?: string; page?: string; pageSize?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const sp = await searchParams;
  const editId = sp.edit;
  const sort = sp.sort === "monthlySalary" ? "monthlySalary" : "year";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = [10, 25, 50, 100].includes(Number(sp.pageSize)) ? Number(sp.pageSize) : 25;
  const listHref = "/goals/salary";
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
        title="Salary plan by year"
        description="Salary, bonus and living costs per year. A year without its own row reuses the nearest one."
        action={
          <Modal label="Add year" title="Add salary year" openParam="salary">
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
              <Field label="Expected monthly expense" className="sm:col-span-2">
                <MoneyInput name="monthlyExpense" />
              </Field>
              <div className="sm:col-span-2">
                <FormActions submitLabel="Add year" cancel={<ModalCancel />} />
              </div>
            </ModalForm>
          </Modal>
        }
      >
        <Table responsive>
          <TableHeader>
            <TableRow>
              <TableHead>
                <SortableHeader
                  label="Year"
                  column="year"
                  currentSort={sort}
                  currentDir={dir}
                  basePath="/goals/salary"
                />
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader
                  label="Salary"
                  column="monthlySalary"
                  currentSort={sort}
                  currentDir={dir}
                  basePath="/goals/salary"
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
                      { kind: "link", label: "Edit", href: `${listHref}?edit=${s.id}`, icon: <Pencil size={14} /> },
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
          basePath="/goals/salary"
          extraParams={{ sort, dir }}
        />
      </Card>

      {editId &&
        salaryConfigs
          .filter((s) => s.id === editId)
          .map((s) => (
            <EditModal key={s.id} title={`Edit ${s.year} salary`} closeHref={listHref}>
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
                <Field label="Expected monthly expense" className="sm:col-span-2">
                  <MoneyInput name="monthlyExpense" defaultValue={toNumber(s.monthlyExpense)} />
                </Field>
                <div className="sm:col-span-2">
                  <FormActions submitLabel="Save changes" cancel={editCancel(listHref)} />
                </div>
              </ValidatedForm>
            </EditModal>
          ))}
    </>
  );
}

