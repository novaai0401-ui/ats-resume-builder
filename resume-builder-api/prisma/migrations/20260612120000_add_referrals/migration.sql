-- R-037 · Referral credits.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_referralCode_key" ON "User"("referralCode");

CREATE TABLE "Referral" (
    "id"             TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "referredUserId" TEXT NOT NULL,
    "emailHash"      TEXT NOT NULL,
    "ipHash"         TEXT,
    "creditGranted"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Referral_referredUserId_key" ON "Referral"("referredUserId");
CREATE UNIQUE INDEX "Referral_emailHash_key" ON "Referral"("emailHash");
CREATE INDEX "Referral_referrerUserId_createdAt_idx" ON "Referral"("referrerUserId", "createdAt");
CREATE INDEX "Referral_ipHash_createdAt_idx" ON "Referral"("ipHash", "createdAt");
