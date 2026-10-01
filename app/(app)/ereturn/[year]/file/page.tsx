import { AlertTriangle, ExternalLink, Info } from "lucide-react";
import { requireUserId } from "@/lib/current-user";
import { getLocalisation } from "@/lib/preferences";
import { getReturn } from "@/lib/ereturn/load";
import { buildFilingGuide, type FilingItem } from "@/lib/ereturn/filing";
import { Card } from "@/components/Card";
import { CopyValue } from "@/components/ereturn/CopyValue";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const NBR = "https://etaxnbr.gov.bd/#/user-panel/";

function Row({ label, hint, children, muted }: { label: string; hint?: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-border/60 py-2 last:border-0 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4">
      <div className="min-w-0">
        <div className={cn("text-sm", muted && "text-muted-foreground")}>{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="sm:text-right">{children}</div>
    </div>
  );
}

function Item({ item }: { item: FilingItem }) {
  switch (item.kind) {
    case "value":
      return (
        <Row label={item.label} hint={item.hint}>
          <CopyValue text={item.cell.text} copy={item.cell.copy} className="font-medium" />
        </Row>
      );
    case "choice":
      return (
        <Row label={item.label} hint={item.hint}>
          <span className={cn("rounded-md px-2 py-0.5 text-sm font-medium", item.on === false ? "text-muted-foreground" : "bg-muted")}>{item.answer}</span>
        </Row>
      );
    case "check":
      return (
        <Row label={item.label} muted={!item.strong}>
          <span className={cn("px-1.5 text-sm tabular-nums", item.strong ? "font-semibold" : "text-muted-foreground")}>{item.text}</span>
        </Row>
      );
    case "note": {
      const Icon = item.tone === "warning" ? AlertTriangle : Info;
      return (
        <p className={cn("flex gap-2 py-2 text-xs", item.tone === "warning" ? "text-warning" : "text-muted-foreground")}>
          <Icon size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>{item.text}</span>
        </p>
      );
    }
    case "table":
      return (
        <div className="flex flex-col gap-1 py-2">
          <div className="text-sm font-medium">{item.title}</div>
          {item.hint && <div className="text-xs text-muted-foreground">{item.hint}</div>}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {item.columns.map((c) => (
                    <TableHead key={c} className="whitespace-nowrap">
                      {c}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className="whitespace-nowrap px-1">
                        <CopyValue text={cell.text} copy={cell.copy} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
              {item.total && (
                <TableFooter>
                  <TableRow>
                    {item.total.map((cell, j) => (
                      <TableCell key={j} className="whitespace-nowrap px-1 font-medium">
                        {cell.copy ? <CopyValue text={cell.text} copy={cell.copy} /> : <span className="px-1.5">{cell.text}</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>
      );
  }
}

/** Every value for NBR's eReturn site, screen by screen in the site's own order, to copy across. */
export default async function FilePage({ params }: { params: Promise<{ year: string }> }) {
  const userId = await requireUserId();
  const { year } = await params;
  const [{ record, result }, { fmt }] = await Promise.all([getReturn(userId, year), getLocalisation(userId)]);
  const screens = buildFilingGuide(record, result, fmt);

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="File on eReturn"
        description="Log in to etaxnbr.gov.bd and choose Submission → Regular e-Return. Then go screen by screen: each card below is one of the site's screens, its fields in the site's order. Click a value to copy it (amounts copy as plain digits, dates as DD-MM-YYYY)."
        action={
          <Button variant="outline" nativeButton={false} render={<a href={`${NBR}assessment/regular-return`} target="_blank" rel="noreferrer" />}>
            <ExternalLink size={14} />
            Open eReturn
          </Button>
        }
      >
        <ol className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {screens.map((s, n) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className={cn("hover:underline", s.empty && "text-muted-foreground")}>
                {n + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>
      </Card>

      {screens.map((s, n) => (
        <Card
          key={s.id}
          id={s.id}
          title={`${n + 1}. ${s.title}`}
          description={
            <>
              {s.tab}
              {s.path && <span className="text-muted-foreground/70"> · /{s.path}</span>}
            </>
          }
          className={cn("scroll-mt-20", s.empty && "opacity-75")}
        >
          <div className="flex flex-col">
            {s.items.map((item, i) => (
              <Item key={i} item={item} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
