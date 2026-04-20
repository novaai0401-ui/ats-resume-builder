import { BadRequestException, Controller, Get, HttpCode, Inject, Logger, Post, Body, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { SocialAuthService } from './social-auth.service';
import { REDIS_CLIENT, type RedisLikeClient } from './redisClient';

/** How long an OAuth state token is valid (5 minutes). */
const STATE_TTL_SECONDS = 300;
/** How long a login handoff token is valid (60 seconds). */
const HANDOFF_TTL_SECONDS = 60;

/** Each group is OR'd — if ANY var in the group is set, the requirement is met. */
type EnvVarGroup = string[];

type ProviderConfig = {
  name: string;
  /** Each entry is a group of alternative env var names (any one suffices). */
  requiredGroups: EnvVarGroup[];
  clientIdKey: string;
};

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  google: {
    name: 'Google',
    requiredGroups: [
      ['GOOGLE_LOGIN_CLIENT_ID', 'GOOGLE_CLIENT_ID'],
      ['GOOGLE_LOGIN_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET'],
      ['GOOGLE_LOGIN_REDIRECT_URI', 'GOOGLE_REDIRECT_URI'],
    ],
    clientIdKey: 'GOOGLE_LOGIN_CLIENT_ID',
  },
  github: {
    name: 'GitHub',
    requiredGroups: [
      ['GITHUB_CLIENT_ID'],
      ['GITHUB_CLIENT_SECRET'],
      ['GITHUB_REDIRECT_URI'],
    ],
    clientIdKey: 'GITHUB_CLIENT_ID',
  },
  linkedin: {
    name: 'LinkedIn',
    requiredGroups: [
      ['LINKEDIN_CLIENT_ID'],
      ['LINKEDIN_CLIENT_SECRET'],
      ['LINKEDIN_REDIRECT_URI'],
    ],
    clientIdKey: 'LINKEDIN_CLIENT_ID',
  },
  yahoo: {
    name: 'Yahoo',
    requiredGroups: [
      ['YAHOO_CLIENT_ID'],
      ['YAHOO_CLIENT_SECRET'],
      ['YAHOO_REDIRECT_URI'],
    ],
    clientIdKey: 'YAHOO_CLIENT_ID',
  },
};

@Controller('auth/social')
export class SocialAuthController {
  private readonly logger = new Logger(SocialAuthController.name);

  constructor(
    private readonly socialAuth: SocialAuthService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly store: RedisLikeClient,
  ) {
    // Log detailed provider configuration status on startup
    for (const [, cfg] of Object.entries(PROVIDER_CONFIGS)) {
      const missingGroups = cfg.requiredGroups
        .filter((group) => !group.some((v) => this.config.get(v)))
        .map((group) => group.join(' or '));
      if (missingGroups.length === 0) {
        this.logger.log(`${cfg.name} login: CONFIGURED`);
      } else {
        this.logger.warn(`${cfg.name} login: NOT CONFIGURED — missing: ${missingGroups.join(', ')}`);
      }
    }
    const successUrl = this.config.get<string>('SOCIAL_LOGIN_SUCCESS_URL');
    const resolved = this.getFrontendCallbackUrl();
    if (!successUrl) {
      this.logger.warn(
        `SOCIAL_LOGIN_SUCCESS_URL not set — using fallback: ${resolved}`,
      );
    } else if (this.looksLikeApiHost(successUrl)) {
      this.logger.error(
        `SOCIAL_LOGIN_SUCCESS_URL=${successUrl} appears to point at the API itself. ` +
          `This will 404 after OAuth completes. Set it to your WEB host, e.g. https://<web-service>.onrender.com/auth/callback`,
      );
    } else {
      this.logger.log(`SOCIAL_LOGIN_SUCCESS_URL resolved to: ${resolved}`);
    }
  }

