-- R-073: link a per-download payment to the resume + buyer email, and record
-- when the paid resume was actually delivered, so support can look up a
-- payment by email and resend the resume (email-only recovery).

ALTER TABLE "PaymentHistory" ADD COLUMN "resumeId" TEXT;
ALTER TABLE "PaymentHistory" ADD COLUMN "email" TEXT;
ALTER TABLE "PaymentHistory" ADD COLUMN "fulfilledAt" TIMESTAMP(3);

CREATE INDEX "PaymentHistory_email_idx" ON "PaymentHistory"("email");
CREATE INDEX "PaymentHistory_resumeId_idx" ON "PaymentHistory"("resumeId");

-- Delivery audit trail for every resume email we send.
CREATE TABLE "ResumeEmailLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'download',
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResumeEmailLog_userId_idx" ON "ResumeEmailLog"("userId");
CREATE INDEX "ResumeEmailLog_resumeId_idx" ON "ResumeEmailLog"("resumeId");
CREATE INDEX "ResumeEmailLog_email_idx" ON "ResumeEmailLog"("email");
