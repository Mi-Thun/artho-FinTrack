import { ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2, Printer, RotateCcw } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { todayInputValue } from "@/lib/dates";
import { getReturn } from "@/lib/ereturn/load";
import { assessmentYearOf } from "@/lib/ereturn/rules";
import { PageHeader } from "@/components/PageHeader";
import { SubNav } from "@/components/SubNav";
import { Field } from "@/components/Field";
import { DateInput } from "@/components/DateInput";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormActions, Modal, ModalCancel, ModalForm } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markFiled, reopenReturn } from "../actions";

/** One return: a header with its status and filing actions, and the form's parts as tabs. */
export default async function ReturnLayout({ children, params }: { children: ReactNode; params: Promise<{ year: string }> }) {
  const userId = await requireUserId();
  const { year } = await params;
  const [{ record }, { fmt }] = await Promise.all([getReturn(userId, year), getLocalisation(userId)]);
  const base = `/ereturn/${year}`;
  const filed = record.status === "FILED";

  const tabs = [
    { href: base, label: "Summary" },
    { href: `${base}/import`, label: "Import documents" },
    { href: `${base}/taxpayer`, label: "Taxpayer" },
    { href: `${base}/income`, label: "Income" },
    { href: `${base}/tax`, label: "Tax & rebate" },
    { href: `${base}/wealth`, label: "Assets & expenses" },
    { href: `${base}/file`, label: "File on eReturn" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Return ${assessmentYearOf(year)}`}
        back={{ href: "/ereturn", label: "eReturn" }}
        description={
          <>
            Income year {year} (1 Jul {year.slice(0, 4)} – 30 Jun {Number(year.slice(0, 4)) + 1}) ·{" "}
            {filed ? (
              <span className="font-medium text-success">
                Filed{record.filedAt ? ` ${fmt.day(record.filedAt)}` : ""}
                {record.serialNo ? ` · serial ${record.serialNo}` : ""}
              </span>
            ) : (
              "Draft"
            )}
          </>
        }
        actions={
          <>
            {filed ? (
              <ConfirmDialog
                action={reopenReturn.bind(null, record.id)}
                title="Reopen as a draft?"
                description="Marks the return as not yet filed. Nothing entered is changed, and you can mark it filed again."
                confirmLabel="Reopen"
                tone="default"
                successMessage="Return reopened"
                triggerLabel="Reopen"
                triggerIcon={<RotateCcw size={14} />}
                triggerVariant="outline"
              />
            ) : (
              <Modal label="Mark as filed" title="Mark as filed" variant="secondary" size="compact" icon={<CheckCircle2 size={15} />}>
                <ModalForm action={markFiled.bind(null, record.id)} className="flex flex-col gap-3" successMessage="Return marked as filed">
                  <Field label="Date submitted" required>
                    <DateInput name="filedAt" defaultValue={todayInputValue()} required />
                  </Field>
                  <Field label="Serial no. of return register" hint="From the acknowledgement NBR gives you.">
                    <Input name="serialNo" defaultValue={record.serialNo ?? ""} />
                  </Field>
                  <FormActions submitLabel="Mark as filed" cancel={<ModalCancel />} />
                </ModalForm>
              </Modal>
            )}
            <Button nativeButton={false} render={<Link href={`/ereturn-print/${year}`} target="_blank" />}>
              <Printer size={15} />
              Print return
            </Button>
          </>
        }
      >
        <SubNav items={tabs} label="Return sections" />
      </PageHeader>
      {children}
    </div>
  );
}
