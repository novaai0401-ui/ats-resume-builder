const assert = require('node:assert/strict');
const test = require('node:test');
const { PatternModelService } = require('../dist/pattern-learner/pattern-model.service.js');

// The corpus→model bridge: trains resume-pattern-model over redacted
// TrainingSample/ParseFailureSample texts and persists a snapshot.

const SAMPLE = [
  'Jane Doe',
  'jane@example.com | +91 9000000000',
  'WORK EXPERIENCE',
  'Acme Technologies Ltd, Bangalore Senior Engineer Jan 2020 - Present',
  '- Built scalable payment services handling 2M requests/day.',
  '- Led a team of 5 engineers across two time zones.',
  'Initech Solutions LLP, Mumbai Data Analyst Mar 2021 - Present',
  '- Automated weekly reporting, saving 12 analyst-hours per week.',
  'Umbrella Corp, Delhi Junior Analyst Jul 2018 - Feb 2021',
  '- Cleaned and modelled sales data for 3 regional teams.',
  'EDUCATION',
  'B.E. Computer Science, VTU 2012 - 2016',
].join('\n');

function makePrisma({ samples = [], failures = [] } = {}) {
  const created = [];
  return {
    created,
    trainingSample: {
      findMany: async () => samples.map((t) => ({ redactedText: t })),
      count: async () => samples.length,
    },
    parseFailureSample: {
      findMany: async () => failures.map((t) => ({ redactedText: t })),
      count: async () => failures.length,
    },
    patternModelSnapshot: {
      create: async ({ data }) => { created.push(data); return { id: 'snap-1' }; },
      findFirst: async () => (created.length
        ? { id: 'snap-1', createdAt: new Date(), model: created[created.length - 1].model, docsSeen: created[created.length - 1].docsSeen, vocabSize: created[created.length - 1].vocabSize, shapes: created[created.length - 1].shapes }
        : null),
    },
  };
}

test('train() learns from the corpus and persists a snapshot', async () => {
  const prisma = makePrisma({ samples: [SAMPLE, SAMPLE] });
  const svc = new PatternModelService(prisma);
  const res = await svc.train();
  assert.equal(res.ok, true);
  assert.equal(res.docsSeen, 2);
  assert.ok(res.vocabSize > 10);
  assert.equal(res.snapshotId, 'snap-1');
  assert.equal(prisma.created.length, 1);
});

test('train() falls back to failure samples when training corpus is empty', async () => {
  const prisma = makePrisma({ samples: [], failures: [SAMPLE] });
  const svc = new PatternModelService(prisma);
  const res = await svc.train();
  assert.equal(res.ok, true);
  assert.equal(res.docsSeen, 1);
});

test('train() reports ok:false on an empty corpus (no snapshot row)', async () => {
  const prisma = makePrisma();
  const svc = new PatternModelService(prisma);
  const res = await svc.train();
  assert.equal(res.ok, false);
  assert.equal(prisma.created.length, 0);
});

test('loadLatestModel() rehydrates a working model from the snapshot', async () => {
  const prisma = makePrisma({ samples: [SAMPLE, SAMPLE] });
  const svc = new PatternModelService(prisma);
  await svc.train();
  const model = await svc.loadLatestModel();
  assert.ok(model, 'model rehydrated');
  assert.equal(model.docsSeen, 2);
  // Heading classification works after round-trip.
  assert.equal(model.classify('CERTIFICATIONS').label, 'heading');
  // Learned header shapes survive the round-trip: an unseen header with the
  // same layout as the training headers has recorded shape support.
  const unseen = 'Globex Pvt Ltd, Pune Software Developer Jun 2016 - Dec 2019';
  assert.ok(model.shapeSupport(unseen) >= 2, 'learned header shape survives persistence');
  // And the deterministic splitter extracts role/company/dates from it.
  const h = model.splitHeader(unseen);
  assert.match(h.role, /Software Developer/i);
  assert.match(h.company, /Globex/i);
  assert.match(h.dates, /2016/);
});
