# End-to-end tests (Playwright)

Browser tests for the real user journeys — the things unit tests can't cover:
home loads, auth validation, template selection on mobile, the ₹49 download
flow, and Recruiter-AI loading the active resume.

## Layout
- `smoke.spec.ts` — public: home loads, pricing shows the no-subscription model.
- `auth.spec.ts` — public: register email/password validation, no plan upsell.
- `resume-flow.spec.ts` — authenticated journeys (skipped without creds).
- `helpers.ts` — API login that injects tokens into `localStorage` the way the
  app stores them, so specs boot already signed in.

## Run it

```bash
cd resume-builder-web
npm i                      # installs @playwright/test
npx playwright install     # one-time: browser binaries

# Against a deployed/preview URL (public specs only):
PLAYWRIGHT_BASE_URL=https://ats-rb-web.onrender.com PLAYWRIGHT_NO_SERVER=1 npm run test:e2e

# Full suite incl. authenticated journeys:
PLAYWRIGHT_BASE_URL=https://ats-rb-web.onrender.com \
PLAYWRIGHT_API_URL=https://<api-host> \
E2E_EMAIL=you@example.com E2E_PASSWORD=•••• \
PLAYWRIGHT_NO_SERVER=1 npm run test:e2e

# Against a local build:
npm run build && npm run test:e2e     # auto-boots `npm run start`
```

## Env
| Var | Purpose | Default |
|---|---|---|
| `PLAYWRIGHT_BASE_URL` | web origin under test | `http://localhost:3000` |
| `PLAYWRIGHT_API_URL` | API origin (for login helper) | `NEXT_PUBLIC_API_URL` / `:4000` |
| `PLAYWRIGHT_NO_SERVER` | `1` = don't auto-boot a local server | unset |
| `E2E_EMAIL` / `E2E_PASSWORD` | creds; auth specs **skip** without them | unset |

CI: `.github/workflows/e2e.yml` runs on PRs (public specs always; authenticated
when the `E2E_EMAIL`/`E2E_PASSWORD` repo secrets are set).
