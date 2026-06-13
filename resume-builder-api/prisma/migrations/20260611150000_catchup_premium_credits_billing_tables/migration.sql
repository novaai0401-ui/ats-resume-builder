-- Catch-up migration: these objects existed in schema.prisma (via merge
-- commit b0b259a) but no migration ever created them. Every deploy that
-- ran `prisma migrate deploy` against a fresh database was missing them,
-- which made ALL /auth/register calls fail with P2022 (column
-- User.premiumCredits does not exist) surfaced as a 503.
--
-- All statements are idempotent (IF NOT EXISTS) so this migration is
-- safe both on fresh databases AND on databases where `prisma db push`
-- had already created the objects out-of-band.

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "premiumCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiCritiqueLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCritiqueLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaymentHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "planType" TEXT NOT NULL,
    "paymentProvider" TEXT NOT NULL DEFAULT 'razorpay',
    "providerPaymentId" TEXT,
    "providerOrderId" TEXT,
    "paymentMethod" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiTokenUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "featureType" TEXT NOT NULL,
    "tokensUsed" INTEGER NOT NULL,
    "modelUsed" TEXT,
    "costMicroCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiTokenUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiCritiqueLog_userId_createdAt_idx" ON "AiCritiqueLog"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentHistory_userId_idx" ON "PaymentHistory"("userId");
CREATE INDEX IF NOT EXISTS "PaymentHistory_providerOrderId_idx" ON "PaymentHistory"("providerOrderId");
CREATE INDEX IF NOT EXISTS "AiTokenUsage_userId_createdAt_idx" ON "AiTokenUsage"("userId", "createdAt");
