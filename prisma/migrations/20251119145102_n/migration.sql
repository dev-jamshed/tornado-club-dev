-- CreateTable
CREATE TABLE "referral_codes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "referralLink" TEXT NOT NULL,
    "referralCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_referralCode_key" ON "referral_codes"("referralCode");
