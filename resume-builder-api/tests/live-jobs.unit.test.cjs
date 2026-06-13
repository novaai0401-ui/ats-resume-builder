const assert = require('node:assert/strict');
const test = require('node:test');
const { buildAdzunaUrl, normalizeAdzunaResults } = require('../dist/live-jobs/adzuna.util.js');

const CFG = { appId: 'id1', appKey: 'key1', country: 'in' };

test('buildAdzunaUrl targets the right country and includes credentials', () => {
  const url = buildAdzunaUrl(CFG, 'react node', { where: 'Bengaluru', limit: 5 });
  assert.ok(url.startsWith('https://api.adzuna.com/v1/api/jobs/in/search/1?'));
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('app_id'), 'id1');
  assert.equal(params.get('app_key'), 'key1');
  assert.equal(params.get('what'), 'react node');
  assert.equal(params.get('where'), 'Bengaluru');
  assert.equal(params.get('results_per_page'), '5');
  assert.equal(params.get('sort_by'), 'date');
});

test('buildAdzunaUrl clamps the limit and omits empty where', () => {
  const url = buildAdzunaUrl(CFG, 'python', { limit: 999 });
  const params = new URLSearchParams(url.split('?')[1]);
  assert.equal(params.get('results_per_page'), '20'); // clamped to MAX
  assert.equal(params.get('where'), null);
});

test('buildAdzunaUrl lowercases the country', () => {
  const url = buildAdzunaUrl({ ...CFG, country: 'US' }, 'sql');
  assert.ok(url.includes('/jobs/us/search/1'));
});

test('normalizeAdzunaResults maps fields and strips HTML from titles', () => {
  const payload = {
    results: [
      {
        title: 'Senior <b>React</b> Engineer',
        redirect_url: 'https://adzuna/job/1',
        company: { display_name: 'Acme' },
        location: { display_name: 'Bengaluru, Karnataka' },
        salary_min: 1500000, salary_max: 2500000,
        created: '2026-06-01T00:00:00Z',
      },
    ],
  };
  const [job] = normalizeAdzunaResults(payload);
  assert.equal(job.title, 'Senior React Engineer');
  assert.equal(job.company, 'Acme');
  assert.equal(job.location, 'Bengaluru, Karnataka');
  assert.equal(job.url, 'https://adzuna/job/1');
  assert.equal(job.source, 'adzuna');
  assert.match(job.salaryText, /₹15\.0 L–25\.0 L/);
  assert.equal(job.postedAt, '2026-06-01T00:00:00Z');
});

test('normalizeAdzunaResults skips entries missing title or url', () => {
  const payload = { results: [
    { title: '', redirect_url: 'https://x' },
    { title: 'Dev', redirect_url: '' },
    { title: 'Valid', redirect_url: 'https://ok' },
  ] };
  const jobs = normalizeAdzunaResults(payload);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, 'Valid');
  assert.equal(jobs[0].company, 'Unknown');
  assert.equal(jobs[0].salaryText, null);
});

test('normalizeAdzunaResults respects the limit and handles bad payloads', () => {
  const many = { results: Array.from({ length: 10 }, (_, i) => ({ title: `J${i}`, redirect_url: `https://j/${i}` })) };
  assert.equal(normalizeAdzunaResults(many, 3).length, 3);
  assert.deepEqual(normalizeAdzunaResults(null), []);
  assert.deepEqual(normalizeAdzunaResults({}), []);
  assert.deepEqual(normalizeAdzunaResults({ results: 'nope' }), []);
});
