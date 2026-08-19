import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PresetTemplate from '@/components/templates/PresetTemplate';
import type { ResumeImportResult } from 'resume-builder-shared';
import {
  getAtsSectionTitle,
  resolveSectionOrder,
  TEMPLATE_CATALOG,
  TEMPLATE_PRESETS,
  PRESET_TEMPLATE_IDS,
  REORDERABLE_SECTIONS,
  templatePreset,
} from 'resume-builder-shared';

/**
 * Guards the one invariant that keeps a downloaded PDF looking like the preview
 * the user approved: the two renderers must agree.
 *
 * A resume is rendered twice by different code:
 *
 *   preview  React  components/templates/*        styled by app/globals.css
 *   export   HTML   resume-builder-api            styled by ATS_TEMPLATE_EXPORT_CSS
 *
 * Nothing used to check that those two stayed in step, and they repeatedly did
 * not — section labels, section order, and CSS rules each drifted at some point
 * and shipped as "the PDF does not match the preview". Preset-driven templates
 * remove the duplication (both renderers read resume-builder-shared/templates/presets.ts),
 * and these tests fail the build if that property is ever broken.
 */

const REPO = join(process.cwd(), '..');
const GLOBALS_CSS = join(process.cwd(), 'app', 'globals.css');
const API_SERVICE = join(REPO, 'resume-builder-api', 'src', 'resume', 'resume.service.ts');

function readGlobalsCss(): string {
  return readFileSync(GLOBALS_CSS, 'utf8');
}

function readExportCss(): string {
  const source = readFileSync(API_SERVICE, 'utf8');
  const start = source.indexOf('ATS_TEMPLATE_EXPORT_CSS = ');
  assert.ok(start > -1, 'ATS_TEMPLATE_EXPORT_CSS not found in resume.service.ts');
  const end = source.indexOf('\n`;', start);
  assert.ok(end > start, 'could not find the end of ATS_TEMPLATE_EXPORT_CSS');
  return source.slice(start, end);
}

/**
 * The class vocabulary a preset can express itself through. Every one of these
 * is declared in BOTH stylesheets, which is why a preset template exports
 * correctly without adding any CSS. A preset that needs something outside this
 * set must add the rule to both files — the test below is what enforces that.
 */
const SHARED_CLASS_VOCABULARY = [
  '.ats-template',
  '.ats-template__header',
  '.ats-template__header--bar',
  '.ats-section',
  '.ats-section--tight',
  '.ats-section--divided',
  '.ats-item',
  '.ats-item__meta',
  '.ats-upper',
];

test('every class a preset template renders is styled in BOTH stylesheets', () => {
  const globals = readGlobalsCss();
  const exportCss = readExportCss();

  for (const selector of SHARED_CLASS_VOCABULARY) {
    // Match the class as a whole token so `.ats-item` does not match `.ats-item__meta`.
    const token = new RegExp(`\\${selector}(?![a-zA-Z0-9_-])`);
    assert.ok(
      token.test(globals),
      `${selector} is used by preset templates but is not declared in globals.css (the preview would lose it)`,
    );
    assert.ok(
      token.test(exportCss),
      `${selector} is used by preset templates but is not declared in ATS_TEMPLATE_EXPORT_CSS (the PDF would lose it)`,
    );
  }
});

test('every preset id exists in the catalog, and every preset-keyed catalog entry has a preset', () => {
  const catalogIds = new Set(TEMPLATE_CATALOG.map((t) => t.id));
  for (const id of PRESET_TEMPLATE_IDS) {
    assert.ok(catalogIds.has(id), `preset "${id}" has no catalog entry, so it is unreachable in the UI`);
  }
  assert.equal(
    PRESET_TEMPLATE_IDS.length,
    Object.keys(TEMPLATE_PRESETS).length,
    'PRESET_TEMPLATE_IDS drifted from TEMPLATE_PRESETS',
  );
});

