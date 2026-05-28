-- Outcome Loop: attribute job-application results to a specific resume version.
ALTER TABLE "JobApplication" ADD COLUMN "resumeVersionId" TEXT;
CREATE INDEX "JobApplication_resumeVersionId_idx"
    ON "JobApplication" ("resumeVersionId");
