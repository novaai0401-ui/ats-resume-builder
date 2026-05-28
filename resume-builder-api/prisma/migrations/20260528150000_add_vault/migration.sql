-- Phase 7 step 3 — encrypted payload columns + UserVault.

ALTER TABLE "Resume" ADD COLUMN "ciphertext"  TEXT;
ALTER TABLE "Resume" ADD COLUMN "iv"          TEXT;
ALTER TABLE "Resume" ADD COLUMN "titleCipher" TEXT;
ALTER TABLE "Resume" ADD COLUMN "titleIv"     TEXT;

CREATE TABLE "UserVault" (
    "id"             TEXT PRIMARY KEY,
    "userId"         TEXT NOT NULL UNIQUE,
    "schemaVersion"  INT  NOT NULL DEFAULT 1,
    "kdfParams"      JSONB NOT NULL,
    "passphraseSalt" TEXT NOT NULL,
    "recoverySalt"   TEXT NOT NULL,
    "passphraseWrap" JSONB NOT NULL,
    "recoveryWrap"   JSONB NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
