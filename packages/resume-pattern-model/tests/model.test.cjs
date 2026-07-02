const assert = require('node:assert/strict');
const test = require('node:test');
const {
  createModel, ResumePatternModel, selfLabel, featurize, shapeOf,
} = require('../dist/index.js');

const RESUME_A = [
  'Jane Doe',
  'jane@example.com | +91 9000000000',
  'SUMMARY',
  'Full stack engineer with 8 years of experience building scalable platforms for fintech clients.',
  'WORK EXPERIENCE',
  'Acme Technologies Ltd, Bangalore Senior Engineer Jan 2020 - Present',
  '- Built scalable payment services handling 2M requests/day.',
  '- Led a team of 5 engineers across two time zones.',
  'Globex Pvt Ltd, Pune Software Developer Jun 2016 - Dec 2019',
  '- Shipped the customer onboarding portal used by 40k users.',
  'EDUCATION',
  'B.E. Computer Science, VTU 2012 - 2016',
  'SKILLS',
  'Java, Spring, AWS, Kubernetes',
].join('\n');

const RESUME_B = [
  'Rahul Sharma',
  'rahul.sharma@mail.com',
  'PROFILE',
  'Data analyst focused on turning messy operational data into decisions that move revenue.',
  'EXPERIENCE',
  'Initech Solutions LLP, Mumbai Data Analyst Mar 2021 - Present',
  '- Automated weekly reporting, saving 12 analyst-hours per week.',
  'Umbrella Corp, Delhi Junior Analyst Jul 2018 - Feb 2021',
  '- Cleaned and modelled sales data for 3 regional teams.',
  'EDUCATION',
  'B.Sc. Statistics, Delhi University 2015 - 2018',
  'LANGUAGES',
  'English, Hindi',
].join('\n');

// ── Weak supervision ────────────────────────────────────────────────────

test('selfLabel labels the obvious line kinds', () => {
  assert.equal(selfLabel('WORK EXPERIENCE'), 'heading');
  assert.equal(selfLabel('jane@example.com | +91 9000000000'), 'contact');
  assert.equal(selfLabel('- Built scalable payment services handling 2M requests/day.'), 'bullet');
  assert.equal(selfLabel('Acme Technologies Ltd, Bangalore Senior Engineer Jan 2020 - Present'), 'job_header');
  assert.equal(selfLabel(''), null);
});

test('featurize emits token + shape features', () => {
  const f = featurize('WORK EXPERIENCE');
  assert.ok(f.includes('§allcaps'));
  assert.ok(f.includes('§short'));
  const f2 = featurize('Acme Technologies Ltd, Bangalore Senior Engineer Jan 2020 - Present');
  assert.ok(f2.includes('§daterange'));
  assert.ok(f2.includes('§roleword'));
});

test('shapeOf generalises header lines so similar headers share a signature', () => {
  const s1 = shapeOf('Acme Technologies Ltd, Bangalore Senior Engineer Jan 2020 - Present');
  const s2 = shapeOf('Initech Solutions LLP, Mumbai Data Analyst Mar 2021 - Present');
  assert.equal(s1, s2, 'same layout → same shape signature');
});

// ── Learning ────────────────────────────────────────────────────────────

test('learn() updates counts; the model classifies new lines it never saw', () => {
  const m = createModel();
  m.learnMany([RESUME_A, RESUME_B]);
  assert.equal(m.docsSeen, 2);
  assert.ok(m.stats().vocabSize > 20);

  // Never-seen heading, bullet and job header are classified correctly.
  assert.equal(m.classify('CERTIFICATIONS').label, 'heading');
  assert.equal(m.classify('- Reduced infra cost by 30% through autoscaling.').label, 'bullet');
  assert.equal(
    m.classify('Wayne Enterprises Ltd, Gotham Lead Engineer Feb 2019 - Present').label,
    'job_header',
  );
});

test('header-shape memory accumulates support for repeated layouts', () => {
  const m = createModel();
  m.learnMany([RESUME_A, RESUME_B]);
  const support = m.shapeSupport('Stark Industries Ltd, Chennai Senior Manager Apr 2018 - Present');
  assert.ok(support >= 3, `expected learned shape support >= 3, got ${support}`);
});

// ── Extraction ──────────────────────────────────────────────────────────

test('extract() returns contact, sections and split experience headers', () => {
  const m = createModel();
  m.learnMany([RESUME_A, RESUME_B]);
  const out = m.extract(RESUME_A);

  assert.equal(out.contact.email, 'jane@example.com');
  assert.ok(out.contact.phone.includes('9000000000'));
  assert.equal(out.contact.name, 'Jane Doe');

  assert.ok(Object.keys(out.sections).some((s) => /experience/.test(s)));
  assert.equal(out.experienceHeaders.length, 2);
  const first = out.experienceHeaders[0];
  assert.match(first.role, /Senior Engineer/i);
  assert.match(first.company, /Acme Technologies/i);
  assert.match(first.dates, /2020/);
  assert.ok(out.confidence > 0.5, `confidence ${out.confidence}`);
});

// ── Persistence ─────────────────────────────────────────────────────────

test('toJSON()/fromJSON() round-trips: restored model behaves identically', () => {
  const m = createModel();
  m.learnMany([RESUME_A, RESUME_B]);
  const json = JSON.parse(JSON.stringify(m.toJSON()));
  const restored = ResumePatternModel.fromJSON(json);

  const line = 'Umbrella Corp, Delhi Junior Analyst Jul 2018 - Feb 2021';
  assert.deepEqual(restored.classify(line), m.classify(line));
  assert.equal(restored.docsSeen, m.docsSeen);
  assert.equal(restored.shapeSupport(line), m.shapeSupport(line));
});

test('a restored model can keep learning (incremental)', () => {
  const m = ResumePatternModel.fromJSON(createModel().toJSON());
  const before = m.stats().totalLabeledLines;
  m.learn(RESUME_A);
  assert.ok(m.stats().totalLabeledLines > before);
  assert.equal(m.docsSeen, 1);
});
