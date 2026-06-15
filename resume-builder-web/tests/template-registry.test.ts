import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_TEMPLATE_ID, TEMPLATE_CATALOG } from 'resume-builder-shared';
import { templateList, templateRegistry, type TemplateId } from '@/shared/templateRegistry';

const SUPPORTED_IDS = TEMPLATE_CATALOG.map((template) => template.id) as TemplateId[];

test('template registry exposes every supported ATS template', () => {
  assert.equal(templateList.length, TEMPLATE_CATALOG.length);
  const seen = new Set<string>();
  for (const template of templateList) {
    assert.ok(template.id, 'template id should not be empty');
    assert(!seen.has(template.id), `duplicate template id ${template.id}`);
    seen.add(template.id);
    assert.ok(SUPPORTED_IDS.includes(template.id as TemplateId), `unsupported template id ${template.id}`);
    assert.equal(typeof template.component, 'function');
  }
});

test('template registry object keys match template ids', () => {
  for (const id of SUPPORTED_IDS) {
    assert.ok(templateRegistry[id], `missing registry entry for ${id}`);
    assert.equal(templateRegistry[id].id, id);
  }
});

test('template registry preserves shared default template metadata', () => {
  assert.equal(DEFAULT_TEMPLATE_ID, 'classic');
  assert.equal(templateRegistry[DEFAULT_TEMPLATE_ID].isDefault, true);
});

// ── TEMPLATE_SPEC §2.2 — catalogue metadata contract (R-030/R-035 pass) ──

const SECTION_KEYS = new Set([
  'summary', 'skills', 'experience', 'projects',
  'achievements', 'education', 'certifications', 'languages',
]);

test('every template declares supportedSections within the canonical key set', () => {
  for (const t of TEMPLATE_CATALOG) {
    assert.ok(Array.isArray(t.supportedSections) && t.supportedSections.length >= 4,
      `${t.id} must declare its first-class sections`);
    for (const s of t.supportedSections) {
      assert.ok(SECTION_KEYS.has(s), `${t.id} declares unknown section '${s}'`);
    }
  }
});

test('every template declares at least the en-IN locale', () => {
  for (const t of TEMPLATE_CATALOG) {
    assert.ok(t.supportedLocales.includes('en-IN'), `${t.id} missing en-IN`);
  }
});

test('every template declares a layout family and the screen variant', () => {
  for (const t of TEMPLATE_CATALOG) {
    assert.ok(['single-column', 'multi-column', 'sidebar'].includes(t.layout), t.id);
    assert.ok(t.implementedVariants.includes('screen'), `${t.id} missing screen variant`);
  }
});

test("atsSafety high/medium templates MUST implement the ats-export variant", () => {
  // TEMPLATE_SPEC §2.2: a template advertised as ATS-safe that cannot
  // produce ATS-safe export HTML is a broken promise.
  for (const t of TEMPLATE_CATALOG) {
    if (t.atsSafety === 'high' || t.atsSafety === 'medium') {
      assert.ok(
        t.implementedVariants.includes('ats-export'),
        `${t.id} (atsSafety=${t.atsSafety}) must implement ats-export`,
      );
    }
  }
});

test('achievements render everywhere: first-class OR via the shared fallback', () => {
  // The founder-reported bug: parser extracted achievements fine, but
  // 10 of 11 templates silently dropped the section from preview +
  // PDF. Every template component source must now reference either
  // achievementItems (first-class styling) or AchievementsSection
  // (the shared fallback) so user data is never thrown away.
  const { readFileSync } = require('node:fs');
  const path = require('node:path');
  const dir = path.resolve(__dirname, '..', 'components', 'templates');
  for (const t of TEMPLATE_CATALOG) {
    const entry = templateRegistry[t.id as TemplateId];
    assert.ok(entry, `registry missing ${t.id}`);
    const file = {
      classic: 'ClassicATS', modern: 'ModernProfessional', executive: 'ExecutiveImpact',
      technical: 'TechnicalCompact', minimal: 'MinimalClean', consultant: 'ConsultantClean',
      academic: 'AcademicCV', healthcare: 'HealthcareCV', creative: 'CreativePortfolio',
      'sidebar-bold': 'SidebarBold', 'accent-header': 'AccentHeader',
    }[t.id];
    const src = readFileSync(path.join(dir, `${file}.tsx`), 'utf8');
    // R-045 Phase 2: the ATS family now renders achievements (and every other
    // body section) through the shared OrderedAtsSections renderer; the visual
    // templates still reference achievementItems / AchievementsSection directly.
    assert.ok(
      /achievementItems|AchievementsSection|OrderedAtsSections/.test(src),
      `${t.id} renders achievements via neither first-class styling nor the fallback`,
    );
  }
});
