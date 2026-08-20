import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Whole-app link wiring: every internal link the code emits must resolve to a
 * route that exists, and every public marketing page must have at least one
 * inbound link (a sitemap-only page gets crawled late or never, and a linked
 * 404 is a dead end a founder finds by clicking — /security on the download
 * page shipped exactly that way and sat broken until audited).
 */

const ROOT = process.cwd();

function collectRoutes(): string[] {
  const routes: string[] = [];
  const walk = (dir: string, seg: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full, `${seg}/${e.name}`);
      else if (e.name === 'page.tsx' || e.name === 'route.ts') routes.push(seg || '/');
    }
  };
  walk(join(ROOT, 'app'), '');
  return routes;
}

function collectLinks(): Map<string, string[]> {
  const links = new Map<string, string[]>();
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(tsx?|jsx?)$/.test(e.name)) continue;
      const text = readFileSync(full, 'utf8');
      const rel = relative(ROOT, full).replace(/\\/g, '/');
      const found: string[] = [];
      // JSX attributes, data-driven objects, imperative navigation, redirects.
      for (const m of text.matchAll(/href="(\/[^"#?]*)/g)) found.push(m[1]);
      for (const m of text.matchAll(/href:\s*'(\/[^'#?]*)/g)) found.push(m[1]);
      for (const m of text.matchAll(/href=\{`(\/[^`$#?]*)/g)) found.push(m[1]);
      for (const m of text.matchAll(/router\.push\(\s*['`](\/[^'`$#?]*)/g)) found.push(m[1]);
      for (const m of text.matchAll(/redirect\(\s*'(\/[^'#?]*)/g)) found.push(m[1]);
      for (const href of found) {
        const clean = href.replace(/\/$/, '') || '/';
        if (clean.startsWith('/api') || clean.startsWith('/icons') || clean.includes('.')) continue;
        const list = links.get(clean) ?? [];
        if (!list.includes(rel)) list.push(rel);
        links.set(clean, list);
      }
    }
  };
  walk(join(ROOT, 'app'));
  walk(join(ROOT, 'src'));
  return links;
}

const routes = collectRoutes();
const links = collectLinks();
const matchers = routes.map((r) => ({
  route: r,
  re: new RegExp('^' + r.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\/\\\[[^\]]+\\\]/g, '/[^/]+') + '/?$'),
}));

test('every internal link resolves to an existing route', () => {
  const broken: string[] = [];
  for (const [href, files] of links) {
    const ok =
      matchers.some((m) => m.re.test(href)) ||
      // Template-literal prefixes truncate at ${ — accept when a dynamic route
      // starts with the same prefix.
      routes.some(
        (r) => r.includes('[') && href !== '/' && href.startsWith(r.slice(0, r.indexOf('[')).replace(/\/$/, '')),
      );
    if (!ok) broken.push(`${href}  (from ${files.slice(0, 2).join(', ')})`);
  }
  assert.deepEqual(broken, [], `links with no matching route:\n  ${broken.join('\n  ')}`);
});

test('every public marketing page has at least one inbound link', () => {
  // Auth-gated app surfaces are reached through login flows, not marketing
  // links, so they are out of scope here.
  const AUTHED =
    /^(\/dashboard|\/resume|\/jobs|\/settings|\/billing|\/admin|\/contacts|\/cover-letter|\/recruiter-sim|\/sahaayak|\/applications|\/coach|\/linkedin|\/jd-match|\/interview-prep|\/mentor|\/career|\/skill-demand|\/auth|\/p$)/;
  const orphans = routes.filter((r) => {
    if (r === '/' || r.includes('[') || AUTHED.test(r)) return false;
    if (/(sitemap|robots|manifest|llms|opengraph|icon)/.test(r)) return false;
    return !links.has(r);
  });
  assert.deepEqual(orphans, [], `public pages nothing links to:\n  ${orphans.join('\n  ')}`);
});
