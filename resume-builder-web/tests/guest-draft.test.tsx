import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { JSDOM } from 'jsdom';

/**
 * Guest resume drafting (try-before-signup) pinning tests.
 *
 * Contract under test:
 *  (a) The editor renders WITHOUT a token, shows the "device only"
 *      draft banner, and fires NO authed API calls.
 *  (b) The local guest draft persists through the localStorage shim
 *      (rb_guest_draft, canonical ResumeDraft shape).
 *  (c) An authed load with a pending guest draft creates the resume
 *      from the draft via api.createResume, then clears the key.
 *  (d) Account-gated actions (Export) in guest mode open the signup
 *      dialog instead of silently no-oping.
 */

process.env.NEXT_TEST_MOCK_ROUTER = '1';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/resume' });
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;
globalThis.navigator = dom.window.navigator;
globalThis.self = dom.window;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
globalThis.requestAnimationFrame =
  dom.window.requestAnimationFrame?.bind(dom.window) ??
  ((callback: FrameRequestCallback) => setTimeout(callback, 0) as unknown as number);
(globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame =
  (id: number) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>);

if (typeof (dom.window as unknown as { matchMedia?: unknown }).matchMedia !== 'function') {
  Object.defineProperty(dom.window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
(globalThis as unknown as { matchMedia: typeof window.matchMedia }).matchMedia =
  (dom.window as unknown as { matchMedia: typeof window.matchMedia }).matchMedia;

// No real network in tests — anything that escapes the api spy rejects fast.
(globalThis as unknown as { fetch: typeof fetch }).fetch = (() =>
  Promise.reject(new Error('network disabled in tests'))) as typeof fetch;

import {
  GUEST_DRAFT_KEY,
  clearGuestDraft,
  readGuestDraft,
  saveGuestDraft,
  shouldImportGuestDraft,
  shouldRestoreGuestDraft,
} from '../src/lib/guest-draft';
import { getEmptyResumeDraft, type ResumeDraft } from '../src/lib/resume-store';

type TestingLib = typeof import('@testing-library/react');

let testingLibPromise: Promise<TestingLib> | null = null;
function getTestingLib() {
  if (!testingLibPromise) {
    testingLibPromise = import('@testing-library/react');
  }
  return testingLibPromise;
}

function buildValidResume(): ResumeDraft {
  return {
    ...getEmptyResumeDraft(),
    title: 'Guest Resume',
    contact: { fullName: 'Guest User', email: 'guest@example.com' },
    summary: 'Product engineer with 6 years of experience shipping resilient web platforms.',
    skills: ['TypeScript', 'React', 'Node.js'],
    technicalSkills: ['TypeScript', 'React', 'Node.js'],
    softSkills: ['Collaboration'],
    languages: ['English'],
    experience: [
      {
        company: 'Acme Technologies',
        role: 'Senior Engineer',
        startDate: '2021-02',
        endDate: 'Present',
        highlights: ['Led modernization of the billing platform serving 40000 users.'],
      },
    ],
    education: [
      {
        institution: 'State University',
        degree: 'B.Tech Computer Science',
        startDate: '2014-08',
        endDate: '2018-05',
        details: [],
        gpa: null,
        percentage: null,
      },
    ],
    templateId: 'classic',
  };
}

// The editor uses the GLOBAL api singleton. Spy by patching its methods
// in place; every authed method records into `authedCalls` so guest
// renders can assert zero authed traffic.
const authedCalls: string[] = [];
let createdPayloads: Array<Record<string, unknown>> = [];

async function installApiSpy() {
  const { api } = await import('../src/lib/api');
  const record = (name: string) => {
    authedCalls.push(name);
  };
  const target = api as unknown as Record<string, unknown>;
  target.getFeatureFlags = async () => ({ paymentFeatureEnabled: false }); // public endpoint — not counted
  target.getDownloadChargeConfig = async () => { record('getDownloadChargeConfig'); return { enabled: false }; };
  target.getBillingStatus = async () => { record('getBillingStatus'); return { plan: 'FREE' }; };
  target.getResume = async (id: string) => { record('getResume'); throw new Error(`unexpected getResume(${id})`); };
  target.updateResume = async () => { record('updateResume'); throw new Error('unexpected updateResume'); };
  target.recomputeResume = async () => { record('recomputeResume'); return { roleLevel: 'MID' }; };
  target.atsScore = async () => { record('atsScore'); throw new Error('unexpected atsScore'); };
  target.createResume = async (payload: Record<string, unknown>) => {
    record('createResume');
    createdPayloads.push(payload);
    const now = new Date().toISOString();
    return {
      id: 'resume-from-guest-1',
      createdAt: now,
      updatedAt: now,
      ...payload,
    };
  };
  return api;
}

async function resetSharedState() {
  const { useResumeStore } = await import('../src/lib/resume-store');
  useResumeStore.getState().resetResume();
  window.localStorage.clear();
  window.sessionStorage.clear();
  authedCalls.length = 0;
  createdPayloads = [];
}

test.afterEach(async () => {
  const { cleanup } = await getTestingLib();
  cleanup();
  await resetSharedState();
});

test.after(() => {
  try {
    (dom.window as unknown as { close?: () => void }).close?.();
  } catch {
    // best-effort teardown
  }
});

// ── (b) local draft persistence via the localStorage shim ────────────

test('guest draft persists and clears via localStorage (rb_guest_draft)', () => {
  const resume = buildValidResume();
  assert.equal(saveGuestDraft(resume), true);
  assert.ok(window.localStorage.getItem(GUEST_DRAFT_KEY));

  const restored = readGuestDraft();
  assert.ok(restored);
  assert.equal(restored?.resume.contact.fullName, 'Guest User');
  assert.equal(restored?.resume.templateId, 'classic');
  assert.ok((restored?.savedAt || 0) > 0);

  clearGuestDraft();
  assert.equal(readGuestDraft(), null);
  assert.equal(window.localStorage.getItem(GUEST_DRAFT_KEY), null);
});

test('corrupt guest draft payloads read as null instead of throwing', () => {
  window.localStorage.setItem(GUEST_DRAFT_KEY, '{not json');
  assert.equal(readGuestDraft(), null);
  window.localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ nope: true }));
  assert.equal(readGuestDraft(), null);
});

