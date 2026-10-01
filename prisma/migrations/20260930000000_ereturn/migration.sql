-- CreateEnum
CREATE TYPE "TaxReturnStatus" AS ENUM ('DRAFT', 'FILED');

-- CreateEnum
CREATE TYPE "TaxpayerBenefit" AS ENUM ('FEMALE', 'SENIOR', 'THIRD_GENDER', 'DISABLED', 'FREEDOM_FIGHTER', 'PARENT_OF_DISABLED');

-- CreateEnum
CREATE TYPE "MinimumTaxArea" AS ENUM ('DHAKA_CHATTOGRAM_CITY', 'OTHER_CITY', 'ELSEWHERE');

-- CreateEnum
CREATE TYPE "TaxFinancialAssetKind" AS ENUM ('BANK_ACCOUNT', 'SANCHAYAPATRA', 'DPS', 'FIXED_DEPOSIT', 'SHARES', 'BOND', 'MOBILE_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxPaymentKind" AS ENUM ('SALARY_TDS', 'OTHER_TDS', 'ADVANCE_TAX', 'REFUND_ADJUSTMENT', 'WITH_RETURN');

-- CreateEnum
CREATE TYPE "TaxInvestmentKind" AS ENUM ('LIFE_INSURANCE', 'DEPOSIT_PENSION', 'GOVT_SECURITIES', 'LISTED_SECURITIES', 'PROVIDENT_FUND_1925', 'RECOGNIZED_PF', 'SUPERANNUATION', 'BENEVOLENT_FUND', 'ZAKAT', 'OTHER');

-- CreateTable
CREATE TABLE "TaxReturn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomeYear" TEXT NOT NULL,
    "status" "TaxReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL DEFAULT '',
    "nid" TEXT,
    "tin" TEXT,
    "circle" TEXT,
    "taxZone" TEXT,
    "resident" BOOLEAN NOT NULL DEFAULT true,
    "benefits" "TaxpayerBenefit"[] DEFAULT ARRAY[]::"TaxpayerBenefit"[],
    "dateOfBirth" DATE,
    "fatherName" TEXT,
    "spouseName" TEXT,
    "spouseTin" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "employerName" TEXT,
    "businessName" TEXT,
    "bin" TEXT,
    "area" "MinimumTaxArea" NOT NULL DEFAULT 'DHAKA_CHATTOGRAM_CITY',
    "previousNetWealth" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lastYearTaxPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "environmentalSurcharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "delayInterest" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "filedAt" DATE,
    "serialNo" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReturnLine" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxFinancialAsset" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "kind" "TaxFinancialAssetKind" NOT NULL,
    "institution" TEXT NOT NULL,
    "branch" TEXT,
    "reference" TEXT,
    "description" TEXT,
    "openedDate" DATE,
    "value" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "income" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxDeducted" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxFinancialAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPayment" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "kind" "TaxPaymentKind" NOT NULL,
    "reference" TEXT,
    "date" DATE,
    "depositedBy" TEXT,
    "bank" TEXT,
    "branch" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRebateInvestment" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "kind" "TaxInvestmentKind" NOT NULL,
    "description" TEXT,
    "date" DATE,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRebateInvestment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxReturn_userId_incomeYear_key" ON "TaxReturn"("userId", "incomeYear");

-- CreateIndex
CREATE UNIQUE INDEX "TaxReturnLine_returnId_code_key" ON "TaxReturnLine"("returnId", "code");

-- CreateIndex
CREATE INDEX "TaxFinancialAsset_returnId_idx" ON "TaxFinancialAsset"("returnId");

-- CreateIndex
CREATE INDEX "TaxPayment_returnId_idx" ON "TaxPayment"("returnId");

-- CreateIndex
CREATE INDEX "TaxRebateInvestment_returnId_idx" ON "TaxRebateInvestment"("returnId");

-- AddForeignKey
ALTER TABLE "TaxReturn" ADD CONSTRAINT "TaxReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturnLine" ADD CONSTRAINT "TaxReturnLine_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "TaxReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxFinancialAsset" ADD CONSTRAINT "TaxFinancialAsset_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "TaxReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPayment" ADD CONSTRAINT "TaxPayment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "TaxReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRebateInvestment" ADD CONSTRAINT "TaxRebateInvestment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "TaxReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

