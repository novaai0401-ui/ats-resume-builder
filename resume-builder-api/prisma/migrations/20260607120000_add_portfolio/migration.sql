-- Public shareable portfolio. Snapshot of recruiter-facing resume fields with
-- a unique public slug. Recruiters view at /p/:slug without an account.

CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "headline" TEXT,
    "resumeId" TEXT,
    "snapshot" JSONB NOT NULL,
    "contactEmail" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Portfolio_slug_key" ON "Portfolio"("slug");
CREATE INDEX "Portfolio_userId_createdAt_idx" ON "Portfolio"("userId", "createdAt");
