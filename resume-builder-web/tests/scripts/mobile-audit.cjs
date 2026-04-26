'use strict';

/**
 * Mobile UX audit. Loads each new page at iPhone-SE width (375px) and at
 * a tighter phone width (360px) to catch:
 * - horizontal scroll (page wider than viewport)
 * - touch targets smaller than 40px
 * - form inputs that overflow
 * - text that's smaller than 14px
 *
 * Usage: node mobile-audit.cjs http://localhost:3500
 */

const puppeteer = require('/home/user/ats-resume-builder/resume-builder-api/node_modules/puppeteer-core');

const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const BASE_URL = process.argv[2] || 'http://localhost:3500';

const VIEWPORTS = [
  { name: 'iPhone-SE', width: 375, height: 667 },
  { name: 'Galaxy-S8',  width: 360, height: 740 },
];

const ROUTES = [
  { path: '/auth/login',            name: 'Login' },
  { path: '/auth/forgot-password',  name: 'Forgot password' },
  { path: '/auth/reset-password',   name: 'Reset password' },
  { path: '/jobs',                  name: 'Jobs (auth-gated, will show loading)' },
  { path: '/cover-letter',          name: 'Cover Letter (auth-gated)' },
  { path: '/resume/versions',       name: 'Resume Versions (auth-gated)' },
  { path: '/dashboard',             name: 'Dashboard (auth-gated)' },
];

// Route → list of CSS selectors we want to render before measuring.
// For auth-gated routes the AuthGate redirects, so we measure only the
// AuthGate fallback layout.
async function measure(page, viewport) {
  return page.evaluate(() => {
    const docWidth  = document.documentElement.scrollWidth;
    const winWidth  = window.innerWidth;
    const horizontalOverflow = Math.max(0, docWidth - winWidth);

    // Find every interactive element that is visible.
    function isVisible(el) {
      const r = el.getBoundingClientRect();
      const cs = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 &&
        cs.visibility !== 'hidden' && cs.display !== 'none';
    }
    const interactives = Array.from(
      document.querySelectorAll('button, a, input, select, textarea, [role="button"]'),
    ).filter(isVisible);

    const smallTargets = interactives
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          name: el.getAttribute('name') || '',
          type: el.getAttribute('type') || '',
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
          width: Math.round(r.width),
          height: Math.round(r.height),
        };
      })
      .filter((t) => t.height > 0 && t.height < 40);

    // Form inputs that overflow the viewport.
    const overflowingInputs = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(isVisible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), id: el.id || '', right: Math.round(r.right), width: Math.round(r.width) };
      })
      .filter((el) => el.right > window.innerWidth + 1);

    // Tiny body text (excluding muted captions).
    const smallText = Array.from(document.querySelectorAll('p, li, label, span, div'))
      .filter(isVisible)
      .map((el) => {
        const cs = window.getComputedStyle(el);
        const fs = parseFloat(cs.fontSize);
        const text = (el.textContent || '').trim();
        return { fs, text: text.slice(0, 60) };
      })
      .filter((x) => x.text && x.text.length > 8 && x.fs > 0 && x.fs < 12)
      .slice(0, 6);

    // Detect any element that overflows horizontally (wider than viewport width).
    const overflowingBlocks = Array.from(document.querySelectorAll('main, section, .card, .kanban, .versions-controls, .form-grid'))
      .filter(isVisible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').join('.') : ''), width: Math.round(r.width), right: Math.round(r.right) };
      })
      .filter((b) => b.right > window.innerWidth + 1)
      .slice(0, 4);

    return {
      docWidth,
      winWidth,
      horizontalOverflow,
      smallTargets,
      overflowingInputs,
      smallText,
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

  for (const vp of VIEWPORTS) {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const url = `${BASE_URL}${route.path}`;
      try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
        // Some pages render an AuthGate skeleton; give it 600ms to settle.
        await new Promise((r) => setTimeout(r, 600));
      } catch (err) {
        summary.push({ vp: vp.name, route: route.path, err: err.message });
        await page.close();
        continue;
      }
      const m = await measure(page, vp);
      summary.push({ vp: vp.name, route: route.path, ...m });
      await page.close();
    }
  }

  await browser.close();
  console.log(JSON.stringify(summary, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
