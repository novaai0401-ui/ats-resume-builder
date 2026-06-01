-- Phase 8 step 1 — training dataset infrastructure.

ALTER TABLE "User" ADD COLUMN "trainingConsent"        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "User" ADD COLUMN "trainingConsentAt"      TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "trainingConsentVersion" INT     NOT NULL DEFAULT 0;

CREATE TABLE "TrainingSample" (
    "id"                TEXT PRIMARY KEY,
    "userId"            TEXT,
    "sourceFingerprint" TEXT,
    "sourceFileType"    TEXT NOT NULL,
    "sourceFileBytes"   INT  NOT NULL,
    "redactedText"      TEXT NOT NULL,
    "layoutHints"       JSONB,
    "structuredLabel"   JSONB,
    "labelSource"       TEXT,
    "status"            TEXT NOT NULL DEFAULT 'pending',
    "splitGroup"        TEXT NOT NULL DEFAULT 'train',
    "consentVersion"    INT  NOT NULL DEFAULT 1,
    "notes"             TEXT,
    "labeledAt"         TIMESTAMP(3),
    "labeledBy"         TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TrainingSample_status_splitGroup_idx"
    ON "TrainingSample" ("status", "splitGroup");
CREATE INDEX "TrainingSample_userId_createdAt_idx"
    ON "TrainingSample" ("userId", "createdAt");
CREATE INDEX "TrainingSample_sourceFileType_idx"
    ON "TrainingSample" ("sourceFileType");

CREATE TABLE "ModelEvaluation" (
    "id"           TEXT PRIMARY KEY,
    "modelName"    TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "sampleCount"  INT  NOT NULL,
    "metrics"      JSONB NOT NULL,
    "trainingNote" TEXT,
    "evaluatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ModelEvaluation_modelName_evaluatedAt_idx"
    ON "ModelEvaluation" ("modelName", "evaluatedAt");
