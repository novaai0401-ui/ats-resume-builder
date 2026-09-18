# @tekivex/callbackcv-mcp

MCP server for [CallbackCV](https://ats-rb-web.onrender.com). Lets AI
agents (Claude Desktop, Claude Code, ChatGPT, any MCP host) read your
resumes, tailor them to job descriptions, log applications, and query
which resume version actually gets replies.

Every agent action goes through the same REST API as the web app with
**your** token — plan gates, AI-token quotas, and rate limits apply
identically to agents and humans. Tailored versions and logged
applications feed the same Outcome Graph, so "did the agent's
tailoring work?" is answerable in your Outcomes dashboard.

> ### ⚠️ Not published to npm yet
>
> `@tekivex/callbackcv-mcp` currently returns **404** from the npm
> registry, so every `npx -y @tekivex/callbackcv-mcp` command below will
> fail. Until the package is published, install from a local clone:
>
> ```bash
> git clone https://github.com/novaai0401-ui/ats-resume-builder
> cd ats-resume-builder/resume-builder-mcp
> npm install && npm run build
> ```
>
> …then use `"command": "node"` with
> `"args": ["/absolute/path/to/resume-builder-mcp/dist/index.js"]`
> wherever this README shows `npx`.
>
> The hosted connector (ChatGPT/Claude over OAuth) does not need the npm
> package at all — it is a separate path and is unaffected.
>
> Remove this notice once `npm publish` has run and a clean-machine
> install has been verified (R-111).

## 1. Get your token

1. Sign in to CallbackCV on the web.
2. Go to **Settings → API access**.
3. Click **Copy token**.

That token is a ~7-day access token — the same one the web app uses, not
a separate long-lived key. When it expires, your assistant will report an
auth error; come back to Settings and copy a fresh one. Treat it like a
password: anyone holding it can act as you until it expires.

Logging out invalidates it immediately, on every device and every
connected assistant. To disconnect assistants without logging out, use
**Disconnect assistants** in the same settings card (R-106).

**Connecting over OAuth instead?** The hosted connector never asks for
your password or your token: you generate a one-time connect code in
Settings → API access and paste that into the authorize page. No page
outside `callbackcv.tekivex.com` should ever ask for your CallbackCV
password.

## 2. Connect your assistant

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config) and add:

```json
{
  "mcpServers": {
    "callbackcv": {
      "command": "npx",
      "args": ["-y", "@tekivex/callbackcv-mcp"],
      "env": {
        "POCKET_RESUME_TOKEN": "<paste your token>",
        "POCKET_RESUME_API_URL": "https://ats-rb-api.onrender.com"
      }
    }
  }
}
```

Restart Claude Desktop. You'll see the `callbackcv` tools in the tools menu.

### Claude Code (CLI)

```bash
claude mcp add callbackcv \
  --env POCKET_RESUME_TOKEN=<paste your token> \
  --env POCKET_RESUME_API_URL=https://ats-rb-api.onrender.com \
  -- npx -y @tekivex/callbackcv-mcp
```

### ChatGPT / remote hosts (HTTP transport — multi-tenant)

Remote MCP hosts talk to an HTTP endpoint instead of spawning a local
command. HTTP mode is **multi-tenant**: one hosted URL serves many users,
and every request authenticates itself with the caller's own token via
`Authorization: Bearer <token>` (from Settings → API access). A request
with no token gets a 401. `POCKET_RESUME_TOKEN` in the environment is
optional here — it only acts as a fallback identity for header-less
requests (handy for a personal tunnel).

```bash
MCP_TRANSPORT=http MCP_PORT=8941 \
POCKET_RESUME_API_URL=https://ats-rb-api.onrender.com \
npx -y @tekivex/callbackcv-mcp
```

Expose the port over HTTPS (any host, or a tunnel like `cloudflared`)
and connect with an MCP client that can send an Authorization header
(Claude Code: `claude mcp add --transport http callbackcv <url> --header
"Authorization: Bearer <token>"`).

#### OAuth for ChatGPT / Claude connectors

