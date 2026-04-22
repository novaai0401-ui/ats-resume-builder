-- Add auth provider tracking, brute-force lockout, and BYOK flag to User.
ALTER TABLE "User"
  ADD COLUMN "primaryAuthProvider" TEXT NOT NULL DEFAULT 'password',
  ADD COLUMN "hasUserSetPassword"  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "byokKeyEnabled"      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "failedLoginCount"    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lockedUntil"         TIMESTAMP(3),
  ADD COLUMN "lastActiveAt"        TIMESTAMP(3);
