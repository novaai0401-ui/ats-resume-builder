'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const fs = require('fs');
const path = require('path');

function readFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, relativePath), 'utf-8');
}

// ─── LoginPageView Unit Tests ────────────────────────────────────────────────

describe('LoginPageView social login buttons', () => {
  const source = readFile('../app/auth/login/LoginPageView.tsx');

  it('should always render all 4 social provider buttons statically', () => {
    for (const provider of ['Google', 'LinkedIn', 'Yahoo', 'GitHub']) {
      assert.ok(
        source.includes(`name: '${provider}'`),
        `SOCIAL_PROVIDERS must contain { name: '${provider}' }`,
      );
    }
    assert.ok(source.includes('Continue with'), 'Must render "Continue with" buttons');
  });

  it('should NOT depend on getSocialProviders API call', () => {
    assert.ok(!source.includes('getSocialProviders'), 'Must not call getSocialProviders');
  });

  it('should NOT contain Email OTP references', () => {
    assert.ok(!source.includes('requestEmailOtp'), 'No requestEmailOtp');
    assert.ok(!source.includes('verifyEmailOtp'), 'No verifyEmailOtp');
    assert.ok(!source.includes('devOtp'), 'No devOtp');
    assert.ok(!source.includes('Email OTP'), 'No Email OTP text');
    assert.ok(!source.includes('Send OTP'), 'No Send OTP button');
  });

  it('should have OAuth URLs pointing to backend /auth/social/{provider}/start', () => {
    assert.ok(source.includes('/auth/social/google/start'), 'Google start route');
    assert.ok(source.includes('/auth/social/github/start'), 'GitHub start route');
    assert.ok(source.includes('/auth/social/linkedin/start'), 'LinkedIn start route');
    assert.ok(source.includes('/auth/social/yahoo/start'), 'Yahoo start route');
  });

  it('should show password login as secondary option', () => {
    assert.ok(source.includes('or use email'), 'Email/password divider');
    assert.ok(source.includes('type="password"'), 'Password input');
  });
});

// ─── Callback Page Tests ─────────────────────────────────────────────────────

describe('Auth callback page security', () => {
  const source = readFile('../app/auth/callback/page.tsx');

  it('should exchange handoff token instead of reading tokens from URL', () => {
    assert.ok(source.includes('exchange-handoff'), 'Must call exchange-handoff endpoint');
    assert.ok(source.includes('handoff'), 'Must read handoff param');
    // Must NOT read raw tokens from URL params
    assert.ok(
      !source.includes("searchParams.get('accessToken')"),
      'Must NOT read accessToken from URL params',
    );
    assert.ok(
      !source.includes("searchParams.get('refreshToken')"),
      'Must NOT read refreshToken from URL params',
    );
  });

  it('should handle not_configured error', () => {
    assert.ok(source.includes('not_configured'), 'Handles not_configured error');
  });

  it('should handle invalid_state error', () => {
    assert.ok(source.includes('invalid_state'), 'Handles invalid_state (CSRF) error');
  });

  it('should handle denied error', () => {
    assert.ok(source.includes('denied'), 'Handles denied error');
  });

  it('should redirect admin users to admin dashboard', () => {
    assert.ok(source.includes('/admin/settings'), 'Admin redirects to /admin/settings');
    assert.ok(source.includes('isAdmin'), 'Checks isAdmin flag');
  });

  it('should prevent double execution with ref guard', () => {
    assert.ok(source.includes('exchangedRef'), 'Has ref guard against double execution');
  });
});

// ─── Backend Controller Tests (source analysis) ─────────────────────────────

describe('SocialAuthController security', () => {
  const source = readFile('../../resume-builder-api/src/auth/social-auth.controller.ts');

  it('should validate OAuth state in callbacks', () => {
    assert.ok(source.includes('validateState'), 'Must validate state parameter');
    assert.ok(source.includes('invalid_state'), 'Must redirect on invalid state');
  });

  it('should use handoff tokens instead of raw tokens in URL', () => {
    assert.ok(source.includes('createHandoffToken'), 'Must create handoff tokens');
    assert.ok(source.includes('exchange-handoff'), 'Must have exchange-handoff endpoint');
    // The redirect in handleProviderCallback should use handoff token, not raw tokens
    const callbackSection = source.substring(source.indexOf('handleProviderCallback'));
    assert.ok(
      callbackSection.includes('handoff='),
      'Redirect must use handoff token parameter',
    );
  });

  it('should store state in Redis/memory store', () => {
    assert.ok(source.includes('oauth:state:'), 'Stores state with oauth:state: prefix');
    assert.ok(source.includes('REDIS_CLIENT'), 'Uses REDIS_CLIENT store');
  });

  it('should check all required env vars per provider, not just client ID', () => {
    assert.ok(source.includes('GOOGLE_LOGIN_CLIENT_SECRET') || source.includes('GOOGLE_CLIENT_SECRET'), 'Checks Google secret');
    assert.ok(source.includes('GOOGLE_LOGIN_REDIRECT_URI') || source.includes('GOOGLE_REDIRECT_URI'), 'Checks Google redirect URI');
    assert.ok(source.includes('GITHUB_CLIENT_SECRET'), 'Checks GitHub secret');
    assert.ok(source.includes('GITHUB_REDIRECT_URI'), 'Checks GitHub redirect URI');
    assert.ok(source.includes('requiredGroups'), 'Uses requiredGroups for env var checking');
  });

  it('should log which env vars are missing on startup', () => {
    assert.ok(source.includes('NOT CONFIGURED — missing:'), 'Logs missing vars');
    assert.ok(source.includes('SOCIAL_LOGIN_SUCCESS_URL'), 'Checks success URL');
  });
});

describe('SocialAuthService GitHub redirect_uri', () => {
  const source = readFile('../../resume-builder-api/src/auth/social-auth.service.ts');

  it('should send redirect_uri in GitHub token exchange', () => {
    const githubSection = source.substring(source.indexOf('exchangeGitHubCode'));
    assert.ok(
      githubSection.includes('redirect_uri: redirectUri'),
      'GitHub token exchange must include redirect_uri',
    );
    assert.ok(
      githubSection.includes("GITHUB_REDIRECT_URI"),
      'Must read GITHUB_REDIRECT_URI from config',
    );
  });
});
