# CallbackCV connector — rollout runbook (R-099)

Two routes, in order. Route A needs no approval and starts working the day
the hosted instance is up; Route B is the ChatGPT app-directory submission
with OpenAI review.

## Prerequisite: the hosted instance

1. Deploy `ats-rb-mcp` (already defined in `render.yaml` — a Render web
   service running this package in HTTP mode with OAuth enabled;
   `MCP_OAUTH_SECRET` is auto-generated).
2. After the first deploy, set `MCP_PUBLIC_URL` to the service's public URL
   — e.g. `https://ats-rb-mcp.onrender.com`, or `https://mcp.tekivex.com`
   once the custom domain is attached (Render → service → Settings →
   Custom Domains; add a CNAME at your DNS).
3. Smoke-check:
   - `GET /health` → `{"ok":true,"oauth":true}`
   - `GET /.well-known/oauth-authorization-server` → JSON metadata whose
     `issuer` exactly matches `MCP_PUBLIC_URL`.

## Route A — unlisted connector (live immediately, no review)

Users (or you) add the URL directly:

- **ChatGPT**: Settings → Connectors → Advanced → Developer mode → Add
  custom connector → paste `https://mcp.tekivex.com`. ChatGPT discovers the
  OAuth flow; the user signs in with their CallbackCV email/password (or a
  Settings → API access token for social-login accounts).
- **Claude (web/desktop)**: Settings → Connectors → Add custom connector →
  same URL, same flow.
- **Claude Code**: `claude mcp add --transport http callbackcv
  https://mcp.tekivex.com` (OAuth), or with `--header "Authorization:
  Bearer <token>"` to skip OAuth.

Share the URL on the site once live (Settings → "CallbackCV everywhere" —
set `NEXT_PUBLIC_MCP_NPM_URL` and consider adding the connector URL there).

## Route B — ChatGPT app directory (OpenAI review)

Submit at the OpenAI developer console once Route A is stable. Review
covers: publisher identity + domain verification, production MCP
reachability, the OAuth flow (with working reviewer credentials), tool
metadata/annotations, privacy disclosures, starter prompts, and test cases.

Checklist — code side (DONE, keep true):
- [x] OAuth 2.1 + PKCE + dynamic client registration + discovery.
- [x] Real sign-in on the authorize page (email/password via /auth/login;
      token-paste fallback for social-login users).
- [x] Tool annotations on all 6 tools (read-only vs additive-write).
- [x] Privacy policy at https://callbackcv.tekivex.com/privacy covering the
      MCP data flow AND retention timelines.

Checklist — founder side (at submission time):
- [ ] Domain verification for tekivex.com in the OpenAI console.
- [ ] Reviewer test account: a dedicated CallbackCV account with 1–2 sample
      resumes and a few tracked applications; supply its credentials in the
      submission's reviewer-access field. Never reuse a real user account.
- [ ] Assets: app name ("CallbackCV"), 64×64 icon (<5 KB), short + long
      descriptions, screenshots, company URL, privacy-policy URL.
- [ ] Starter prompts, e.g.:
      - "Which of my resume versions gets the most callbacks?"
      - "Tailor my resume to this job description and track the application."
- [ ] Positive/negative test cases, e.g. positive: the tailor→log flow
      returns a versionId that appears in list_versions; negative: with no
      auth the server returns 401 and never exposes another user's data.
- [ ] Country availability + audience: general audience (13+), no
      child-directed content.

Honesty rules that must survive submission edits (C-003): describe only
shipped behaviour; the connector can do exactly what the signed-in user
can, nothing more; no invented metrics.
