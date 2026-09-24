ALTER TABLE "FixedDeposit"
ADD COLUMN "nextPayoutDate" TIMESTAMP(3),
ADD COLUMN "nextPayoutAmount" DECIMAL(65, 30);
