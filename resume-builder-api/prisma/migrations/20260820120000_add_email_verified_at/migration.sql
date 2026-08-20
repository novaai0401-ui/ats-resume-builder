-- Email-verification gate for NEW signups (a fake example.com address made it
-- into production, proving nothing was verified). Existing users are
-- backfilled as verified: they registered before verification existed, and
-- retroactively locking them out would punish real users for our gap.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "emailVerifiedAt" IS NULL;
