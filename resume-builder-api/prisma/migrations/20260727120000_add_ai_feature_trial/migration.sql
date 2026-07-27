-- R-098 — one free run per AI feature (lifetime, FREE users only).
CREATE TABLE "AiFeatureTrial" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "feature" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiFeatureTrial_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AiFeatureTrial_userId_feature_key" ON "AiFeatureTrial"("userId", "feature");
CREATE INDEX "AiFeatureTrial_userId_idx" ON "AiFeatureTrial"("userId");
