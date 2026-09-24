-- DropForeignKey
ALTER TABLE "ZakatConfig" DROP CONSTRAINT "ZakatConfig_userId_fkey";

-- DropForeignKey
ALTER TABLE "ZakatPayment" DROP CONSTRAINT "ZakatPayment_userId_fkey";

-- DropTable
DROP TABLE "ZakatPayment";

-- DropTable
DROP TABLE "ZakatConfig";

-- DropEnum
DROP TYPE "ZakatRecipientCategory";
