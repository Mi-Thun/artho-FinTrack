import { Settings, Languages, Moon, Lock } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { termTable } from "@/lib/finance-mode";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Select } from "@/components/Select";
import { PinForm } from "@/components/PinForm";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { clearPin, savePreferences } from "./actions";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const { language, numerals, financeMode, hasPin, fmt } = await getLocalisation(userId);

  const sample = 1234567;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Settings size={16} />}
        crumbs={[{ label: "Settings" }]}
      />

      <Card title="Language & Numerals" icon={<Languages size={15} />}>
        <form action={savePreferences} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
            Language
            <Select
              name="language"
              defaultValue={language}
              options={[
                { value: "EN", label: "English" },
                { value: "BN", label: "বাংলা (Bangla)" },
              ]}
            />
          </Label>
          <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
            Numerals
            <Select
              name="numerals"
              defaultValue={numerals}
              options={[
                { value: "WESTERN", label: "Western — 1 2 3" },
                { value: "BENGALI", label: "Bengali — ১ ২ ৩" },
              ]}
            />
            <span className="text-xs font-normal text-muted-foreground">
              Currently shows {fmt.money(sample)}
            </span>
          </Label>
          <Label className="flex flex-col items-start gap-1.5 text-sm font-medium">
            Finance mode
            <Select
              name="financeMode"
              defaultValue={financeMode}
              options={[
                { value: "CONVENTIONAL", label: "Conventional" },
                { value: "ISLAMIC", label: "Islamic (Shariah)" },
              ]}
            />
            <span className="text-xs font-normal text-muted-foreground">
              Changes wording only — no figure is recalculated.
            </span>
          </Label>
          <div className="sm:col-span-3">
            <Button type="submit">Save preferences</Button>
          </div>
        </form>
      </Card>

      <Card title="What Islamic mode changes" icon={<Moon size={15} />}>
        <p className="mb-4 text-sm text-muted-foreground">
          Islamic mode relabels products to match the contract they actually are — a Mudaraba deposit shares profit,
          it does not pay interest — and separates income from riba sources so it can be given away rather than spent.
          Arithmetic is untouched: a profit rate and an interest rate of the same size produce the same number.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conventional</TableHead>
              <TableHead>Islamic</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {termTable("CONVENTIONAL").map((row) => (
              <TableRow key={row.key}>
                <TableCell className={financeMode === "CONVENTIONAL" ? "font-medium" : "text-muted-foreground"}>
                  {row.label}
                </TableCell>
                <TableCell className={financeMode === "ISLAMIC" ? "font-medium" : "text-muted-foreground"}>
                  {row.other}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card title="App Lock" icon={<Lock size={15} />}>
        <p className="mb-4 text-sm text-muted-foreground">
          An optional PIN asked for when the app opens, on top of your password. Useful when you hand your phone to
          someone. It is not a replacement for your password and does not encrypt your data.
        </p>
        <PinForm hasPin={hasPin} clearAction={clearPin} />
      </Card>
    </div>
  );
}
