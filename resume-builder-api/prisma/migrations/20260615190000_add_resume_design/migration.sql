-- R-045 Phase 1 — per-resume design customization (font family + density).
ALTER TABLE "Resume" ADD COLUMN "fontFamily" TEXT;
ALTER TABLE "Resume" ADD COLUMN "density" TEXT;
