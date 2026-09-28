"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { Field } from "@/components/Field";
import { FormActions, ModalCancel, ModalForm } from "@/components/Modal";
import { Input } from "@/components/ui/input";

const TEMPLATE =
  "date,type,amount,category,note,tax,month\n2026-09-24,EXPENSE,1250,Groceries/Bazar,Weekly bazar,,\n2026-09-01,INCOME,95000,Salary,August salary,900,2026-08\n";

export interface ImportSummary {
  imported: number;
  updated: number;
  duplicates: number;
  skipped: number;
  categoriesCreated: number;
}

interface Preview {
  total: number;
  valid: number;
  skipped: { line: number; reason: string }[];
  sample: { date: string; type: string; amount: string; category: string; tax: string; month: string }[];
  taxRows: number;
  monthRows: number;
  missingColumns: string[];
  unknownCategories: string[];
}

/**
 * Reads the file in the browser first and shows what will happen — how many rows import,
 * which are skipped and why, and names that won't match an existing category —
 * before anything is written. The rules mirror importTransactionsCsv on the server.
 */
function preview(text: string, categories: string[]): Preview {
  const [header = [], ...rows] = parseCsv(text).filter((r) => !(r.length === 1 && r[0].trim() === ""));
  const cols = header.map((h) => h.trim().toLowerCase());
  const col = (name: string) => cols.indexOf(name);
  const missingColumns = ["date", "amount"].filter((c) => col(c) === -1);
  const skipped: Preview["skipped"] = [];
  const sample: Preview["sample"] = [];
  const unknownCategories = new Set<string>();
  let valid = 0;
  let taxRows = 0;
  let monthRows = 0;
  const taxCol = col("tax") !== -1 ? col("tax") : col("taxwithheld");
  const monthCol = col("month") !== -1 ? col("month") : col("incomemonth");

  rows.forEach((row, i) => {
    const get = (name: string) => (col(name) === -1 ? "" : (row[col(name)] ?? "").trim());
    const date = get("date");
    const amount = Number(get("amount"));
    if (Number.isNaN(new Date(date).getTime())) return void skipped.push({ line: i + 2, reason: `date "${date}" isn't a date` });
    if (!Number.isFinite(amount) || amount <= 0) return void skipped.push({ line: i + 2, reason: `amount "${get("amount")}" isn't a positive number` });
    valid++;
    const category = get("category");
    if (category && !categories.includes(category)) unknownCategories.add(category);
    const tax = taxCol === -1 ? "" : (row[taxCol] ?? "").trim();
    if (Number(tax) > 0) taxRows++;
    const isIncome = get("type").toUpperCase() === "INCOME";
    const month = monthCol === -1 || !isIncome ? "" : (row[monthCol] ?? "").trim();
    if (month && month !== date.slice(0, 7)) monthRows++;
    if (sample.length < 5) sample.push({ date, type: isIncome ? "Income" : "Expense", amount: get("amount"), category, tax, month });
  });

  return {
    total: rows.length,
    valid,
    skipped,
    sample,
    taxRows,
    monthRows,
    missingColumns,
    unknownCategories: [...unknownCategories],
  };
}

