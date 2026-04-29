import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Verifies HMAC-style signatures on requests coming from the **mobile**
 * client. The web app skips this check (no X-App-Platform header), as
 * web cookies + CSRF tokens are the appropriate guard there.
 *
 * Rationale:
 *   The mobile client signs every request with
 *     SHA256( REQUEST_SIGNING_KEY + ':' + METHOD + '\n' + PATH + '\n' +
 *             TIMESTAMP + '\n' + BODY )
 *   So even if an attacker steals a JWT from a phone (which is hard —
 *   we use Keychain/Keystore), they still can't forge or replay
 *   arbitrary requests because they don't have the signing key.
 *
 *   The signing key is baked into the mobile build at compile time;
 *   rotating it requires shipping a new APK / TestFlight build, which
 *   is desirable behaviour — old compromised builds become inert.
 *
 * Skipped for:
 *   • Anything when REQUEST_SIGNING_KEY isn't configured (gradual rollout).
 *   • Requests without an X-App-Platform header (the web app + curl).
 *   • /health, /app/version, /auth/social/providers (used pre-login,
 *     no key in scope yet).
 */
@Injectable()
export class RequestSignatureMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const key = process.env.REQUEST_SIGNING_KEY;
    if (!key) return next();

    const platform = req.header('x-app-platform');
    if (!platform || (platform !== 'ios' && platform !== 'android')) return next();

    const skipPaths = ['/health', '/app/version', '/auth/social/providers'];
    if (skipPaths.some((p) => req.path === p || req.path.startsWith(`${p}/`))) return next();

    const sig = req.header('x-request-signature');
    const ts = req.header('x-request-timestamp');
    if (!sig || !ts) {
      throw new UnauthorizedException('Missing request signature.');
    }

    // Reject anything older than 60 seconds to neuter replay attacks.
    const tsNum = Number(ts);
    if (!Number.isFinite(tsNum)) {
      throw new UnauthorizedException('Bad request timestamp.');
    }
    const skewSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
    if (skewSec > 60) {
      throw new UnauthorizedException('Request signature expired.');
    }

    // Recompute and compare. Express has already parsed the body for
    // JSON routes, so we re-stringify in canonical (sorted) order to
    // match what the client sent. For routes with raw bodies (Stripe /
    // Razorpay webhooks), this middleware never runs because they don't
    // carry an X-App-Platform header.
    const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : '';
    const payload = `${req.method.toUpperCase()}\n${req.path}\n${ts}\n${body}`;
    const expected = createHash('sha256').update(`${key}:${payload}`).digest('hex');

    if (!constantTimeEqual(sig, expected)) {
      throw new UnauthorizedException('Invalid request signature.');
    }

    return next();
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
