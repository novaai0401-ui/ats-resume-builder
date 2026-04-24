-- JobApplication: pipeline-style tracker for every role a user is pursuing.
CREATE TABLE "JobApplication" (
  "id"            TEXT PRIMARY KEY,
  "userId"        TEXT NOT NULL,
  "company"       TEXT NOT NULL,
  "role"          TEXT NOT NULL,
  "jdUrl"         TEXT,
  "jdText"        TEXT,
  "location"      TEXT,
  "salaryRange"   TEXT,
  "status"        TEXT NOT NULL DEFAULT 'wishlist',
  "source"        TEXT,
  "referral"      TEXT,
  "resumeId"      TEXT,
  "coverLetterId" TEXT,
  "notes"         TEXT,
  "nextActionAt"  TIMESTAMP(3),
  "appliedAt"     TIMESTAMP(3),
  "closedAt"      TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);

CREATE INDEX "JobApplication_userId_status_idx"       ON "JobApplication" ("userId", "status");
CREATE INDEX "JobApplication_userId_nextActionAt_idx" ON "JobApplication" ("userId", "nextActionAt");

-- CoverLetter: AI-generated tailored cover letters.
CREATE TABLE "CoverLetter" (
  "id"         TEXT PRIMARY KEY,
  "userId"     TEXT NOT NULL,
  "resumeId"   TEXT,
  "company"    TEXT NOT NULL,
  "role"       TEXT NOT NULL,
  "jdText"     TEXT,
  "tone"       TEXT NOT NULL DEFAULT 'professional',
  "body"       TEXT NOT NULL,
  "wordCount"  INTEGER NOT NULL DEFAULT 0,
  "provider"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL
);

CREATE INDEX "CoverLetter_userId_createdAt_idx" ON "CoverLetter" ("userId", "createdAt");
