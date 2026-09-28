"use client";

import { ReactNode, useState } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Field } from "@/components/Field";
import { DateInput } from "@/components/DateInput";
import { MoneyInput } from "@/components/MoneyInput";
import { FormActions, ModalCancel, ModalForm } from "@/components/Modal";
import { ValidatedForm } from "@/components/ValidatedForm";
import { Input } from "@/components/ui/input";
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Kind = "EXPENSE" | "INCOME";
type Action = (formData: FormData) => void | Promise<void>;

const KINDS: { value: Kind; label: string; icon: typeof ArrowUpRight }[] = [
  { value: "EXPENSE", label: "Expense", icon: ArrowUpRight },
  { value: "INCOME", label: "Income", icon: ArrowDownLeft },
];

/**
 * Add/edit an expense or income.
 *
 * - Categories are filtered to the chosen type, recently used ones first as one-tap chips,
 *   and the pick resets when the type changes.
 * - There's no account: accounts are a view-only record kept by hand, and a transaction
 *   never moves a balance.
 * - Inside a Modal (`inModal`) it closes and toasts on success; on an edit page it's a
 *   plain validated form whose action redirects.
 */
export function EntryForm({
  categories,
  recentCategoryIds = [],
  today,
  transactionAction,
  inModal = true,
  defaults,
  submitLabel,
  cancel,
  hiddenFields,
  initialKind,
}: {
  categories: { id: string; name: string; kind: "INCOME" | "EXPENSE" }[];
  recentCategoryIds?: string[];
  today: string;
  transactionAction: Action;
  inModal?: boolean;
  defaults?: {
    type: "INCOME" | "EXPENSE";
    amount: number;
    categoryId: string | null;
    date: string;
    note: string;
    taxWithheld?: number;
    /** YYYY-MM the income is for, when not the month of `date`. */
    incomeMonth?: string;
  };
  submitLabel?: string;
  cancel?: ReactNode;
  hiddenFields?: ReactNode;
  /** Which tab to start on. */
  initialKind?: Kind;
}) {
  const [kind, setKind] = useState<Kind>(defaults?.type ?? initialKind ?? "EXPENSE");
  const [categoryId, setCategoryId] = useState<string>(defaults?.categoryId ?? "");
  const options = categories.filter((c) => c.kind === kind);
  const recent = recentCategoryIds
    .map((id) => options.find((c) => c.id === id))
    .filter((c): c is (typeof options)[number] => c != null)
    .slice(0, 4);
  const labels = new Map(options.map((c) => [c.id, c.name]));

  const fields = (
    <>
      <div role="radiogroup" aria-label="Type" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
        {KINDS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => {
              if (value === kind) return;
              setKind(value);
              setCategoryId("");
            }}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              kind === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon size={14} aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="type" value={kind} />

      <Field label="Amount" required hint={kind === "INCOME" ? "What you received. Tax withheld goes below." : undefined}>
        <MoneyInput name="amount" size="lg" required positive autoFocus defaultValue={defaults?.amount} />
      </Field>
      {kind === "INCOME" && (
        <Field label="Tax withheld" hint="Tax deducted at source, e.g. salary TDS. Recorded in the Income ledger; doesn't change the amount.">
          <MoneyInput name="taxWithheld" defaultValue={defaults?.taxWithheld || undefined} />
        </Field>
      )}
      {kind === "INCOME" && (
        <Field
          label="Income for"
          hint="The month this pay is for, if it arrived in another — e.g. May's salary paid on 1 June. Leave blank for the month of the date."
        >
          <Input name="incomeMonth" type="month" defaultValue={defaults?.incomeMonth} className="sm:max-w-56" />
        </Field>
      )}

          <Field label="Category" hint={options.length === 0 ? `No ${kind === "INCOME" ? "income" : "expense"} categories yet.` : undefined}>
            <UiSelect
              name="categoryId"
              value={categoryId || null}
              onValueChange={(v) => setCategoryId(String(v ?? ""))}
              itemToStringLabel={(v) => labels.get(String(v)) ?? ""}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {options.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
          </Field>
          {recent.length > 0 && (
            <div className="-mt-1 flex flex-wrap items-center gap-1.5" aria-label="Recent categories">
              <span className="text-xs text-muted-foreground">Recent:</span>
              {recent.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  aria-pressed={categoryId === c.id}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                    categoryId === c.id ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date" required>
          <DateInput name="date" defaultValue={defaults?.date ?? today} required />
        </Field>
        <Field label="Note">
          <Input name="note" type="text" defaultValue={defaults?.note} />
        </Field>
      </div>
      {hiddenFields}
    </>
  );

  const label = submitLabel ?? (kind === "INCOME" ? "Add income" : "Add expense");
  const action = transactionAction;

  if (inModal) {
    return (
      <ModalForm action={action} className="flex flex-col gap-4" successMessage="Transaction added">
        {fields}
        <FormActions submitLabel={label} cancel={cancel ?? <ModalCancel />} />
      </ModalForm>
    );
  }
  return (
    <ValidatedForm action={action} className="flex flex-col gap-4">
      {fields}
      <FormActions submitLabel={label} cancel={cancel} />
    </ValidatedForm>
  );
}
