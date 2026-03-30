# See root-level Dockerfile for production builds.
# This copy is for reference / local dev:  docker build -t ats-api -f Dockerfile ..

FROM node:20-alpine AS builder
WORKDIR /build

COPY packages/ ./packages/
COPY resume-builder-shared/ ./resume-builder-shared/

RUN cd resume-builder-shared && npm ci && npm run build
RUN cd packages/resume-schemas && npm ci && npm run build
RUN cd packages/resume-intelligence && npm ci && npm run build

WORKDIR /build/resume-builder-api
COPY resume-builder-api/package*.json ./
RUN npm ci --ignore-scripts

COPY resume-builder-api/prisma ./prisma
RUN npx prisma generate

COPY resume-builder-api/tsconfig.json ./
COPY resume-builder-api/src ./src
RUN npx nest build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /build/resume-builder-api/node_modules ./node_modules
COPY --from=builder /build/resume-builder-api/dist ./dist
COPY --from=builder /build/resume-builder-api/prisma ./prisma
COPY --from=builder /build/resume-builder-shared ../resume-builder-shared
COPY --from=builder /build/packages ../packages

RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup
USER appuser

EXPOSE 3001
CMD ["node", "dist/main.js"]
