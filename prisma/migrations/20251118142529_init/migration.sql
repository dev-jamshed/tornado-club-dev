-- CreateTable
CREATE TABLE "ReferralSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "referralRewards" JSONB
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralSettings_shop_key" ON "ReferralSettings"("shop");
