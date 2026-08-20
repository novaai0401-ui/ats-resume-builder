import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { computePreviewScale, TEMPLATE_PAGE_WIDTH, TEMPLATE_PAGE_HEIGHT } from '../src/components/TemplatePreviewFrame';

const renderPath = path.join(__dirname, '..', 'src', 'components', 'ResumeTemplateRender.tsx');
const catalogGridPath = path.join(__dirname, '..', 'src', 'components', 'templates', 'TemplateCatalogGrid.tsx');
const templateSelectionPath = path.join(__dirname, '..', 'app', 'resume', 'template', 'TemplateSelectionView.tsx');
const globalsPath = path.join(__dirname, '..', 'app', 'globals.css');

// ── Issue 1: Template thumbnails must show actual readable resume content ──

test('thumbnail mode scales the whole page through TemplatePreviewFrame (R-094)', () => {
  const src = readFileSync(renderPath, 'utf-8');
  // R-094 contract: thumbnails are true miniatures of the ENTIRE resume, so
  // there is no longer a separate no-frame thumbnail branch that renders
  // TemplatePreview at natural width and top-crops it. Both modes render the
  // full page through TemplatePreviewFrame (which scales it to fit), keeping
  // TemplatePreview wrapped by exactly one frame.
  assert(
    !src.includes("if (mode === 'thumbnail')"),
    'The old no-frame thumbnail branch must be gone — thumbnails now scale the whole page',
  );
  const previewCount = (src.match(/<TemplatePreview\b/g) || []).length;
  const frameCount = (src.match(/<TemplatePreviewFrame/g) || []).length;
  assert(
    previewCount >= 1 && previewCount === frameCount,
    `Every TemplatePreview should be wrapped in a frame (${previewCount} previews vs ${frameCount} frames)`,
  );
});

test('thumbnail renders the actual template component (same as live preview)', () => {
  const src = readFileSync(renderPath, 'utf-8');
  // Both thumbnail and full modes should use TemplatePreview
  const templatePreviewCount = (src.match(/<TemplatePreview/g) || []).length;
  assert(
    templatePreviewCount >= 2,
    `Should render TemplatePreview in both modes, found ${templatePreviewCount} usages`,
  );
});

test('thumbnail fills its box so the frame can scale the WHOLE page (R-094)', () => {
  const css = readFileSync(globalsPath, 'utf-8');
  // New contract (R-094): a thumbnail is a true miniature of the entire
  // resume, produced by TemplatePreviewFrame scaling the full 794×1123 page
  // down to fit — NOT a top-cropped slice. So the thumbnail wrapper fills the
  // parent's A4 box (height:100%) and the frame's own aspect-ratio is
  // neutralised so it fills that box instead of imposing its own height.
  const thumbnailRule = css.split('.resume-template-render--thumbnail')[1]?.split('}')[0] || '';
  assert(
    thumbnailRule.includes('height: 100%'),
    'Thumbnail renderer should fill its box (height:100%) so the frame scales the whole page',
  );
  assert(
    thumbnailRule.includes('overflow: hidden'),
    'Thumbnail renderer should clip overflow to the card bounds',
  );
  assert(
    css.includes('.resume-template-render--thumbnail .template-preview-frame__container'),
    'Thumbnail should override the frame container so it fills the A4 box',
  );
});

test('thumbnail container clips content with aspect-ratio and overflow:hidden', () => {
  const css = readFileSync(globalsPath, 'utf-8');
  // .template-card__thumbnail should have overflow:hidden
  const thumbRule = css.split('.template-card__thumbnail')[1]?.split('}')[0] || '';
  assert(
    thumbRule.includes('overflow: hidden'),
    'Card thumbnail container should clip overflowing content',
  );
  // .template-card__preview should have aspect-ratio for consistent card sizing
  const previewRule = css.split('.template-card__preview')[1]?.split('}')[0] || '';
  assert(
    previewRule.includes('aspect-ratio'),
    'Card preview container should maintain aspect-ratio for consistent height',
  );
});

test('thumbnail removes ats-template border to avoid double border inside card', () => {
  const css = readFileSync(globalsPath, 'utf-8');
  assert(
    css.includes('.template-card__thumbnail .resume-template-render--thumbnail .ats-template'),
    'CSS should target ats-template inside thumbnail to remove its border',
  );
});

