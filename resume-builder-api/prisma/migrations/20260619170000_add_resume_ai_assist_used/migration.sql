-- New monetization model: flat per-download AI fee when our AI assisted a resume.
ALTER TABLE "Resume" ADD COLUMN "aiAssistUsed" BOOLEAN NOT NULL DEFAULT false;
