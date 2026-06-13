/**
 * R-036 — single source of truth for the 5-hub nav.
 *
 * Pure data, no React. Driven by two surfaces:
 *   1. TopNav reads `NAV_HUBS` to render the five top-level links and
 *      decide which one to highlight on the current route (via
 *      `routesUnder`).
 *   2. The hub landing pages (`/applications`, `/coach`) read `tools`
 *      to render their card grid, so adding a tool to a hub is a
 *      single-line edit here.
 *
 * Canonical URLs are preserved: every entry in `routesUnder` is a
 * real route that already works. The hub system is navigational only
 * — bookmarks and SEO links keep working unchanged.
 */

export type HubKey = 'home' | 'resume' | 'applications' | 'coach' | 'account';

export type HubTool = {
  href: string;
  label: string;
  /** One-line explainer shown on the hub landing page. */
  blurb: string;
  /** When set, surfaced as a badge ("PRO", "Student+") on the card. */
  planBadge?: 'PRO' | 'STUDENT+';
};

export type Hub = {
  key: HubKey;
  label: string;
  /** Where the top-nav link points. Always a real, working route. */
  landing: string;
  /**
   * Every route this hub claims for the purpose of nav highlighting.
   * MUST include `landing`. Order is irrelevant — matched as a prefix
   * (so `/resume/versions` lights up the Resume hub via `/resume`).
   */
  routesUnder: string[];
  /**
   * Tools surfaced as cards on the hub landing page. Empty for `home`
   * and (intentionally) for `resume` — that page already has its own
   * upload/scratch UI. Populated for Applications, Coach, Account.
   */
  tools: HubTool[];
};

export const NAV_HUBS: Hub[] = [
  {
    key: 'home',
    label: 'Home',
    landing: '/',
    // Home is the EXACT match only — see isHubActive below.
    routesUnder: ['/'],
    tools: [],
  },
  {
    key: 'resume',
    label: 'Resume',
    landing: '/resume/start',
    routesUnder: [
      '/resume',                  // editor itself
      '/resume/start',
      '/resume/review',
      '/resume/template',
      '/resume/versions',
      '/resume/ats',
      '/resume/ats-simulate',
      '/templates',               // gallery
      '/templates/preview',
    ],
    tools: [
      { href: '/resume/start', label: 'Start or upload', blurb: 'Upload an existing resume or open a blank one.' },
      { href: '/resume/versions', label: 'Version history', blurb: 'Snapshots, restore points, and "what changed".' },
      { href: '/templates/preview', label: 'Templates', blurb: 'Pick an ATS-safe or visual template.' },
      { href: '/resume/ats', label: 'ATS Score', blurb: 'See whether your resume format parses cleanly.' },
      { href: '/resume/ats-simulate', label: 'ATS Simulator', blurb: 'Preview what a recruiter sees inside Workday/Greenhouse.' },
    ],
  },
  {
    key: 'applications',
    label: 'Applications',
    landing: '/applications',
    routesUnder: [
      '/applications',
      '/jobs',
      '/jd-match',
      '/recruiter-sim',
      '/resume/outcomes',
      '/cover-letter',
    ],
    tools: [
      { href: '/jobs', label: 'Job tracker', blurb: 'Kanban of every role you have applied to. Statuses + reminders.' },
      { href: '/jd-match', label: 'JD Match', blurb: 'Paste a job description, see what your resume covers and what to add.' },
      { href: '/recruiter-sim', label: 'Recruiter AI', blurb: 'See the verdict an AI hiring screen would give you against a JD.', planBadge: 'STUDENT+' },
      { href: '/resume/outcomes', label: 'Outcomes', blurb: 'Per-version response, interview, and offer rates. The moat.' },
      { href: '/cover-letter', label: 'Cover Letter', blurb: 'Tailored cover letters per JD with tone control.', planBadge: 'STUDENT+' },
    ],
  },
  {
    key: 'coach',
    label: 'Coach',
    landing: '/coach',
    routesUnder: [
      '/coach',
      '/mentor',
      '/mentor/chat',
      '/interview-prep',
      '/career',
      '/skill-demand',
      '/sahaayak',
    ],
    tools: [
      { href: '/mentor', label: 'Mentor', blurb: 'Curated tech/keyword/learning playlist for your role.', planBadge: 'STUDENT+' },
      { href: '/mentor/chat', label: 'Mentor Chat', blurb: 'Live chat with an AI mentor that knows your resume.', planBadge: 'PRO' },
      { href: '/interview-prep', label: 'Interview Prep', blurb: '8 likely questions per role with answer outlines.', planBadge: 'PRO' },
      { href: '/career', label: 'Career Navigator', blurb: 'Tech-gap and role-readiness analysis.', planBadge: 'STUDENT+' },
      { href: '/skill-demand', label: 'Skill Demand', blurb: 'Which of your skills are in demand, what to learn next, who is hiring.' },
      { href: '/sahaayak', label: 'Sahaayak', blurb: 'A quiet companion for the job-search journey.' },
    ],
  },
  {
    key: 'account',
    label: 'Account',
    landing: '/settings',
    routesUnder: ['/settings', '/billing'],
    tools: [
      { href: '/billing', label: 'Billing', blurb: 'Plan, usage, invoices, and the ₹49 micro-payment explainer.' },
      { href: '/settings', label: 'Settings', blurb: 'Training-data consent, BYOK key, public share links.' },
    ],
  },
];

/**
 * Returns the hub that owns `pathname` for the purpose of nav
 * highlighting. Home wins ONLY on the exact path '/'. Every other hub
 * matches the longest prefix in its `routesUnder` list, so e.g.
 *
 *   /resume/versions     → Resume
 *   /jd-match            → Applications
 *   /interview-prep      → Coach
 *   /sahaayak            → Coach
 *   /settings#share-links → Account
 *
 * Returns null when no hub claims the path (auth pages, admin, etc.)
 * so they don't accidentally highlight a hub.
 */
export function activeHubKey(pathname: string): HubKey | null {
  if (!pathname) return null;
  if (pathname === '/') return 'home';
  let best: { key: HubKey; len: number } | null = null;
  for (const hub of NAV_HUBS) {
    if (hub.key === 'home') continue;
    for (const route of hub.routesUnder) {
      if (route === '/') continue;
      if (pathname === route || pathname.startsWith(route + '/')) {
        if (!best || route.length > best.len) best = { key: hub.key, len: route.length };
      }
    }
  }
  return best?.key ?? null;
}
