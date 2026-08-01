import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { ApiRequestError } from '@/src/lib/api';
import {
  FREE_AI_RESUME_LOCKED_CODE,
  FREE_TRIAL_BLOCK_EVENT,
  FREE_TRIAL_EXHAUSTED_CODE,
  FREE_TRIAL_FEATURE_USED_CODE,
  handleFreeTrialError,
  parseFreeTrialError,
} from '@/src/lib/free-trial';

/**
 * R-098 — client half of the "one free run per AI feature" trial.
 *
 * What must not regress:
 *   1. The two structured 403 codes are recognised and carry the ledger, so
 *      the popup can list what's still free without a second request.
 *   2. Anything else (network, validation, the older FREE_PLAN_AI_BLOCKED)
 *      is NOT swallowed — pages still show their own error.
 *   3. Every AI page routes its failure through `handleFreeTrialError`, so a
 *      spent free run never surfaces as a bare red sentence on one page and
 *      a popup on another.
 */

const webRoot = path.resolve(__dirname, '..');
const read = (rel: string) => readFileSync(path.join(webRoot, rel), 'utf8');

function trialError(code: string, overrides: Record<string, unknown> = {}) {
  const raw = {
    statusCode: 403,
    code,
    message: "You've already used your one free Job-description skill gap run.",
    feature: 'jd-match',
    featureLabel: 'Job-description skill gap',
    upgradeHref: '/pricing',
    byokHref: '/settings',
    trialApplies: true,
    usedCount: 1,
    totalCount: 3,
    remainingCount: 2,
    exhausted: code === FREE_TRIAL_EXHAUSTED_CODE,
    features: [
      { key: 'jd-match', label: 'Job-description skill gap', blurb: 'Paste a JD.', href: '/jd-match', used: true, usedAt: '2026-07-01T00:00:00.000Z' },
      { key: 'tailor', label: 'Tailor resume to a job', blurb: 'Rewrite.', href: '/jd-match', used: false, usedAt: null },
      { key: 'cover-letter', label: 'Cover letter generator', blurb: 'Draft.', href: '/cover-letter', used: false, usedAt: null },
    ],
    ...overrides,
  };
  return new ApiRequestError({
    status: 403,
    code,
    message: String(raw.message),
    errors: [String(raw.message)],
    fields: [],
    raw,
  });
}

test('a spent free run parses into a block carrying the whole ledger', () => {
  const block = parseFreeTrialError(trialError(FREE_TRIAL_FEATURE_USED_CODE));
  assert.ok(block, 'the structured 403 is recognised');
  assert.equal(block.code, FREE_TRIAL_FEATURE_USED_CODE);
  assert.equal(block.featureLabel, 'Job-description skill gap');
  assert.equal(block.exhausted, false);
  assert.equal(block.remainingCount, 2);
  assert.equal(block.features.filter((f) => !f.used).length, 2, 'the popup can list what is still free');
});

test('the exhausted code is always treated as exhausted, whatever the body says', () => {
  const block = parseFreeTrialError(trialError(FREE_TRIAL_EXHAUSTED_CODE, { exhausted: false }));
  assert.ok(block);
  assert.equal(block.exhausted, true);
});

test('unrelated errors are left alone for the page to render', () => {
  assert.equal(parseFreeTrialError(new Error('network down')), null);
  assert.equal(
    parseFreeTrialError(
      new ApiRequestError({
        status: 403,
        code: 'FREE_PLAN_AI_BLOCKED',
        message: 'AI tailoring requires a plan.',
        errors: [],
        fields: [],
        raw: {},
      }),
    ),
    null,
    'the older plan block keeps its own paywall card',
  );
});

