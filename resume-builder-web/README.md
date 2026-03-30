# resume-builder-web

Next.js (App Router) web client for the ATS Resume Builder SaaS.

## Local Development

```bash
npm install
cp .env.example .env.local     # fill in values
npm run dev
```

Runs at `http://localhost:3000`.

## Production Deployment (Vercel)

1. Create a new project on [Vercel](https://vercel.com).
2. Connect your GitHub repo (`seemaalmas/ats-resume-builder`).
3. Configure:
   - **Root Directory:** `resume-builder-web`
   - **Framework Preset:** Next.js (auto-detected)
   - Vercel will use `vercel.json` for install/build commands
4. Add environment variables:
   - `NEXT_PUBLIC_API_URL` — your Render API URL (e.g. `https://ats-resume-builder-api.onrender.com`)
5. Deploy.

> `vercel.json` handles building `resume-builder-shared` before Next.js
> via a custom `installCommand`.

### Security Headers

Security headers are configured in both `next.config.mjs` and `vercel.json`:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- Content-Security-Policy (restricts script/style/connect sources)
- Strict-Transport-Security (via Vercel)

### Cloudflare DNS

Point your domain to Vercel via CNAME. Enable:
- Proxied (orange cloud) for Cloudflare WAF
- SSL: Full (Strict)
- Always Use HTTPS: On

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend API URL (default: `http://localhost:3001`) |
| `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS` | Session idle timeout in ms |
| `NEXT_PUBLIC_ADMIN_EMAILS` | Admin emails for UI visibility |
| `NEXT_PUBLIC_ADMIN_USER_IDS` | Admin user IDs for UI visibility |
| `NEXT_PUBLIC_ADMIN_MOBILES` | Admin mobiles for UI visibility |

> **Note**: Admin visibility in the frontend is cosmetic only.
> All admin actions are enforced by backend guards (JWT + AdminAuthGuard).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm test` | Run tests |

## Routes

- `/auth/login` — Login page
- `/auth/register` — Registration
- `/auth/callback` — OAuth callback handler
- `/dashboard` — User dashboard
- `/resume` — Resume editor
- `/resume/ats` — ATS scoring
- `/billing` — Subscription management
- `/admin/settings` — Admin panel (backend-enforced)
- `/templates/preview` — Template browser
