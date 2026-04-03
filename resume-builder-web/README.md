# resume-builder-web

Next.js (App Router) web client for the Resume Builder SaaS.

---

## Prerequisites

| Tool    | Version    | Notes                        |
| ------- | ---------- | ---------------------------- |
| Node.js | 18 – 22.x | Required by `engines` field  |
| npm     | ≥ 9        | Ships with Node 18+          |
| Docker  | ≥ 24       | Only for Docker deployments  |

---

## Monorepo Dependency

The web app depends on `resume-builder-shared` (shared types/schemas). It must be built before the web app:

```
resume-builder-shared → resume-builder-web
```

---

## 1. Development Environment (Local)

### 1.1 Install dependencies

```bash
# From monorepo root
cd resume-builder-shared && npm install && npm run build && cd ..
cd resume-builder-web && npm install
```

### 1.2 Configure environment

```bash
cd resume-builder-web
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4001
NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS=1800000
NEXT_PUBLIC_ADMIN_EMAILS=your-email@example.com
NEXT_PUBLIC_ADMIN_USER_IDS=
NEXT_PUBLIC_ADMIN_MOBILES=
```

> **Note:** `NEXT_PUBLIC_` variables are embedded into the JavaScript bundle at build time. In dev mode (`next dev`), they are read from `.env.local` on each request.

### 1.3 Start the dev server

```bash
npm run dev
```

Web app runs at `http://localhost:4000`.

### 1.4 Verify

Open `http://localhost:4000` in your browser. Ensure the API is running at `http://localhost:4001`.

---

## 2. Staging Environment

### 2.1 Infrastructure

| Service  | Recommended                      |
| -------- | -------------------------------- |
| Hosting  | Render (Starter plan, $7/mo)     |
| API      | `ats-rb-api` on Render           |

### 2.2 Environment variables

Set in the Render dashboard:

```env
NODE_ENV=production
PORT=4000

# ── API URL (CRITICAL — baked into JS bundle at build time) ──
NEXT_PUBLIC_API_URL=https://ats-rb-api-staging.onrender.com

# ── Admin config ──
NEXT_PUBLIC_ADMIN_EMAILS=admin@example.com
NEXT_PUBLIC_ADMIN_USER_IDS=
NEXT_PUBLIC_ADMIN_MOBILES=

# ── Session ──
NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS=1800000
```

> **Important:** After changing `NEXT_PUBLIC_API_URL`, you must trigger a **manual redeploy** on Render for the new value to take effect (it's baked into the build).

### 2.3 Deploy

Deploy using the Render Blueprint (`render.yaml`) — see [Production > Docker / Render](#34-docker--render-deployment).

---

## 3. Production Environment

### 3.1 Standalone build (bare-metal / VM)

```bash
# From monorepo root
cd resume-builder-shared && npm ci && npm run build && cd ..
cd resume-builder-web && npm ci

# Set build-time env vars
export NEXT_PUBLIC_API_URL=https://api.your-domain.com

# Build
npm run build

# Start (standalone mode)
cd .next/standalone/resume-builder-web
NODE_ENV=production PORT=4000 node server.js
```

> The `output: 'standalone'` config in `next.config.mjs` produces a self-contained `server.js` with only the required `node_modules`.

### 3.2 Environment variables (production)

```env
NODE_ENV=production
PORT=4000

NEXT_PUBLIC_API_URL=https://api.your-domain.com
NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS=1800000
NEXT_PUBLIC_ADMIN_EMAILS=admin@your-domain.com
NEXT_PUBLIC_ADMIN_USER_IDS=<user-cuid>
NEXT_PUBLIC_ADMIN_MOBILES=+91xxxxxxxxxx
```

### 3.3 Process manager (PM2)

```bash
npm install -g pm2

cd .next/standalone/resume-builder-web
pm2 start server.js --name ats-web -i max
pm2 startup
pm2 save
```

### 3.4 Docker / Render deployment

Build and run the Web Docker image locally:

```bash
# From monorepo root
docker build -t ats-web -f Dockerfile.web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain.com .

docker run -p 4000:4000 ats-web
```

**Deploy to Render via Blueprint:**

1. Push `render.yaml` to your repo (already included at repo root)
2. Go to Render → **New** → **Blueprint** → connect your GitHub repo
3. Render auto-detects `render.yaml` and creates the `ats-rb-web` service
4. Set `NEXT_PUBLIC_API_URL` in the Render dashboard to your API URL
   - Example: `https://ats-rb-api.onrender.com`
5. Deploy — Render builds the Docker image and starts the service

> **First deploy order:** Deploy the API first to get its URL, then set `NEXT_PUBLIC_API_URL` and deploy the web service.

---

## Available Scripts

| Script          | Description                                     |
| --------------- | ----------------------------------------------- |
| `npm run dev`   | Start dev server with hot-reload (port 4000)    |
| `npm run build` | Production build (standalone output)            |
| `npm run start` | Start production server (requires build first)  |
| `npm test`      | Run test suite with Node test runner + tsx       |

---

## Environment Variables Reference

| Variable                              | Required | Build-time | Description                          |
| ------------------------------------- | -------- | ---------- | ------------------------------------ |
| `NEXT_PUBLIC_API_URL`                 | Yes      | Yes        | Backend API URL                      |
| `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MS` | No       | Yes        | Session idle timeout (default: 30m)  |
| `NEXT_PUBLIC_ADMIN_EMAILS`            | No       | Yes        | Comma-separated admin emails         |
| `NEXT_PUBLIC_ADMIN_USER_IDS`          | No       | Yes        | Comma-separated admin user IDs       |
| `NEXT_PUBLIC_ADMIN_MOBILES`           | No       | Yes        | Comma-separated admin phone numbers  |
| `PORT`                                | No       | No         | Server port (default: 4000)          |
| `NODE_ENV`                            | No       | No         | `development` or `production`        |

> **Build-time = Yes** means the variable is embedded into the JS bundle during `next build`. Changing it requires a rebuild/redeploy.

---

## Routes

| Path               | Description                          | Auth     |
| ------------------ | ------------------------------------ | -------- |
| `/auth/login`      | Login page                           | Public   |
| `/auth/register`   | Registration page                    | Public   |
| `/auth/callback`   | Social login OAuth callback          | Public   |
| `/dashboard`       | Resume list & template gallery       | JWT      |
| `/resume`          | Resume editor                        | JWT      |
| `/billing`         | Subscription & pricing               | JWT      |
| `/admin/settings`  | Admin settings panel                 | Admin    |

---

## Troubleshooting

| Issue                                    | Fix                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `Unable to acquire lock at .next/dev/lock` | Stop all `next dev` processes, delete `.next/dev/lock`, restart                    |
| API requests failing (CORS)              | Ensure `CORS_ORIGIN` on the API matches the web app URL exactly                      |
| Stale `NEXT_PUBLIC_API_URL`              | Rebuild the app — this is a build-time variable                                      |
| Shared package type errors               | Rebuild `resume-builder-shared`: `cd ../resume-builder-shared && npm run build`      |
| Build OOM on small VMs                   | Set `NODE_OPTIONS=--max-old-space-size=512` before build                             |

### Windows dev lock recovery

```bat
for /f "tokens=2" %a in ('tasklist ^| findstr node.exe') do taskkill /F /PID %a
if exist .next\dev\lock del /f /q .next\dev\lock
npm run dev
```
