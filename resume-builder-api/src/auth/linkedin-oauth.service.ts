import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { getPlanConfig } from '../billing/plan-limits';
import { resetUsageForPlan } from '../billing/usage';
import * as bcrypt from 'bcryptjs';

/**
 * "Sign in with LinkedIn" via OpenID Connect.
 *
 * LinkedIn-only by design: Google's OAuth verification has cost/overhead the
 * product can't justify pre-revenue, while LinkedIn is where job-seekers
 * already are. The flow:
 *   1. GET /auth/linkedin           → returns the authorize URL (+ signed state)
 *   2. user authenticates on LinkedIn, redirected back with ?code&state
 *   3. GET /auth/linkedin/callback  → verify state, exchange code, read
 *      /userinfo, find-or-create the user, redirect to the web app with tokens
 *
 * The pure helpers (URL build, profile normalize, state sign/verify) are
 * exported and unit-tested; the network calls are isolated in thin methods.
 */

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const SCOPES = 'openid profile email';
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export interface LinkedInConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface LinkedInProfile {
  sub: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
}

// ── Pure helpers (exported for tests) ───────────────────────────────

/** Build the LinkedIn authorize URL with the given signed state. */
export function buildLinkedInAuthUrl(cfg: Pick<LinkedInConfig, 'clientId' | 'redirectUri'>, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/** Normalize + validate the OIDC userinfo payload into our profile shape. */
export function normalizeLinkedInProfile(userinfo: Record<string, unknown>): LinkedInProfile {
  const email = String(userinfo?.email ?? '').trim().toLowerCase();
  const sub = String(userinfo?.sub ?? '').trim();
  if (!sub) throw new BadRequestException('LinkedIn did not return a user id.');
  if (!email) throw new BadRequestException('LinkedIn did not return an email. Grant email permission and retry.');
  const name = String(userinfo?.name ?? '').trim();
  const given = String(userinfo?.given_name ?? '').trim();
  const family = String(userinfo?.family_name ?? '').trim();
  const fullName = name || [given, family].filter(Boolean).join(' ').trim() || email.split('@')[0];
  return {
    sub,
    email,
    fullName,
    emailVerified: userinfo?.email_verified === true || userinfo?.email_verified === 'true',
  };
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

/** Create a signed, timestamped state token (CSRF protection). */
export function signOAuthState(secret: string, now: number = Date.now()): string {
  const payload = b64url(Buffer.from(JSON.stringify({ n: randomBytes(8).toString('hex'), t: now }), 'utf8'));
  return `${payload}.${sign(payload, secret)}`;
}

/** Verify a state token's signature and freshness. */
export function verifyOAuthState(secret: string, state: string, maxAgeMs: number = STATE_MAX_AGE_MS, now: number = Date.now()): boolean {
  if (!state || !secret) return false;
  const dot = state.indexOf('.');
  if (dot <= 0) return false;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    const t = Number(decoded?.t);
    if (!Number.isFinite(t)) return false;
    return now - t <= maxAgeMs && now - t >= -60_000; // allow 60s clock skew
  } catch {
    return false;
  }
}

// ── Service (impure flow) ───────────────────────────────────────────

@Injectable()
export class LinkedInOAuthService {
  private readonly logger = new Logger(LinkedInOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /** Resolve config or throw a clear error if LinkedIn login isn't set up. */
  getConfig(): LinkedInConfig {
    const clientId = this.config.get<string>('LINKEDIN_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('LINKEDIN_CLIENT_SECRET', '');
    const redirectUri = this.config.get<string>('LINKEDIN_REDIRECT_URI', '');
    if (!clientId || !clientSecret || !redirectUri) {
      throw new BadRequestException('LinkedIn sign-in is not configured on this server.');
    }
    return { clientId, clientSecret, redirectUri };
  }

  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('LINKEDIN_CLIENT_ID', '') &&
      this.config.get<string>('LINKEDIN_CLIENT_SECRET', '') &&
      this.config.get<string>('LINKEDIN_REDIRECT_URI', ''),
    );
  }

  private stateSecret(): string {
    return this.config.get<string>('OAUTH_STATE_SECRET', '') || this.config.get<string>('JWT_SECRET', 'dev_secret');
  }

  /** Step 1 — produce the authorize URL the client should redirect to. */
  startUrl(): string {
    const cfg = this.getConfig();
    return buildLinkedInAuthUrl(cfg, signOAuthState(this.stateSecret()));
  }

  /** Where to send the browser after a successful (or failed) callback. */
  webCallbackUrl(): string {
    const url =
      this.config.get<string>('WEB_URL', '') ||
      this.config.get<string>('APP_WEB_URL', '') ||
      'http://localhost:3000';
    return url.replace(/\/$/, '');
  }

  /** Step 3 — exchange the code, read the profile, log in / create the user. */
  async handleCallback(code: string, state: string) {
    if (!verifyOAuthState(this.stateSecret(), state)) {
      throw new BadRequestException('Invalid or expired sign-in state. Please try again.');
    }
    const cfg = this.getConfig();
    const accessToken = await this.exchangeCode(code, cfg);
    const userinfo = await this.fetchUserInfo(accessToken);
    const profile = normalizeLinkedInProfile(userinfo);
    return this.loginOrCreate(profile);
  }

  private async exchangeCode(code: string, cfg: LinkedInConfig): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: cfg.redirectUri,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`LinkedIn token exchange failed: ${res.status} ${text.slice(0, 200)}`);
      throw new BadRequestException('Could not complete LinkedIn sign-in. Please try again.');
    }
    const data = await res.json();
    const token = data?.access_token;
    if (typeof token !== 'string') throw new BadRequestException('LinkedIn did not return an access token.');
    return token;
  }

  private async fetchUserInfo(accessToken: string): Promise<Record<string, unknown>> {
    const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.error(`LinkedIn userinfo failed: ${res.status} ${text.slice(0, 200)}`);
      throw new BadRequestException('Could not read your LinkedIn profile. Please try again.');
    }
    return res.json();
  }

  private async loginOrCreate(profile: LinkedInProfile) {
    const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (existing) {
      return this.authService.issueTokensForUser({
        id: existing.id,
        email: existing.email,
        fullName: existing.fullName,
        mobile: existing.mobile,
      });
    }

    // New social signup: placeholder password, no mobile, provider tagged.
    const planConfig = getPlanConfig('FREE');
    const adminEmails = this.config.get<string>('ADMIN_EMAILS', '');
    const isAdmin = adminEmails.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(profile.email);
    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
    const user = await this.prisma.user.create({
      data: {
        email: profile.email,
        fullName: profile.fullName,
        passwordHash,
        plan: 'FREE',
        isAdmin,
        primaryAuthProvider: 'linkedin',
        hasUserSetPassword: false,
        // LinkedIn asserts the email as verified on their side; no extra
        // code step for OAuth signups.
        emailVerifiedAt: new Date(),
        aiTokensLimit: planConfig.aiTokensLimit,
        pdfExportsLimit: planConfig.pdfExportsLimit,
        atsScansLimit: planConfig.atsScansLimit,
        resumesLimit: planConfig.resumesLimit,
      },
      select: { id: true, email: true, fullName: true, mobile: true },
    });
    await resetUsageForPlan(this.prisma, user.id, 'FREE');
    return this.authService.issueTokensForUser(user);
  }
}
