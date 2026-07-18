# @tekivex/callbackcv-mcp

MCP server for [CallbackCV](https://pocketresume.app). Lets AI
agents (Claude Desktop, Claude Code, any MCP host) read your resumes,
tailor them to job descriptions, log applications, and query which
resume version actually gets replies.

Every agent action goes through the same REST API as the web app with
**your** token — plan gates, AI-token quotas, and rate limits apply
identically to agents and humans. Tailored versions and logged
applications feed the same Outcome Graph, so "did the agent's
tailoring work?" is answerable in your Outcomes dashboard.

## Setup (Claude Desktop / Claude Code)

```json
{
  "mcpServers": {
    "callbackcv": {
      "command": "npx",
      "args": ["-y", "@tekivex/callbackcv-mcp"],
      "env": {
        "POCKET_RESUME_TOKEN": "<your token — Settings → API access>",
        "POCKET_RESUME_API_URL": "https://api.pocketresume.app"
      }
    }
  }
}
```

Config is env-only (no CLI flags) so tokens never appear in `ps`
output. When the token expires, tools return a clear re-auth message.

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

- **stdio** (default) — what MCP hosts spawn.
- **HTTP** — `MCP_TRANSPORT=http MCP_PORT=8941` runs a Streamable-HTTP
  endpoint (stateless; one server per user token).

## Development

```bash
npm install
npm run build
POCKET_RESUME_TOKEN=... POCKET_RESUME_API_URL=http://localhost:4001 node dist/index.js
```
