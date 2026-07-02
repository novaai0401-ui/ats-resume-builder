CREATE TABLE "JobAlert" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "location" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "seenKeys" JSONB NOT NULL DEFAULT '[]',
  "lastRunAt" TIMESTAMP(3),
  "lastMatchAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JobAlert_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JobAlert_userId_idx" ON "JobAlert"("userId");
CREATE INDEX "JobAlert_active_idx" ON "JobAlert"("active");
