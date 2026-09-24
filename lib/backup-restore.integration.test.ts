// Integration check for the backup → restore round-trip against the dev database.
// Temporary: deleted after the run.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_EMAIL = "restore-rt@example.test";
let userId = "";

// restoreBackup is a server action: it resolves the session and calls Next's redirect /
// revalidatePath. Stub exactly those boundaries so the real mapping and writes run.
vi.mock("@/lib/current-user", () => ({ requireUserId: async () => userId }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { db } = await import("@/lib/db");
const { restoreBackup } = await import("@/app/(app)/profile/actions");

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));

beforeAll(async () => {
  await db.user.deleteMany({ where: { email: TEST_EMAIL } });
  const user = await db.user.create({ data: { email: TEST_EMAIL, passwordHash: "x" } });
  userId = user.id;
});

afterAll(async () => {
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

/** A v5 backup exercising every table, including the ones added most recently. */
function backupFile() {
  return {
    version: 5,
    exportedAt: new Date().toISOString(),
    userId: "some-other-user",
    accounts: [
      { id: "acc1", name: "City Bank", kind: "BANK", balance: "250000", createdAt: d(2025, 0, 1) },
      { id: "acc2", name: "Cash", kind: "CASH", balance: "15000", createdAt: d(2025, 0, 1) },
    ],
    categories: [{ id: "cat1", name: "Bazar", kind: "EXPENSE" }],
    transactions: [
      { id: "t1", accountId: "acc1", categoryId: "cat1", date: d(2026, 5, 3), amount: "4200", type: "EXPENSE", createdAt: d(2026, 5, 3) },
    ],
    recurringTransactions: [],
    budgets: [{ id: "b1", categoryId: "cat1", month: d(2026, 6, 1), monthlyLimit: "8000" }],
    salaryConfigs: [{ id: "s1", year: 2026, monthlySalary: "95000", bonusMonths: [3, 9], festivalBonusMultiplier: "1", taxRebate: "0", annualTax: "0", monthlyExpense: "0" }],
    // A government scheme and a plain FDR — the merged shape, with the dropped `source`
    // field still present as an older file would have it.
    fixedDeposits: [
      { id: "fd1", label: "Pariwar", principal: "1500000", openedDate: d(2024, 0, 15), rateY1: "0.1152", rateY2: "0.1152", rateY3: "0.1152", termMonths: 60, scheme: "PARIWAR", holderType: "SINGLE", registrationNo: "REG-1", source: "MANUAL" },
      { id: "fd2", label: "DBBL FDR", principal: "400000", openedDate: d(2025, 0, 1), rateY1: "0.09", rateY2: "0.09", rateY3: "0.09", termMonths: 36, source: "PROJECTED" },
    ],
    dpsPlans: [{ id: "dps1", label: "Islami DPS", monthlyDeposit: "5000", startMonth: d(2025, 0, 10), tenureMonths: 60, interestRate: "0.09", profitTaxAtSource: "0.1" }],
    depositPlan: { startingNetWorth: "0", startMonth: d(2025, 0, 1), depositUnitSize: "100000", profitRateY1: "0.11", profitRateY2: "0.11", profitRateY3: "0.11", investmentCap: "6000000" },
    milestones: [{ id: "m1", label: "50 Lakh", targetAmount: "5000000" }],
    loans: [{ id: "l1", name: "Car loan", originalAmount: "800000", startDate: d(2025, 0, 1), payments: [{ id: "lp1", date: d(2025, 6, 1), amount: "100000" }] }],
    bigPurchases: [{ id: "bp1", item: "Fridge", amount: "70000", date: d(2025, 3, 1) }],
    incomeLedger: [{ id: "il1", date: d(2025, 0, 1), description: "Salary", amount: "1000000", taxWithheld: "50000" }],
    preferences: { language: "BN", numerals: "BENGALI", financeMode: "ISLAMIC" },
    // Left over from the removed Assets (v4), Calculators (v5), Reports (v6) and
    // Reminders (v7) modules. An old file in someone's downloads still carries these
    // keys, and restoring it must ignore them rather than fail.
    taxWithholdings: [{ id: "tw1", date: d(2025, 2, 1), source: "SALARY", description: "TDS", grossAmount: "900000", taxWithheld: "45000", incomeYear: "2024-25", certificateRef: "C-1" }],
    returnAssets: [{ id: "ra1", incomeYear: "2024-25", goldValue: "800000", goldGrams: "60", silverGrams: "100", sharesCost: "200000" }],
    reminders: [{ id: "rm1", kind: "INSURANCE_PREMIUM", label: "MetLife", dueDate: d(2026, 7, 5), amount: "12000", recurEveryMonths: 12 }],
    zakatConfig: { nisabBasis: "SILVER", goldKarat: "22K", silverKarat: "22K", otherAssets: "50000", liabilityDeduction: "DUE_ONLY", dueLiabilities: "20000", includePersonalJewellery: true },
    zakatPayments: [{ id: "zp1", date: d(2026, 2, 1), amount: "25000", recipient: "Madrasa", category: "FAQIR", hijriYear: "1447" }],
    metalHoldings: [{ id: "mh1", label: "Necklace", metal: "GOLD", karat: "22K", grams: "40", purchasePricePerGram: "8000", personalUse: false }],
    stockHoldings: [
      { id: "sh1", ticker: "GP", name: "Grameenphone", exchange: "DSE", lastPrice: "340", lastPriceAt: d(2026, 6, 1), trades: [{ id: "st1", date: d(2025, 0, 10), type: "BUY", quantity: "200", price: "300", fees: "500" }] },
    ],
    savingsGoals: [
      { id: "g1", name: "Qurbani", templateKey: "QURBANI", targetAmount: "90000", targetDate: d(2026, 4, 20), contributions: [{ id: "gc1", date: d(2026, 1, 1), amount: "30000" }] },
    ],
    personalLoans: [
      { id: "pl1", counterparty: "Rahim", direction: "LENT", principal: "50000", date: d(2026, 0, 10), dueDate: d(2026, 3, 1), payments: [{ id: "plp1", date: d(2026, 2, 1), amount: "15000" }] },
    ],
  };
}

async function runRestore(payload: unknown) {
  const form = new FormData();
  form.set("backup", new File([JSON.stringify(payload)], "backup.json", { type: "application/json" }));
  try {
    await restoreBackup(form);
  } catch (error) {
    // Success is signalled by a redirect, which the stub turns into a throw.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.startsWith("REDIRECT:")) throw error;
    return message.slice("REDIRECT:".length);
  }
  return null;
}

describe("backup restore round-trip", () => {
  it("restores every table without a Prisma error", async () => {
    const redirectTo = await runRestore(backupFile());
    expect(redirectTo).toBe("/profile?restore=success");
  });

  it("restores the core tables", async () => {
    expect(await db.account.count({ where: { userId } })).toBe(2);
    expect(await db.category.count({ where: { userId } })).toBe(1);
    expect(await db.transaction.count({ where: { userId } })).toBe(1);
    expect(await db.budget.count({ where: { userId } })).toBe(1);
    expect(await db.dpsPlan.count({ where: { userId } })).toBe(1);
    expect(await db.loanPayment.count({ where: { loan: { userId } } })).toBe(1);
    expect(await db.incomeLedgerEntry.count({ where: { userId } })).toBe(1);
  });

  it("keeps the scheme on a merged savings certificate", async () => {
    const pariwar = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "Pariwar" } });
    expect(pariwar.scheme).toBe("PARIWAR");
    expect(pariwar.registrationNo).toBe("REG-1");
    expect(pariwar.holderType).toBe("SINGLE");
  });

  it("ignores the dropped `source` field from older files", async () => {
    // Both rows restore as real holdings; the old PROJECTED marker no longer means
    // anything and must not cause a failure or a silent drop.
    expect(await db.fixedDeposit.count({ where: { userId } })).toBe(2);
    const fdr = await db.fixedDeposit.findFirstOrThrow({ where: { userId, label: "DBBL FDR" } });
    expect(fdr.scheme).toBeNull();
  });

  it("restores every Bangladesh-feature table", async () => {
    expect(await db.savingsGoal.count({ where: { userId } })).toBe(1);
    expect(await db.goalContribution.count({ where: { goal: { userId } } })).toBe(1);
    expect(await db.personalLoan.count({ where: { userId } })).toBe(1);
    expect(await db.personalLoanPayment.count({ where: { personalLoan: { userId } } })).toBe(1);
  });

  it("restores 1:1 config rows", async () => {
    const preferences = await db.userPreferences.findUniqueOrThrow({ where: { userId } });
    expect(preferences.language).toBe("BN");
    expect(preferences.financeMode).toBe("ISLAMIC");
  });

  it("is idempotent — restoring the same file twice leaves the same counts", async () => {
    expect(await runRestore(backupFile())).toBe("/profile?restore=success");
    expect(await db.account.count({ where: { userId } })).toBe(2);
    expect(await db.fixedDeposit.count({ where: { userId } })).toBe(2);
    expect(await db.personalLoan.count({ where: { userId } })).toBe(1);
  });

  it("still accepts an old v1 file with none of the new keys", async () => {
    const v1 = {
      version: 1,
      accounts: [{ id: "old1", name: "Old", kind: "BANK", balance: "1000", createdAt: d(2024, 0, 1) }],
      categories: [],
      transactions: [],
      budgets: [],
      fixedDeposits: [],
    };
    expect(await runRestore(v1)).toBe("/profile?restore=success");
    expect(await db.account.count({ where: { userId } })).toBe(1);
    // The new tables are cleared rather than left stale, since the file represents the
    // complete state being restored.
    expect(await db.savingsGoal.count({ where: { userId } })).toBe(0);
  });

  it("rejects a malformed file without touching data", async () => {
    expect(await runRestore({ nonsense: true })).toBe("/profile?restore=error");
    expect(await db.account.count({ where: { userId } })).toBe(1);
  });

  it("restores a file whose ids belong to somebody else's rows", async () => {
    // Ids in a backup are only unique within the account it was exported from, and the
    // restore can only delete rows belonging to `userId`. A file carrying an id another
    // user still owns used to fail the whole transaction on the primary key (P2002).
    const otherEmail = "restore-rt-other@example.test";
    await db.user.deleteMany({ where: { email: otherEmail } });
    const other = await db.user.create({ data: { email: otherEmail, passwordHash: "x" } });

    try {
      await db.account.create({
        data: { id: "acc1", userId: other.id, name: "Their account", kind: "BANK", balance: "1" },
      });

      expect(await runRestore(backupFile())).toBe("/profile?restore=success");

      // The colliding row is still theirs, untouched.
      const theirs = await db.account.findUniqueOrThrow({ where: { id: "acc1" } });
      expect(theirs.userId).toBe(other.id);
      expect(theirs.name).toBe("Their account");

      // And the restore landed in full, on ids of its own.
      const restored = await db.account.findMany({ where: { userId }, select: { id: true } });
      expect(restored).toHaveLength(2);
      expect(restored.map((a) => a.id)).not.toContain("acc1");

      // Relations were rewritten onto those new ids rather than left dangling.
      const txn = await db.transaction.findFirstOrThrow({ where: { userId } });
      expect(restored.map((a) => a.id)).toContain(txn.accountId);
    } finally {
      await db.user.delete({ where: { id: other.id } });
    }
  });
});
