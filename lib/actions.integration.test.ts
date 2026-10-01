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

const deposits = await import("@/app/(app)/investments/actions");
const goals = await import("@/app/(app)/goals/actions");
const lending = await import("@/app/(app)/lending/actions");
const settings = await import("@/app/(app)/settings/actions");
const budgets = await import("@/app/(app)/budgets/actions");
const transactions = await import("@/app/(app)/transactions/actions");
const accounts = await import("@/app/(app)/accounts/actions");
const { accountBalancesForMonth } = await import("@/lib/account-balances");

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

  it("uses the single profit rate typed when adding a scheme SP, for every year", async () => {
    await run(() =>
      deposits.createFixedDeposit(
        form({ scheme: "THREE_MONTH_PROFIT", label: "Deposit typed rate", principal: "100000", openedDate: "2026-09-26", rate: "10.5" }),
      ),
    );
    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "Deposit typed rate" } });
    expect([Number(row.rateY1), Number(row.rateY2), Number(row.rateY3)]).toEqual([0.105, 0.105, 0.105]);
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

  it("saves the plan's single profit rate for all three years", async () => {
    await run(() =>
      goals.saveDepositPlanConfig(
        form({ startingNetWorth: "0", startMonth: "2025-01-01", depositUnitSize: "100000", profitRate: "11.5", investmentCap: "6000000" }),
      ),
    );
    const plan = await db.depositPlanConfig.findUniqueOrThrow({ where: { userId } });
    expect([Number(plan.profitRateY1), Number(plan.profitRateY2), Number(plan.profitRateY3)]).toEqual([0.115, 0.115, 0.115]);
  });

  it("an SP edit with one profit rate sets all three years", async () => {
    await run(() => deposits.createFixedDeposit(form({ scheme: "OTHER", label: "One-rate FDR", principal: "50000", openedDate: "2026-01-10", rate: "9", termMonths: "12" })));
    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "One-rate FDR" } });
    expect([Number(row.rateY1), Number(row.rateY2), Number(row.rateY3), row.termMonths]).toEqual([0.09, 0.09, 0.09, 12]);
    await run(() => deposits.updateFixedDeposit(row.id, form({ scheme: "OTHER", label: "One-rate FDR", principal: "50000", openedDate: "2026-01-10", rate: "9.5" })));
    const edited = await db.fixedDeposit.findUniqueOrThrow({ where: { id: row.id } });
    expect([Number(edited.rateY1), Number(edited.rateY2), Number(edited.rateY3)]).toEqual([0.095, 0.095, 0.095]);
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

describe("accounts are view-only", () => {
  it("no transaction action or import moves an account balance", async () => {
    const account = await db.account.create({ data: { userId, name: "View-only bank", kind: "BANK", balance: 5000 } });
    const balance = async () => Number((await db.account.findUniqueOrThrow({ where: { id: account.id } })).balance);

    // An accountId posted by an old form is ignored.
    await run(() =>
      transactions.createTransaction(form({ type: "INCOME", amount: "1000", date: "2026-08-01", accountId: account.id, note: "view-only-1" })),
    );
    const tx = await db.transaction.findFirstOrThrow({ where: { userId, note: "view-only-1" } });
    expect(tx.accountId).toBeNull();
    await run(() =>
      transactions.updateTransaction(tx.id, form({ type: "EXPENSE", amount: "300", date: "2026-08-01", accountId: account.id, note: "view-only-1" })),
    );
    await run(() => transactions.deleteTransaction(tx.id));
    await run(() => transactions.restoreTransaction(tx.id));

    const fd = new FormData();
    fd.set("file", new File([`date,type,amount,account,note\n2026-08-02,EXPENSE,700,View-only bank,view-only-2`], "a.csv", { type: "text/csv" }));
    const result = await transactions.importTransactionsCsv(fd);
    expect(result).toMatchObject({ imported: 1 });
    expect((await db.transaction.findFirstOrThrow({ where: { userId, note: "view-only-2" } })).accountId).toBeNull();

    expect(await balance()).toBe(5000);
  });
});

