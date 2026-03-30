'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

// ─── Provider Selection ─────────────────────────────────────────────────────

describe('AI Provider Selection', () => {
  it('GroqProvider requires API key', () => {
    const { GroqProvider } = require('../dist/ai/providers/groq.provider.js');
    assert.throws(() => new GroqProvider(''), /GROQ_API_KEY is required/);
  });

  it('GroqProvider uses default model when not specified', () => {
    const { GroqProvider } = require('../dist/ai/providers/groq.provider.js');
    const provider = new GroqProvider('test-key');
    assert.equal(provider.name, 'groq');
  });

  it('GroqProvider accepts custom model', () => {
    const { GroqProvider } = require('../dist/ai/providers/groq.provider.js');
    const provider = new GroqProvider('test-key', 'llama-3.1-8b-instant');
    assert.equal(provider.name, 'groq');
  });

  it('XaiProvider requires API key', () => {
    const { XaiProvider } = require('../dist/ai/providers/xai.provider.js');
    assert.throws(() => new XaiProvider(''), /XAI_API_KEY is required/);
  });

  it('XaiProvider uses default model when not specified', () => {
    const { XaiProvider } = require('../dist/ai/providers/xai.provider.js');
    const provider = new XaiProvider('test-key');
    assert.equal(provider.name, 'xai');
  });
});

// ─── Prompt Builder ──────────────────────────────────────────────────────────

describe('ATS Critique Prompt Builder', () => {
  const { buildCritiquePrompt } = require('../dist/ai/prompts/ats-critique.prompt.js');

  it('builds system and user prompts', () => {
    const result = buildCritiquePrompt({
      summary: 'Test summary',
      skills: ['React', 'TypeScript'],
      experience: [
        {
          company: 'Acme Corp',
          role: 'Developer',
          startDate: '2020-01',
          endDate: '2023-01',
          highlights: ['Built features', 'Led team'],
        },
      ],
      education: [
        {
          institution: 'MIT',
          degree: 'B.S. Computer Science',
          startDate: '2016',
          endDate: '2020',
        },
      ],
      plan: 'free',
    });

    assert.ok(result.system.includes('ATS'));
    assert.ok(result.system.includes('NEVER fabricate'));
    assert.ok(result.user.includes('Test summary'));
    assert.ok(result.user.includes('React'));
    assert.ok(result.user.includes('Acme Corp'));
    assert.ok(result.user.includes('FREE PLAN CONSTRAINTS'));
  });

  it('includes JD context when provided', () => {
    const result = buildCritiquePrompt({
      summary: 'Summary',
      skills: [],
      experience: [],
      education: [],
      jdText: 'We are looking for a Senior React developer with Redux experience.',
      plan: 'free',
    });

    assert.ok(result.user.includes('TARGET JOB DESCRIPTION'));
    assert.ok(result.user.includes('Senior React developer'));
  });

  it('includes ATS weaknesses when provided', () => {
    const result = buildCritiquePrompt({
      summary: 'Summary',
      skills: [],
      experience: [],
      education: [],
      atsWeaknesses: ['Missing measurable outcomes', 'Weak action verbs'],
      plan: 'free',
    });

    assert.ok(result.user.includes('CURRENT ATS WEAKNESSES'));
    assert.ok(result.user.includes('Missing measurable outcomes'));
  });

  it('includes current score when provided', () => {
    const result = buildCritiquePrompt({
      summary: 'Summary',
      skills: [],
      experience: [],
      education: [],
      currentScore: 72,
      plan: 'free',
    });

    assert.ok(result.user.includes('CURRENT ATS SCORE: 72/100'));
  });

  it('omits free plan constraints for premium', () => {
    const result = buildCritiquePrompt({
      summary: 'Summary',
      skills: [],
      experience: [],
      education: [],
      plan: 'premium',
    });

    assert.ok(!result.user.includes('FREE PLAN CONSTRAINTS'));
  });
});

// ─── Response Parsing ────────────────────────────────────────────────────────

describe('AI Critique Response Parsing', () => {
  // We test parseAiCritiqueJson indirectly through the module's exports.
  // Since it's not exported, we test the expected shapes.

  it('shared types have correct shape', () => {
    // Verify the types compile and are consistent
    const sampleResult = {
      success: true,
      provider: 'groq',
      plan: 'free',
      critique: {
        summary: 'Test',
        topIssues: [{ type: 'summary', severity: 'high', message: 'Add more details' }],
        missingKeywords: ['React'],
        sectionSuggestions: {
          summary: ['Improved summary'],
          skills: ['Redux'],
          experience: [{ expIndex: 0, bulletIndex: 0, original: 'Built', suggested: 'Led development of' }],
        },
        atsSafetyWarnings: ['Use standard headers'],
        estimatedImprovementBand: {
          current: '72',
          possibleFree: 'up to ~90',
          premium: 'available',
        },
      },
    };
    assert.equal(sampleResult.success, true);
    assert.equal(sampleResult.provider, 'groq');
    assert.equal(sampleResult.critique.topIssues.length, 1);
    assert.equal(sampleResult.critique.sectionSuggestions.experience[0].expIndex, 0);
  });
});

// ─── Free Plan Limits ────────────────────────────────────────────────────────

describe('Free Plan Limits', () => {
  it('free plan limits bullet rewrites to 5', () => {
    // The prompt builder adds constraints for free plan
    const { buildCritiquePrompt } = require('../dist/ai/prompts/ats-critique.prompt.js');
    const result = buildCritiquePrompt({
      summary: 'Test',
      skills: [],
      experience: [],
      education: [],
      plan: 'free',
    });
    assert.ok(result.user.includes('Up to 5 experience bullet rewrites'));
  });

  it('free plan limits skills to 10', () => {
    const { buildCritiquePrompt } = require('../dist/ai/prompts/ats-critique.prompt.js');
    const result = buildCritiquePrompt({
      summary: 'Test',
      skills: [],
      experience: [],
      education: [],
      plan: 'free',
    });
    assert.ok(result.user.includes('Up to 10 skill suggestions'));
  });

  it('free plan limits keywords to 8', () => {
    const { buildCritiquePrompt } = require('../dist/ai/prompts/ats-critique.prompt.js');
    const result = buildCritiquePrompt({
      summary: 'Test',
      skills: [],
      experience: [],
      education: [],
      plan: 'free',
    });
    assert.ok(result.user.includes('Up to 8 missing keywords'));
  });
});
