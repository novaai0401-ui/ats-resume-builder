#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from 'node:http';
import { buildServer } from './server.js';
import { PocketResumeClient } from './api-client.js';
import { bearerToken } from './http-auth.js';
import { handleOAuth, unwrapAccessToken, type OAuthConfig } from './oauth.js';

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

// OAuth for ChatGPT/Claude remote connectors (R-098) — enabled only when
// both env vars are set; plain Bearer tokens keep working either way.
const oauthSecret = String(process.env.MCP_OAUTH_SECRET || '').trim();
const publicUrl = String(process.env.MCP_PUBLIC_URL || '').trim().replace(/\/+$/, '');
const oauthCfg: OAuthConfig | null =
  oauthSecret && publicUrl ? { secret: oauthSecret, issuer: publicUrl, apiBaseUrl: baseUrl } : null;

async function main() {
  if (transportKind === 'http') {
    const port = Number(process.env.MCP_PORT || 8941);
    const httpServer = createServer(async (req, res) => {
      // Unauthenticated liveness probe for the hosting platform.
      if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, oauth: Boolean(oauthCfg) }));
        return;
      }
      // OAuth endpoints (discovery, register, authorize, token) first.
      if (await handleOAuth(req, res, oauthCfg)) return;

      // Multi-tenant + stateless: a fresh server/transport per request,
      // bound to the CALLER's token. No cross-user state can leak because
      // nothing outlives the request. The bearer may be an OAuth-wrapped
      // token (cbcv.…) or a raw CallbackCV token; env token is the
      // single-user fallback for header-less personal tunnels.
      const rawBearer = bearerToken(req);
      let token = rawBearer || envToken;
      if (oauthCfg && rawBearer) {
        const unwrapped = unwrapAccessToken(oauthCfg.secret, rawBearer);
        if (unwrapped === null) token = ''; // wrapped but invalid/expired → force re-auth
        else if (unwrapped) token = unwrapped;
      }
      if (!token) {
        const headers: Record<string, string> = { 'content-type': 'application/json' };
        if (oauthCfg) {
          // RFC 9728: point MCP clients at the resource metadata so they
          // can discover the OAuth flow automatically.
          headers['www-authenticate'] = `Bearer resource_metadata="${oauthCfg.issuer}/.well-known/oauth-protected-resource"`;
        }
        res.writeHead(401, headers);
        res.end(
          JSON.stringify({
            error: 'unauthorized',
            message:
              'Send your CallbackCV token as "Authorization: Bearer <token>" (Settings → API access), or connect via OAuth.',
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
