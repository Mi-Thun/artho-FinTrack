import Link from "next/link";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { getRuleRows, toRules } from "@/lib/ereturn/rules-db";
import { assessmentYearOf, incomeYearForDate, incomeYearOf, incomeYearStart } from "@/lib/ereturn/rules";
import { Card } from "@/components/Card";
import { PageHeader } from "@/components/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** Every income year's rules: published from NBR's circulars, or the user's own copy. */
export default async function RulesPage() {
  const userId = await requireUserId();
  const [{ published, own }, { fmt }] = await Promise.all([getRuleRows(userId), getLocalisation(userId)]);
  const years = [...new Set([...published.keys(), ...own.keys()])].sort().reverse();
  const latest = years[0];
  const current = incomeYearForDate(new Date());
  const next = latest ? incomeYearOf(Math.max(incomeYearStart(latest), incomeYearStart(current)) + 1) : current;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tax rules"
        back={{ href: "/ereturn", label: "eReturn" }}
        description="The slabs, tax-free bands, minimum tax, exemption, rebate and surcharge each return is worked out with — from NBR's yearly Income Tax Paripatra."
      />
      <Card
        title="By income year"
        description="A tax year (করবর্ষ) is the year after the income year: income earned July 2025 – June 2026 is taxed in tax year 2026-27."
        action={
          <Link href={`/ereturn/rules/${next}`} className="text-sm text-link hover:underline">
            Add {next}
          </Link>
        }
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Income year</TableHead>
              <TableHead>Tax year</TableHead>
              <TableHead className="text-right">Tax-free</TableHead>
              <TableHead className="text-right">Minimum tax</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {years.map((y) => {
              const r = toRules((own.get(y) ?? published.get(y))!);
              const minimums = [...new Set(Object.values(r.minimumTax))];
              return (
                <TableRow key={y}>
                  <TableCell>
                    <Link href={`/ereturn/rules/${y}`} className="font-medium text-link hover:underline">
                      {y}
                    </Link>
                  </TableCell>
                  <TableCell>{assessmentYearOf(y)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt.money(r.threshold.general)}</TableCell>
                  <TableCell className="text-right tabular-nums">{minimums.map((v) => fmt.money(v)).join(" / ")}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.own ? <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-link">Your copy</span> : null}
                    {r.source}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