describe("deleting an account", () => {
  const aug = new Date(Date.UTC(2026, 7, 1));
  const sep = new Date(Date.UTC(2026, 8, 1));
  const balanceIn = async (id: string, month: Date) => (await accountBalancesForMonth(userId, month)).get(id)?.balance;

  it("removes it from the month viewed on, keeping earlier months", async () => {
    await accounts.createAccount(form({ name: "Test wallet", kind: "WALLET", balance: "1200", month: "2026-08" }));
    const account = await db.account.findFirstOrThrow({ where: { userId, name: "Test wallet" } });
    await run(() => accounts.updateAccount(account.id, form({ name: "Test wallet", kind: "WALLET", balance: "800", month: "2026-09" })));

    await accounts.deleteAccount(account.id, "2026-09");
    expect(await balanceIn(account.id, aug)).toBe(1200);
    expect(await balanceIn(account.id, sep)).toBeUndefined();
    const closed = await db.account.findUniqueOrThrow({ where: { id: account.id } });
    expect(closed.closedFrom).toEqual(sep);
    expect(Number(closed.balance)).toBe(1200);

    // Closed from September, so it can't be edited back into it.
    await run(() => accounts.updateAccount(account.id, form({ name: "Test wallet", kind: "WALLET", balance: "5", month: "2026-09" })));
    expect(await balanceIn(account.id, sep)).toBeUndefined();

    // Deleting from its first month leaves nothing to keep.
    await accounts.deleteAccount(account.id, "2026-08");
    expect(await db.account.findUnique({ where: { id: account.id } })).toBeNull();
  });
});

describe("CSV import feeding the income ledger", () => {
  const csv = [
    "date,type,amount,category,account,note,tax",
    "2026-01-28,INCOME,60000,Salary,,SGC-Jan 26,900",
    "2026-03-05,INCOME,30000,Bonus,,SGC-Eid 1,",
    "2026-05-18,INCOME,9000,Gift (test),,Shefali+Baba,",
    "not-a-date,INCOME,5,,,bad,",
  ].join("\n");
  const upload = (createCategories: boolean) => {
    const fd = new FormData();
    fd.set("file", new File([csv], "income.csv", { type: "text/csv" }));
    if (createCategories) fd.set("createCategories", "on");
    return fd;
  };

  it("imports income with tax withheld, creates missing categories, leaves balances alone", async () => {
    // Salary and Bonus exist already; only the gift category is new.
    for (const name of ["Salary", "Bonus"]) {
      await db.category.upsert({
        where: { userId_name_kind: { userId, name, kind: "INCOME" } },
        create: { userId, name, kind: "INCOME" },
        update: {},
      });
    }
    const balancesBefore = await db.account.aggregate({ where: { userId }, _sum: { balance: true } });
    const result = await transactions.importTransactionsCsv(upload(true));
    expect(result).toMatchObject({ imported: 3, duplicates: 0, skipped: 1, categoriesCreated: 1 });

    const salary = await db.transaction.findFirstOrThrow({ where: { userId, note: "SGC-Jan 26" } });
    expect(salary.type).toBe("INCOME");
    expect(Number(salary.amount)).toBe(60000);
    expect(Number(salary.taxWithheld)).toBe(900);
    expect(salary.accountId).toBeNull();

    const gift = await db.transaction.findFirstOrThrow({ where: { userId, note: "Shefali+Baba" }, include: { category: true } });
    expect(gift.category?.name).toBe("Gift (test)");

    const balancesAfter = await db.account.aggregate({ where: { userId }, _sum: { balance: true } });
    expect(Number(balancesAfter._sum.balance)).toBe(Number(balancesBefore._sum.balance));
  });

  it("skips rows already recorded when the same file is imported again", async () => {
    const before = await db.transaction.count({ where: { userId } });
    const result = await transactions.importTransactionsCsv(upload(true));
    expect(result).toMatchObject({ imported: 0, duplicates: 3 });
    expect(await db.transaction.count({ where: { userId } })).toBe(before);
  });

  it("records tax only on income entered by hand", async () => {
    await run(() =>
      transactions.createTransaction(form({ type: "EXPENSE", amount: "100", date: "2026-09-01", taxWithheld: "50", note: "tax-on-expense" })),
    );
    const expense = await db.transaction.findFirstOrThrow({ where: { userId, note: "tax-on-expense" } });
    expect(Number(expense.taxWithheld)).toBe(0);
  });

  it("with update on, re-importing a corrected file fixes category, month and tax in place", async () => {
    const corrected = [
      "date,type,amount,category,account,note,tax,month",
      // Same rows as before, now with their own types and the month each is for.
      "2026-01-28,INCOME,60000,Salary (SGC test),,SGC-Jan 26,900,2026-01",
      "2026-03-05,INCOME,30000,Festival bonus (test),,SGC-Eid 1,,",
      "2026-05-18,INCOME,9000,Gift (test),,Shefali+Baba,,",
      // New: May's salary paid on 1 June counts as May.
      "2026-06-01,INCOME,6250,Salary (SGC test),,SGC-May 26,,2026-05",
    ].join("\n");
    const fd = new FormData();
    fd.set("file", new File([corrected], "income.csv", { type: "text/csv" }));
    fd.set("createCategories", "on");
    fd.set("updateExisting", "on");
    const before = await db.transaction.count({ where: { userId } });
    const result = await transactions.importTransactionsCsv(fd);
    expect(result).toMatchObject({ imported: 1, updated: 3, duplicates: 0 });
    expect(await db.transaction.count({ where: { userId } })).toBe(before + 1);

    const bonus = await db.transaction.findFirstOrThrow({ where: { userId, note: "SGC-Eid 1" }, include: { category: true } });
    expect(bonus.category?.name).toBe("Festival bonus (test)");
    expect(Number(bonus.amount)).toBe(30000);
    const jan = await db.transaction.findFirstOrThrow({ where: { userId, note: "SGC-Jan 26" } });
    // Same month as the date: stored as "no separate month".
    expect(jan.incomeMonth).toBeNull();
    expect(Number(jan.taxWithheld)).toBe(900);
    const may = await db.transaction.findFirstOrThrow({ where: { userId, note: "SGC-May 26" } });
    expect(may.incomeMonth?.toISOString().slice(0, 10)).toBe("2026-05-01");
  });

  it("saves the month income is for, and only on income", async () => {
    await run(() =>
      transactions.createTransaction(form({ type: "INCOME", amount: "7000", date: "2026-07-02", incomeMonth: "2026-06", note: "june-pay" })),
    );
    const pay = await db.transaction.findFirstOrThrow({ where: { userId, note: "june-pay" } });
    expect(pay.incomeMonth?.toISOString().slice(0, 10)).toBe("2026-06-01");

    // Clearing it on edit falls back to the month of the date.
    await run(() => transactions.updateTransaction(pay.id, form({ type: "INCOME", amount: "7000", date: "2026-07-02", incomeMonth: "", note: "june-pay" })));
    expect((await db.transaction.findUniqueOrThrow({ where: { id: pay.id } })).incomeMonth).toBeNull();

    await run(() =>
      transactions.createTransaction(form({ type: "EXPENSE", amount: "10", date: "2026-07-02", incomeMonth: "2026-06", note: "month-on-expense" })),
    );
    expect((await db.transaction.findFirstOrThrow({ where: { userId, note: "month-on-expense" } })).incomeMonth).toBeNull();
  });
});

