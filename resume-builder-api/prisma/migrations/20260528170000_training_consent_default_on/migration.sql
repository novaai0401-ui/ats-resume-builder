-- Phase 8 — flip training consent to default-on (patterns-only, no PII)
-- and add the one-time-notice flag.

ALTER TABLE "User" ALTER COLUMN "trainingConsent"        SET DEFAULT TRUE;
ALTER TABLE "User" ALTER COLUMN "trainingConsentVersion" SET DEFAULT 1;
ALTER TABLE "User" ADD COLUMN "trainingConsentNoticeSeen" BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill existing accounts to the new default: opt-in, not yet shown
-- the notice. This is safe because v1 of the policy is patterns-only,
-- PII-redacted; existing accounts get the one-time modal on next login.
UPDATE "User"
   SET "trainingConsent"        = TRUE,
       "trainingConsentVersion" = 1
 WHERE "trainingConsentVersion" = 0;
