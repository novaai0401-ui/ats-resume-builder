import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { computeTemplateFacts, TEMPLATE_CATALOG } from 'resume-builder-shared';

/**
 * R-110 — template claims must come from the catalogue.
 *
 * llms.txt and the templates lander said "Every template is single-column
 * with standard section headings", while the catalogue ships
 * multi-column and sidebar layouts — including one whose own description
 * warns that most ATS scrapers drop the sidebar. We were feeding
 * assistants a claim our own data contradicted (C-003).
 */

test('the catalogue really does contain non-single-column templates', () => {
  // If this ever fails, the original claim became true and the guard
  // below can be revisited — but it must be checked, not assumed.
  const facts = computeTemplateFacts();
  assert.ok(facts.multiColumn + facts.sidebar > 0, 'the claim was false because these exist');
  assert.equal(facts.total, TEMPLATE_CATALOG.length);
});

test('derived facts do not conflate single-column with ATS-safe', () => {
  const facts = computeTemplateFacts();
  // 23 single-column vs 20 rated high: different properties, different
  // totals. Blurring them would be a smaller version of the same bug.
  assert.notEqual(
    facts.singleColumn,
    facts.atsSafe,
    'these counts differ in this catalogue, so the sentence must not equate them',
  );
  assert.match(facts.summarySentence, new RegExp(`${facts.atsSafe} are rated ATS-safe`));
  assert.match(facts.summarySentence, new RegExp(`${facts.singleColumn} use a single-column`));
});

test('no public surface still claims every template is single-column', () => {
  const files = [
    'app/llms.txt/route.ts',
    'app/ats-resume-templates/page.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf-8');
    assert.doesNotMatch(
      source,
      /Every template is single-column/i,
      `${file} states a claim the catalogue contradicts`,
    );
  }
});

test('template copy is generated, not hardcoded', () => {
  for (const file of ['app/llms.txt/route.ts', 'app/ats-resume-templates/page.tsx']) {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf-8');
    assert.match(
      source,
      /computeTemplateFacts\(\)/,
      `${file} must derive its numbers so adding a template updates the claim instead of falsifying it`,
    );
  }
});

test('no surface claims vendor-parser testing we have not done', () => {
  const files = [
    'app/ats-resume-templates/page.tsx',
    'app/about/page.tsx',
    'app/resume-templates/page.tsx',
    'src/components/templates/TemplateCatalogGrid.tsx',
  ];
  for (const file of files) {
    const source = readFileSync(path.join(__dirname, '..', file), 'utf-8');
    assert.doesNotMatch(
      source,
      /tested against Workday|Tested to parse cleanly across|tested across Workday/i,
      `${file} asserts vendor testing; naming the systems a layout targets is fine, claiming we tested against them is not`,
    );
  }
});