// ── pure gates for restore / handoff ─────────────────────────────────

test('shouldRestoreGuestDraft: only for tokenless visitors with a free editor surface', () => {
  const base = { hasToken: false, resumeId: '', flowParam: '', hasPendingUpload: false, hasDraft: true };
  assert.equal(shouldRestoreGuestDraft(base), true);
  assert.equal(shouldRestoreGuestDraft({ ...base, hasToken: true }), false);
  assert.equal(shouldRestoreGuestDraft({ ...base, resumeId: 'r1' }), false);
  assert.equal(shouldRestoreGuestDraft({ ...base, flowParam: 'scratch' }), false);
  assert.equal(shouldRestoreGuestDraft({ ...base, hasPendingUpload: true }), false);
  assert.equal(shouldRestoreGuestDraft({ ...base, hasDraft: false }), false);
});

test('shouldImportGuestDraft: token + draft + no resume id + no pending upload', () => {
  const base = { hasToken: true, resumeId: '', hasDraft: true, hasPendingUpload: false };
  assert.equal(shouldImportGuestDraft(base), true);
  assert.equal(shouldImportGuestDraft({ ...base, hasToken: false }), false);
  assert.equal(shouldImportGuestDraft({ ...base, resumeId: 'r1' }), false);
  assert.equal(shouldImportGuestDraft({ ...base, hasDraft: false }), false);
  assert.equal(shouldImportGuestDraft({ ...base, hasPendingUpload: true }), false);
});

// ── (a) guest editor render: banner shown, zero authed API calls ─────

test('guest editor renders without a token, shows the device-only banner, fires no authed API calls', async () => {
  await installApiSpy();
  saveGuestDraft(buildValidResume());
  const { render, screen } = await getTestingLib();
  const { default: ResumeEditor } = await import('../app/resume/ResumeEditor');

  render(React.createElement(ResumeEditor));

  const banner = await screen.findByTestId('guest-draft-banner', undefined, { timeout: 15_000 });
  assert.match(banner.textContent || '', /Draft saved on this device only/i);
  assert.match(banner.textContent || '', /Create free account/i);
  // Restored draft is visible (came from localStorage, not the API).
  await screen.findByDisplayValue('Guest User', undefined, { timeout: 15_000 });

  // Give mount-time effects a beat to fire anything they were going to.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.deepEqual(authedCalls, [], `expected no authed API calls in guest mode, got: ${authedCalls.join(', ')}`);
});

// ── (d) gated action: Export in guest mode opens the signup dialog ───

test('export click in guest mode opens the signup dialog instead of calling the API', async () => {
  await installApiSpy();
  saveGuestDraft(buildValidResume());
  const { render, screen, fireEvent, waitFor } = await getTestingLib();
  const { default: ResumeEditor } = await import('../app/resume/ResumeEditor');

  render(React.createElement(ResumeEditor));

  const exportButton = await screen.findByRole('button', { name: /^Export$/i }, { timeout: 15_000 });
  await waitFor(() => {
    assert.equal((exportButton as HTMLButtonElement).disabled, false, 'Export should be enabled for a valid guest draft');
  }, { timeout: 15_000 });

  fireEvent.click(exportButton);

  const dialog = await screen.findByTestId('guest-gate-dialog', undefined, { timeout: 15_000 });
  assert.match(dialog.textContent || '', /your draft comes with you/i);
  assert.equal(authedCalls.filter((name) => name === 'atsScore').length, 0);
  // Draft survives the gated click.
  assert.ok(readGuestDraft());
});

// ── (c) authed load imports the pending guest draft then clears it ───

test('authed load with a pending guest draft creates the resume from the draft and clears the key', async () => {
  await installApiSpy();
  saveGuestDraft(buildValidResume());
  window.localStorage.setItem('accessToken', 'test-access-token');
  window.localStorage.setItem('refreshToken', 'test-refresh-token');

  const { render, screen, waitFor } = await getTestingLib();
  const { default: ResumeEditor } = await import('../app/resume/ResumeEditor');

  render(React.createElement(ResumeEditor));

  await waitFor(() => {
    assert.equal(authedCalls.includes('createResume'), true, 'expected api.createResume for the guest draft');
  }, { timeout: 15_000 });

  await waitFor(() => {
    assert.equal(window.localStorage.getItem(GUEST_DRAFT_KEY), null, 'guest draft key should be cleared after import');
  }, { timeout: 15_000 });

  assert.equal(createdPayloads.length, 1);
  const payload = createdPayloads[0] as { contact?: { fullName?: string }; summary?: string };
  assert.equal(payload.contact?.fullName, 'Guest User');
  assert.match(payload.summary || '', /Product engineer/i);
  // No guest banner for an authed user.
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(screen.queryByTestId('guest-draft-banner'), null);
});
