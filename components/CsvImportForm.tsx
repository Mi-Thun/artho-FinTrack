"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { parseCsv } from "@/lib/csv";
import { Field } from "@/components/Field";
import { FormActions, ModalCancel, ModalForm } from "@/components/Modal";
import { Input } from "@/components/ui/input";

const TEMPLATE = "date,type,amount,category,account,note\n2026-09-24,EXPENSE,1250,Groceries/Bazar,Cash,Weekly bazar\n2026-09-01,INCOME,95000,Salary,City,September salary\n";

interface Preview {
  total: number;
  valid: number;
  skipped: { line: number; reason: string }[];
  sample: { date: string; type: string; amount: string; category: string; account: string }[];
  missingColumns: string[];
  unknownCategories: string[];
  unknownAccounts: string[];
}

/**
 * Reads the file in the browser first and shows what will happen — how many rows import,
 * which are skipped and why, and names that won't match an existing category or account —
 * before anything is written. The rules mirror importTransactionsCsv on the server.
 */
function preview(text: string, categories: string[], accounts: string[]): Preview {
  const [header = [], ...rows] = parseCsv(text).filter((r) => !(r.length === 1 && r[0].trim() === ""));
  const cols = header.map((h) => h.trim().toLowerCase());
  const col = (name: string) => cols.indexOf(name);
  const missingColumns = ["date", "amount"].filter((c) => col(c) === -1);
  const skipped: Preview["skipped"] = [];
  const sample: Preview["sample"] = [];
  const unknownCategories = new Set<string>();
  const unknownAccounts = new Set<string>();
  let valid = 0;

  rows.forEach((row, i) => {
    const get = (name: string) => (col(name) === -1 ? "" : (row[col(name)] ?? "").trim());
    const date = get("date");
    const amount = Number(get("amount"));
    if (Number.isNaN(new Date(date).getTime())) return void skipped.push({ line: i + 2, reason: `date "${date}" isn't a date` });
    if (!Number.isFinite(amount) || amount <= 0) return void skipped.push({ line: i + 2, reason: `amount "${get("amount")}" isn't a positive number` });
    valid++;
    const category = get("category");
    const account = get("account");
    if (category && !categories.includes(category)) unknownCategories.add(category);
    if (account && !accounts.includes(account)) unknownAccounts.add(account);
    if (sample.length < 5) sample.push({ date, type: get("type").toUpperCase() === "INCOME" ? "Income" : "Expense", amount: get("amount"), category, account });
  });

  return {
    total: rows.length,
    valid,
    skipped,
    sample,
    missingColumns,
    unknownCategories: [...unknownCategories],
    unknownAccounts: [...unknownAccounts],
  };
}

export function CsvImportForm({
  action,
  categoryNames,
  accountNames,
}: {
  action: (formData: FormData) => void | Promise<void>;
  categoryNames: string[];
  accountNames: string[];
}) {
  const [result, setResult] = useState<Preview | null>(null);
  const canImport = result != null && result.missingColumns.length === 0 && result.valid > 0;

  return (
    <ModalForm action={action} className="flex flex-col gap-4" successMessage="Import finished">
      <div className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
        <p>
          Columns: <span className="font-mono text-foreground">date, type, amount, category, account, note</span>. Dates as
          YYYY-MM-DD; type INCOME or EXPENSE (blank = expense). Category and account are matched by exact name.
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
            setResult(file ? preview(await file.text(), categoryNames, accountNames) : null);
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
              {result.skipped.length > 0 && <>; {result.skipped.length} will be skipped</>}.
            </p>
          )}
          {result.sample.length > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <caption className="sr-only">First rows of the file</caption>
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    {["Date", "Type", "Amount", "Category", "Account"].map((h) => (
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
                      <td className="px-2 py-1.5">{r.category || "—"}</td>
                      <td className="px-2 py-1.5">{r.account || "—"}</td>
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
          {(result.unknownCategories.length > 0 || result.unknownAccounts.length > 0) && (
            <p className="text-xs text-warning">
              Not found, so imported without them:{" "}
              {[...result.unknownCategories.map((c) => `category "${c}"`), ...result.unknownAccounts.map((a) => `account "${a}"`)].join(", ")}.
            </p>
          )}
        </div>
      )}

      <FormActions submitLabel={canImport ? `Import ${result!.valid} rows` : "Import"} cancel={<ModalCancel />} disabled={!canImport} />
      {!canImport && result && <p className="-mt-2 text-right text-xs text-muted-foreground">Nothing importable in this file.</p>}
    </ModalForm>
  );
}
