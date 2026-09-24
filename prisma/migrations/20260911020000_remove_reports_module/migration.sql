-- DropForeignKey
ALTER TABLE "TaxWithholding" DROP CONSTRAINT "TaxWithholding_userId_fkey";

-- DropForeignKey
ALTER TABLE "ReturnAssetEntry" DROP CONSTRAINT "ReturnAssetEntry_userId_fkey";

-- DropTable
DROP TABLE "TaxWithholding";

-- DropTable
DROP TABLE "ReturnAssetEntry";

-- DropEnum
DROP TYPE "WithholdingSource";
