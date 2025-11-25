/*
  Warnings:

  - A unique constraint covering the columns `[referralCode]` on the table `Session` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Session" ADD COLUMN "referralCode" TEXT;
ALTER TABLE "Session" ADD COLUMN "referralSource" TEXT;
ALTER TABLE "Session" ADD COLUMN "storedAt" DATETIME;

-- CreateTable
CREATE TABLE "ReferralUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT,
    "customerEmail" TEXT,
    "referralCode" TEXT NOT NULL,
    "usedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderId" TEXT
);

-- CreateIndex
CREATE INDEX "ReferralUsage_customerEmail_referralCode_idx" ON "ReferralUsage"("customerEmail", "referralCode");

-- CreateIndex
CREATE INDEX "ReferralUsage_customerId_referralCode_idx" ON "ReferralUsage"("customerId", "referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Session_referralCode_key" ON "Session"("referralCode");
