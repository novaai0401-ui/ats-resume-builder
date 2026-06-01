-- PatternLearnerAgent v1 — capture parse failures and learned patterns.

CREATE TABLE "ParseFailureSample" (
    "id"             TEXT PRIMARY KEY,
    "userId"         TEXT,
    "fileName"       TEXT,
    "redactedText"   TEXT NOT NULL,
    "verification"   JSONB NOT NULL,
    "extractedShape" JSONB NOT NULL,
    "trigger"        TEXT NOT NULL DEFAULT 'low-confidence',
    "status"         TEXT NOT NULL DEFAULT 'open',
    "proposalId"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ParseFailureSample_status_createdAt_idx"
    ON "ParseFailureSample" ("status", "createdAt");

CREATE TABLE "LearnedPattern" (
    "id"             TEXT PRIMARY KEY,
    "kind"           TEXT NOT NULL,
    "pattern"        TEXT NOT NULL,
    "flags"          TEXT NOT NULL DEFAULT 'i',
    "patternType"    TEXT NOT NULL DEFAULT 'regex',
    "rationale"      TEXT,
    "examples"       JSONB,
    "metrics"        JSONB,
    "status"         TEXT NOT NULL DEFAULT 'proposed',
    "sourceSampleId" TEXT,
    "reviewedBy"     TEXT,
    "reviewedAt"     TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LearnedPattern_kind_status_idx"
    ON "LearnedPattern" ("kind", "status");
CREATE INDEX "LearnedPattern_status_createdAt_idx"
    ON "LearnedPattern" ("status", "createdAt");
