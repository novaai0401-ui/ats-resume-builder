const assert = require('node:assert/strict');
const test = require('node:test');
const { summarizeEvents } = require('../dist/sahaayak/memory-summarizer.js');

const NOW = new Date('2026-05-28T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

test('flags fintech rejection cluster', () => {
  const events = [
    { kind: 'rejection', payload: { company: 'A', industry: 'fintech' }, occurredAt: daysAgo(2) },
    { kind: 'rejection', payload: { company: 'B', industry: 'fintech' }, occurredAt: daysAgo(8) },
    { kind: 'rejection', payload: { company: 'C', industry: 'fintech' }, occurredAt: daysAgo(20) },
  ];
  const out = summarizeEvents(events, NOW);
  assert.ok(out.patterns.some((p) => p.includes('fintech')));
  assert.equal(out.bullets.length, 3);
});

test('flags sustained low mood', () => {
  const events = [
    { kind: 'mood', payload: {}, moodRating: 2, occurredAt: daysAgo(1) },
    { kind: 'mood', payload: {}, moodRating: 1, occurredAt: daysAgo(3) },
    { kind: 'mood', payload: {}, moodRating: 2, occurredAt: daysAgo(5) },
  ];
  const out = summarizeEvents(events, NOW);
  assert.ok(out.patterns.some((p) => p.includes('mood')));
});

test('flags long interview silence', () => {
  const events = [
    { kind: 'interview', payload: { company: 'X' }, occurredAt: daysAgo(20) },
  ];
  const out = summarizeEvents(events, NOW);
  assert.ok(out.patterns.some((p) => p.includes('interview')));
});

test('no patterns when events are sparse and recent', () => {
  const events = [
    { kind: 'interview', payload: { company: 'X' }, occurredAt: daysAgo(2) },
    { kind: 'win', payload: { detail: 'finished portfolio' }, occurredAt: daysAgo(1) },
  ];
  const out = summarizeEvents(events, NOW);
  assert.equal(out.patterns.length, 0);
  assert.equal(out.bullets.length, 2);
});

test('formats offer event prominently', () => {
  const events = [
    { kind: 'offer', payload: { company: 'Acme', role: 'Staff' }, occurredAt: daysAgo(0) },
  ];
  const out = summarizeEvents(events, NOW);
  assert.ok(out.bullets[0].includes('OFFER'));
  assert.ok(out.bullets[0].includes('Acme'));
});