test('preset section orders only use canonical, non-duplicated section keys', () => {
  const canonical = new Set<string>(REORDERABLE_SECTIONS);
  for (const id of PRESET_TEMPLATE_IDS) {
    const preset = templatePreset(id);
    assert.ok(preset, `no preset resolved for ${id}`);
    const body = preset!.defaultBody;
    assert.ok(body.length > 0, `${id} has an empty defaultBody`);

    const seen = new Set<string>();
    for (const key of body) {
      assert.ok(canonical.has(key), `${id} orders unknown section "${key}"`);
      assert.ok(!seen.has(key), `${id} lists section "${key}" twice`);
      seen.add(key);
    }
    // A missing key would be appended by resolveSectionOrder anyway, but an
    // incomplete list means the template author did not decide where it goes.
    assert.equal(
      body.length,
      REORDERABLE_SECTIONS.length,
      `${id} must place all ${REORDERABLE_SECTIONS.length} reorderable sections; it places ${body.length}`,
    );
  }
});

test('preset labels only rename sections BOTH renderers can rename', () => {
  // The React preview resolves labels generically for every section key. The
  // API resolves them from an explicit SectionLabelOverrides type, so that type
  // is the binding constraint: a label the API cannot apply would render on
  // screen and silently revert to the default heading in the PDF.
  const apiSource = readFileSync(API_SERVICE, 'utf8');
  const typeStart = apiSource.indexOf('type SectionLabelOverrides = Partial<{');
  assert.ok(typeStart > -1, 'SectionLabelOverrides not found');
  const typeBody = apiSource.slice(typeStart, apiSource.indexOf('}>;', typeStart));
  const apiSupported = new Set(
    [...typeBody.matchAll(/^\s*([a-z]+):\s*string;/gm)].map((m) => m[1]),
  );

  for (const id of PRESET_TEMPLATE_IDS) {
    const labels = templatePreset(id)?.labels || {};
    for (const key of Object.keys(labels)) {
      assert.ok(
        apiSupported.has(key),
        `${id} renames "${key}", but the API export renderer cannot override that heading — ` +
          `the PDF would show the default while the preview shows "${labels[key as keyof typeof labels]}"`,
      );
    }
  }
});

test('the API export renderer routes preset ids instead of falling back to classic', () => {
  const apiSource = readFileSync(API_SERVICE, 'utf8');
  assert.match(
    apiSource,
    /if \(templatePreset\(templateId\)\) return renderPresetTemplateArticle\(templateId, resume\);/,
    'renderTemplateBody must route preset ids to renderPresetTemplateArticle',
  );
  // The route has to come BEFORE the classic fallback or it can never be hit.
  const routeAt = apiSource.indexOf('if (templatePreset(templateId)) return renderPresetTemplateArticle');
  // The service file is CRLF, so match the fallback without assuming a line ending.
  const fallbackAt = apiSource.search(/return renderClassicTemplateArticle\(resume\);\s*\r?\n\}/);
  assert.ok(routeAt > -1 && fallbackAt > -1, 'could not locate both the preset route and the classic fallback');
  assert.ok(routeAt < fallbackAt, 'the preset route must precede the classic fallback');
});

test('the API export renderer honours an explicit preset section order', () => {
  const apiSource = readFileSync(API_SERVICE, 'utf8');
  // Without this the API would keep deriving order from educationFirst /
  // certificationsFirst and ignore whatever the preset asked for.
  assert.match(
    apiSource,
    /const defaultBody = options\.defaultBody\s*\n?\s*\?\s*options\.defaultBody/,
    'renderOrderedSections must prefer options.defaultBody over the boolean shortcuts',
  );
});

test('preset templates are catalogued as ATS-exportable single-column layouts', () => {
  for (const id of PRESET_TEMPLATE_IDS) {
    const item = TEMPLATE_CATALOG.find((t) => t.id === id);
    assert.ok(item, `${id} missing from catalog`);
    assert.equal(item!.layout, 'single-column', `${id} must be single-column to parse reliably`);
    assert.ok(
      item!.implementedVariants.includes('ats-export'),
      `${id} claims ATS safety but does not implement the ats-export variant`,
    );
    assert.equal(item!.componentKey, id, `${id} must map to its own component key`);
  }
});

