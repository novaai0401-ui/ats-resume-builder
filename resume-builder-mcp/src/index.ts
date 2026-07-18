#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { buildServer } from './server.js';
import { PocketResumeClient } from './api-client.js';

/**
 * Entry point. Two transports per the R-040 acceptance:
 *
 *   stdio (default) — what Claude Desktop / Claude Code / most MCP
 *   hosts spawn:
 *     POCKET_RESUME_TOKEN=... POCKET_RESUME_API_URL=... callbackcv-mcp
 *
 *   HTTP — for remote hosting (one server per user-token is still the
 *   model; multi-tenant HTTP belongs to the R-041 API-key work):
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

const token = String(process.env.POCKET_RESUME_TOKEN || '').trim();
const baseUrl = String(process.env.POCKET_RESUME_API_URL || 'https://api.pocketresume.app').trim();
if (!token) {
  fatal(
    'POCKET_RESUME_TOKEN is required. Get a token from CallbackCV → Settings → API access, then set it in your MCP host config.',
  );
}

const client = new PocketResumeClient({ baseUrl, token });
const transportKind = String(process.env.MCP_TRANSPORT || 'stdio').toLowerCase();

async function main() {
  if (transportKind === 'http') {
    const port = Number(process.env.MCP_PORT || 8941);
    const httpServer = createServer(async (req, res) => {
      // Stateless mode: a fresh transport per request, no session
      // tracking. Fine for single-user remote hosting; multi-tenant
      // session management arrives with the API-key milestone.
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
      console.error(`[callbackcv-mcp] HTTP transport listening on :${port}`);
    });
    return;
  }

  const server = buildServer(client);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[callbackcv-mcp] stdio transport connected');
}

main().catch((err) => fatal(err instanceof Error ? err.message : String(err)));
