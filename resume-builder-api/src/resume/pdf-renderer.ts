import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer-core';
import { existsSync } from 'fs';
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Resilient HTML→PDF renderer shared by every export path (paid export,
 * share-link, and R-073 recovery resend).
 *
 * Why this exists: previously each export called `puppeteer.launch()` and
 * `browser.close()` per request with no concurrency cap and no timeouts.
 * Under even light concurrency on Render's memory-constrained starter that
 * cold-launches N Chromium processes → OOM kill / hung renders, and a hung
 * `setContent`/`page.pdf()` had no ceiling. This module:
 *
 *   • reuses ONE shared browser (lazy-launched, auto-relaunched if it dies);
 *   • caps concurrent renders with a small semaphore so we never fan out
 *     more Chromium work than the box can hold;
 *   • puts hard timeouts on navigation and PDF generation so a pathological
 *     resume can't pin a worker forever;
 *   • always closes the page it opened, even on error.
 */

const IS_SERVERLESS = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

function intFromEnv(name: string, fallback: number): number {
  const n = parseInt(String(process.env[name] ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Max Chromium pages rendering at once. Small on purpose (memory). */
const MAX_CONCURRENT_RENDERS = intFromEnv('PDF_MAX_CONCURRENCY', 2);
/** Ceiling for loading the HTML into the page. */
const SET_CONTENT_TIMEOUT_MS = intFromEnv('PDF_SETCONTENT_TIMEOUT_MS', 20_000);
/** Ceiling for the actual PDF print. */
const PDF_TIMEOUT_MS = intFromEnv('PDF_RENDER_TIMEOUT_MS', 20_000);
/** How long a render may wait for a free concurrency slot before giving up. */
const QUEUE_TIMEOUT_MS = intFromEnv('PDF_QUEUE_TIMEOUT_MS', 25_000);

async function resolveChromeLaunchOptions(): Promise<LaunchOptions> {
  if (IS_SERVERLESS) {
    try {
      const chromium = (await import('@sparticuz/chromium')).default;
      return {
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: true,
      };
    } catch {
      console.warn('[pdf-export] @sparticuz/chromium not available, falling back to local Chrome');
    }
  }
  const chromePath = resolveLocalChromePath();
  return {
    headless: true,
    // --disable-dev-shm-usage is required on Alpine / Render where /dev/shm
    // is ~64MB; without it Chromium crashes mid-render on multi-page resumes.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    ...(chromePath ? { executablePath: chromePath } : {}),
  };
}

function resolveLocalChromePath(): string | undefined {
  const envPath = process.env.CHROME_EXECUTABLE_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  const candidates: string[] = isWin
    ? [
        `${process.env.PROGRAMFILES || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.LOCALAPPDATA || ''}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.PROGRAMFILES || 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ]
    : isMac
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : [
          '/usr/bin/google-chrome-stable',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium-browser',
          '/usr/bin/chromium',
          '/snap/bin/chromium',
        ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  return undefined;
}

// ── Shared browser (lazy, self-healing) ─────────────────────────────────

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      // `connected` is true on a live puppeteer Browser; treat anything
      // else (undefined on a test stub, false on a dead browser) as stale.
      if (existing && existing.connected) return existing;
    } catch {
      // fall through to relaunch
    }
    browserPromise = null;
  }
  browserPromise = (async () => {
    const launchOptions = await resolveChromeLaunchOptions();
    try {
      const browser = await puppeteer.launch(launchOptions);
      // `.on` is absent on lightweight test stubs — guard it so a partial
      // browser object can never crash the render path.
      if (typeof (browser as { on?: unknown }).on === 'function') {
        browser.on('disconnected', () => {
          // Drop the cached handle so the next render relaunches cleanly.
          browserPromise = null;
        });
      }
      return browser;
    } catch (launchError) {
      browserPromise = null;
      const hint = launchOptions.executablePath
        ? `Tried Chrome at: ${launchOptions.executablePath}`
        : 'No Chrome/Chromium found. Install Chrome or set CHROME_EXECUTABLE_PATH env variable.';
      console.error(`[pdf-export] Chrome launch failed. ${hint}`, launchError);
      throw new HttpException(
        `PDF generation unavailable: Chrome browser not found. ${hint}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  })();
  return browserPromise;
}

// ── Concurrency semaphore ───────────────────────────────────────────────

let active = 0;
const waiters: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (active < MAX_CONCURRENT_RENDERS) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(grant);
      if (idx >= 0) waiters.splice(idx, 1);
      reject(
        new HttpException(
          'The export service is busy right now. Please try again in a moment.',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );
    }, QUEUE_TIMEOUT_MS);
    const grant = () => {
      clearTimeout(timer);
      active += 1;
      resolve();
    };
    waiters.push(grant);
  });
}

function releaseSlot(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

const PDF_MARGIN = { top: '15mm', bottom: '15mm', left: '15mm', right: '15mm' } as const;

/**
 * Render finished HTML to a PDF buffer. Concurrency-capped, timed out, and
 * backed by a shared browser. Throws an HTTP 503 on Chrome-unavailable or
 * when the box is too busy; re-throws render errors for the caller.
 */
export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  await acquireSlot();
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'networkidle0', timeout: SET_CONTENT_TIMEOUT_MS });
      const buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: PDF_MARGIN,
        timeout: PDF_TIMEOUT_MS,
      });
      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as unknown as ArrayBuffer);
    } finally {
      // `close` is absent on lightweight test stubs — guard it.
      if (typeof (page as { close?: unknown }).close === 'function') {
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    releaseSlot();
  }
}

/** Test/observability hook — current in-flight + queued render counts. */
export function pdfRendererStats(): { active: number; queued: number; maxConcurrency: number } {
  return { active, queued: waiters.length, maxConcurrency: MAX_CONCURRENT_RENDERS };
}
