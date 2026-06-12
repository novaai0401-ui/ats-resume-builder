-- R-032 · Mail-in outcome capture.

CREATE TABLE "InboundOutcomeMail" (
    "id"                   TEXT NOT NULL,
    "userId"               TEXT,
    "fromEmail"            TEXT NOT NULL,
    "subject"              TEXT NOT NULL,
    "detectedOutcome"      TEXT,
    "resolution"           TEXT NOT NULL,
    "matchedApplicationId" TEXT,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundOutcomeMail_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboundOutcomeMail_userId_createdAt_idx" ON "InboundOutcomeMail"("userId", "createdAt");
CREATE INDEX "InboundOutcomeMail_expiresAt_idx" ON "InboundOutcomeMail"("expiresAt");
