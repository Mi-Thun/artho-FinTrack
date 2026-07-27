-- CreateTable
CREATE TABLE "DpsPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "monthlyDeposit" DECIMAL(65,30) NOT NULL,
    "startMonth" TIMESTAMP(3) NOT NULL,
    "tenureMonths" INTEGER NOT NULL,
    "interestRate" DECIMAL(65,30) NOT NULL,
    "profitTaxAtSource" DECIMAL(65,30) NOT NULL DEFAULT 0.1,

    CONSTRAINT "DpsPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DpsPlan_userId_idx" ON "DpsPlan"("userId");

-- AddForeignKey
ALTER TABLE "DpsPlan" ADD CONSTRAINT "DpsPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

