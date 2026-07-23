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

## 1. Get your token

1. Sign in to CallbackCV on the web.
2. Go to **Settings → API access**.
3. Click **Copy token**.

That token is a ~7-day access token — the same one the web app uses, not
a separate long-lived key. When it expires, your assistant will report an
auth error; come back to Settings and copy a fresh one. Treat it like a
password: anyone holding it can act as you until it expires, and logging
out invalidates it.

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

Honest caveat for ChatGPT specifically: ChatGPT's custom-connector UI
authenticates connectors via OAuth (or no auth) and does not let a user
type a bearer token, so a smooth public ChatGPT experience additionally
needs an OAuth layer in front of this endpoint — not built yet. Until
then, ChatGPT works through an authenticated proxy the user runs (e.g.
`mcp-remote` with a header), or by self-hosting with the env-token
fallback.

Config is env-only (no CLI flags) so tokens never appear in `ps` output.

## Tools

| Tool | What it does |
|---|---|
| `list_resumes` | Find your resumes (id + title). |
| `get_resume` | Full structured resume JSON. |
| `list_versions` | Saved snapshots, incl. tailored variants. |
| `tailor_resume` | JD → AI rewrite saved as a NEW version labelled `Tailored: <role> @ <company>`. Live resume untouched. Returns the `versionId`. |
| `log_application` | Write to the Jobs tracker. Pass `resumeVersionId` from `tailor_resume` so reply rates attribute to the exact variant. |
| `get_outcome_stats` | Per-version response/interview/offer rates. |

The intended agent loop:

```
get_outcome_stats → pick the best-performing base
tailor_resume     → version for THIS job
log_application   → with that versionId
```

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
