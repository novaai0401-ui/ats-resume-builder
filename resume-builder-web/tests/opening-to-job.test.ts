import assert from 'node:assert/strict';
import test from 'node:test';
import { openingToJobInput } from '../src/lib/job-utils';

test('maps a full opening to a wishlist job input', () => {
  const job = openingToJobInput({
    title: 'Senior React Engineer',
    company: 'Acme',
    location: 'Bengaluru',
    url: 'https://x/job/1',
    salaryText: '₹15 L–25 L',
    source: 'adzuna',
  });
  assert.deepEqual(job, {
    company: 'Acme',
    role: 'Senior React Engineer',
    jdUrl: 'https://x/job/1',
    location: 'Bengaluru',
    salaryRange: '₹15 L–25 L',
    source: 'adzuna',
    status: 'wishlist',
  });
});

test('fills sensible defaults for missing fields', () => {
  const job = openingToJobInput({ title: 'Dev', company: '' });
  assert.equal(job.company, 'Unknown');
  assert.equal(job.jdUrl, null);
  assert.equal(job.location, null);
  assert.equal(job.salaryRange, null);
  assert.equal(job.source, 'live');
  assert.equal(job.status, 'wishlist');
});

test('trims whitespace', () => {
  const job = openingToJobInput({ title: '  Dev  ', company: '  Acme  ', location: ' Pune ' });
  assert.equal(job.role, 'Dev');
  assert.equal(job.company, 'Acme');
  assert.equal(job.location, 'Pune');
});
