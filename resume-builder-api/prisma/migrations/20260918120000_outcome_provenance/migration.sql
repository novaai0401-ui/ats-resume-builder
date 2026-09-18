-- R-109 — record where an outcome came from.
--
-- Additive and nullable: existing rows keep NULL, which the code reads as
-- "self-reported". That is accurate — every outcome recorded before this
-- column existed was typed in by the user.

ALTER TABLE "JobApplication" ADD COLUMN "outcomeSource" TEXT;
