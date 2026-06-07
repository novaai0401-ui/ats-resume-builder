import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyDevice, isInstallTargetDevice } from '../src/lib/device';

// The TopNav uses this to hide the "Download App" link on desktop —
// pointing a desktop user at a Play / App Store install they can't
// do anything useful with is confusing. These tests pin the
// classification for the major real-world UAs.

test('iPhone Safari classifies as mobile', () => {
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.equal(classifyDevice(ua, 390), 'mobile');
});

test('Android Chrome on a phone classifies as mobile', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
  assert.equal(classifyDevice(ua, 412), 'mobile');
});

test('iPad classifies as tablet on the legacy iPad UA', () => {
  const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  assert.equal(classifyDevice(ua, 1024), 'tablet');
});

test('Android tablet classifies as tablet', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 14; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
  assert.equal(classifyDevice(ua, 1280), 'tablet');
});

test('desktop Chrome classifies as desktop', () => {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  assert.equal(classifyDevice(ua, 1440), 'desktop');
});

test('desktop Firefox on Windows classifies as desktop', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0';
  assert.equal(classifyDevice(ua, 1920), 'desktop');
});

test('empty UA returns "unknown" (SSR / pre-hydration)', () => {
  assert.equal(classifyDevice(''), 'unknown');
  assert.equal(classifyDevice(null), 'unknown');
  assert.equal(classifyDevice(undefined), 'unknown');
});

test('falls back to width when UA has no platform hint', () => {
  // A custom in-app webview UA with nothing recognisable in it.
  const ua = 'CustomEmbeddedWebView/1.0';
  assert.equal(classifyDevice(ua, 360), 'mobile');
  assert.equal(classifyDevice(ua, 900), 'tablet');
  assert.equal(classifyDevice(ua, 1440), 'desktop');
});

test('isInstallTargetDevice returns true for phones and tablets only', () => {
  assert.equal(isInstallTargetDevice('mobile'), true);
  assert.equal(isInstallTargetDevice('tablet'), true);
  assert.equal(isInstallTargetDevice('desktop'), false);
  assert.equal(isInstallTargetDevice('unknown'), false);
});
