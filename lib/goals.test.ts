import { describe, expect, it } from "vitest";
import { GOAL_TEMPLATES, goalProgress, goalTemplate, suggestedTargetDate, summariseGoals, type GoalInput } from "./goals";
import { toHijri } from "./hijri";

const ASOF = new Date(Date.UTC(2026, 0, 15));

function goal(overrides: Partial<GoalInput> = {}): GoalInput {
  return { name: "Qurbani", targetAmount: 90000, contributions: [], ...overrides };
}

describe("goal templates", () => {
  it("has unique keys and Bangla names", () => {
    const keys = GOAL_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of GOAL_TEMPLATES) {
      expect(t.nameBn.length).toBeGreaterThan(0);
      expect(t.suggestedAmount).toBeGreaterThan(0);
      expect(t.blurb.length).toBeGreaterThan(0);
    }
  });

  it("looks templates up by key", () => {
    expect(goalTemplate("HAJJ")?.name).toBe("Hajj fund");
    expect(goalTemplate("NOPE")).toBeNull();
    expect(goalTemplate(null)).toBeNull();
  });

  it("resolves an observance-linked deadline to the right Hijri date", () => {
    const qurbani = goalTemplate("QURBANI")!;
    const date = suggestedTargetDate(qurbani, ASOF);
    expect(date.getTime()).toBeGreaterThanOrEqual(ASOF.getTime());
    const hijri = toHijri(date);
    expect(hijri.month).toBe(12);
    expect(hijri.day).toBe(10);
  });

  it("uses a month horizon for life goals", () => {
    const hajj = goalTemplate("HAJJ")!;
    const date = suggestedTargetDate(hajj, ASOF);
    // 60 months out.
    expect(date.getUTCFullYear()).toBe(2031);
  });
});

describe("goalProgress", () => {
  it("sums contributions and computes what is left", () => {
    const p = goalProgress(
      goal({ contributions: [{ date: ASOF, amount: 20000 }, { date: ASOF, amount: 10000 }] }),
      ASOF,
    );
    expect(p.saved).toBe(30000);
    expect(p.remaining).toBe(60000);
    expect(p.progressPct).toBeCloseTo(33.33, 1);
    expect(p.isComplete).toBe(false);
  });

  it("divides the remainder across the months left", () => {
    const p = goalProgress(goal({ targetDate: new Date(Date.UTC(2026, 6, 15)) }), ASOF);
    expect(p.monthsRemaining).toBe(6);
    expect(p.requiredMonthly).toBe(15000);
  });

  it("asks for the whole remainder when the deadline is this month", () => {
    const p = goalProgress(goal({ targetDate: new Date(Date.UTC(2026, 0, 20)) }), ASOF);
    expect(p.monthsRemaining).toBe(1);
    expect(p.requiredMonthly).toBe(90000);
  });

  it("does not divide by zero on the target date itself", () => {
    const p = goalProgress(goal({ targetDate: ASOF }), ASOF);
    expect(p.monthsRemaining).toBe(0);
    expect(p.requiredMonthly).toBe(90000);
    expect(Number.isFinite(p.requiredMonthly!)).toBe(true);
  });

  it("caps progress at 100% when over-saved", () => {
    const p = goalProgress(goal({ contributions: [{ date: ASOF, amount: 200000 }] }), ASOF);
    expect(p.progressPct).toBe(100);
    expect(p.remaining).toBe(0);
    expect(p.isComplete).toBe(true);
    expect(p.requiredMonthly).toBeNull();
  });

  it("flags an unmet goal past its date as overdue", () => {
    const p = goalProgress(goal({ targetDate: new Date(Date.UTC(2025, 0, 1)) }), ASOF);
    expect(p.isOverdue).toBe(true);
  });

  it("does not call a completed goal overdue", () => {
    const p = goalProgress(
      goal({ targetDate: new Date(Date.UTC(2025, 0, 1)), contributions: [{ date: ASOF, amount: 90000 }] }),
      ASOF,
    );
    expect(p.isOverdue).toBe(false);
    expect(p.requiredMonthly).toBe(0);
  });

  it("has no monthly requirement without a target date", () => {
    const p = goalProgress(goal(), ASOF);
    expect(p.monthsRemaining).toBeNull();
    expect(p.requiredMonthly).toBeNull();
  });
});

describe("summariseGoals", () => {
  it("totals only active goals", () => {
    const summary = summariseGoals(
      [
        goal({ name: "A", targetAmount: 100000, contributions: [{ date: ASOF, amount: 50000 }] }),
        goal({ name: "B", targetAmount: 50000, archivedAt: ASOF }),
      ],
      ASOF,
    );
    expect(summary.totalTarget).toBe(100000);
    expect(summary.totalSaved).toBe(50000);
    expect(summary.goals).toHaveLength(2);
  });

  it("adds up the monthly commitment across goals", () => {
    const summary = summariseGoals(
      [
        goal({ targetAmount: 60000, targetDate: new Date(Date.UTC(2026, 6, 15)) }),
        goal({ targetAmount: 120000, targetDate: new Date(Date.UTC(2026, 6, 15)) }),
      ],
      ASOF,
    );
    expect(summary.totalRequiredMonthly).toBe(30000);
  });

  it("counts completed and overdue goals", () => {
    const summary = summariseGoals(
      [
        goal({ targetAmount: 100, contributions: [{ date: ASOF, amount: 100 }] }),
        goal({ targetAmount: 100, targetDate: new Date(Date.UTC(2025, 0, 1)) }),
      ],
      ASOF,
    );
    expect(summary.completedCount).toBe(1);
    expect(summary.overdueCount).toBe(1);
  });
});