/* ---------------------------------------------------------------------------
   Behavioural half: render each preset template for real and check the headings
   it produces are exactly the ones the export renderer would derive from the
   same preset, in the same order. The assertions above check the wiring; this
   checks the output, which is what the user actually compares when they hit
   Download.
   --------------------------------------------------------------------------- */

const SAMPLE: ResumeImportResult = {
  title: 'Senior Engineer',
  contact: { fullName: 'Test Person', email: 't@example.com', phone: '555-0100', location: 'Pune' },
  summary: 'A summary line.',
  skills: ['React', 'TypeScript'],
  technicalSkills: ['React'],
  softSkills: ['Leadership'],
  languages: ['English', 'Hindi'],
  experience: [
    { company: 'Citi', role: 'AVP', startDate: 'Dec 2022', endDate: 'Present', highlights: ['Did a thing.'] },
  ],
  education: [{ institution: 'Uni', degree: 'BE', startDate: '2010', endDate: '2014', details: [] }],
  projects: [{ name: 'Proj', highlights: ['Built it.'] }],
  achievements: ['Won an award'],
  certifications: [{ name: 'AWS' }],
};

/** The headings the API export renderer derives from the preset. */
function expectedExportHeadings(id: string): string[] {
  const preset = templatePreset(id)!;
  const labels = preset.labels || {};
  return resolveSectionOrder(undefined, preset.defaultBody).map((key) => {
    const label = labels[key] ?? getAtsSectionTitle(key);
    return preset.uppercaseHeadings ? label.toUpperCase() : label;
  });
}

/** The headings the React preview actually rendered. */
function renderedPreviewHeadings(id: string): string[] {
  const html = renderToStaticMarkup(
    React.createElement(PresetTemplate, { resumeData: SAMPLE, templateId: id }),
  );
  return [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) =>
    m[1]
      .replace(/<[^>]+>/g, '')
      // React escapes text, so a label like "Experience & Outcomes" arrives as
      // "Experience &amp; Outcomes". Decode before comparing against the raw
      // preset label the export renderer would use.
      .replace(/&amp;/g, '&')
      .replace(/&#x27;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

test('preview headings match what the export renderer would emit, in the same order', () => {
  for (const id of PRESET_TEMPLATE_IDS) {
    const preview = renderedPreviewHeadings(id);
    assert.ok(preview.length > 0, `${id} rendered no sections`);

    // The sample has no licenses/publications, so those sections are absent from
    // both sides. Compare the order of everything the preview did render.
    const expected = expectedExportHeadings(id).filter((h) => preview.includes(h));
    assert.deepEqual(
      preview,
      expected,
      `${id}: the preview renders headings in a different order than the PDF would.\n` +
        `  preview: ${preview.join(' > ')}\n  export : ${expected.join(' > ')}`,
    );
  }
});

test('each preset template renders its own modifier class and header treatment', () => {
  for (const id of PRESET_TEMPLATE_IDS) {
    const html = renderToStaticMarkup(
      React.createElement(PresetTemplate, { resumeData: SAMPLE, templateId: id }),
    );
    assert.ok(
      html.includes(`ats-template ats-template--${id}"`),
      `${id} missing its modifier class`,
    );

    const preset = templatePreset(id)!;
    const hasBar = /ats-template__header--bar/.test(html);
    assert.equal(
      hasBar,
      Boolean(preset.headerBar),
      `${id}: header bar rendered=${hasBar} but the preset says ${Boolean(preset.headerBar)} — ` +
        'the export renderer passes the same flag, so this would differ in the PDF',
    );

    const sectionClass = preset.tight
      ? 'ats-section--tight'
      : preset.divided
        ? 'ats-section--divided'
        : null;
    if (sectionClass) {
      assert.match(html, new RegExp(sectionClass), `${id} should render ${sectionClass}`);
    }
  }
});
