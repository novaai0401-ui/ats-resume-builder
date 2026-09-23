import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://callbackcv.tekivex.com';

/**
 * /robots.txt — keep crawlers out of authenticated routes (which 401
 * for them anyway, but explicit is better than implicit) and away from
 * any debug surfaces. Allow everything else.
 */

const ALLOW = [
  '/',
  '/auth/login',
  '/auth/register',
  '/templates',
  '/ats-resume-templates',
  '/ats-resume-checker',
  '/resume-builder-india',
  '/compare',
  '/career',
  '/download',
  '/ai-assistants',
  '/llms.txt',
  '/llms-full.txt',
];

const DISALLOW = [
  '/dashboard',
  '/resume/',
  '/jobs',
  '/cover-letter',
  '/settings',
  '/admin',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/callback',
  '/billing',
  '/api/',
];

/**
 * R-126 — the assistant crawlers, named.
 *
 * The wildcard rule below already permits every one of these, so this changes
 * NO bot's effective access. What it changes is that the policy is stated:
 * a reader can see which assistants are welcome instead of inferring it from
 * the absence of a rule, and switching one off later has to be a deliberate
 * edit rather than a side effect of tightening the wildcard.
 *
 * Two distinct jobs behind these names, and we want both:
 *   - training/index crawlers (GPTBot, ClaudeBot, Google-Extended)
 *   - retrieval-time fetchers that power citations in answers
 *     (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User,
 *     PerplexityBot)
 * The second group is how /llms.txt and /ai-assistants reach a user who asks
 * an assistant for a resume tool, so blocking them to "protect content" would
 * cost exactly the distribution R-126 exists to build.
 *
 * The disallow list applies to them too. Robots rules are not access control
 * (R-110) — the authenticated routes 401 regardless — but a well-behaved
 * crawler should not be pulling /dashboard, and a crawler that ignores this
 * was never going to respect a wildcard either.
 */
const ASSISTANT_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: ALLOW, disallow: DISALLOW },
      ...ASSISTANT_CRAWLERS.map((userAgent) => ({ userAgent, allow: ALLOW, disallow: DISALLOW })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
