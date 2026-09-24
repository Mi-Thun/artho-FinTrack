// Exercises every mutation the UI can trigger, against a real database.
//
// Server actions are the least-tested surface in the app: they're only reachable through
// a form POST, so a typo in a field name or a column that no longer exists surfaces as a
// runtime 500 rather than a type error. Several were rewritten when SavingsCertificate
// was folded into FixedDeposit, which is exactly the kind of change that breaks them.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_EMAIL = "actions-rt@example.test";
let userId = "";

vi.mock("@/lib/current-user", () => ({ requireUserId: async () => userId }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { db } = await import("@/lib/db");

const deposits = await import("@/app/(app)/deposits/actions");
const goals = await import("@/app/(app)/goals/actions");
const lending = await import("@/app/(app)/lending/actions");
const settings = await import("@/app/(app)/settings/actions");
const budgets = await import("@/app/(app)/budgets/actions");

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Runs an action, treating the redirect thrown by the stub as success. */
async function run(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("REDIRECT:")) return message.slice("REDIRECT:".length);
    throw error;
  }
}

beforeAll(async () => {
  await db.user.deleteMany({ where: { email: TEST_EMAIL } });
  const user = await db.user.create({ data: { email: TEST_EMAIL, passwordHash: "x" } });
  userId = user.id;
});

afterAll(async () => {
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

describe("SP / Sanchayapatra actions", () => {
  // SP is Sanchayapatra — one page, one set of actions. These used to be duplicated
  // across two modules, which is how the same holding could be entered twice.
  it("creates a certificate with rates seeded from the scheme", async () => {
    await run(() =>
      deposits.createFixedDeposit(
        form({
          scheme: "PARIWAR",
          label: "Pariwar — Ammu",
          principal: "1500000",
          openedDate: "2024-01-15",
          holderType: "SINGLE",
          registrationNo: "REG-9",
          rateY1: "",
          rateY2: "",
          rateY3: "",
        }),
      ),
    );

    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "Pariwar — Ammu" } });
    expect(row.scheme).toBe("PARIWAR");
    // Blank rate inputs fall back to Pariwar's statutory rate.
    expect(Number(row.rateY1)).toBeCloseTo(0.1152, 4);
    expect(row.termMonths).toBe(60);
    expect(row.registrationNo).toBe("REG-9");
  });

  it("lets a typed rate override the scheme default", async () => {
    await run(() =>
      deposits.createFixedDeposit(
        form({ scheme: "PARIWAR", label: "Older Pariwar", principal: "100000", openedDate: "2020-01-15", rateY1: "11", rateY2: "11", rateY3: "11" }),
      ),
    );
    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "Older Pariwar" } });
    expect(Number(row.rateY1)).toBeCloseTo(0.11, 4);
  });

  it("rejects an invalid payload rather than writing a broken row", async () => {
    const before = await db.fixedDeposit.count({ where: { userId } });
    await run(() => deposits.createFixedDeposit(form({ label: "", principal: "0", openedDate: "nope" })));
    expect(await db.fixedDeposit.count({ where: { userId } })).toBe(before);
  });

  it("updates and re-seeds rates when the scheme changes", async () => {
    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "Pariwar — Ammu" } });
    await run(() =>
      deposits.updateFixedDeposit(
        row.id,
        form({ scheme: "PENSIONER", label: "Pensioner", principal: "900000", openedDate: "2024-02-01", holderType: "JOINT", rateY1: "", rateY2: "", rateY3: "" }),
      ),
    );
    const updated = await db.fixedDeposit.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.scheme).toBe("PENSIONER");
    expect(Number(updated.rateY1)).toBeCloseTo(0.1176, 4);
    expect(updated.holderType).toBe("JOINT");
  });

  it("encashes without deleting, so tax history survives", async () => {
    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, scheme: "PENSIONER" } });
    await run(() => deposits.encashFixedDeposit(row.id));
    expect((await db.fixedDeposit.findUniqueOrThrow({ where: { id: row.id } })).encashedAt).not.toBeNull();
    await run(() => deposits.reopenFixedDeposit(row.id));
    expect((await db.fixedDeposit.findUniqueOrThrow({ where: { id: row.id } })).encashedAt).toBeNull();
  });

  it("will not touch another user's certificate", async () => {
    const other = await db.user.create({ data: { email: `other-${Date.now()}@example.test`, passwordHash: "x" } });
    const theirs = await db.fixedDeposit.create({
      data: { userId: other.id, label: "Theirs", principal: 1, openedDate: new Date(), rateY1: 0, rateY2: 0, rateY3: 0 },
    });
    await run(() => deposits.deleteFixedDeposit(theirs.id));
    expect(await db.fixedDeposit.findUnique({ where: { id: theirs.id } })).not.toBeNull();
    await db.user.delete({ where: { id: other.id } });
  });
});

