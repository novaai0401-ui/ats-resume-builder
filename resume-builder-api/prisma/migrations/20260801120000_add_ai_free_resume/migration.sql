-- R-103 — the one resume a FREE user gets full AI on.
CREATE TABLE "AiFreeResume" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "resumeId" TEXT NOT NULL,
  "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiFreeResume_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiFreeResume_userId_key" ON "AiFreeResume"("userId");
CREATE INDEX "AiFreeResume_resumeId_idx" ON "AiFreeResume"("resumeId");
