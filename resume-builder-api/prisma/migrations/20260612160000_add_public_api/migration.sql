-- R-041 · Public parsing + scoring API for B2B (tenant API keys + usage).

CREATE TABLE "ApiKey" (
    "id"               TEXT NOT NULL,
    "label"            TEXT NOT NULL,
    "keyHash"          TEXT NOT NULL,
    "prefix"           TEXT NOT NULL,
    "tenantSlug"       TEXT NOT NULL,
    "monthlyCallLimit" INTEGER NOT NULL DEFAULT 10000,
    "perMinuteLimit"   INTEGER NOT NULL DEFAULT 60,
    "enabled"          BOOLEAN NOT NULL DEFAULT true,
    "expiresAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"       TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_tenantSlug_idx" ON "ApiKey"("tenantSlug");

CREATE TABLE "ApiUsage" (
    "id"         TEXT NOT NULL,
    "apiKeyId"   TEXT NOT NULL,
    "endpoint"   TEXT NOT NULL,
    "status"     INTEGER NOT NULL,
    "ipHash"     TEXT,
    "userAgent"  TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApiUsage_apiKeyId_createdAt_idx" ON "ApiUsage"("apiKeyId", "createdAt");
CREATE INDEX "ApiUsage_apiKeyId_status_idx" ON "ApiUsage"("apiKeyId", "status");
