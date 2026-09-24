/*
  Warnings:

  - You are about to drop the column `goldPricePerGram` on the `ZakatConfig` table. All the data in the column will be lost.
  - You are about to drop the column `silverPricePerGram` on the `ZakatConfig` table. All the data in the column will be lost.
  - You are about to drop the column `useLivePrice` on the `ZakatConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ZakatConfig" DROP COLUMN "goldPricePerGram",
DROP COLUMN "silverPricePerGram",
DROP COLUMN "useLivePrice";
