-- R-045 Phase 2 — per-resume body-section order (ATS family).
ALTER TABLE "Resume" ADD COLUMN "sectionOrder" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
