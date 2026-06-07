import assert from 'node:assert/strict';
import test from 'node:test';
import { isEmptyDraft, shouldShowHydrationLoader } from '../src/lib/hydration-gate';

// Regression guard for the "Continue to Review screen is flickering"
// bug. The previous build of the editor showed the hydration spinner
// on EVERY api.getResume call, including the silent background
// re-fetch that runs right after autosave assigns an id. That toggled
// the loader on/off and made the screen flicker. The rule now: show
// the loader ONLY when the editor is empty (initial load).

function emptyInput() {
  return {
    summary: '',
    skills: [],
    languages: [],
    experience: [],
    education: [],
    projects: [],
    achievements: [],
    certifications: [],
  };
}

// --------------------------------------------------------------------
// isEmptyDraft — every meaningful field on its own counts as content
// --------------------------------------------------------------------

test('a truly empty draft is reported empty', () => {
  assert.equal(isEmptyDraft(emptyInput()), true);
});

test('whitespace-only fields still count as empty', () => {
  assert.equal(
    isEmptyDraft({ ...emptyInput(), summary: '   ', skills: ['', ' ', '\t'] }),
    true,
  );
});

test('a non-empty summary counts as content', () => {
  assert.equal(isEmptyDraft({ ...emptyInput(), summary: 'Senior engineer.' }), false);
});

test('a non-empty skill counts as content', () => {
  assert.equal(isEmptyDraft({ ...emptyInput(), skills: ['React'] }), false);
});

test('a non-empty language counts as content', () => {
  assert.equal(isEmptyDraft({ ...emptyInput(), languages: ['English'] }), false);
});

test('an achievement counts as content', () => {
  assert.equal(isEmptyDraft({ ...emptyInput(), achievements: ['Won the Rising Star award'] }), false);
});

test('an experience entry with a company OR a role counts as content', () => {
  assert.equal(
    isEmptyDraft({ ...emptyInput(), experience: [{ company: 'Acme', role: '' }] }),
    false,
  );
  assert.equal(
    isEmptyDraft({ ...emptyInput(), experience: [{ company: '', role: 'Engineer' }] }),
    false,
  );
});

test('an experience entry with only a highlight (no company/role yet) counts as content', () => {
  assert.equal(
    isEmptyDraft({ ...emptyInput(), experience: [{ company: '', role: '', highlights: ['Built X'] }] }),
    false,
  );
});

test('an education entry with an institution OR a degree counts as content', () => {
  assert.equal(
    isEmptyDraft({ ...emptyInput(), education: [{ institution: 'IIT', degree: '' }] }),
    false,
  );
});

test('a project with a name OR a highlight counts as content', () => {
  assert.equal(
    isEmptyDraft({ ...emptyInput(), projects: [{ name: 'PocketResume', highlights: [] }] }),
    false,
  );
  assert.equal(
    isEmptyDraft({ ...emptyInput(), projects: [{ name: '', highlights: ['Shipped v1'] }] }),
    false,
  );
});

test('a certification with a name counts as content', () => {
  assert.equal(
    isEmptyDraft({ ...emptyInput(), certifications: [{ name: 'AWS Certified' }] }),
    false,
  );
});

// --------------------------------------------------------------------
// shouldShowHydrationLoader — the actual flicker-prevention rule
// --------------------------------------------------------------------

test('shows the loader on the FIRST load (editor empty + fetch in flight)', () => {
  assert.equal(shouldShowHydrationLoader(true, emptyInput()), true);
});

test('does NOT show the loader on a background re-fetch (editor has content)', () => {
  // This is the exact regression case: the editor already has the
  // user's resume on screen (from the autosave path) and a refresh
  // fires because effectiveResumeId flipped from '' to the new id.
  // The loader must stay off.
  const withContent = { ...emptyInput(), summary: 'Senior engineer with 10 years experience.' };
  assert.equal(shouldShowHydrationLoader(true, withContent), false);
});

test('never shows the loader when nothing is in flight', () => {
  assert.equal(shouldShowHydrationLoader(false, emptyInput()), false);
  assert.equal(shouldShowHydrationLoader(false, { ...emptyInput(), summary: 'x'.repeat(50) }), false);
});

test('exactly the case users reported: post-autosave id flip', () => {
  // Sequence:
  //  1. User uploads → lands on /resume/review (no ?id= in URL).
  //  2. Pending-upload effect populates the draft from local session.
  //  3. Autosave runs, server assigns an id, session storage is
  //     updated, effectiveResumeId flips '' → '<new id>'.
  //  4. The load useEffect re-runs because effectiveResumeId changed.
  //  5. At this moment the draft is ALREADY populated → loader off.
  const after = {
    ...emptyInput(),
    summary: 'A real summary the user just uploaded.',
    experience: [{ company: 'Acme', role: 'Engineer', highlights: ['Built things'] }],
  };
  assert.equal(shouldShowHydrationLoader(true, after), false);
});