ChatGPT's custom-connector UI (and Claude's remote connectors) authenticate
via OAuth — there is no "paste a bearer token" field. The server ships a
built-in, **stateless** OAuth 2.1 provider (authorization-code + PKCE,
dynamic client registration, RFC 8414/9728 discovery). Enable it with two
extra env vars on the hosted instance:

```bash
MCP_TRANSPORT=http MCP_PORT=8941 \
MCP_PUBLIC_URL=https://mcp.your-domain.com \
MCP_OAUTH_SECRET=<long random string — openssl rand -hex 32> \
POCKET_RESUME_API_URL=https://ats-rb-api.onrender.com \
npx -y @tekivex/callbackcv-mcp
```

Then add `https://mcp.your-domain.com` as a custom connector in ChatGPT
(Settings → Connectors → Advanced → Developer mode) or Claude. The
connector discovers the OAuth endpoints automatically; during connect, the
user lands on a CallbackCV page asking them to paste their token from
**Settings → API access** (verified live against the API — no passwords
ever touch this server). The connector receives an **encrypted wrapper**
around that token, never the raw JWT, and everything stays stateless — no
database, nothing to leak across users. When the underlying ~7-day token
expires, tools return a re-auth message and the user reconnects.

Notes: rotate `MCP_OAUTH_SECRET` to invalidate all issued connector tokens
at once. If the OAuth env vars are unset, the OAuth endpoints return 404
and plain `Authorization: Bearer` keeps working unchanged.

Config is env-only (no CLI flags) so tokens never appear in `ps` output.

## Tools

The authoritative list is `TOOL_CONTRACT` in `tests/server.test.mjs`,
which drives a real client over an in-memory transport — this table is
prose, that test is the contract.

| Tool | What it does |
|---|---|
| `open_in_callbackcv` | Link into the app, for a user working in CallbackCV. |
| `create_resume` | Create a new resume from structured fields. |
| `update_resume` | Edit an existing resume, contact details included. |
| `list_resumes` | Find your resumes (id + title). |
| `get_resume` | Full structured resume JSON. |
| `list_versions` | Saved snapshots, incl. tailored variants. |
| `get_resume_version` | Read ONE version, so a tailored variant can be reviewed before it is sent. |
| `propose_tailoring` | JD → proposed rewrites. **Saves nothing.** Flags every added number and every skill not already on the resume. |
| `apply_tailoring` | Save the changes the USER approved as a new version. Live resume untouched. Returns the `versionId`. |
| `get_download_link` | Where the PDF downloads. Pass `versionId` to download the tailored version rather than the original. |
| `log_application` | Write to the Jobs tracker. Pass `resumeVersionId` so reply rates attribute to the exact variant. |
| `get_outcome_stats` | Per-version callback / interview / offer rates. |

The intended agent loop:

```
get_outcome_stats  → pick the best-performing base
propose_tailoring  → proposed changes for THIS job
   ↳ show the user, especially anything in needsConfirmation
apply_tailoring    → save only what they approved  → versionId
get_download_link  → with that versionId, so they download what they reviewed
log_application    → with that same versionId
```

**v0.4.0 breaking change:** `tailor_resume` is gone, replaced by
`propose_tailoring` + `apply_tailoring`. The old tool applied every AI
suggestion with no human in between, which put invented metrics into a
document users send to employers under their own name. Update any script
that called it.

## Transports

- **stdio** (default) — what Claude Desktop / Claude Code spawn.
- **HTTP** — `MCP_TRANSPORT=http MCP_PORT=8941` runs a Streamable-HTTP
  endpoint (stateless; one server per user token). Used for ChatGPT and
  other remote hosts.

## Development

```bash
npm install
npm run build
POCKET_RESUME_TOKEN=... POCKET_RESUME_API_URL=http://localhost:4001 node dist/index.js
```

## Publishing (maintainer)

The package is publish-ready (`files: ["dist","README.md"]`, `bin`,
`publishConfig.access: public`). To release:

```bash
npm install
npm run build          # emits dist/
npm pack --dry-run     # inspect the tarball contents
npm publish            # requires npm auth for the @tekivex scope
```
