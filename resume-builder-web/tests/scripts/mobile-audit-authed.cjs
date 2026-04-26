'use strict';

/**
 * Mobile UX audit — authenticated paths. Plants a fake JWT in localStorage
 * before navigating so AuthGate stops redirecting to /auth/login. The fake
 * JWT also has a future `exp` so the heartbeat doesn't immediately expire.
 *
 * For each page we also stub the API client's fetch calls so the page
 * renders empty-state UI deterministically (no real backend required).
 */

const puppeteer = require('/home/user/ats-resume-builder/resume-builder-api/node_modules/puppeteer-core');

const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE_URL = process.argv[2] || 'http://localhost:3500';

// Minimal valid JWT (header.payload.signature) — payload sets exp ~1 year out.
function makeFakeJwt() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'audit-user', email: 'audit@example.com', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 }),
  ).toString('base64url');
  return `${header}.${payload}.fake-sig`;
}

const VIEWPORTS = [
  { name: 'iPhone-SE-375', width: 375, height: 667 },
  { name: 'Galaxy-S8-360', width: 360, height: 740 },
];

const SCENARIOS = [
  {
    path: '/jobs',
    name: 'Jobs (empty)',
    stubs: {
      '/jobs': [],
      '/jobs/stats': { total: 0, active: 0, closed: 0, byStatus: { wishlist: 0, applied: 0, phone_screen: 0, interview: 0, offer: 0, rejected: 0, withdrawn: 0 }, responseRate: 0, offerRate: 0 },
    },
  },
  {
    path: '/jobs',
    name: 'Jobs (with data)',
    stubs: {
      '/jobs': [
        { id: 'j1', userId: 'u', company: 'Acme Corporation Limited', role: 'Senior Software Engineer', jdUrl: null, jdText: null, location: 'Remote', salaryRange: '$150k', status: 'applied', source: 'linkedin', referral: null, resumeId: null, coverLetterId: null, notes: null, nextActionAt: new Date(Date.now() + 86400_000 * 2).toISOString(), appliedAt: new Date().toISOString(), closedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: 'j2', userId: 'u', company: 'Globex Industries Worldwide Inc', role: 'Staff Engineer (Platform Infrastructure)', jdUrl: null, jdText: null, location: 'Bangalore, India', salaryRange: '₹50L', status: 'interview', source: 'referral', referral: 'Jane', resumeId: null, coverLetterId: null, notes: null, nextActionAt: null, appliedAt: new Date().toISOString(), closedAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ],
    },
    afterLoadAction: 'open-new-modal',
  },
  {
    path: '/cover-letter',
    name: 'Cover Letter (empty)',
    stubs: { '/resumes': [], '/ai/cover-letters': [] },
  },
  {
    path: '/cover-letter',
    name: 'Cover Letter (with data)',
    stubs: {
      '/resumes': [{ id: 'r1', userId: 'u', title: 'Software Engineer Resume', summary: '', skills: [], experience: [], education: [] }],
      '/ai/cover-letters': [
        { id: 'cl1', userId: 'u', resumeId: 'r1', company: 'Acme', role: 'SWE', jdText: null, tone: 'professional', body: 'Dear Hiring Team,\n\nI am applying for the Senior SWE role.\n\nSincerely,\nMe', wordCount: 80, provider: 'groq', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ],
    },
  },
  {
    path: '/resume/versions',
    name: 'Versions (empty)',
    stubs: { '/resumes': [{ id: 'r1', userId: 'u', title: 'My Resume' }], '/resumes/r1/versions': [] },
  },
  {
    path: '/resume/versions',
    name: 'Versions (with data)',
    stubs: {
      '/resumes': [{ id: 'r1', userId: 'u', title: 'My Resume' }],
      '/resumes/r1/versions': [
        { id: 'v1', resumeId: 'r1', label: 'Pre-AI rewrite', atsScoreSnapshot: 78, createdAt: new Date().toISOString() },
        { id: 'v2', resumeId: 'r1', label: 'A really long label that should wrap on a small screen if it is too aggressive', atsScoreSnapshot: 65, createdAt: new Date(Date.now() - 86400_000).toISOString() },
        { id: 'v3', resumeId: 'r1', label: null, atsScoreSnapshot: null, createdAt: new Date(Date.now() - 86400_000 * 2).toISOString() },
      ],
    },
  },
];

async function measure(page) {
  return page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;

    function isVisible(el) {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    }

    const interactives = Array.from(
      document.querySelectorAll('button, a, input, select, textarea, [role="button"]'),
    ).filter(isVisible);

    const smallTargets = interactives
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        cls: (el.className || '').toString().split(/\s+/).slice(0, 3).join('.'),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      }))
      .filter((t) => t.height > 0 && t.height < 38);

    const overflowingInputs = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(isVisible)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        right: Math.round(el.getBoundingClientRect().right),
        width: Math.round(el.getBoundingClientRect().width),
      }))
      .filter((el) => el.right > window.innerWidth + 1);

    const overflowingBlocks = Array.from(document.querySelectorAll('main, section, .card, .kanban, .versions-controls, .form-grid, .modal'))
      .filter(isVisible)
      .map((el) => ({
        sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
        right: Math.round(el.getBoundingClientRect().right),
      }))
      .filter((b) => b.right > window.innerWidth + 1)
      .slice(0, 4);

    return {
      docWidth,
      winWidth,
      horizontalOverflow: Math.max(0, docWidth - winWidth),
      smallTargets,
      overflowingInputs,
      overflowingBlocks,
    };
  });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const summary = [];
  const fakeJwt = makeFakeJwt();

  for (const vp of VIEWPORTS) {
    for (const scenario of SCENARIOS) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

      // Plant the auth tokens before any script runs.
      await page.evaluateOnNewDocument((jwt) => {
        try {
          localStorage.setItem('accessToken', jwt);
          localStorage.setItem('refreshToken', jwt);
          localStorage.setItem('userId', 'audit-user');
          localStorage.setItem('userEmail', 'audit@example.com');
          localStorage.setItem('sessionExpiresAt', String(Date.now() + 1000 * 60 * 60 * 24 * 30));
          localStorage.setItem('sessionLastActivityAt', String(Date.now()));
        } catch {}
      }, fakeJwt);

      // Intercept BACKEND API requests only (localhost:4001) so the page
      // can't hang on real fetches. We pass everything else — page HTML,
      // RSC prefetches, JS chunks, fonts — through to the Next server.
      // Stubbing RSC prefetches with empty bodies confuses React's
      // reconciler and triggers a re-render that wipes the <head> meta.
      await page.setRequestInterception(true);
      const stubs = scenario.stubs || {};
      page.on('request', (req) => {
        const url = req.url();
        // Only stub backend API URLs, never the Next server's own routes.
        if (url.includes('localhost:4001')) {
          // Match the configured stubs against the path tail.
          for (const [key, body] of Object.entries(stubs)) {
            if (url.endsWith(key)) {
              return req.respond({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(body),
              });
            }
          }
          // Default backend response: empty list.
          return req.respond({ status: 200, contentType: 'application/json', body: '[]' });
        }
        req.continue();
      });

      try {
        await page.goto(`${BASE_URL}${scenario.path}`, { waitUntil: 'networkidle0', timeout: 20000 });
        await new Promise((r) => setTimeout(r, 700));
      } catch (err) {
        summary.push({ vp: vp.name, scenario: scenario.name, err: err.message });
        await page.close();
        continue;
      }

      // Optional post-load action (open modals etc).
      if (scenario.afterLoadAction === 'open-new-modal') {
        try {
          // Click "+ New Application" button
          await page.evaluate(() => {
            const btn = Array.from(document.querySelectorAll('button')).find((b) => /New Application/i.test(b.textContent || ''));
            if (btn) btn.click();
          });
          await new Promise((r) => setTimeout(r, 400));
        } catch {}
      }

      const m = await measure(page);
      summary.push({ vp: vp.name, scenario: scenario.name, path: scenario.path, ...m });
      await page.close();
    }
  }

  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
