import { Pencil, Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { localiseAmountsInText } from "@/lib/i18n";
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
import { createMilestone, deleteMilestone, updateMilestone } from "../actions";
import { editCancel, loadProjection, PlanNeeded, toNumber } from "../shared";
import { pageSizeFrom } from "@/lib/pagination";

export default async function GoalsMilestonesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; sort?: string; dir?: string; page?: string; pageSize?: string }>;
}) {
  const userId = await requireUserId();
  const { fmt } = await getLocalisation(userId);
  const sp = await searchParams;
  const editId = sp.edit;
  const sort = sp.sort === "label" ? "label" : "targetAmount";
  const dir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = pageSizeFrom(sp.pageSize);
  const listHref = "/goals/milestones";
  const plan = await loadProjection(userId);
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
      <Card
        title="Milestones"
        description="Targets for accumulated savings. The projection works out the month each one is reached."
        action={
          <Modal label="Add milestone" title="Add milestone" openParam="milestone">
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
        }
      >
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
                  basePath="/goals/milestones"
                />
              </TableHead>
              <TableHead className="text-right">
                <SortableHeader
                  label="Target"
                  column="targetAmount"
                  currentSort={sort}
                  currentDir={dir}
                  basePath="/goals/milestones"
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
                        { kind: "link", label: "Edit", href: `${listHref}?edit=${m.id}`, icon: <Pencil size={14} /> },
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
          basePath="/goals/milestones"
          extraParams={{ sort, dir }}
        />
      </Card>

      {editId &&
        milestones
          .filter((m) => m.id === editId)
          .map((m) => (
            <EditModal key={m.id} title="Edit milestone" closeHref={listHref}>
              <ValidatedForm action={updateMilestone.bind(null, m.id)} className="flex flex-col gap-3">
                <Field label="Label" required>
                  <Input name="label" defaultValue={m.label} required />
                </Field>
                <Field label="Target amount" required>
                  <MoneyInput name="targetAmount" defaultValue={toNumber(m.targetAmount)} required positive />
                </Field>
                <FormActions submitLabel="Save changes" cancel={editCancel(listHref)} />
              </ValidatedForm>
            </EditModal>
          ))}
    </>
  );
}