describe("deposit actions", () => {
  it("creates a plain FDR with no scheme", async () => {
    await run(() =>
      deposits.createFixedDeposit(
        form({ scheme: "OTHER", label: "DBBL FDR", principal: "400000", openedDate: "2025-01-01", rateY1: "9", rateY2: "9", rateY3: "9", termMonths: "36" }),
      ),
    );
    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "DBBL FDR" } });
    expect(row.scheme).toBe("OTHER");
    // The form takes percentages and stores fractions.
    expect(Number(row.rateY1)).toBeCloseTo(0.09, 4);
  });

  it("edits a deposit that used to be locked as auto-generated", async () => {
    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "DBBL FDR" } });
    await run(() =>
      deposits.updateFixedDeposit(
        row.id,
        form({ scheme: "OTHER", label: "DBBL FDR v2", principal: "450000", openedDate: "2025-01-01", rateY1: "9.5", rateY2: "9.5", rateY3: "9.5", termMonths: "36" }),
      ),
    );
    const after = await db.fixedDeposit.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.label).toBe("DBBL FDR v2");
    expect(Number(after.principal)).toBe(450000);
  });

  it("saves plan assumptions and a salary plan", async () => {
    await run(() =>
      goals.saveDepositPlanConfig(
        form({ startingNetWorth: "0", startMonth: "2025-01-01", depositUnitSize: "100000", profitRateY1: "0.11", profitRateY2: "0.11", profitRateY3: "0.11", investmentCap: "6000000" }),
      ),
    );
    await run(() =>
      goals.saveSalaryConfig(
        form({ year: "2026", monthlySalary: "95000", festivalBonusMultiplier: "1", bonusMonths: "3,9", taxRebate: "0", annualTax: "0", monthlyExpense: "30000" }),
      ),
    );
    expect(await db.depositPlanConfig.findUnique({ where: { userId } })).not.toBeNull();
    const salary = await db.salaryConfig.findFirstOrThrow({ where: { userId, year: 2026 } });
    expect(salary.bonusMonths).toEqual([3, 9]);
  });

  it("does not resurrect projected deposits after saving a plan", async () => {
    // The old sync wrote a row per elapsed month here; nothing should be auto-created.
    const labels = (await db.fixedDeposit.findMany({ where: { userId }, select: { label: true } })).map((d) => d.label);
    expect(labels.some((l) => l.includes("(auto)"))).toBe(false);
  });

  it("creates DPS plans and milestones", async () => {
    await run(() =>
      deposits.createDpsPlan(form({ label: "Islami DPS", monthlyDeposit: "5000", startMonth: "2025-01", tenureMonths: "60", interestRate: "9", profitTaxAtSource: "10" })),
    );
    await run(() => goals.createMilestone(form({ label: "50 Lakh", targetAmount: "5000000" })));
    expect(await db.dpsPlan.count({ where: { userId } })).toBe(1);
    expect(await db.milestone.count({ where: { userId } })).toBe(1);
  });
});

describe("goal and lending actions", () => {
  it("creates a goal from a template with a Hijri-derived deadline", async () => {
    await run(() => goals.createGoalFromTemplate("QURBANI"));
    const goal = await db.savingsGoal.findFirstOrThrow({ where: { userId, templateKey: "QURBANI" } });
    expect(goal.targetDate).not.toBeNull();
    expect(goal.targetDate!.getTime()).toBeGreaterThan(Date.now());
  });

  it("records a contribution against a goal", async () => {
    const goal = await db.savingsGoal.findFirstOrThrow({ where: { userId } });
    await run(() => goals.contributeToGoal(form({ goalId: goal.id, amount: "30000", date: "2026-02-01" })));
    expect(await db.goalContribution.count({ where: { goalId: goal.id } })).toBe(1);
  });

  it("records a personal loan and a repayment", async () => {
    await run(() => lending.createPersonalLoan(form({ counterparty: "Rahim", direction: "LENT", principal: "50000", date: "2026-01-10", dueDate: "2026-04-01" })));
    const loan = await db.personalLoan.findFirstOrThrow({ where: { userId } });
    await run(() => lending.recordLoanPayment(form({ personalLoanId: loan.id, amount: "15000", date: "2026-03-01" })));
    expect(await db.personalLoanPayment.count({ where: { personalLoanId: loan.id } })).toBe(1);

    await run(() => lending.settlePersonalLoan(loan.id));
    expect((await db.personalLoan.findUniqueOrThrow({ where: { id: loan.id } })).settledAt).not.toBeNull();
  });

  it("saves preferences and a hashed PIN", async () => {
    await run(() => settings.savePreferences(form({ language: "BN", numerals: "BENGALI", financeMode: "ISLAMIC" })));
    const prefs = await db.userPreferences.findUniqueOrThrow({ where: { userId } });
    expect(prefs.language).toBe("BN");
    expect(prefs.financeMode).toBe("ISLAMIC");

    const state = await settings.setPin({}, form({ pin: "1234", confirmPin: "1234" }));
    expect(state.success).toBeTruthy();
    const withPin = await db.userPreferences.findUniqueOrThrow({ where: { userId } });
    expect(withPin.pinHash).not.toBeNull();
    expect(withPin.pinHash).not.toBe("1234"); // hashed, not stored raw

    expect((await settings.setPin({}, form({ pin: "12", confirmPin: "12" }))).error).toBeTruthy();
    expect((await settings.setPin({}, form({ pin: "1234", confirmPin: "9999" }))).error).toBeTruthy();
  });

  it("sets a budget scoped to the month being edited", async () => {
    const category = await db.category.create({ data: { userId, name: "Bazar", kind: "EXPENSE" } });
    await run(() => budgets.setBudget(form({ categoryId: category.id, monthlyLimit: "8000", month: "2026-07" })));
    const budget = await db.budget.findFirstOrThrow({ where: { userId, categoryId: category.id } });
    expect(budget.month.toISOString().slice(0, 10)).toBe("2026-07-01");
  });

  it("will not attach a budget to another user's category", async () => {
    const other = await db.user.create({ data: { email: `o3-${Date.now()}@example.test`, passwordHash: "x" } });
    const theirCategory = await db.category.create({ data: { userId: other.id, name: "Theirs", kind: "EXPENSE" } });
    await run(() => budgets.setBudget(form({ categoryId: theirCategory.id, monthlyLimit: "1", month: "2026-07" })));
    expect(await db.budget.count({ where: { categoryId: theirCategory.id } })).toBe(0);
    await db.user.delete({ where: { id: other.id } });
  });
});
