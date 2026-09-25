"use client";

import { useState } from "react";
import { Field } from "@/components/Field";
import { Select } from "@/components/Select";

type TxType = "EXPENSE" | "INCOME";

/**
 * Type + Category + Account for transaction and recurring forms. Categories are filtered
 * to the chosen type — an expense can't be filed under Salary — and the category resets
 * whenever the type changes, so a stale income category can't ride along into an expense.
 */
export function TransactionTypeFields({
  categories,
  accounts,
  defaultType = "EXPENSE",
  defaultCategoryId,
  defaultAccountId,
}: {
  categories: { id: string; name: string; kind: TxType }[];
  accounts: { id: string; name: string }[];
  defaultType?: TxType;
  defaultCategoryId?: string | null;
  defaultAccountId?: string | null;
}) {
  const [type, setType] = useState<TxType>(defaultType);
  const options = categories.filter((c) => c.kind === type).map((c) => ({ value: c.id, label: c.name }));
  const categoryDefault = type === defaultType && defaultCategoryId ? defaultCategoryId : undefined;

  return (
    <>
      <Field label="Type" required>
        <Select
          name="type"
          defaultValue={defaultType}
          onValueChange={(value) => setType(value === "INCOME" ? "INCOME" : "EXPENSE")}
          options={[
            { value: "EXPENSE", label: "Expense" },
            { value: "INCOME", label: "Income" },
          ]}
        />
      </Field>
      <Field label="Category" hint={options.length === 0 ? `No ${type === "INCOME" ? "income" : "expense"} categories yet.` : undefined}>
        {/* Keyed on type so switching type remounts it empty rather than keeping the old pick. */}
        <Select key={type} name="categoryId" defaultValue={categoryDefault} placeholder="Choose a category" options={options} />
      </Field>
      <Field label="Account">
        <Select
          name="accountId"
          defaultValue={defaultAccountId ?? undefined}
          placeholder="Choose an account"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />
      </Field>
    </>
  );
}
