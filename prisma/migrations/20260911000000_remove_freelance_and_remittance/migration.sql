-- DropForeignKey
ALTER TABLE "Client" DROP CONSTRAINT "Client_userId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_userId_fkey";

-- DropForeignKey
ALTER TABLE "RemittanceEntry" DROP CONSTRAINT "RemittanceEntry_userId_fkey";

-- DropTable
DROP TABLE "Client";

-- DropTable
DROP TABLE "Invoice";

-- DropTable
DROP TABLE "RemittanceEntry";

-- DropEnum
DROP TYPE "InvoiceStatus";

