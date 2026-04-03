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

# Prisma query engine needs OpenSSL 3 on Alpine (linux-musl-openssl-3.0.x)
RUN apk add --no-cache openssl

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
