-- AlterEnum
ALTER TYPE "TaxpayerBenefit" ADD VALUE 'JULY_WARRIOR';

-- AlterTable
ALTER TABLE "TaxReturn" ADD COLUMN     "firstReturn" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TaxRuleYear" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "incomeYear" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT '',
    "thresholdGeneral" DECIMAL(65,30) NOT NULL,
    "thresholdFemaleOrSenior" DECIMAL(65,30) NOT NULL,
    "thresholdThirdGender" DECIMAL(65,30) NOT NULL,
    "thresholdDisabled" DECIMAL(65,30) NOT NULL,
    "thresholdFreedomFighter" DECIMAL(65,30) NOT NULL,
    "thresholdJulyWarrior" DECIMAL(65,30),
    "parentOfDisabledExtra" DECIMAL(65,30) NOT NULL,
    "slabs" JSONB NOT NULL,
    "nonResidentRate" DECIMAL(65,30) NOT NULL,
    "minimumTaxDhakaChattogram" DECIMAL(65,30) NOT NULL,
    "minimumTaxOtherCity" DECIMAL(65,30) NOT NULL,
    "minimumTaxElsewhere" DECIMAL(65,30) NOT NULL,
    "minimumTaxFirstReturn" DECIMAL(65,30),
    "salaryExemptionFraction" DECIMAL(65,30) NOT NULL,
    "salaryExemptionCap" DECIMAL(65,30) NOT NULL,
    "rebateIncomePct" DECIMAL(65,30) NOT NULL,
    "rebateInvestmentPct" DECIMAL(65,30) NOT NULL,
    "rebateCap" DECIMAL(65,30) NOT NULL,
    "netWealthSurcharge" JSONB NOT NULL,
    "surchargeOnRegularTax" BOOLEAN NOT NULL DEFAULT false,
    "sanchayapatraFinalTax" BOOLEAN NOT NULL DEFAULT true,
    "returnDueDate" TEXT NOT NULL,
    "firstReturnDueDate" TEXT,
    "lateFilingMonthlyRate" DECIMAL(65,30) NOT NULL,
    "lateFilingMaxMonths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRuleYear_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxRuleYear_userId_incomeYear_key" ON "TaxRuleYear"("userId", "incomeYear");

-- AddForeignKey
ALTER TABLE "TaxRuleYear" ADD CONSTRAINT "TaxRuleYear_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Published rules, one row per income year. A fixed id per year keeps one published row
-- each; a later year's Paripatra is added by a new migration (or edited in the app as a
-- user's own override). Slab widths are above the tax-free band; a null width is "the rest".
INSERT INTO "TaxRuleYear" (
  "id", "userId", "incomeYear", "source",
  "thresholdGeneral", "thresholdFemaleOrSenior", "thresholdThirdGender", "thresholdDisabled", "thresholdFreedomFighter", "thresholdJulyWarrior", "parentOfDisabledExtra",
  "slabs", "nonResidentRate",
  "minimumTaxDhakaChattogram", "minimumTaxOtherCity", "minimumTaxElsewhere", "minimumTaxFirstReturn",
  "salaryExemptionFraction", "salaryExemptionCap",
  "rebateIncomePct", "rebateInvestmentPct", "rebateCap",
  "netWealthSurcharge", "surchargeOnRegularTax", "sanchayapatraFinalTax",
  "returnDueDate", "firstReturnDueDate", "lateFilingMonthlyRate", "lateFilingMaxMonths"
) VALUES
(
  'published-2023-24', NULL, '2023-24', 'Finance Act 2023 (tax year 2024-25)',
  350000, 400000, 475000, 475000, 500000, NULL, 50000,
  '[{"width":100000,"rate":0.05},{"width":300000,"rate":0.1},{"width":400000,"rate":0.15},{"width":500000,"rate":0.2},{"width":null,"rate":0.25}]', 0.3,
  5000, 4000, 3000, NULL,
  0.333333333333333333, 450000,
  0.03, 0.15, 1000000,
  '[{"above":40000000,"rate":0.1},{"above":100000000,"rate":0.2},{"above":200000000,"rate":0.3},{"above":500000000,"rate":0.35}]', false, true,
  '11-30', NULL, 0.02, 24
),
(
  'published-2024-25', NULL, '2024-25', 'Income Tax Paripatra 2025-26, §2.1, §2.4, §3.5, §59.5 (tax year 2025-26)',
  350000, 400000, 475000, 475000, 500000, NULL, 50000,
  '[{"width":100000,"rate":0.05},{"width":400000,"rate":0.1},{"width":500000,"rate":0.15},{"width":500000,"rate":0.2},{"width":2000000,"rate":0.25},{"width":null,"rate":0.3}]', 0.3,
  5000, 4000, 3000, NULL,
  0.333333333333333333, 500000,
  0.03, 0.15, 1000000,
  '[{"above":40000000,"rate":0.1},{"above":100000000,"rate":0.2},{"above":200000000,"rate":0.3},{"above":500000000,"rate":0.35}]', false, true,
  '11-30', '06-30', 0.02, 24
),
(
  'published-2025-26', NULL, '2025-26', 'Income Tax Paripatra 2025-26, §1.1, §1.4, §3.5, §42, §59.5 (tax year 2026-27)',
  375000, 425000, 500000, 500000, 525000, 525000, 50000,
  '[{"width":300000,"rate":0.1},{"width":400000,"rate":0.15},{"width":500000,"rate":0.2},{"width":2000000,"rate":0.25},{"width":null,"rate":0.3}]', 0.3,
  5000, 5000, 5000, 1000,
  0.333333333333333333, 500000,
  0.03, 0.15, 1000000,
  '[{"above":40000000,"rate":0.1},{"above":100000000,"rate":0.2},{"above":200000000,"rate":0.3},{"above":500000000,"rate":0.35}]', true, true,
  '11-30', '06-30', 0.02, 24
),
(
  'published-2026-27', NULL, '2026-27', 'Income Tax Paripatra 2025-26, §1.1, §1.4, §3.5, §42, §59.5 (tax year 2027-28)',
  375000, 425000, 500000, 500000, 525000, 525000, 50000,
  '[{"width":300000,"rate":0.1},{"width":400000,"rate":0.15},{"width":500000,"rate":0.2},{"width":2000000,"rate":0.25},{"width":null,"rate":0.3}]', 0.3,
  5000, 5000, 5000, 1000,
  0.333333333333333333, 500000,
  0.03, 0.15, 1000000,
  '[{"above":40000000,"rate":0.1},{"above":100000000,"rate":0.2},{"above":200000000,"rate":0.3},{"above":500000000,"rate":0.35}]', true, true,
  '11-30', '06-30', 0.02, 24
)
ON CONFLICT ("id") DO NOTHING;