describe("SP rate slab (৳7.5 lakh)", () => {
  // Its own user, so the SPs created above don't count toward the slab.
  const SLAB_EMAIL = "actions-slab@example.test";
  let mainUserId = "";

  beforeAll(async () => {
    mainUserId = userId;
    await db.user.deleteMany({ where: { email: SLAB_EMAIL } });
    userId = (await db.user.create({ data: { email: SLAB_EMAIL, passwordHash: "x" } })).id;
  });

  afterAll(async () => {
    await db.user.delete({ where: { id: userId } });
    userId = mainUserId;
  });

  it("splits one SP at the slab, counting SPs opened before it", async () => {
    await run(() =>
      deposits.createFixedDeposit(form({ scheme: "THREE_MONTH_PROFIT", label: "Earlier", principal: "300000", openedDate: "2026-01-04", rate: "11.82" })),
    );
    await run(() =>
      deposits.createFixedDeposit(
        form({ scheme: "THREE_MONTH_PROFIT", label: "Split", principal: "700000", openedDate: "2026-10-04", rate: "11.82", slabRate: "11.77" }),
      ),
    );

    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "Split" } });
    expect(Number(row.slabAmount)).toBe(250000);
    expect(Number(row.slabRate)).toBeCloseTo(0.1177, 6);
    // Quarterly profit equals ৳4.5 lakh at 11.82% plus ৳2.5 lakh at 11.77%.
    expect((700000 * Number(row.rateY3)) / 4).toBeCloseTo((450000 * 0.1182 + 250000 * 0.1177) / 4, 4);
  });

  it("drops the split when an edit brings the SP back under the slab", async () => {
    const row = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "Split" } });
    await run(() =>
      deposits.updateFixedDeposit(
        row.id,
        form({ scheme: "THREE_MONTH_PROFIT", label: "Split", principal: "400000", openedDate: "2026-10-04", rate: "11.82", slabRate: "11.77" }),
      ),
    );
    const updated = await db.fixedDeposit.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.slabAmount).toBeNull();
    expect(Number(updated.rateY3)).toBeCloseTo(0.1182, 6);
  });
});