test('both modes render through TemplatePreviewFrame for proper page scaling (R-094)', () => {
  const src = readFileSync(renderPath, 'utf-8');
  assert(
    src.includes('<TemplatePreviewFrame'),
    'Renderer should use TemplatePreviewFrame for page-level scaling',
  );
  // R-094: thumbnail and full share one code path — the frame receives the
  // current mode so a thumbnail scales the same whole page, just smaller.
  assert(
    src.includes('mode={mode}'),
    'Frame should receive mode={mode} so both thumbnail and full scale the full page',
  );
});

// ── Issue 2: Clicking template card navigates to template selection ──

test('entire template card article is clickable (not just the preview area)', () => {
  const src = readFileSync(catalogGridPath, 'utf-8');
  assert(
    src.includes('<article') && src.includes('onClick'),
    'Template card article should have onClick for full-card clickability',
  );
  assert(
    src.includes('role="button"'),
    'Template card should have role="button" for accessibility',
  );
});

test('inner preview area stops propagation to prevent double navigation', () => {
  const src = readFileSync(catalogGridPath, 'utf-8');
  assert(
    src.includes('event.stopPropagation()'),
    'Inner preview area should stopPropagation to prevent bubbling to article onClick',
  );
});

// ── Issue 3: Template URL param must match displayed template ──

test('template selection view uses refs to prevent stale closure in async fetch', () => {
  const src = readFileSync(templateSelectionPath, 'utf-8');
  assert(
    src.includes('urlTemplateRef'),
    'Should use a ref to track the latest URL template to avoid stale closures in async callbacks',
  );
});

test('URL template param takes priority over saved resume templateId', () => {
  const src = readFileSync(templateSelectionPath, 'utf-8');
  assert(
    src.includes('const urlTemplate = hasUrlTemplateRef.current ? urlTemplateRef.current : null'),
    'Fetch callback should extract URL template from ref',
  );
  assert(
    src.includes('const initialTemplate = urlTemplate || savedTemplate'),
    'URL template should take priority over saved template',
  );
});

test('URL sync effect runs to override any race conditions after fetch', () => {
  const src = readFileSync(templateSelectionPath, 'utf-8');
  assert(
    src.includes('setSelectedTemplate(requestedTemplate)'),
    'URL sync effect should explicitly set selectedTemplate from URL param',
  );
});

// ── Scale computation tests (for full preview) ──

test('computePreviewScale returns correct scale for full preview container', () => {
  const scale = computePreviewScale(600, 850);
  const expected = Math.min(600 / TEMPLATE_PAGE_WIDTH, 850 / TEMPLATE_PAGE_HEIGHT);
  assert.strictEqual(scale, expected);
  assert.ok(scale > 0 && scale <= 1, `Scale should be between 0 and 1, got ${scale}`);
});

test('computePreviewScale never exceeds 1 even when container is large', () => {
  assert.strictEqual(computePreviewScale(2000, 3200), 1);
});

test('computePreviewScale handles zero dimensions gracefully', () => {
  assert.strictEqual(computePreviewScale(0, 0), 1);
  assert.strictEqual(computePreviewScale(0, 500), 1);
  assert.strictEqual(computePreviewScale(500, 0), 1);
});

// ── Accent dots must RIDE ALONG into selection/download (founder report:
//    picked a colour on the card, PDF downloaded in the default navy) ──

test('catalog grid hands the active accent dot to the selection callbacks', () => {
  const src = readFileSync(catalogGridPath, 'utf-8');
  assert(
    src.includes('previewHandler(template.id, accent || undefined)'),
    'Preview must carry the active dot',
  );
  assert(
    src.includes('onSelectTemplate(template.id, accent || undefined)'),
    'Primary action must carry the active dot',
  );
});

test('template selection persists a previewed accent before generating the PDF', () => {
  const src = readFileSync(templateSelectionPath, 'utf-8');
  // The server export renders the SAVED resume, so runDownload must save the
  // pending accent override first — otherwise the preview and the PDF differ.
  assert(
    src.includes('previewAccentRef.current !== resumeData?.accentColor'),
    'Download must check for an unpersisted accent override',
  );
  assert(
    src.includes('accentColor: previewAccentRef.current'),
    'Download must persist the previewed accent via updateResume',
  );
  // "Use template" (persistTemplate) must carry it too.
  assert(
    src.includes('...(accentOverride ? { accentColor: accentOverride } : {})'),
    'persistTemplate must include the accent override when one is active',
  );
});

test('dashboard template apply carries the previewed accent', () => {
  const src = readFileSync(path.join(__dirname, '..', 'app', 'dashboard', 'DashboardPageView.tsx'), 'utf-8');
  assert(
    src.includes('...(previewAccent ? { accentColor: previewAccent } : {})'),
    'Dashboard apply must persist the card accent alongside the template',
  );
});
