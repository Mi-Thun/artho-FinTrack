-- CreateTable
CREATE TABLE "ZakatConfig" (
    "userId" TEXT NOT NULL,
    "nisabBasis" TEXT NOT NULL DEFAULT 'SILVER',
    "goldPricePerGram" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "silverPricePerGram" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherAssets" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "ZakatConfig_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ZakatConfig" ADD CONSTRAINT "ZakatConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
