import assert from 'node:assert/strict';
import test from 'node:test';
import { openingToApplicationPayload } from '../lib/jobs-util.js';

test('maps a full opening to a wishlist application payload', () => {
  const p = openingToApplicationPayload({
    title: 'Backend Engineer', company: 'Acme', location: 'Pune',
    url: 'https://x/1', salaryText: '₹20 L', source: 'adzuna',
  });
  assert.deepEqual(p, {
    company: 'Acme', role: 'Backend Engineer', jdUrl: 'https://x/1',
    location: 'Pune', salaryRange: '₹20 L', source: 'adzuna', status: 'wishlist',
  });
});

test('defaults missing fields safely', () => {
  const p = openingToApplicationPayload({ title: 'Dev' });
  assert.equal(p.company, 'Unknown');
  assert.equal(p.jdUrl, null);
  assert.equal(p.source, 'live');
  assert.equal(p.status, 'wishlist');
});

test('trims whitespace and tolerates empty input', () => {
  assert.equal(openingToApplicationPayload({ title: ' Dev ', company: ' Acme ' }).role, 'Dev');
  assert.equal(openingToApplicationPayload({}).company, 'Unknown');
});
