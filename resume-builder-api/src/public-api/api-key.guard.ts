import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeysService, hashIp } from './api-keys.service';
import { rateLimitOrThrow } from '../limits/rate-limit';

/**
 * R-041 — API-key auth for the public surface.
 *
 * Reads the key from `Authorization: Bearer pra_...` (Postman default,
 * curl default) OR `x-api-key: pra_...` (some SDK clients). Sends 401
 * with a uniform message on any failure — no oracle that lets a
 * caller tell "expired" from "revoked" from "never existed".
 *
 * On success, attaches `req.apiKey` with id/limits/tenantSlug so the
 * controller can rate-limit + log usage. Per-minute rate-limit is
 * enforced HERE (before the route runs) using the in-process limiter;
 * monthly cap is enforced once before the heavy work.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeysService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { apiKey?: { id: string; tenantSlug: string; monthlyCallLimit: number; perMinuteLimit: number }; apiCallStart?: number }>();

    const bearer = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
    const headerKey = String(req.headers['x-api-key'] || '').trim();
    const provided = bearer || headerKey;
    if (!provided) throw new UnauthorizedException('API key required.');

    const authorised = await this.keys.authorise(provided);
    if (!authorised) throw new UnauthorizedException('API key invalid or revoked.');

    rateLimitOrThrow({
      key: `api:rl:${authorised.id}`,
      limit: authorised.perMinuteLimit,
      windowMs: 60_000,
      message: `Per-minute rate limit (${authorised.perMinuteLimit}) exceeded for this API key.`,
    });

    if (await this.keys.isOverMonthlyCap(authorised.id, authorised.monthlyCallLimit)) {
      // 402 Payment Required is the semantic match — overage = bill;
      // raise the cap by upgrading.
      throw new UnauthorizedException('Monthly API call limit reached for this key. Raise the cap or wait for next month.');
    }

    req.apiKey = authorised;
    req.apiCallStart = Date.now();
    return true;
  }
}

/** Hash the caller IP for the audit log — never store raw IPs. */
export function ipHashFromRequest(req: Request): string | null {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0]?.trim();
  const ip = fwd || req.ip || req.socket?.remoteAddress || '';
  return ip ? hashIp(ip) : null;
}
