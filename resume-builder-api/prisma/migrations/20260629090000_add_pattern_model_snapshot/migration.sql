CREATE TABLE "PatternModelSnapshot" (
  "id" TEXT NOT NULL,
  "docsSeen" INTEGER NOT NULL,
  "vocabSize" INTEGER NOT NULL DEFAULT 0,
  "shapes" INTEGER NOT NULL DEFAULT 0,
  "model" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatternModelSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PatternModelSnapshot_createdAt_idx" ON "PatternModelSnapshot"("createdAt");
