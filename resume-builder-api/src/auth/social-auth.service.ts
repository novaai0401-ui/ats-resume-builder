import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

export type OAuthProfile = {
  provider: 'google' | 'linkedin' | 'yahoo' | 'github';
  providerId: string;
  email: string;
  fullName: string;
  picture?: string;
};

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Read an env var with fallback name.
   * Supports both GOOGLE_LOGIN_CLIENT_ID and GOOGLE_CLIENT_ID naming conventions.
   */
  private env(primary: string, ...fallbacks: string[]): string {
    const val = this.config.get<string>(primary, '');
    if (val) return val;
    for (const fb of fallbacks) {
      const v = this.config.get<string>(fb, '');
      if (v) return v;
    }
    return '';
  }

  /**
   * Handle social OAuth login/register.
   * If user exists with same email -> link and login.
   * If no user exists -> create new account and login.
   */
  async handleSocialLogin(profile: OAuthProfile) {
    if (!profile.email) {
      throw new BadRequestException('Email is required from OAuth provider.');
    }
    const email = profile.email.trim().toLowerCase();

    // Try to find existing user by email
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (user) {
      // Existing user — update login metadata
      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginCount: { increment: 1 } },
      });
    } else {
      // New user — register via social login
      const { getPlanConfig } = await import('../billing/plan-limits');
      const { resetUsageForPlan } = await import('../billing/usage');
      const bcrypt = await import('bcryptjs');
      const { randomBytes } = await import('node:crypto');

      const adminEmails = parseCsvSet(this.config.get<string>('ADMIN_EMAILS', ''));
      const isAdmin = adminEmails.has(email);
      const planConfig = getPlanConfig('FREE');

      user = await this.prisma.user.create({
        data: {
          email,
          fullName: profile.fullName || email.split('@')[0],
          passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
          plan: 'FREE',
          isAdmin,
          aiTokensLimit: planConfig.aiTokensLimit,
          pdfExportsLimit: planConfig.pdfExportsLimit,
          atsScansLimit: planConfig.atsScansLimit,
          resumesLimit: planConfig.resumesLimit,
        },
      });
      await resetUsageForPlan(this.prisma, user.id, 'FREE');
    }

    // Record login event
    await this.prisma.loginEvent.create({
      data: {
        userId: user.id,
        email,
        method: `social_${profile.provider}`,
      },
    });

    return this.authService.issueTokensForUser({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      mobile: user.mobile,
    });
  }

  /** Check if an email is in the admin list. */
  async isUserAdmin(email: string): Promise<boolean> {
    const adminEmails = parseCsvSet(this.config.get<string>('ADMIN_EMAILS', ''));
    return adminEmails.has(email.trim().toLowerCase());
  }

  /**
   * Exchange Google OAuth code for user profile.
   */
  async exchangeGoogleCode(code: string): Promise<OAuthProfile> {
    const clientId = this.env('GOOGLE_LOGIN_CLIENT_ID', 'GOOGLE_CLIENT_ID');
    const clientSecret = this.env('GOOGLE_LOGIN_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET');
    const redirectUri = this.getGoogleRedirectUri();

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Google login is not configured.');
    }

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text().catch(() => '');
      this.logger.error(`Google token exchange failed: ${err.slice(0, 200)}`);
      throw new UnauthorizedException('Google authentication failed.');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new UnauthorizedException('Google did not return an access token.');
    }

    // Get user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      throw new UnauthorizedException('Failed to fetch Google profile.');
    }

    const profile = await profileRes.json();
    return {
      provider: 'google',
      providerId: String(profile.id || ''),
      email: String(profile.email || ''),
      fullName: String(profile.name || ''),
      picture: profile.picture,
    };
  }

  /**
   * Exchange LinkedIn OAuth code for user profile.
   */
  async exchangeLinkedInCode(code: string): Promise<OAuthProfile> {
    const clientId = this.config.get<string>('LINKEDIN_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('LINKEDIN_CLIENT_SECRET', '');
    const redirectUri = this.config.get<string>('LINKEDIN_REDIRECT_URI', '');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('LinkedIn login is not configured.');
    }

    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException('LinkedIn authentication failed.');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const profileRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      throw new UnauthorizedException('Failed to fetch LinkedIn profile.');
    }

    const profile = await profileRes.json();
    return {
      provider: 'linkedin',
      providerId: String(profile.sub || ''),
      email: String(profile.email || ''),
      fullName: String(profile.name || ''),
      picture: profile.picture,
    };
  }

  /**
   * Exchange Yahoo OAuth code for user profile.
   */
  async exchangeYahooCode(code: string): Promise<OAuthProfile> {
    const clientId = this.config.get<string>('YAHOO_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('YAHOO_CLIENT_SECRET', '');
    const redirectUri = this.config.get<string>('YAHOO_REDIRECT_URI', '');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('Yahoo login is not configured.');
    }

    const tokenRes = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException('Yahoo authentication failed.');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const profileRes = await fetch('https://api.login.yahoo.com/openid/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      throw new UnauthorizedException('Failed to fetch Yahoo profile.');
    }

    const profile = await profileRes.json();
    return {
      provider: 'yahoo',
      providerId: String(profile.sub || ''),
      email: String(profile.email || ''),
      fullName: String(profile.name || profile.given_name || ''),
      picture: profile.picture,
    };
  }

  /**
   * Get the Google OAuth redirect URI.
   * Prefers GOOGLE_LOGIN_REDIRECT_URI if set explicitly for social login.
   * Falls back to auto-constructing from PORT to ensure it always points to
   * the social auth callback route, not the old Google Drive callback.
   */
  private getGoogleRedirectUri(): string {
    const explicit = this.config.get<string>('GOOGLE_LOGIN_REDIRECT_URI', '');
    if (explicit) return explicit;
    // Auto-construct from the server's port — ensures the URI always matches
    // the /auth/social/google/callback route, even if the user only set
    // GOOGLE_REDIRECT_URI for the old Drive integration.
    const port = this.config.get<string>('PORT', '3001');
    return `http://localhost:${port}/auth/social/google/callback`;
  }

  /** Build the OAuth consent URL for Google login. */
  buildGoogleLoginUrl(state: string): string {
    const clientId = this.env('GOOGLE_LOGIN_CLIENT_ID', 'GOOGLE_CLIENT_ID');
    const redirectUri = this.getGoogleRedirectUri();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  /** Build the OAuth consent URL for LinkedIn login. */
  buildLinkedInLoginUrl(state: string): string {
    const clientId = this.config.get<string>('LINKEDIN_CLIENT_ID', '');
    const redirectUri = this.config.get<string>('LINKEDIN_REDIRECT_URI', '');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
    });
    return `https://www.linkedin.com/oauth/v2/authorization?${params}`;
  }

  /** Build the OAuth consent URL for Yahoo login. */
  buildYahooLoginUrl(state: string): string {
    const clientId = this.config.get<string>('YAHOO_CLIENT_ID', '');
    const redirectUri = this.config.get<string>('YAHOO_REDIRECT_URI', '');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid',
      state,
    });
    return `https://api.login.yahoo.com/oauth2/request_auth?${params}`;
  }

  /**
   * Exchange GitHub OAuth code for user profile.
   */
  async exchangeGitHubCode(code: string): Promise<OAuthProfile> {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('GITHUB_CLIENT_SECRET', '');
    const redirectUri = this.config.get<string>('GITHUB_REDIRECT_URI', '');

    if (!clientId || !clientSecret) {
      throw new BadRequestException('GitHub login is not configured.');
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedException('GitHub authentication failed.');
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      throw new UnauthorizedException('GitHub did not return an access token.');
    }

    // Get user profile
    const profileRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!profileRes.ok) {
      throw new UnauthorizedException('Failed to fetch GitHub profile.');
    }

    const profile = await profileRes.json();
    let email = profile.email;

    // GitHub may not return email in profile — fetch from emails API
    if (!email) {
      const emailsRes = await fetch('https://api.github.com/user/emails', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (emailsRes.ok) {
        const emails = await emailsRes.json();
        const primary = emails.find((e: { primary: boolean; verified: boolean }) => e.primary && e.verified);
        email = primary?.email || emails[0]?.email || '';
      }
    }

    return {
      provider: 'github',
      providerId: String(profile.id || ''),
      email: String(email || ''),
      fullName: String(profile.name || profile.login || ''),
      picture: profile.avatar_url,
    };
  }

  /** Build the OAuth consent URL for GitHub login. */
  buildGitHubLoginUrl(state: string): string {
    const clientId = this.config.get<string>('GITHUB_CLIENT_ID', '');
    const redirectUri = this.config.get<string>('GITHUB_REDIRECT_URI', '');
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }
}

function parseCsvSet(raw: string): Set<string> {
  return new Set(
    String(raw || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}
