const assert = require('node:assert/strict');
const test = require('node:test');
const {
  ATS_SECTION_ORDER,
  REORDERABLE_SECTIONS,
  getAtsSectionTitle,
  getAtsSectionOrder,
} = require('resume-builder-shared');
const { TEMPLATE_CATALOG, resolveTemplateCatalogId, PROFESSION_INDUSTRIES } = require('resume-builder-shared');
const { renderResumeTemplateHtml } = require('../dist/resume/resume.service.js');

/**
 * R-077 — profession-specific sections (licenses, publications) and the
 * Medical Coder profession/template. Pins the section catalogue (C-002),
 * presence detection, and export rendering.
 */

const BASE = {
  title: 'Dr Test',
  contact: { fullName: 'Dr A Test', email: 'a@t.io' },
  summary: 'Physician with a decade of clinical practice across tertiary hospitals.',
  skills: ['Clinical Diagnosis'],
  experience: [{ company: 'City Hospital', role: 'Physician', startDate: '2015-01', endDate: 'Present', highlights: ['Treated patients.'] }],
  education: [],
  projects: [],
  certifications: [],
  achievements: [],
  languages: [],
};

test('section catalogue includes licenses + publications with titles', () => {
  assert.ok(ATS_SECTION_ORDER.includes('licenses'));
  assert.ok(ATS_SECTION_ORDER.includes('publications'));
  assert.ok(REORDERABLE_SECTIONS.includes('licenses'));
  assert.equal(getAtsSectionTitle('licenses'), 'Licenses & Registrations');
  assert.equal(getAtsSectionTitle('publications'), 'Publications & Patents');
});

test('presence detection: sections appear in order only when populated', () => {
  const empty = getAtsSectionOrder(BASE);
  assert.ok(!empty.includes('licenses'));
  const withLic = getAtsSectionOrder({ ...BASE, licenses: [{ name: 'Medical Registration' }], publications: [{ title: 'Paper' }] });
  assert.ok(withLic.includes('licenses'));
  assert.ok(withLic.includes('publications'));
});

test('PDF export HTML renders licensure + publications content', () => {
  const rendered = renderResumeTemplateHtml({
    templateId: 'classic',
    resumeData: {
      ...BASE,
      licenses: [{ name: 'Medical Registration', authority: 'National Medical Commission', licenseNumber: 'NMC-12345', validTill: '2030' }],
      publications: [{ title: 'Sepsis outcomes in ICUs', venue: 'Indian J Med', year: '2024' }, { title: 'Triage device', type: 'patent' }],
    },
    mode: 'export',
  });
  assert.match(rendered.html, /Licenses (&|&amp;) Registrations/i);
  assert.match(rendered.html, /NMC-12345/);
  assert.match(rendered.html, /Publications (&|&amp;) Patents/i);
  assert.match(rendered.html, /Sepsis outcomes/);
  assert.match(rendered.html, /\[Patent\]/);
});

test('medical-coder template exists, resolves, and renders coder labels', () => {
  const item = TEMPLATE_CATALOG.find((t) => t.id === 'medical-coder');
  assert.ok(item, 'catalog entry present');
  assert.equal(item.atsSafety, 'high');
  assert.equal(resolveTemplateCatalogId('medical-coding'), 'medical-coder');
  const rendered = renderResumeTemplateHtml({ templateId: 'medical-coder', resumeData: BASE, mode: 'export' });
  assert.match(rendered.html, /ats-template--medical-coder/);
  assert.match(rendered.html, /Coding Certifications|Code Sets/i);
});

test('medical-coder role exists in the healthcare profession with code-set keywords', () => {
  const hc = PROFESSION_INDUSTRIES.find((i) => i.id === 'healthcare');
  const role = hc.roles.find((r) => r.id === 'medical-coder');
  assert.ok(role, 'medical-coder role present');
  assert.ok(role.keywords.includes('ICD-10'));
  assert.ok(hc.recommendedTemplates.includes('medical-coder'));
});

test('R-081: AI/ML Engineer + Product Manager templates render with role labels', () => {
  const aiml = renderResumeTemplateHtml({ templateId: 'ai-ml-engineer', resumeData: BASE, mode: 'export' });
  assert.match(aiml.html, /ats-template--ai-ml-engineer/);
  assert.match(aiml.html, /AI\/ML Skills & Frameworks/);
  assert.equal(resolveTemplateCatalogId('data-scientist'), 'ai-ml-engineer');
  assert.equal(resolveTemplateCatalogId('ml-engineer'), 'ai-ml-engineer');

  const pm = renderResumeTemplateHtml({ templateId: 'product-manager', resumeData: BASE, mode: 'export' });
  assert.match(pm.html, /ats-template--product-manager/);
  assert.match(pm.html, /Core Competencies/);

  const both = TEMPLATE_CATALOG.filter((t) => ['ai-ml-engineer', 'product-manager'].includes(t.id));
  assert.equal(both.length, 2);
  assert.ok(both.every((t) => t.atsSafety === 'high'));
});

test('R-081: AI/ML industry recommends the ai-ml-engineer template first', () => {
  const aiml = PROFESSION_INDUSTRIES.find((i) => i.id === 'ai-machine-learning');
  assert.equal(aiml.recommendedTemplates[0], 'ai-ml-engineer');
});
