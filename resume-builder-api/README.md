# resume-builder-api

NestJS API for the ATS Resume Builder SaaS.

## Local Development

```bash
npm install
cp .env.example .env          # fill in real values
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

API runs at `http://localhost:3001` by default.

## Production Deployment

### Prerequisites
| Service | Purpose |
|---------|---------|
| **Render** | API hosting (Docker) |
| **Supabase** | Postgres database |
| **Upstash** | Redis (OAuth state, sessions) |
| **Cloudflare** | DNS + SSL termination |

### Render Setup

1. Create a **Web Service** on [Render](https://render.com).
2. Connect your GitHub repo (`seemaalmas/ats-resume-builder`).
3. Configure build settings:
   - **Root Directory:** leave empty (repo root)
   - **Runtime:** Docker
   - **Dockerfile Path:** `./Dockerfile`
   - **Docker Context:** `.` (repo root)
4. Add env vars in the Render dashboard (see `.env.example`):
   - `NODE_ENV=production`
   - `PORT=3001`
   - `DATABASE_URL` — Supabase pooler connection string
   - `JWT_SECRET` — strong random secret (>= 32 chars)
   - `JWT_REFRESH_SECRET` — strong random secret (>= 32 chars)
   - `TOKEN_ENC_KEY` — 32-byte hex key (64 hex chars)
   - `CORS_ORIGIN` — your Vercel frontend URL (e.g. `https://app.yourdomain.com`)
   - `REDIS_URL` + `REDIS_TOKEN` — Upstash credentials
   - `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — if billing is enabled
   - `SOCIAL_LOGIN_SUCCESS_URL` — e.g. `https://app.yourdomain.com/auth/callback`
5. Set **Health Check Path** to `/health`.
6. Deploy.

> **Alternative:** Render auto-detects `render.yaml` in the repo root.
> You can also deploy via `render blueprint apply`.

```bash
# Manual build & run (without Docker)
npm ci --ignore-scripts
npx prisma generate
npx prisma migrate deploy
npm run build
NODE_ENV=production node dist/main.js
```

### Environment Validation

In production (`NODE_ENV=production`), the app **will not start** if critical
secrets are missing or set to placeholder values:

- `DATABASE_URL` — Supabase connection string
- `JWT_SECRET` — >= 32 chars, random
- `JWT_REFRESH_SECRET` — >= 32 chars, random
- `TOKEN_ENC_KEY` — 32-byte hex key
- `CORS_ORIGIN` — your frontend origin(s)
- `REDIS_URL` + `REDIS_TOKEN` — Upstash credentials
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — if billing is enabled

Generate strong secrets:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Security Features

| Feature | Implementation |
|---------|---------------|
| **Rate Limiting** | Global 60 req/min + stricter per-route (auth: 5-10/min, AI: 10/min, upload: 10/min) |
| **Security Headers** | X-Content-Type-Options, X-Frame-Options, HSTS, CSP, Referrer-Policy, Permissions-Policy |
| **OAuth State** | CSRF-protected with Redis-backed state tokens |
| **Token Handoff** | One-time handoff tokens instead of tokens in URL params |
| **Trusted Proxy** | Enabled in production for Render/Cloudflare |
| **Env Validation** | Hard-fail on weak secrets in production |
| **Admin Guard** | JWT + DB isAdmin flag + env allow-lists |

### Reverse Proxy / Cloudflare

The API runs behind a reverse proxy in production. `trust proxy` is enabled
so `X-Forwarded-For` headers are respected for rate limiting.

Recommended Cloudflare settings:
- SSL: Full (Strict)
- Always Use HTTPS: On
- WAF: Enable managed rules
- Rate Limiting: Add Cloudflare-level rules as an extra layer

## Environment Variables

See `.env.example` for the complete list with documentation.

## Endpoints

- `GET /health` — liveness check
- `GET /health/db` — readiness check (DB ping)
- `POST /auth/register` — rate limited: 5/min
- `POST /auth/login` — rate limited: 10/min
- `POST /auth/refresh` — rate limited: 10/min
- `POST /auth/logout` (JWT)
- `GET /auth/social/:provider/start` — rate limited: 15/min
- `GET /auth/social/:provider/callback`
- `POST /auth/social/exchange-handoff`
- `POST /ai/parse-jd` (JWT) — rate limited: 10/min
- `POST /ai/critique` (JWT) — rate limited: 10/min
- `POST /ai/skill-gap` (JWT) — rate limited: 10/min
- `POST /billing/checkout` (JWT) — rate limited: 10/min
- `POST /billing/portal` (JWT) — rate limited: 10/min
- `POST /billing/webhook` (Stripe, no throttle)
- `GET /resumes` (JWT)
- `POST /resumes` (JWT)
- `GET /resumes/:id` (JWT)
- `PATCH /resumes/:id` (JWT)
- `DELETE /resumes/:id` (JWT)
- `POST /resumes/:id/ats-score` (JWT) — rate limited: 15/min
- `GET /resumes/:id/pdf` (JWT) — rate limited: 10/min
- `POST /resumes/parse-upload` (JWT) — rate limited: 10/min, max 6 MB
- `GET /admin/settings` (JWT + Admin)
- `PUT /admin/settings/rate-limit` (JWT + Admin)
- `PATCH /admin/settings` (JWT + Admin)
- `GET /admin/analytics/summary` (JWT + Admin)
- `GET /admin/analytics/users` (JWT + Admin)

## Commands

| Command | Description |
|---------|-------------|
| `npm run start:dev` | Development with hot-reload |
| `npm run build` | Production build |
| `npm test` | Run tests |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Run DB migrations |