test('handleFreeTrialError announces the block and reports that it handled it', () => {
  const received: unknown[] = [];
  const listeners: Record<string, ((e: Event) => void)[]> = {};
  const fakeWindow = {
    dispatchEvent: (event: Event) => {
      received.push((event as CustomEvent).detail);
      (listeners[event.type] || []).forEach((fn) => fn(event));
      return true;
    },
    addEventListener: (type: string, fn: (e: Event) => void) => {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener: () => {},
    CustomEvent,
  };
  const globalRef = globalThis as unknown as { window?: unknown };
  const previous = globalRef.window;
  globalRef.window = fakeWindow;
  try {
    assert.equal(handleFreeTrialError(trialError(FREE_TRIAL_FEATURE_USED_CODE)), true);
    assert.equal(handleFreeTrialError(new Error('boom')), false, 'other failures fall through');
  } finally {
    if (previous === undefined) delete globalRef.window;
    else globalRef.window = previous;
  }
  assert.equal(received.length, 1, 'exactly one popup request per refusal');
});

test('the modal host listens for the same event name the emitter uses', () => {
  const host = read('src/components/FreeTrialLimitModalHost.tsx');
  assert.ok(host.includes('FREE_TRIAL_BLOCK_EVENT'), 'host subscribes via the shared constant');
  assert.equal(FREE_TRIAL_BLOCK_EVENT, 'callbackcv:free-trial-block');
  const layout = read('app/layout.tsx');
  assert.ok(layout.includes('<FreeTrialLimitModalHost />'), 'the host is mounted app-wide');
});

test('every AI surface routes refusals through the shared handler', () => {
  const aiPages = [
    'app/jd-match/JdMatchClient.tsx',
    'app/resume/ResumeEditor.tsx',
    'app/career/CareerNavigatorClient.tsx',
    'app/cover-letter/CoverLetterClient.tsx',
    'app/interview-prep/InterviewPrepClient.tsx',
    'app/linkedin/LinkedInOptimizeClient.tsx',
    'app/mentor/chat/MentorChatClient.tsx',
    'app/recruiter-sim/RecruiterSimClient.tsx',
    'app/skill-demand/SkillDemandClient.tsx',
  ];
  for (const page of aiPages) {
    assert.ok(
      read(page).includes('handleFreeTrialError('),
      `${page} must open the free-trial popup instead of showing a raw error`,
    );
  }
});

test('the popup offers both paths out: the plan and the free own-key route (C-003)', () => {
  const modal = read('src/components/FreeTrialLimitModal.tsx');
  assert.ok(modal.includes('href="/pricing"'), 'upgrade path');
  assert.ok(modal.includes('href="/settings"'), 'own-AI-key path stays visible');
  assert.ok(/Still free for you/.test(modal), 'leads with what the user can still run free');
});

// ── R-103: AI is unlocked on ONE resume ───────────────────────────────────

test('the resume-locked refusal parses with the resume it is bound to', () => {
  const raw = {
    statusCode: 403,
    code: FREE_AI_RESUME_LOCKED_CODE,
    message: 'Your free AI is unlocked on “Senior Consultant CV”.',
    claimedResumeId: 'resume-1',
    claimedResumeTitle: 'Senior Consultant CV',
    upgradeHref: '/pricing',
    byokHref: '/settings',
  };
  const block = parseFreeTrialError(
    new ApiRequestError({
      status: 403,
      code: FREE_AI_RESUME_LOCKED_CODE,
      message: String(raw.message),
      errors: [],
      fields: [],
      raw,
    }),
  );
  assert.ok(block, 'the new code is recognised');
  assert.equal(block.code, FREE_AI_RESUME_LOCKED_CODE);
  assert.equal(block.claimedResumeId, 'resume-1');
  assert.equal(block.claimedResumeTitle, 'Senior Consultant CV');
});

test('the popup names the resume and never claims a run was "used up"', () => {
  const modal = read('src/components/FreeTrialLimitModal.tsx');
  assert.ok(modal.includes('FREE_AI_RESUME_LOCKED_CODE'), 'the modal branches on the new code');
  assert.ok(/Your free AI is on/.test(modal), 'it names where the free AI lives');
  assert.ok(/unlimited/.test(modal), 'and says AI stays unlimited on that resume');
});

test('the editor and JD match bind their AI calls to a resume', () => {
  assert.ok(
    read('app/jd-match/JdMatchClient.tsx').includes('resumeId: activeResumeId || undefined'),
    'JD match sends the active resume so matching stays free on it',
  );
});
