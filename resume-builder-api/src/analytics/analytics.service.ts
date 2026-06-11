import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Server-side hook into the self-hosted audit-admin-analytics dashboard.
 *
 * Why this lives in the API: web, mobile, and the Chrome extension all
 * funnel auth through the same /auth endpoints here. Instrumenting once
 * server-side captures every client without a per-client SDK.
 *
 * Critical wiring detail — the dashboard derives IP / device / OS /
 * browser / geo from the *incoming* request's x-forwarded-for and
 * user-agent. We call it server-to-server, so we must forward the end
 * user's real headers on the outgoing fetch. Otherwise every event
 * shows up tagged with this server's IP.
 *
 * Contract:
 *   - Completely fire-and-forget. Never throws, never blocks the auth
 *     request path. If AUDIT_URL or AUDIT_WRITE_KEY is unset, it no-ops
 *     silently — auth must work identically with or without analytics.
 *   - Failures are logged at warn level only; we do not retry. The
 *     dashboard owns its own ingestion durability.
 */

export type AnalyticsEventType =
  | 'login'
  | 'login_failed'
  | 'register'
  | 'logout'
  // R-038: public share-link surface. Recorded server-side so the
  // analytics dashboard sees recruiter activity even though the public
  // page has no JS tracking.
  | 'share_link_view'
  | 'share_link_download';

export interface AnalyticsEvent {
  type: AnalyticsEventType;
  email?: string;
  anonId?: string;
  path?: string;
  properties?: Record<string, unknown>;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  track(event: AnalyticsEvent, req?: Request): void {
    // Resolve env at call time, not constructor time, so test harnesses
    // can flip the vars between cases without rebuilding the module.
    const url = process.env.AUDIT_URL;
    const writeKey = process.env.AUDIT_WRITE_KEY;
    if (!url || !writeKey) return;

    const endpoint = `${url.replace(/\/+$/, '')}/api/collect`;
    const forwardedFor = this.extractForwardedFor(req);
    const userAgent = req?.headers['user-agent']
      ? String(req.headers['user-agent']).slice(0, 500)
      : undefined;
    const language = this.extractLanguage(req);

    const body: Record<string, unknown> = {
      writeKey,
      type: event.type,
    };
    if (event.email) body.email = event.email;
    if (event.anonId) body.anonId = event.anonId;
    if (event.path) body.path = event.path;
    if (language) body.language = language;
    if (event.properties) body.properties = event.properties;

    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;
    if (userAgent) headers['user-agent'] = userAgent;

    // Fire-and-forget. We deliberately do NOT await — the auth response
    // path must not pay a network round-trip to ship analytics.
    void fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (!res.ok) {
          this.logger.warn(
            `analytics sink returned ${res.status} for type=${event.type}`,
          );
        }
      })
      .catch((err) => {
        this.logger.warn(
          `analytics sink unreachable for type=${event.type}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      });
  }

  private extractForwardedFor(req?: Request): string | undefined {
    if (!req) return undefined;
    const raw = req.headers['x-forwarded-for'];
    const first = Array.isArray(raw)
      ? raw[0]
      : String(raw || '').split(',')[0];
    const trimmed = first?.trim();
    if (trimmed) return trimmed;
    const remote = req.socket?.remoteAddress;
    return remote ? String(remote) : undefined;
  }

  private extractLanguage(req?: Request): string | undefined {
    const raw = req?.headers['accept-language'];
    if (!raw) return undefined;
    // Accept-Language is a comma-separated list with optional q-values;
    // the first token is the user's preferred locale.
    const first = String(raw).split(',')[0]?.split(';')[0]?.trim();
    return first || undefined;
  }
}
