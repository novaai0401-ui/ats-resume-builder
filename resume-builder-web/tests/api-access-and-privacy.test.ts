import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * R-096 — the MCP README and the extension options page tell users to get
 * their token from "Settings → API access". These pin that the surface those
 * docs reference actually exists (C-003: no docs pointing at a non-existent
 * feature), and that the privacy page the Chrome listing requires is real.
 */
const webRoot = path.join(__dirname, '..');
const read = (...p: string[]) => readFileSync(path.join(webRoot, ...p), 'utf-8');

test('Settings renders the API access card the MCP/extension docs point to', () => {
  const settings = read('app', 'settings', 'SettingsPageView.tsx');
  assert(settings.includes('ApiAccessCard'), 'Settings must render <ApiAccessCard />');

  const card = read('src', 'components', 'ApiAccessCard.tsx');
  assert(/API access/i.test(card), 'card is titled "API access" to match the docs');
  assert(card.includes('POCKET_RESUME_TOKEN'), 'card names the env var the MCP config expects');
  assert(card.includes('@tekivex/callbackcv-mcp'), 'card links the MCP package');
  assert(/expires/i.test(card), 'card is honest that the token expires (~7 days)');
});

test('privacy policy page exists and covers the extension + MCP data flow', () => {
  const privacy = read('app', 'privacy', 'page.tsx');
  assert(/extension/i.test(privacy), 'privacy policy covers the browser extension');
  assert(/MCP/i.test(privacy), 'privacy policy covers the MCP server');
  assert(/do not sell your data/i.test(privacy), 'privacy policy states no data sale');
  assert(privacy.includes("canonical: '/privacy'"), 'privacy page is canonical at /privacy');
});