  /** Heuristic: warn if the configured success URL is the API's own host. */
  private looksLikeApiHost(url: string): boolean {
    try {
      const host = new URL(url).hostname;
      // Heuristic: any hostname starting with "api" or containing "-api."
      return /^api[.-]|[-.]api\./i.test(host);
    } catch {
      return false;
    }
  }

  /** Check if a provider has ALL required env var groups satisfied. */
  private isProviderConfigured(providerId: string): boolean {
    const cfg = PROVIDER_CONFIGS[providerId];
    if (!cfg) return false;
    return cfg.requiredGroups.every((group) => group.some((v) => Boolean(this.config.get(v))));
  }

  private getFrontendCallbackUrl(): string {
    // 1. Explicit env var wins
    const explicit = this.config.get<string>('SOCIAL_LOGIN_SUCCESS_URL');
    if (explicit) return explicit;

    // 2. Fall back to first CORS_ORIGIN entry + /auth/callback. This handles the
    //    common deploy case where the operator sets CORS_ORIGIN to the web host
    //    and forgets to set SOCIAL_LOGIN_SUCCESS_URL separately.
    const corsOrigin = this.config.get<string>('CORS_ORIGIN');
    if (corsOrigin) {
      const first = corsOrigin.split(',')[0].trim().replace(/\/+$/, '');
      if (first) return `${first}/auth/callback`;
    }

    // 3. Local dev fallback
    return 'http://localhost:4000/auth/callback';
  }

  // ─── State Management ─────────────────────────────────────────────────────

  private async createAndStoreState(provider: string): Promise<string> {
    const state = randomBytes(20).toString('hex');
    await this.store.set(`oauth:state:${state}`, provider, { ex: STATE_TTL_SECONDS });
    return state;
  }

  private async validateState(state: string, expectedProvider: string): Promise<boolean> {
    if (!state) return false;
    const stored = await this.store.get(`oauth:state:${state}`);
    if (stored !== expectedProvider) return false;
    await this.store.del(`oauth:state:${state}`);
    return true;
  }

  // ─── Handoff Token (replaces tokens-in-URL) ───────────────────────────────

  private async createHandoffToken(authData: Record<string, string>): Promise<string> {
    const token = randomBytes(32).toString('hex');
    await this.store.set(`oauth:handoff:${token}`, JSON.stringify(authData), { ex: HANDOFF_TTL_SECONDS });
    return token;
  }

  /** Frontend calls this to exchange a one-time handoff token for real auth data. */
  @Post('exchange-handoff')
  @HttpCode(200)
  async exchangeHandoff(@Body() body: { token: string }) {
    const token = String(body?.token || '').trim();
    if (!token) throw new BadRequestException('Handoff token is required.');
    const raw = await this.store.get(`oauth:handoff:${token}`);
    if (!raw) throw new BadRequestException('Invalid or expired handoff token.');
    await this.store.del(`oauth:handoff:${token}`);
    return JSON.parse(raw);
  }

  // ─── Providers List ───────────────────────────────────────────────────────

  @Get('providers')
  getProviders() {
    const providers: Array<{ id: string; name: string; configured: boolean }> = [];
    for (const [id, cfg] of Object.entries(PROVIDER_CONFIGS)) {
      providers.push({
        id,
        name: cfg.name,
        configured: this.isProviderConfigured(id),
      });
    }
    return { providers };
  }

  // ─── OAuth Start Routes ───────────────────────────────────────────────────

  @Get('google/start')
  async googleStart(@Res() res: Response) {
    if (!this.isProviderConfigured('google')) {
      return this.redirectProviderNotConfigured(res, 'google');
    }
    const state = await this.createAndStoreState('google');
    return res.redirect(this.socialAuth.buildGoogleLoginUrl(state));
  }

  @Get('github/start')
  async githubStart(@Res() res: Response) {
    if (!this.isProviderConfigured('github')) {
      return this.redirectProviderNotConfigured(res, 'github');
    }
    const state = await this.createAndStoreState('github');
    return res.redirect(this.socialAuth.buildGitHubLoginUrl(state));
  }

