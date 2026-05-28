-- Sahaayak — per-user emotional companion with persistent memory.

CREATE TABLE "SahaayakProfile" (
    "id"                TEXT PRIMARY KEY,
    "userId"            TEXT NOT NULL UNIQUE,
    "optedIn"           BOOLEAN NOT NULL DEFAULT FALSE,
    "mode"              TEXT NOT NULL DEFAULT 'witness',
    "guardrails"        TEXT,
    "summary"           TEXT,
    "lastInteractionAt" TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "SahaayakEvent" (
    "id"         TEXT PRIMARY KEY,
    "userId"     TEXT NOT NULL,
    "kind"       TEXT NOT NULL,
    "payload"    JSONB NOT NULL,
    "note"       TEXT,
    "moodRating" INT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SahaayakEvent_userId_kind_occurredAt_idx"
    ON "SahaayakEvent" ("userId", "kind", "occurredAt");
CREATE INDEX "SahaayakEvent_userId_occurredAt_idx"
    ON "SahaayakEvent" ("userId", "occurredAt");

CREATE TABLE "SahaayakMessage" (
    "id"         TEXT PRIMARY KEY,
    "userId"     TEXT NOT NULL,
    "role"       TEXT NOT NULL,
    "content"    TEXT NOT NULL,
    "crisisFlag" BOOLEAN NOT NULL DEFAULT FALSE,
    "tokens"     INT NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SahaayakMessage_userId_createdAt_idx"
    ON "SahaayakMessage" ("userId", "createdAt");
