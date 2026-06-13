-- R-038 · Public portfolio / share link.

CREATE TABLE "ShareLink" (
    "id"                  TEXT NOT NULL,
    "slug"                TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "resumeId"            TEXT NOT NULL,
    "resumeVersionId"     TEXT,
    "enabled"             BOOLEAN NOT NULL DEFAULT true,
    "expiresAt"           TIMESTAMP(3),
    "allowSearchIndexing" BOOLEAN NOT NULL DEFAULT false,
    "maskContact"         BOOLEAN NOT NULL DEFAULT false,
    "headline"            TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    "viewCount"           INTEGER NOT NULL DEFAULT 0,
    "downloadCount"       INTEGER NOT NULL DEFAULT 0,
    "lastVisitedAt"       TIMESTAMP(3),

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShareLink_slug_key" ON "ShareLink"("slug");
CREATE INDEX "ShareLink_userId_idx" ON "ShareLink"("userId");
CREATE INDEX "ShareLink_resumeId_idx" ON "ShareLink"("resumeId");

CREATE TABLE "ShareLinkEvent" (
    "id"          TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "ipHash"      TEXT NOT NULL,
    "userAgent"   TEXT,
    "country"     TEXT,
    "city"        TEXT,
    "referrer"    TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLinkEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShareLinkEvent_shareLinkId_createdAt_idx" ON "ShareLinkEvent"("shareLinkId", "createdAt");
CREATE INDEX "ShareLinkEvent_shareLinkId_kind_idx" ON "ShareLinkEvent"("shareLinkId", "kind");
