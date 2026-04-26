'use strict';

const puppeteer = require('/home/user/ats-resume-builder/resume-builder-api/node_modules/puppeteer-core');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function makeFakeJwt() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ sub: 'a', exp: Math.floor(Date.now()/1000)+86400*30 })).toString('base64url');
  return `${header}.${payload}.x`;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: BROWSER_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((jwt) => {
    localStorage.setItem('accessToken', jwt);
    localStorage.setItem('userId', 'a');
    localStorage.setItem('userEmail', 'a@b.com');
    localStorage.setItem('sessionExpiresAt', String(Date.now() + 1000 * 60 * 60 * 24));
  }, makeFakeJwt());
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('/jobs') || req.url().includes('/auth/') || req.url().includes('/billing')) {
      return req.respond({ status: 200, contentType: 'application/json', body: '[]' });
    }
    req.continue();
  });
  await page.goto('http://localhost:3500/jobs', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));

  const result = await page.evaluate(() => {
    const win = window.innerWidth;
    const doc = document.documentElement.scrollWidth;
    const meta = document.querySelector('meta[name="viewport"]');
    const metaContent = meta ? meta.getAttribute('content') : null;

    // Find every element wider than viewport.
    const tooWide = [];
    document.querySelectorAll('*').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > win + 1 && r.width > 50) {
        tooWide.push({
          tag: el.tagName.toLowerCase(),
          id: el.id,
          cls: (el.className || '').toString().split(/\s+/).slice(0, 4).join('.'),
          width: Math.round(r.width),
          left: Math.round(r.left),
          right: Math.round(r.right),
          text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
        });
      }
    });
    return { win, doc, metaContent, tooWide: tooWide.slice(0, 20) };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
