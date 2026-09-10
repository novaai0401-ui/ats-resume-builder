-- R-106 — make assistant connections single-use and revocable.
--
-- Additive only: one column with a default and two new tables. No existing
-- row is rewritten and no column is dropped, so this is safe to apply to a
-- live database ahead of the code that reads it.

-- Revocation counter stamped into every access token as `tv`. Existing
-- tokens carry no `tv` and are treated as version 0, so applying this
-- migration alone does not sign anyone out.
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Short-lived, single-use codes minted in the signed-in web app and pasted
-- into an assistant's authorize page, so the MCP layer never sees a password.
CREATE TABLE "ConnectCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConnectCode_codeHash_key" ON "ConnectCode"("codeHash");
CREATE INDEX "ConnectCode_userId_idx" ON "ConnectCode"("userId");
CREATE INDEX "ConnectCode_expiresAt_idx" ON "ConnectCode"("expiresAt");

ALTER TABLE "ConnectCode" ADD CONSTRAINT "ConnectCode_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Spent OAuth authorization codes. The unique primary key on jti is what
-- makes replay impossible: a concurrent second exchange loses the insert.
CREATE TABLE "ConsumedOAuthCode" (
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedOAuthCode_pkey" PRIMARY KEY ("jti")
);

CREATE INDEX "ConsumedOAuthCode_expiresAt_idx" ON "ConsumedOAuthCode"("expiresAt");
