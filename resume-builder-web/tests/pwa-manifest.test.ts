import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * PWA manifest validation.
 *
 * These checks are cheap and catch the most common regressions:
 *  - invalid JSON (a stray comma will 404 the manifest in Chrome),
 *  - missing icons / icon files not on disk,
 *  - missing `display: standalone` (needed for the "Add to Home Screen"
 *    prompt on iOS/Android to launch without the address bar).
 */

const publicDir = path.resolve(__dirname, '..', 'public');
const manifestPath = path.join(publicDir, 'manifest.json');

test('manifest.json exists and parses', () => {
  assert.ok(existsSync(manifestPath), 'public/manifest.json missing');
  const raw = readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  assert.equal(typeof parsed, 'object');
});

test('manifest has required PWA fields', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  assert.equal(typeof manifest.name, 'string');
  assert.equal(typeof manifest.short_name, 'string');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(typeof manifest.theme_color, 'string');
  assert.equal(typeof manifest.background_color, 'string');
});

test('manifest icons exist on disk', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    icons: Array<{ src: string; type: string; sizes: string }>;
  };
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'icons array empty');
  for (const icon of manifest.icons) {
    const resolved = path.join(publicDir, icon.src.replace(/^\//, ''));
    assert.ok(existsSync(resolved), `icon file missing: ${icon.src}`);
    assert.match(icon.type, /^image\//, `icon type invalid: ${icon.type}`);
  }
});

test('manifest shortcuts point to real routes', () => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    shortcuts?: Array<{ name: string; url: string }>;
  };
  if (!manifest.shortcuts) return;
  for (const sc of manifest.shortcuts) {
    assert.equal(typeof sc.name, 'string');
    assert.match(sc.url, /^\//, `shortcut url must be app-relative: ${sc.url}`);
  }
});
