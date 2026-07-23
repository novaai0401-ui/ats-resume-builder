#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { buildServer } from './server.js';
import { PocketResumeClient } from './api-client.js';
import { bearerToken } from './http-auth.js';

/**
 * Entry point. Two transports per the R-040 acceptance:
 *
 *   stdio (default) — what Claude Desktop / Claude Code / most MCP
 *   hosts spawn. Single user; token comes from the environment:
 *     POCKET_RESUME_TOKEN=... POCKET_RESUME_API_URL=... callbackcv-mcp
 *
 *   HTTP — for remote hosting, MULTI-TENANT (R-097): each request may
 *   carry its own user token in the Authorization header
 *   (`Authorization: Bearer <token from Settings → API access>`), so one
 *   hosted URL serves many users, each acting only as themselves. The
 *   env token, when set, is the fallback for header-less requests
 *   (single-user tunnels). A request with neither gets a 401.
 *     MCP_TRANSPORT=http MCP_PORT=8941 callbackcv-mcp
 *
 * Config is env-only, no flags: MCP host configs pass env cleanly and
 * tokens never end up in argv (visible in `ps`).
 */

function fatal(message: string): never {
  // stderr only — stdout belongs to the JSON-RPC stream in stdio mode.
  console.error(`[callbackcv-mcp] ${message}`);
  process.exit(1);
}

const envToken = String(process.env.POCKET_RESUME_TOKEN || '').trim();
const baseUrl = String(process.env.POCKET_RESUME_API_URL || 'https://ats-rb-api.onrender.com').trim();
const transportKind = String(process.env.MCP_TRANSPORT || 'stdio').toLowerCase();

async function main() {
  if (transportKind === 'http') {
    const port = Number(process.env.MCP_PORT || 8941);
    const httpServer = createServer(async (req, res) => {
      // Multi-tenant + stateless: a fresh server/transport per request,
      // bound to the CALLER's token. No cross-user state can leak because
      // nothing outlives the request.
      const token = bearerToken(req) || envToken;
      if (!token) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'unauthorized',
            message:
              'Send your CallbackCV token as "Authorization: Bearer <token>" (Settings → API access).',
          }),
        );
        return;
      }
      const client = new PocketResumeClient({ baseUrl, token });
      const server = buildServer(client);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res);
    });
    httpServer.listen(port, () => {
      console.error(`[callbackcv-mcp] HTTP transport listening on :${port} (multi-tenant: per-request Authorization)`);
    });
    return;
  }

  // stdio: single user — the env token is the identity and is required.
  if (!envToken) {
    fatal(
      'POCKET_RESUME_TOKEN is required. Get a token from CallbackCV → Settings → API access, then set it in your MCP host config.',
    );
  }
  const server = buildServer(new PocketResumeClient({ baseUrl, token: envToken }));
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[callbackcv-mcp] stdio transport connected');
}

main().catch((err) => fatal(err instanceof Error ? err.message : String(err)));
