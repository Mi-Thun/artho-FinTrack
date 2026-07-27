-- CreateEnum
CREATE TYPE "DepositSource" AS ENUM ('MANUAL', 'PROJECTED');

-- AlterTable
ALTER TABLE "FixedDeposit" ADD COLUMN     "source" "DepositSource" NOT NULL DEFAULT 'MANUAL';
