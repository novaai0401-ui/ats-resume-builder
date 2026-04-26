'use strict';
const puppeteer = require('/home/user/ats-resume-builder/resume-builder-api/node_modules/puppeteer-core');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

function jwt() {
  const h = Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const p = Buffer.from(JSON.stringify({sub:'a',exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');
  return `${h}.${p}.x`;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: BROWSER_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.evaluateOnNewDocument((t) => {
    localStorage.setItem('accessToken', t);
    localStorage.setItem('userId', 'a');
  }, jwt());
  page.on('console', (msg) => console.log(`[${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message));
  page.on('requestfailed', (req) => console.log('[reqfail]', req.url(), req.failure()?.errorText));

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (req.url().includes('/jobs') || req.url().includes('/auth/') || req.url().includes('/billing')) {
      return req.respond({ status: 200, contentType: 'application/json', body: '[]' });
    }
    req.continue();
  });

  await page.goto('http://localhost:3500/jobs', { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 800));
  const meta = await page.evaluate(() => {
    const m = document.querySelector('meta[name="viewport"]');
    return { content: m ? m.getAttribute('content') : null, doc: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  console.log('viewport meta:', JSON.stringify(meta));
  await browser.close();
})();
