const assert = require('node:assert/strict');
const {
  extractEmail,
  extractPhone,
  isPlausiblePhone,
  extractLinks,
  classifyLink,
  normalizeDateFlexible,
  extractAdditionalTechSkills,
  hardenString,
  isSafeUrl,
  extractSpokenLanguages,
  parseResumeText,
  mapParsedResume,
} = require('../dist/index.js');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed += 1;
  } catch (err) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${err.message}`);
    failed += 1;
  }
}

console.log('extraction-enhancements');

// ---------- Email ----------
test('extracts plain email', () => {
  assert.equal(extractEmail('Contact me at jane.doe@example.com any time.'), 'jane.doe@example.com');
});
test('extracts (at) obfuscated email', () => {
  assert.equal(extractEmail('jane (at) example (dot) com'), 'jane@example.com');
});
test('extracts [at] obfuscated email', () => {
  assert.equal(extractEmail('jane[at]example[dot]co.uk'), 'jane@example.co.uk');
});
test('returns empty when no email', () => {
  assert.equal(extractEmail('No contact info here'), '');
});

// ---------- Phone ----------
test('extracts US phone with country code', () => {
  const phone = extractPhone('Call: +1 (555) 123-4567');
  assert.ok(phone.includes('555'));
  assert.ok(isPlausiblePhone(phone));
});
test('extracts Indian +91 mobile', () => {
  const phone = extractPhone('Mobile: +91-9876543210');
  assert.ok(phone.replace(/\D/g, '').length >= 10);
});
test('extracts UK phone +44', () => {
  const phone = extractPhone('Phone: +44 20 7946 0958');
  assert.ok(phone.includes('44'));
});
test('rejects all-zero numbers', () => {
  assert.equal(isPlausiblePhone('0000000000'), false);
});
test('ignores phone-like digits in URLs', () => {
  const phone = extractPhone('See https://example.com/path/1234567890 — no contact');
  assert.equal(phone, '');
});

// ---------- Links ----------
test('extracts http/https links', () => {
  const links = extractLinks('Portfolio: https://jane.dev and https://github.com/jane');
  assert.ok(links.some((l) => l.includes('jane.dev')));
  assert.ok(links.some((l) => l.includes('github.com/jane')));
});
test('recovers bare linkedin profile', () => {
  const links = extractLinks('linkedin.com/in/jane-doe');
  assert.ok(links.some((l) => /linkedin\.com\/in\/jane/i.test(l)));
});
test('classifies linkedin link', () => {
  assert.equal(classifyLink('https://www.linkedin.com/in/jane'), 'linkedin');
});
test('classifies github link', () => {
  assert.equal(classifyLink('https://github.com/jane'), 'github');
});
test('classifies portfolio domain', () => {
  assert.equal(classifyLink('https://jane.dev'), 'portfolio');
});

// ---------- Dates ----------
test('normalizes ISO date', () => {
  assert.equal(normalizeDateFlexible('2023-05-12'), 'May 2023');
});
test('normalizes European DD/MM/YYYY', () => {
  assert.equal(normalizeDateFlexible('12/05/2023'), 'May 2023');
});
test('normalizes quarter notation', () => {
  assert.equal(normalizeDateFlexible('Q3 2024'), 'Jul 2024');
});
test('present-token recognized', () => {
  assert.equal(normalizeDateFlexible('Ongoing'), 'Present');
});

// ---------- Skills ----------
test('extracts modern AI/ML skills', () => {
  const text = 'Built RAG pipelines with LangChain, PyTorch and Hugging Face Transformers. Deployed via Kubernetes and ArgoCD.';
  const found = extractAdditionalTechSkills(text);
  assert.ok(found.includes('LangChain'));
  assert.ok(found.includes('PyTorch'));
  assert.ok(found.includes('ArgoCD'));
});
test('honors knownSet to avoid duplicates', () => {
  const known = new Set(['PyTorch']);
  const found = extractAdditionalTechSkills('PyTorch and TensorFlow', known);
  assert.ok(!found.includes('PyTorch'));
  assert.ok(found.includes('TensorFlow'));
});

// ---------- Hardening ----------
test('strips script tags', () => {
  const out = hardenString('Hello<script>alert(1)</script>World');
  assert.equal(out.includes('script'), false);
  assert.equal(out.includes('alert'), false);
});
test('strips html tags', () => {
  const out = hardenString('<b>Senior</b> Engineer');
  assert.ok(/Senior\s+Engineer/.test(out));
});
test('strips control characters', () => {
  const out = hardenString('safe\u0000text\u0007here');
  assert.equal(out, 'safetexthere');
});
test('blocks javascript: urls', () => {
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
});
test('allows https url', () => {
  assert.equal(isSafeUrl('https://example.com'), true);
});
test('allows mailto', () => {
  assert.equal(isSafeUrl('mailto:jane@example.com'), true);
});

// ---------- Spoken languages ----------
test('extracts spoken languages with proficiency', () => {
  const langs = extractSpokenLanguages(['English (Native)', 'Hindi (Fluent)', 'Spanish - Intermediate']);
  assert.ok(langs.find((l) => l.name === 'English' && l.proficiency === 'Native'));
  assert.ok(langs.find((l) => l.name === 'Hindi'));
  assert.ok(langs.find((l) => l.name === 'Spanish'));
});

// ---------- Integration: existing pipeline still works + picks up new skills ----------
test('mapParsedResume picks up modern AI tech via additional skills', () => {
  const sample = `
Jane Doe
jane@example.com | +1 555 000 9999

Profile
ML engineer building production RAG systems with LangChain and PyTorch.

Skills
LangChain, PyTorch, Hugging Face, Pinecone

Employment History
Senior ML Engineer - Acme AI | Jan 2022 - Present
- Built retrieval-augmented chatbots serving 10k QPS

Education
BS Computer Science - State University | 2015 - 2019
`;
  const parsed = parseResumeText(sample);
  const mapped = mapParsedResume(parsed);
  assert.ok(mapped.skills.some((s) => /langchain/i.test(s)));
  assert.ok(mapped.skills.some((s) => /pytorch/i.test(s)));
  assert.ok(mapped.experience.length >= 1);
  assert.ok(mapped.experience[0].company.toLowerCase().includes('acme'));
});

// ---------- Integration: new section synonyms recognized ----------
test('parseResumeText recognises new section synonyms', () => {
  const sample = `
Jane Doe
jane@example.com

Snapshot
Senior engineer who ships product.

Libraries and Frameworks
React, Next.js, FastAPI

Engagements
Senior Engineer - Acme Corp | 2020 - 2023
- Built things

Education
BS CS - MIT | 2015 - 2019
`;
  const parsed = parseResumeText(sample);
  // 'snapshot' -> summary, 'libraries and frameworks' -> skills, 'engagements' -> experience
  assert.ok((parsed.sections.summary || []).length > 0, 'summary section should be populated');
  assert.ok((parsed.sections.skills || []).length > 0, 'skills section should be populated');
  assert.ok((parsed.sections.experience || []).length > 0, 'experience section should be populated');
});

if (failed > 0) {
  console.error(`extraction-enhancements: ${failed} test(s) failed`);
  process.exit(1);
}
console.log(`extraction-enhancements: all ${passed} tests passed`);
