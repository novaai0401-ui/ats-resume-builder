-- Add a dedicated Achievements section to resumes. Modeled as a plain
-- string array (like skills / languages) since achievements are
-- standalone statements, not structured entries.

ALTER TABLE "Resume" ADD COLUMN "achievements" TEXT[] NOT NULL DEFAULT '{}';
