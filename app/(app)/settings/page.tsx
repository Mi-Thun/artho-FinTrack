import { Languages, Moon, Lock } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { termTable } from "@/lib/finance-mode";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Select } from "@/components/Select";
import { PinForm } from "@/components/PinForm";
import { Field } from "@/components/Field";
import { FormActions } from "@/components/Modal";
import { ValidatedForm } from "@/components/ValidatedForm";
import { NumbersPreview, WordingPreview } from "@/components/PreferencesPreview";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { clearPin, savePreferences } from "./actions";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const { language, numerals, financeMode, hasPin } = await getLocalisation(userId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Language, number format, finance wording and app lock." />

      {/* One form across two cards: the action saves language, numerals and finance mode
          together. Each card previews its choice live before saving. */}
      {/* Keyed on the saved values so a save remounts it instead of swapping defaults. */}
      <ValidatedForm
        key={`${language}-${numerals}-${financeMode}`}
        action={savePreferences}
        className="flex flex-col gap-6"
        successMessage="Preferences saved"
      >
        <Card title="Language & numbers" icon={<Languages size={15} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Language">
              <Select
                name="language"
                defaultValue={language}
                options={[
                  { value: "EN", label: "English" },
                  { value: "BN", label: "বাংলা (Bangla)" },
                ]}
              />
            </Field>
            <Field label="Numerals">
              <Select
                name="numerals"
                defaultValue={numerals}
                options={[
                  { value: "WESTERN", label: "Western — 1 2 3" },
                  { value: "BENGALI", label: "Bengali — ১ ২ ৩" },
                ]}
              />
            </Field>
            <div className="sm:col-span-2">
              <NumbersPreview />
            </div>
          </div>
        </Card>

        <Card title="Finance mode" icon={<Moon size={15} />}>
          <div className="flex flex-col gap-4">
            <Field label="Wording" hint="Changes labels only — no figure is recalculated.">
              <Select
                name="financeMode"
                defaultValue={financeMode}
                options={[
                  { value: "CONVENTIONAL", label: "Conventional" },
                  { value: "ISLAMIC", label: "Islamic (Shariah)" },
                ]}
              />
            </Field>
            <WordingPreview />
            <details className="group">
              <summary className="cursor-pointer text-sm font-medium text-link hover:underline">What changes in Islamic mode?</summary>
              <p className="mt-3 text-sm text-muted-foreground">
                Islamic mode relabels products to match the contract they actually are — a Mudaraba deposit shares
                profit, it does not pay interest — and separates income from riba sources so it can be given away rather
                than spent. Arithmetic is untouched: a profit rate and an interest rate of the same size produce the
                same number.
              </p>
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Conventional</TableHead>
                    <TableHead>Islamic</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {termTable("CONVENTIONAL").map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className={financeMode === "CONVENTIONAL" ? "font-medium" : "text-muted-foreground"}>{row.label}</TableCell>
                      <TableCell className={financeMode === "ISLAMIC" ? "font-medium" : "text-muted-foreground"}>{row.other}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </details>
          </div>
        </Card>

        <div className="flex justify-end">
          <FormActions submitLabel="Save preferences" bare />
        </div>
      </ValidatedForm>

      <Card
        title="App lock"
        icon={<Lock size={15} />}
        action={
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${hasPin ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
            {hasPin ? "PIN set" : "No PIN"}
          </span>
        }
      >
        <p className="mb-4 text-sm text-muted-foreground">
          An optional PIN asked for when the app opens, on top of your password. Useful when you hand your phone to
          someone. It is not a replacement for your password and does not encrypt your data.
        </p>
        <PinForm hasPin={hasPin} clearAction={clearPin} />
      </Card>
    </div>
  );
}
