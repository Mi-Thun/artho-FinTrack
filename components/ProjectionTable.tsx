"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Info } from "lucide-react";
import { formatBDT } from "@/lib/currency";

export interface ProjectionRow {
  month: string;
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
  tax: number;
  livingExpense: number;
  netSaved: number;
  spDeposited: number;
  dpsInstallment: number;
  dpsInterest: number;
  dpsMaturityPayout: number;
}

type Column = "wealth" | "dps" | "cash";

function BreakdownRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5" style={{ color: muted ? "var(--muted)" : undefined }}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

function WealthBreakdown({ r }: { r: ProjectionRow }) {
  return (
    <>
      <BreakdownRow label="Previous wealth" value={formatBDT(r.prevWealth)} muted />
      <BreakdownRow label="+ Salary" value={formatBDT(r.salary)} />
      {r.bonus > 0 && <BreakdownRow label="+ Bonus" value={formatBDT(r.bonus)} />}
      {r.passiveIncome > 0 && <BreakdownRow label="+ SP interest" value={formatBDT(r.passiveIncome)} />}
      {r.tax > 0 && <BreakdownRow label="− Tax" value={formatBDT(-r.tax)} />}
      {r.livingExpense > 0 && <BreakdownRow label="− Living expense" value={formatBDT(-r.livingExpense)} />}
      <BreakdownRow label="= Net saved" value={formatBDT(r.netSaved)} muted />
      {r.dpsInstallment > 0 && <BreakdownRow label="− DPS installment (locked away)" value={formatBDT(-r.dpsInstallment)} />}
      {r.dpsMaturityPayout > 0 && <BreakdownRow label="+ DPS matured (paid out)" value={formatBDT(r.dpsMaturityPayout)} />}
      <p className="mt-1 pt-1 text-[0.7rem]" style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
        SP deposits don&apos;t change wealth — they just move money from cash into SP.
      </p>
      <BreakdownRow label="= Wealth" value={formatBDT(r.wealth)} />
    </>
  );
}

function DpsBreakdown({ r }: { r: ProjectionRow }) {
  return (
    <>
      <BreakdownRow label="Previous DPS balance" value={formatBDT(r.prevDpsBalance)} muted />
      {r.dpsInstallment > 0 && <BreakdownRow label="+ Installment paid" value={formatBDT(r.dpsInstallment)} />}
      {r.dpsInterest > 0 && (
        <BreakdownRow label="+ Interest accrued (compounds, stays locked)" value={formatBDT(r.dpsInterest)} />
      )}
      {r.dpsMaturityPayout > 0 && <BreakdownRow label="− Matured, paid out to cash" value={formatBDT(-r.dpsMaturityPayout)} />}
      <p className="mt-1 pt-1 text-[0.7rem]" style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
        DPS balance is illiquid — it grows from installments + compounding interest but isn&apos;t counted in Wealth
        until the plan matures and pays out to cash.
      </p>
      <BreakdownRow label="= DPS balance" value={formatBDT(r.dpsBalance)} />
    </>
  );
}

function CashBreakdown({ r }: { r: ProjectionRow }) {
  return (
    <>
      <BreakdownRow label="Previous uninvested cash" value={formatBDT(r.prevUninvestedCash)} muted />
      <BreakdownRow label="+ Net saved" value={formatBDT(r.netSaved)} />
      {r.spDeposited > 0 && <BreakdownRow label="− New SP deposit(s) opened" value={formatBDT(-r.spDeposited)} />}
      {r.dpsInstallment > 0 && <BreakdownRow label="− DPS installment paid" value={formatBDT(-r.dpsInstallment)} />}
      {r.dpsMaturityPayout > 0 && <BreakdownRow label="+ DPS matured (paid to cash)" value={formatBDT(r.dpsMaturityPayout)} />}
      <BreakdownRow label="= Uninvested cash" value={formatBDT(r.uninvestedCash)} />
    </>
  );
}

function InfoTrigger({ rowIndex, column, title }: { rowIndex: number; column: Column; title: string }) {
  return (
    <button
      type="button"
      className="btn-ghost !px-1 !py-1"
      data-popover-trigger={`${rowIndex}-${column}`}
      data-popover-title={title}
      aria-label={title}
    >
      <Info size={13} style={{ color: "var(--muted)" }} />
    </button>
  );
}

/**
 * Renders the full monthly projection table (up to hundreds of rows) with a per-cell
 * info breakdown. A single client component owning one shared popover — instead of a
 * separate stateful component per cell — keeps hydration cheap even at 200+ rows.
 */
export function ProjectionTable({ rows }: { rows: ProjectionRow[] }) {
  const [open, setOpen] = useState<{ rowIndex: number; column: Column; title: string; top: number; left: number } | null>(
    null,
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickAway = (e: MouseEvent | globalThis.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (popoverRef.current?.contains(target)) return;
      if (target.closest?.("[data-popover-trigger]")) return;
      setOpen(null);
    };
    document.addEventListener("mousedown", onClickAway as EventListener);
    return () => document.removeEventListener("mousedown", onClickAway as EventListener);
  }, [open]);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const trigger = (e.target as HTMLElement).closest("[data-popover-trigger]") as HTMLElement | null;
    if (!trigger) return;
    const [rowIndexStr, column] = (trigger.dataset.popoverTrigger ?? "").split("-") as [string, Column];
    const rowIndex = Number(rowIndexStr);
    if (open && open.rowIndex === rowIndex && open.column === column) {
      setOpen(null);
      return;
    }
    const rect = trigger.getBoundingClientRect();
    setOpen({ rowIndex, column, title: trigger.dataset.popoverTitle ?? "", top: rect.bottom + 4, left: rect.right });
  }

  const openRow = open ? rows[open.rowIndex] : null;

  return (
    <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "32rem" }} onClick={handleClick}>
      <table className="table-clean w-full">
        <thead>
          <tr>
            <th>Month</th>
            <th className="text-right">Wealth</th>
            <th className="text-right">SP Deposited</th>
            <th className="text-right">DPS Balance</th>
            <th className="text-right">Uninvested Cash</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.month}</td>
              <td className="text-right">
                <span className="inline-flex items-center justify-end gap-1">
                  {formatBDT(r.wealth)}
                  <InfoTrigger rowIndex={i} column="wealth" title={`Wealth — ${r.month}`} />
                </span>
              </td>
              <td className="text-right">{formatBDT(r.totalDeposited)}</td>
              <td className="text-right">
                <span className="inline-flex items-center justify-end gap-1">
                  {formatBDT(r.dpsBalance)}
                  <InfoTrigger rowIndex={i} column="dps" title={`DPS Balance — ${r.month}`} />
                </span>
              </td>
              <td className="text-right">
                <span className="inline-flex items-center justify-end gap-1">
                  {formatBDT(r.uninvestedCash)}
                  <InfoTrigger rowIndex={i} column="cash" title={`Uninvested Cash — ${r.month}`} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && openRow && (
        <div
          ref={popoverRef}
          className="card fixed z-50 w-72 !p-3 text-left shadow-lg"
          style={{ top: open.top, left: Math.max(8, open.left - 288), fontSize: "0.8rem" }}
        >
          <p className="mb-2 font-semibold">{open.title}</p>
          {open.column === "wealth" && <WealthBreakdown r={openRow} />}
          {open.column === "dps" && <DpsBreakdown r={openRow} />}
          {open.column === "cash" && <CashBreakdown r={openRow} />}
        </div>
      )}
    </div>
  );
}
