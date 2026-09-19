import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import sitemap from '@/app/sitemap';

/**
 * R-110 — public pages must be findable as themselves.
 *
 * The root layout sets `alternates: { canonical: '/' }` and Next merges
 * metadata, so every page WITHOUT its own override told Google it was the
 * home page. The landers competed with the home page instead of ranking
 * for their own queries. Separately the sitemap listed authenticated
 * tools, omitted /privacy, and stamped every URL as modified right now.
 */

const appDir = path.join(__dirname, '..', 'app');

/** Public landing pages that must each own their canonical. */
const PUBLIC_LANDERS = [
  'download',
  'templates/preview',
  'interview-prep',
  'jd-match',
  'linkedin',
  'mentor',
  'compare',
  'pricing',
  'ats-resume-checker',
];

test('every public landing page declares its own canonical', () => {
  for (const route of PUBLIC_LANDERS) {
    const file = path.join(appDir, route, 'page.tsx');
    assert.ok(existsSync(file), `${route}/page.tsx should exist`);
    const source = readFileSync(file, 'utf-8');
    assert.match(
      source,
      /alternates:\s*\{\s*canonical:/,
      `${route} inherits canonical '/' from the layout and self-canonicalises to the home page`,
    );
  }
});

test('authenticated utilities are noindex, not canonicalised landing pages', () => {
  for (const route of ['applications', 'coach']) {
    const source = readFileSync(path.join(appDir, route, 'page.tsx'), 'utf-8');
    assert.match(source, /robots:\s*\{\s*index:\s*false/, `${route} is behind auth and must not be indexed`);
  }
});

test('the sitemap lists no authenticated tools', () => {
  const urls = sitemap().map((entry) => entry.url);
  // Both render a session-check shell and redirect signed-out visitors,
  // so they were spending crawl budget to show a redirect.
  for (const gated of ['/career', '/skill-demand']) {
    assert.ok(
      !urls.some((u) => u.endsWith(gated)),
      `${gated} is auth-gated and must not be in the sitemap`,
    );
  }
});

test('the sitemap includes the privacy policy', () => {
  const urls = sitemap().map((entry) => entry.url);
  assert.ok(
    urls.some((u) => u.endsWith('/privacy')),
    'the page describing what we do with resumes and training data belongs in the sitemap',
  );
});

test('lastModified is not "now" for every URL on every request', () => {
  const entries = sitemap();
  const now = Date.now();
  const freshCount = entries.filter(
    (e) => e.lastModified && Math.abs(now - +new Date(e.lastModified)) < 60_000,
  ).length;
  assert.equal(
    freshCount,
    0,
    'a sitemap claiming the whole site changed this minute teaches crawlers to ignore the field',
  );
});

test('every sitemap URL is absolute and unique', () => {
  const urls = sitemap().map((e) => e.url);
  for (const url of urls) {
    assert.match(url, /^https?:\/\//, `${url} must be absolute`);
  }
  assert.equal(new Set(urls).size, urls.length, 'duplicate URLs split ranking signals');
});
