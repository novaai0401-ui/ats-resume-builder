-- R-077: profession-specific sections. Licensure (doctors, nurses, lawyers,
-- medical coders, CAs) and publications/patents (academics, researchers,
-- engineers) become first-class resume sections.
ALTER TABLE "Resume" ADD COLUMN "licenses" JSONB;
ALTER TABLE "Resume" ADD COLUMN "publications" JSONB;
