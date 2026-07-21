-- R-092 — networking / referral mini-CRM (NetworkContact).
CREATE TABLE "NetworkContact" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "title" TEXT,
  "email" TEXT,
  "linkedinUrl" TEXT,
  "phone" TEXT,
  "relationship" TEXT NOT NULL DEFAULT 'other',
  "jobApplicationId" TEXT,
  "notes" TEXT,
  "lastContactedAt" TIMESTAMP(3),
  "nextFollowUpAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NetworkContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NetworkContact_userId_idx" ON "NetworkContact"("userId");
CREATE INDEX "NetworkContact_userId_nextFollowUpAt_idx" ON "NetworkContact"("userId", "nextFollowUpAt");
CREATE INDEX "NetworkContact_userId_jobApplicationId_idx" ON "NetworkContact"("userId", "jobApplicationId");
