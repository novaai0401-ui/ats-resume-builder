-- R-112 — make training participation a recorded, affirmative choice.
--
-- The column defaulted to true while /privacy promised training happens
-- only after explicit opt-in, so everyone who never opened the setting was
-- enrolled. Two changes, both reversible, neither destructive.

-- 1. New accounts start opted OUT.
ALTER TABLE "User" ALTER COLUMN "trainingConsent" SET DEFAULT false;

-- 2. Existing accounts that never made an affirmative choice are opted out.
--    An account with trainingConsentAt set DID make the choice explicitly
--    (the settings toggle stamps it) and is left exactly as it is.
UPDATE "User"
SET "trainingConsent" = false
WHERE "trainingConsent" = true
  AND "trainingConsentAt" IS NULL;

-- 3. Hold every sample captured without a recorded opt-in. Flagged, not
--    deleted: the owner decides whether to purge or re-consent, and this
--    flag clears if they re-consent. Exports and training runs must filter
--    on it.
ALTER TABLE "TrainingSample" ADD COLUMN "consentHold" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TrainingSample" s
SET "consentHold" = true
WHERE s."userId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" u
    WHERE u."id" = s."userId" AND u."trainingConsentAt" IS NOT NULL
  );

CREATE INDEX "TrainingSample_consentHold_idx" ON "TrainingSample"("consentHold");
