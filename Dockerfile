# ═══════════════════════════════════════════════════════════════════════
# ATS Resume Builder API — Production Dockerfile
# ═══════════════════════════════════════════════════════════════════════
# Build context: monorepo root (.)
#
# Render:  Dockerfile Path = ./Dockerfile, Docker Context = .
# Local:   docker build -t ats-api -f Dockerfile .
# ═══════════════════════════════════════════════════════════════════════

# ── Stage 1: Build shared packages & NestJS app ─────────────────────
FROM node:20-alpine AS builder
WORKDIR /build

# 1. Install & build resume-builder-shared
COPY resume-builder-shared/ ./resume-builder-shared/
RUN cd resume-builder-shared && npm ci && npm run build

# 2. Install & build packages/resume-schemas
COPY packages/resume-schemas/ ./packages/resume-schemas/
RUN cd packages/resume-schemas && npm ci && npm run build

# 3. Install & build packages/resume-intelligence
COPY packages/resume-intelligence/ ./packages/resume-intelligence/
RUN cd packages/resume-intelligence && npm ci && npm run build

# 3b. Install & build packages/doc-extract (generic schema-driven extractor)
COPY packages/doc-extract/ ./packages/doc-extract/
RUN cd packages/doc-extract && npm ci && npm run build

# 4. Install API dependencies (skip puppeteer browser download)
WORKDIR /build/resume-builder-api
COPY resume-builder-api/package.json resume-builder-api/package-lock.json ./
RUN npm ci --ignore-scripts

# 5. Generate Prisma client (must run before TypeScript compilation)
COPY resume-builder-api/prisma ./prisma
RUN npx prisma generate

# 6. Copy source and compile TypeScript
COPY resume-builder-api/tsconfig.json ./
COPY resume-builder-api/nest-cli.json* ./
COPY resume-builder-api/src ./src
RUN npx nest build

# ── Stage 2: Minimal production runtime ─────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4001

# Prisma query engine needs OpenSSL 3 on Alpine (linux-musl-openssl-3.0.x).
#
# Chromium + supporting libs are required by the PDF export route
# (resume.service.ts → puppeteer-core). Without them the API can't launch a
# browser and every /resumes/:id/pdf request 503s. We install Alpine's
# `chromium` package and the fonts/render libs it needs, and pin
# CHROME_EXECUTABLE_PATH so puppeteer-core uses the system binary instead of
# trying to download its own (which we explicitly skip via npm --ignore-scripts
# during the build stage).
RUN apk add --no-cache \
      openssl \
      chromium \
      nss \
      freetype \
      freetype-dev \
      harfbuzz \
      ca-certificates \
      ttf-freefont \
      font-noto-emoji
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy compiled API and dependencies
COPY --from=builder /build/resume-builder-api/node_modules ./node_modules
COPY --from=builder /build/resume-builder-api/dist ./dist
COPY --from=builder /build/resume-builder-api/prisma ./prisma

# Copy shared packages — node_modules symlinks resolve to these relative paths
COPY --from=builder /build/resume-builder-shared ../resume-builder-shared
COPY --from=builder /build/packages ../packages

# Run as non-root for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup && \
    chown -R appuser:appgroup /app
USER appuser

EXPOSE 4001
CMD ["node", "dist/main.js"]
