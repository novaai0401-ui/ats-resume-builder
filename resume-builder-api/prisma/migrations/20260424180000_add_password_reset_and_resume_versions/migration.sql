-- Password-reset OTP challenges (separate from EmailOtpChallenge so login + reset can never collide).
CREATE TABLE "PasswordResetChallenge" (
  "id"          TEXT PRIMARY KEY,
  "email"       TEXT NOT NULL,
  "otpHash"     TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "attempts"    INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "ip"          TEXT,
  "userAgent"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "PasswordResetChallenge_email_idx" ON "PasswordResetChallenge" ("email");

-- ResumeVersion: point-in-time snapshots for restore + A/B testing.
CREATE TABLE "ResumeVersion" (
  "id"               TEXT PRIMARY KEY,
  "resumeId"         TEXT NOT NULL,
  "userId"           TEXT NOT NULL,
  "label"            TEXT,
  "snapshot"         JSONB NOT NULL,
  "atsScoreSnapshot" INTEGER,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "ResumeVersion_resumeId_createdAt_idx" ON "ResumeVersion" ("resumeId", "createdAt");
CREATE INDEX "ResumeVersion_userId_createdAt_idx"   ON "ResumeVersion" ("userId", "createdAt");
