import type { IncomingMessage } from 'node:http';

/**
 * Multi-tenant HTTP auth (R-097): each request to the hosted MCP endpoint
 * identifies its user via `Authorization: Bearer <token>` — the same ~7-day
 * token from CallbackCV → Settings → API access. Kept in its own module so
 * it is unit-testable (index.ts starts a transport on import).
 */
export function bearerToken(req: Pick<IncomingMessage, 'headers'>): string {
  const header = String(req.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}
