import { SlidersHorizontal } from "lucide-react";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/current-user";
import { rateToPercent } from "@/lib/rates";
import { toMonthInput } from "@/lib/dates";
import { Card } from "@/components/Card";
import { FormActions } from "@/components/Modal";
import { Field } from "@/components/Field";
import { ValidatedForm } from "@/components/ValidatedForm";
import { MoneyInput } from "@/components/MoneyInput";
import { Input } from "@/components/ui/input";
import { saveDepositPlanConfig } from "../actions";
import { toNumber } from "../shared";

export default async function GoalsPlanPage() {
  const userId = await requireUserId();
  const planConfig = await db.depositPlanConfig.findUnique({ where: { userId } });

  return (
    <Card
      title="Plan assumptions"
      icon={<SlidersHorizontal size={16} />}
    >
      <ValidatedForm action={saveDepositPlanConfig} className="flex flex-col gap-3" successMessage="Plan assumptions saved">
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
        <FormActions submitLabel="Save assumptions" />
      </ValidatedForm>
    </Card>
  );
}

