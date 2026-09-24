-- Correctness pass. Hand-written rather than generated because three of these changes
-- need existing rows repaired before the new constraints can hold.

-- ============================================================================
-- 1. Budgets gain a month dimension.
-- ============================================================================
-- A budget row used to be "the limit for this category, forever", so browsing a past
-- month showed that month's spend against today's limit. `month` is the first day of
-- the month the limit takes effect from; a category's limit for any month is the newest
-- row at or before it. Existing rows are backfilled to the current month, which is what
-- they have always meant in practice.
ALTER TABLE "Budget"
  ADD COLUMN "month" DATE,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Budget" SET "month" = date_trunc('month', CURRENT_DATE)::date WHERE "month" IS NULL;

ALTER TABLE "Budget" ALTER COLUMN "month" SET NOT NULL;

DROP INDEX "Budget_userId_categoryId_key";
CREATE UNIQUE INDEX "Budget_userId_categoryId_month_key" ON "Budget"("userId", "categoryId", "month");
CREATE INDEX "Budget_userId_month_idx" ON "Budget"("userId", "month");

-- ============================================================================
-- 2. A recurring plan may generate at most one transaction per due date.
-- ============================================================================
-- Catch-up generation read the last generated date and then wrote, so two concurrent
-- requests could both decide a month was ungenerated and both create it. Any duplicates
-- that race already produced are collapsed here (keeping the earliest row), and the
-- account balances they double-counted are corrected — but only for duplicates that are
-- not soft-deleted, since soft-deleting already reversed a row's balance effect.
CREATE TEMP TABLE "_duplicate_recurring_tx" AS
SELECT id, "accountId", "amount", "type", "deletedAt"
FROM (
  SELECT
    id, "accountId", "amount", "type", "deletedAt",
    row_number() OVER (PARTITION BY "recurringId", "date" ORDER BY "createdAt", id) AS rn
  FROM "Transaction"
  WHERE "recurringId" IS NOT NULL
) ranked
WHERE rn > 1;

UPDATE "Account" a
SET "balance" = a."balance" - COALESCE((
  SELECT SUM(CASE WHEN d."type" = 'INCOME' THEN d."amount" ELSE -d."amount" END)
  FROM "_duplicate_recurring_tx" d
  WHERE d."accountId" = a.id AND d."deletedAt" IS NULL
), 0)
WHERE EXISTS (
  SELECT 1 FROM "_duplicate_recurring_tx" d
  WHERE d."accountId" = a.id AND d."deletedAt" IS NULL
);

DELETE FROM "Transaction" WHERE id IN (SELECT id FROM "_duplicate_recurring_tx");

DROP TABLE "_duplicate_recurring_tx";

-- NULL recurringId rows are unconstrained by this in Postgres, so hand-entered
-- transactions are unaffected.
CREATE UNIQUE INDEX "Transaction_recurringId_date_key" ON "Transaction"("recurringId", "date");

-- Supports the per-category monthly spend rollups on the Budgets page and Dashboard.
CREATE INDEX "Transaction_userId_categoryId_date_idx" ON "Transaction"("userId", "categoryId", "date");

-- ============================================================================
-- 3. Zakat: configurable treatment of outstanding debt.
-- ============================================================================
-- The zakat base used to net out the entire outstanding balance of every loan. The
-- majority scholarly position deducts only liabilities actually due within the zakat
-- year, so that becomes the default; FULL and NONE remain available.
ALTER TABLE "ZakatConfig"
  ADD COLUMN "liabilityDeduction" TEXT NOT NULL DEFAULT 'DUE_ONLY',
  ADD COLUMN "dueLiabilities" DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing configs keep the behaviour they were computed under until the user revisits
-- the setting, so nobody's zakat figure silently changes underneath them.
UPDATE "ZakatConfig" SET "liabilityDeduction" = 'FULL';

-- ============================================================================
-- 4. Deferred-maintenance throttle.
-- ============================================================================
ALTER TABLE "User" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- ============================================================================
-- 5. updatedAt everywhere.
-- ============================================================================
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Account" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Transaction" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RecurringTransaction" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Category" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SalaryConfig" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "FixedDeposit" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DpsPlan" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "DepositPlanConfig" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Milestone" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Loan" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "LoanPayment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BigPurchase" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "IncomeLedgerEntry" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