  @Get('linkedin/start')
  async linkedinStart(@Res() res: Response) {
    if (!this.isProviderConfigured('linkedin')) {
      return this.redirectProviderNotConfigured(res, 'linkedin');
    }
    const state = await this.createAndStoreState('linkedin');
    return res.redirect(this.socialAuth.buildLinkedInLoginUrl(state));
  }

  @Get('yahoo/start')
  async yahooStart(@Res() res: Response) {
    if (!this.isProviderConfigured('yahoo')) {
      return this.redirectProviderNotConfigured(res, 'yahoo');
    }
    const state = await this.createAndStoreState('yahoo');
    return res.redirect(this.socialAuth.buildYahooLoginUrl(state));
  }

  private redirectProviderNotConfigured(res: Response, provider: string) {
    const cfg = PROVIDER_CONFIGS[provider];
    const missingGroups = cfg
      ? cfg.requiredGroups
          .filter((group) => !group.some((v) => this.config.get(v)))
          .map((group) => group[0])
      : [];
    this.logger.warn(`${provider} /start called but not configured. Missing: ${missingGroups.join(', ')}`);
    return res.redirect(`${this.getFrontendCallbackUrl()}?error=not_configured&provider=${provider}`);
  }

  // ─── Server-side OAuth Callbacks ──────────────────────────────────────────

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    return this.handleProviderCallback(res, 'google', code, state, error);
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    return this.handleProviderCallback(res, 'github', code, state, error);
  }

  @Get('linkedin/callback')
  async linkedinCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    return this.handleProviderCallback(res, 'linkedin', code, state, error);
  }

  @Get('yahoo/callback')
  async yahooCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    return this.handleProviderCallback(res, 'yahoo', code, state, error);
  }

  private async handleProviderCallback(
    res: Response,
    provider: string,
    code: string,
    state: string,
    providerError?: string,
  ) {
    const frontendUrl = this.getFrontendCallbackUrl();

    if (providerError) {
      this.logger.warn(`${provider} OAuth denied: ${providerError}`);
      return res.redirect(`${frontendUrl}?error=denied&provider=${provider}`);
    }
    if (!code) {
      return res.redirect(`${frontendUrl}?error=no_code&provider=${provider}`);
    }

    // Validate state to prevent CSRF
    const stateValid = await this.validateState(state, provider);
    if (!stateValid) {
      this.logger.warn(`${provider} callback: invalid or expired state parameter`);
      return res.redirect(`${frontendUrl}?error=invalid_state&provider=${provider}`);
    }

    try {
      let profile;
      switch (provider) {
        case 'google': profile = await this.socialAuth.exchangeGoogleCode(code); break;
        case 'github': profile = await this.socialAuth.exchangeGitHubCode(code); break;
        case 'linkedin': profile = await this.socialAuth.exchangeLinkedInCode(code); break;
        case 'yahoo': profile = await this.socialAuth.exchangeYahooCode(code); break;
        default: return res.redirect(`${frontendUrl}?error=unsupported_provider`);
      }

      const auth = await this.socialAuth.handleSocialLogin(profile);
      this.logger.log(`${provider} login successful for ${profile.email}`);

      // Create a one-time handoff token instead of putting real tokens in the URL
      const handoffToken = await this.createHandoffToken({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
        userId: auth.user.id,
        email: auth.user.email,
        fullName: auth.user.fullName,
        expiresAt: auth.expiresAt || '',
        isAdmin: String(await this.socialAuth.isUserAdmin(auth.user.email)),
      });

      return res.redirect(`${frontendUrl}?handoff=${handoffToken}&provider=${provider}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      this.logger.error(`${provider} callback failed: ${msg}`);
      return res.redirect(`${frontendUrl}?error=auth_failed&provider=${provider}&message=${encodeURIComponent(msg)}`);
    }
  }
}
