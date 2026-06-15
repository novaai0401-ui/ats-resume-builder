const assert = require('node:assert/strict');
const test = require('node:test');

const sharedPromise = import('../dist/index.js');

test('resolveDesign defaults to system-sans / normal with isDefault=true', async () => {
  const { resolveDesign } = await sharedPromise;
  const r = resolveDesign(null);
  assert.equal(r.fontId, 'system-sans');
  assert.equal(r.fontStack, null);
  assert.equal(r.density, 'normal');
  assert.equal(r.fontScale, 1);
  assert.equal(r.isDefault, true);
});

test('resolveDesign coerces unknown font/density to defaults', async () => {
  const { resolveDesign } = await sharedPromise;
  const r = resolveDesign({ fontFamily: 'not-a-font', density: 'huge' });
  assert.equal(r.fontId, 'system-sans');
  assert.equal(r.density, 'normal');
  assert.equal(r.isDefault, true);
});

test('resolveDesign resolves a known font + density', async () => {
  const { resolveDesign } = await sharedPromise;
  const r = resolveDesign({ fontFamily: 'inter', density: 'compact' });
  assert.equal(r.fontId, 'inter');
  assert.match(r.fontStack, /Inter/);
  assert.equal(r.density, 'compact');
  assert.equal(r.fontScale, 0.92);
  assert.equal(r.lineHeight, 1.3);
  assert.equal(r.isDefault, false);
});

test('designCssVars emits {} when default (zero-regression guarantee)', async () => {
  const { designCssVars } = await sharedPromise;
  assert.deepEqual(designCssVars(null), {});
  assert.deepEqual(designCssVars({ fontFamily: 'system-sans', density: 'normal' }), {});
});

test('designCssVars emits only the vars that differ from default', async () => {
  const { designCssVars } = await sharedPromise;
  const vars = designCssVars({ fontFamily: 'inter', density: 'airy' });
  assert.match(vars['--rb-font'], /Inter/);
  assert.equal(vars['--rb-fs-scale'], '1.08');
  assert.equal(vars['--rb-lh'], '1.55');
});

test('designCssVars omits scale/lh when density is normal', async () => {
  const { designCssVars } = await sharedPromise;
  const vars = designCssVars({ fontFamily: 'lato', density: 'normal' });
  assert.match(vars['--rb-font'], /Lato/);
  assert.equal(vars['--rb-fs-scale'], undefined);
  assert.equal(vars['--rb-lh'], undefined);
});

test('normalizeAccentColor validates and lowercases hex; rejects junk', async () => {
  const { normalizeAccentColor } = await sharedPromise;
  assert.equal(normalizeAccentColor('#2563A8'), '#2563a8');
  assert.equal(normalizeAccentColor('#fff'), '#fff');
  assert.equal(normalizeAccentColor('  #1A2E4A  '), '#1a2e4a');
  assert.equal(normalizeAccentColor('red'), null);
  assert.equal(normalizeAccentColor('2563a8'), null);
  assert.equal(normalizeAccentColor(''), null);
  assert.equal(normalizeAccentColor(null), null);
});

test('accentColor flows into resolveDesign and emits --rb-accent', async () => {
  const { resolveDesign, designCssVars } = await sharedPromise;
  const r = resolveDesign({ accentColor: '#0F766E' });
  assert.equal(r.accentColor, '#0f766e');
  assert.equal(r.isDefault, false);
  assert.equal(designCssVars({ accentColor: '#0F766E' })['--rb-accent'], '#0f766e');
});

test('invalid accentColor alone keeps the design default (no vars)', async () => {
  const { designCssVars } = await sharedPromise;
  assert.deepEqual(designCssVars({ accentColor: 'not-a-color' }), {});
});

test('normalizePhotoUrl accepts only base64 image data URIs', async () => {
  const { normalizePhotoUrl } = await sharedPromise;
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  assert.equal(normalizePhotoUrl(png), png);
  assert.equal(normalizePhotoUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');
  // rejects remote URLs, svg, non-image, junk, empty
  assert.equal(normalizePhotoUrl('https://evil.example/x.png'), null);
  assert.equal(normalizePhotoUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(normalizePhotoUrl('data:text/html;base64,PGI+'), null);
  assert.equal(normalizePhotoUrl('not a url'), null);
  assert.equal(normalizePhotoUrl(''), null);
  assert.equal(normalizePhotoUrl(null), null);
});

test('normalizePhotoUrl rejects oversize data URIs', async () => {
  const { normalizePhotoUrl, MAX_PHOTO_DATA_URI_LENGTH } = await sharedPromise;
  const huge = 'data:image/png;base64,' + 'A'.repeat(MAX_PHOTO_DATA_URI_LENGTH);
  assert.equal(normalizePhotoUrl(huge), null);
});

test('templateSupportsPhoto only for the visual templates', async () => {
  const { templateSupportsPhoto } = await sharedPromise;
  assert.equal(templateSupportsPhoto('sidebar-bold'), true);
  assert.equal(templateSupportsPhoto('accent-header'), true);
  assert.equal(templateSupportsPhoto('classic'), false);
  assert.equal(templateSupportsPhoto('creative'), false);
  assert.equal(templateSupportsPhoto(''), false);
  assert.equal(templateSupportsPhoto(null), false);
});

test('designCssText serializes vars to an inline style fragment', async () => {
  const { designCssText } = await sharedPromise;
  assert.equal(designCssText(null), '');
  const text = designCssText({ fontFamily: 'merriweather', density: 'compact' });
  assert.match(text, /--rb-font: .*Merriweather/);
  assert.match(text, /--rb-fs-scale: 0\.92/);
});
