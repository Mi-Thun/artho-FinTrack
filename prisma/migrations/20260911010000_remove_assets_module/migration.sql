-- DropForeignKey
ALTER TABLE "MetalHolding" DROP CONSTRAINT "MetalHolding_userId_fkey";

-- DropForeignKey
ALTER TABLE "StockHolding" DROP CONSTRAINT "StockHolding_userId_fkey";

-- DropForeignKey
ALTER TABLE "StockTrade" DROP CONSTRAINT "StockTrade_holdingId_fkey";

-- DropTable
DROP TABLE "StockTrade";

-- DropTable
DROP TABLE "StockHolding";

-- DropTable
DROP TABLE "MetalHolding";

-- DropEnum
DROP TYPE "StockTradeType";

-- DropEnum
DROP TYPE "StockExchange";

-- DropEnum
DROP TYPE "Metal";

-- CreateTable
CREATE TABLE "ReturnAssetEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomeYear" TEXT NOT NULL,
    "goldValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "goldGrams" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "silverGrams" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sharesCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnAssetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReturnAssetEntry_userId_incomeYear_key" ON "ReturnAssetEntry"("userId", "incomeYear");

-- AddForeignKey
ALTER TABLE "ReturnAssetEntry" ADD CONSTRAINT "ReturnAssetEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
