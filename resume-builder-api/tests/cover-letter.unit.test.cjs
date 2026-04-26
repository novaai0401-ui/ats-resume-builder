'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  buildCoverLetterPrompt,
  buildFallbackCoverLetter,
  countWords,
} = require('../dist/ai/prompts/cover-letter.prompt.js');
const { parseCoverLetterJson } = require('../dist/ai/cover-letter.service.js');

describe('buildCoverLetterPrompt', () => {
  it('embeds candidate, target, and tone in the user prompt JSON', () => {
    const { system, user } = buildCoverLetterPrompt({
      fullName: 'Ada Lovelace',
      company: 'Analytical Engines Inc.',
      role: 'Lead Software Engineer',
      tone: 'professional',
      summary: 'Mathematician-engineer who writes provably correct code.',
      skills: ['Python', 'Systems Design', 'Tech Leadership'],
      experience: [
        {
          company: 'Babbage Labs',
          role: 'Principal Engineer',
          startDate: '2020-01',
          endDate: '2024-01',
          highlights: ['Led 8 engineers to ship the Difference Engine SDK.'],
        },
      ],
      education: [{ institution: 'Imperial College', degree: 'BSc Mathematics' }],
      jdText: 'We need a leader who can build SDKs and hire engineers.',
    });

    assert.match(system, /first-person voice/);
    assert.match(system, /professional/i);
    const parsed = JSON.parse(user);
    assert.equal(parsed.target.company, 'Analytical Engines Inc.');
    assert.equal(parsed.target.role, 'Lead Software Engineer');
    assert.equal(parsed.candidate.fullName, 'Ada Lovelace');
    assert.equal(parsed.tone, 'professional');
    assert.ok(parsed.candidate.skills.includes('Python'));
    assert.equal(parsed.candidate.experience.length, 1);
  });

  it('clamps long skill + experience arrays', () => {
    const skills = Array.from({ length: 40 }, (_, i) => `skill-${i}`);
    const experience = Array.from({ length: 10 }, (_, i) => ({
      company: `Co${i}`,
      role: `Role${i}`,
      highlights: Array.from({ length: 20 }, (_, j) => `hl-${i}-${j}`),
    }));
    const { user } = buildCoverLetterPrompt({
      company: 'X',
      role: 'Y',
      tone: 'concise',
      skills,
      experience,
    });
    const parsed = JSON.parse(user);
    assert.ok(parsed.candidate.skills.length <= 24);
    assert.ok(parsed.candidate.experience.length <= 4);
    for (const job of parsed.candidate.experience) {
      assert.ok(job.highlights.length <= 4);
    }
  });

  it('falls back to professional tone when an unknown tone is passed', () => {
    const { system } = buildCoverLetterPrompt({
      company: 'Co',
      role: 'R',
      // @ts-expect-error testing runtime guard
      tone: 'whimsical',
    });
    assert.match(system, /professional/i);
  });
});

describe('buildFallbackCoverLetter', () => {
  it('produces a letter with salutation, body, and signature', () => {
    const body = buildFallbackCoverLetter({
      fullName: 'Grace Hopper',
      company: 'Navy Systems',
      role: 'Compiler Architect',
      tone: 'professional',
      summary: 'Invented the first compiler.',
      skills: ['COBOL', 'FLOW-MATIC'],
      experience: [
        {
          company: 'US Navy',
          role: 'Rear Admiral',
          highlights: ['Wrote the A-0 system.'],
        },
      ],
    });
    assert.match(body, /Dear Navy Systems Hiring Team/);
    assert.match(body, /Grace Hopper/);
    assert.match(body, /Compiler Architect/);
    assert.match(body, /Sincerely/);
  });
});

describe('countWords', () => {
  it('counts plain words and strips markdown punctuation', () => {
    assert.equal(countWords('Hello world'), 2);
    assert.equal(countWords('**Hello** _world_ `test`'), 3);
    assert.equal(countWords(''), 0);
  });
});

describe('parseCoverLetterJson', () => {
  it('accepts a strict JSON response', () => {
    const raw = JSON.stringify({
      body: 'Dear Hiring Team,\n\nI am excited to apply.\n\nSincerely,\nCandidate',
      wordCount: 11,
    });
    const parsed = parseCoverLetterJson(raw);
    assert.match(parsed.body, /Dear Hiring Team/);
    assert.equal(parsed.wordCount, 11);
  });

  it('extracts JSON embedded in surrounding text', () => {
    const raw = 'Sure, here you go:\n```\n' +
      JSON.stringify({ body: 'Dear Team,\n\nI am writing to apply.\n\nSincerely,\nMe', wordCount: 8 }) +
      '\n```';
    const parsed = parseCoverLetterJson(raw);
    assert.match(parsed.body, /Dear Team/);
  });

  it('falls back to raw body when JSON is missing but letter text is present', () => {
    const raw = 'Dear Hiring Team,\n\nI am applying for the role.\n\nSincerely,\nCandidate';
    const parsed = parseCoverLetterJson(raw);
    assert.match(parsed.body, /Dear Hiring Team/);
    assert.ok(parsed.wordCount > 0);
  });

  it('throws when the response is unusable', () => {
    assert.throws(() => parseCoverLetterJson('nope'), /usable cover letter/);
  });
});
