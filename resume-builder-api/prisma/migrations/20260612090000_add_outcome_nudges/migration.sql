-- R-031 · Outcome-status nudge.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "nudgeEmailsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "OutcomeNudge" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "jobApplicationId" TEXT NOT NULL,
    "token"            TEXT NOT NULL,
    "sentAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"        TIMESTAMP(3) NOT NULL,
    "usedAt"           TIMESTAMP(3),
    "actionTaken"      TEXT,

    CONSTRAINT "OutcomeNudge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutcomeNudge_token_key" ON "OutcomeNudge"("token");
CREATE INDEX "OutcomeNudge_jobApplicationId_sentAt_idx" ON "OutcomeNudge"("jobApplicationId", "sentAt");
CREATE INDEX "OutcomeNudge_userId_sentAt_idx" ON "OutcomeNudge"("userId", "sentAt");
