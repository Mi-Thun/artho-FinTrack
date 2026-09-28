"use client";

import { Fragment, createContext, useContext, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { createFormatter, type Language, type NumeralSystem } from "@/lib/i18n";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { InfoHint } from "@/components/InfoHint";

export interface ProjectionRow {
  month: string;
  year: number;
  wealth: number;
  totalDeposited: number;
  dpsBalance: number;
  uninvestedCash: number;
  prevWealth: number;
  prevUninvestedCash: number;
  prevDpsBalance: number;
  salary: number;
  bonus: number;
  passiveIncome: number;
  livingExpense: number;
  netSaved: number;
  spDeposited: number;
  dpsInstallment: number;
  dpsInterest: number;
  dpsMaturityPayout: number;
}


// The breakdown components format a dozen figures each; a context saves threading the
// user's numeral system through every one of them.
const MoneyContext = createContext<(value: number) => string>(createFormatter("EN", "WESTERN").money);

function useMoney() {
  return useContext(MoneyContext);
}

/**
 * What the projection calls "wealth" is the plan's starting net worth plus everything
 * saved since — not total net worth. SP held before the plan start only counts if it was
 * included in the starting figure, and DPS balances are excluded until they mature. The
 * old "Wealth" label made SP Deposited look larger than wealth itself.
 */
const WEALTH_LABEL = "Accumulated savings";

/** "interest" or, in Islamic finance mode, "profit". */
const InterestWordContext = createContext("interest");

function BreakdownRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-0.5 ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function WealthBreakdown({ r }: { r: ProjectionRow }) {
  const formatBDT = useMoney();
  const interestWord = useContext(InterestWordContext);
  return (
    <>
      <BreakdownRow label="Previous accumulated savings" value={formatBDT(r.prevWealth)} muted />
      <BreakdownRow label="+ Salary" value={formatBDT(r.salary)} />
      {r.bonus > 0 && <BreakdownRow label="+ Bonus" value={formatBDT(r.bonus)} />}
      {r.passiveIncome > 0 && <BreakdownRow label={`+ Sanchayapatra ${interestWord}`} value={formatBDT(r.passiveIncome)} />}
      {r.livingExpense > 0 && <BreakdownRow label="− Living expense" value={formatBDT(-r.livingExpense)} />}
      <BreakdownRow label="= Net saved" value={formatBDT(r.netSaved)} muted />
      {r.dpsInstallment > 0 && <BreakdownRow label="− DPS installment (locked away)" value={formatBDT(-r.dpsInstallment)} />}
      {r.dpsMaturityPayout > 0 && <BreakdownRow label="+ DPS matured (paid out)" value={formatBDT(r.dpsMaturityPayout)} />}
      <p className="mt-1 border-t pt-1 text-[0.7rem] text-muted-foreground">
        Sanchayapatra deposits don&apos;t change this — they just move money from cash into Sanchayapatra.
      </p>
      <BreakdownRow label={`= ${WEALTH_LABEL}`} value={formatBDT(r.wealth)} />
    </>
  );
}

function DpsBreakdown({ r }: { r: ProjectionRow }) {
  const formatBDT = useMoney();
  return (
    <>
      <BreakdownRow label="Previous DPS balance" value={formatBDT(r.prevDpsBalance)} muted />
      {r.dpsInstallment > 0 && <BreakdownRow label="+ Installment paid" value={formatBDT(r.dpsInstallment)} />}
      {r.dpsInterest > 0 && (
        <BreakdownRow label="+ Interest accrued (compounds, stays locked)" value={formatBDT(r.dpsInterest)} />
      )}
      {r.dpsMaturityPayout > 0 && <BreakdownRow label="− Matured, paid out to cash" value={formatBDT(-r.dpsMaturityPayout)} />}
      <p className="mt-1 border-t pt-1 text-[0.7rem] text-muted-foreground">
        DPS balance is illiquid — it grows from installments + compounding interest but isn&apos;t counted in accumulated
        savings until the plan matures and pays out to cash.
      </p>
      <BreakdownRow label="= DPS balance" value={formatBDT(r.dpsBalance)} />
    </>
  );
}

function CashBreakdown({ r }: { r: ProjectionRow }) {
  const formatBDT = useMoney();
  return (
    <>
      <BreakdownRow label="Previous uninvested cash" value={formatBDT(r.prevUninvestedCash)} muted />
      <BreakdownRow label="+ Net saved" value={formatBDT(r.netSaved)} />
      {r.spDeposited > 0 && <BreakdownRow label="− New Sanchayapatra deposit(s) opened" value={formatBDT(-r.spDeposited)} />}
      {r.dpsInstallment > 0 && <BreakdownRow label="− DPS installment paid" value={formatBDT(-r.dpsInstallment)} />}
      {r.dpsMaturityPayout > 0 && <BreakdownRow label="+ DPS matured (paid to cash)" value={formatBDT(r.dpsMaturityPayout)} />}
      <BreakdownRow label="= Uninvested cash" value={formatBDT(r.uninvestedCash)} />
    </>
  );
}

/** A month's figure with the arithmetic behind it one ⓘ away. */
function FigureWithHint({ value, title, children }: { value: string; title: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center justify-end gap-1">
      {value}
      <InfoHint label={`How ${title.toLowerCase()} was worked out`}>
        <div className="text-foreground">
          <p className="mb-1 font-semibold">{title}</p>
          {children}
        </div>
      </InfoHint>
    </span>
  );
}

/**
 * The monthly projection, grouped by year: each year row shows where things stand at the
 * year's end and expands to its months; a month's accumulated savings, DPS balance and
 * uninvested cash each carry an ⓘ with the arithmetic behind them. Nothing scrolls inside
 * the card — collapsed, twenty years is twenty rows.
 */
export function ProjectionTable({
  rows,
  language = "EN",
  numerals = "WESTERN",
  interestWord = "interest",
  title,
  info,
}: {
  rows: ProjectionRow[];
  language?: Language;
  numerals?: NumeralSystem;
  /** Finance-mode wording for SP returns ("interest" / "profit"). */
  interestWord?: string;
  /** Heading shown on the same line as Expand all / Collapse all. */
  title?: string;
  /** Explanation behind an ⓘ after the buttons. */
  info?: string;
}) {
  const formatBDT = createFormatter(language, numerals).money;
  const years = [...new Set(rows.map((r) => r.year))];
  const [openYears, setOpenYears] = useState<Set<number>>(() => new Set(years.slice(0, 1)));

  const toggleYear = (year: number) =>
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });

  return (
    <InterestWordContext.Provider value={interestWord}>
    <MoneyContext.Provider value={formatBDT}>
      <div className="mb-2 flex items-center gap-3 text-xs">
        {title && <h2 className="mr-auto text-base font-semibold">{title}</h2>}
        <button type="button" className={`${title ? "" : "ml-auto "}font-medium text-link hover:underline`} onClick={() => setOpenYears(new Set(years))}>
          Expand all
        </button>
        <button type="button" className="font-medium text-link hover:underline" onClick={() => setOpenYears(new Set())}>
          Collapse all
        </button>
        {info && <InfoHint label={`About ${title ?? "this table"}`}>{info}</InfoHint>}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead className="text-right" title="Starting net worth plus everything saved since the plan start. Excludes DPS until it matures.">
              {WEALTH_LABEL}
            </TableHead>
            <TableHead className="text-right">Sanchayapatra deposited</TableHead>
            <TableHead className="hidden text-right sm:table-cell">DPS balance</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Uninvested cash</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {years.map((year) => {
            const months = rows.filter((r) => r.year === year);
            const end = months[months.length - 1];
            const open = openYears.has(year);
            return (
              <Fragment key={year}>
                <TableRow className="bg-muted/40 font-medium hover:bg-muted/60">
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => toggleYear(year)}
                      aria-expanded={open}
                      className="flex items-center gap-1.5 rounded text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <ChevronRight size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
                      {months.length === 12 ? year : `${year} (${months[0].month.split(" ")[0]}–${end.month.split(" ")[0]})`}
                      <span className="sr-only">{open ? ", collapse" : ", expand months"}</span>
                    </button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatBDT(end.wealth)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatBDT(end.totalDeposited)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatBDT(end.dpsBalance)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatBDT(end.uninvestedCash)}</TableCell>
                </TableRow>
                {open &&
                  months.map((r) => (
                    <TableRow key={r.month}>
                      <TableCell className="pl-8 text-muted-foreground">{r.month}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <FigureWithHint value={formatBDT(r.wealth)} title={WEALTH_LABEL}>
                          <WealthBreakdown r={r} />
                        </FigureWithHint>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatBDT(r.totalDeposited)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        <FigureWithHint value={formatBDT(r.dpsBalance)} title="DPS balance">
                          <DpsBreakdown r={r} />
                        </FigureWithHint>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">
                        <FigureWithHint value={formatBDT(r.uninvestedCash)} title="Uninvested cash">
                          <CashBreakdown r={r} />
                        </FigureWithHint>
                      </TableCell>
                    </TableRow>
                  ))}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </MoneyContext.Provider>
    </InterestWordContext.Provider>
  );
}