export function CsvImportForm({
  action,
  categoryNames,
}: {
  action: (formData: FormData) => Promise<ImportSummary | undefined | void>;
  categoryNames: string[];
}) {
  const [result, setResult] = useState<Preview | null>(null);
  const [createCategories, setCreateCategories] = useState(true);
  const [updateExisting, setUpdateExisting] = useState(false);
  const summary = useRef<ImportSummary | undefined>(undefined);
  const canImport = result != null && result.missingColumns.length === 0 && result.valid > 0;

  return (
    <ModalForm
      action={async (formData) => {
        summary.current = (await action(formData)) ?? undefined;
      }}
      className="flex flex-col gap-4"
      successMessage={() => {
        const r = summary.current;
        if (!r) return "Import finished";
        const parts = [`Imported ${r.imported}`];
        if (r.updated) parts.push(`${r.updated} already recorded, updated`);
        if (r.duplicates) parts.push(`${r.duplicates} already recorded, skipped`);
        if (r.skipped) parts.push(`${r.skipped} unreadable`);
        if (r.categoriesCreated) parts.push(`${r.categoriesCreated} new categor${r.categoriesCreated === 1 ? "y" : "ies"}`);
        return parts.join(" · ");
      }}
    >
      <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        <p>
          Columns: <span className="font-mono text-foreground">date, type, amount, category, note</span>, and an
          optional <span className="font-mono text-foreground">tax</span> (tax withheld on income) and{" "}
          <span className="font-mono text-foreground">month</span> (YYYY-MM the income is for, when paid in another month). Dates as YYYY-MM-DD; type
          INCOME or EXPENSE (blank = expense). Category is matched by exact name; an account column is ignored. Rows already recorded (same date, type, amount and note) are skipped, or updated if you tick that below.
        </p>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
          download="wealthflow-import-template.csv"
          className="mt-2 inline-flex items-center gap-1 font-medium text-link hover:underline"
        >
          <Download size={12} aria-hidden />
          Download a template
        </a>
      </div>

      <Field label="CSV file" required>
        <Input
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setResult(file ? preview(await file.text(), categoryNames) : null);
          }}
        />
      </Field>

      {result && (
        <div aria-live="polite" className="flex flex-col gap-3 text-sm">
          {result.missingColumns.length > 0 ? (
            <p className="text-danger">Missing required column{result.missingColumns.length > 1 ? "s" : ""}: {result.missingColumns.join(", ")}.</p>
          ) : (
            <p>
              <span className="font-medium">{result.valid}</span> of {result.total} rows will be imported
              {result.skipped.length > 0 && <>; {result.skipped.length} will be skipped</>}
              {result.taxRows > 0 && <> · {result.taxRows} with tax withheld</>}
              {result.monthRows > 0 && <> · {result.monthRows} counted in another month</>}.
            </p>
          )}
          {result.sample.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <caption className="sr-only">First rows of the file</caption>
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    {["Date", "Type", "Amount", "Tax", "For", "Category"].map((h) => (
                      <th key={h} scope="col" className="px-2 py-1.5 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.sample.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.date}</td>
                      <td className="px-2 py-1.5">{r.type}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.amount}</td>
                      <td className="px-2 py-1.5 tabular-nums">{r.tax || "—"}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.month || "—"}</td>
                      <td className="px-2 py-1.5">{r.category || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.skipped.length > 0 && (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {result.skipped.slice(0, 5).map((s) => (
                <li key={s.line}>
                  Line {s.line}: {s.reason}
                </li>
              ))}
              {result.skipped.length > 5 && <li>…and {result.skipped.length - 5} more</li>}
            </ul>
          )}
          {result.unknownCategories.length > 0 && (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                name="createCategories"
                checked={createCategories}
                onChange={(e) => setCreateCategories(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Create {result.unknownCategories.length === 1 ? "this category" : "these categories"}:{" "}
                <span className="font-medium">{result.unknownCategories.join(", ")}</span>
                <span className="block text-muted-foreground">Unticked, those rows import uncategorised.</span>
              </span>
            </label>
          )}
          {result.valid > 0 && (
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                name="updateExisting"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Update rows already recorded
                <span className="block text-muted-foreground">
                  For a corrected file: rows that match one you have (same date, type, amount and note) take this file&apos;s
                  category, month and tax. Amounts, dates and balances don&apos;t change.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <FormActions submitLabel={canImport ? `Import ${result!.valid} rows` : "Import"} cancel={<ModalCancel />} disabled={!canImport} />
      {!canImport && result && <p className="-mt-2 text-right text-xs text-muted-foreground">Nothing importable in this file.</p>}
    </ModalForm>
  );
}
