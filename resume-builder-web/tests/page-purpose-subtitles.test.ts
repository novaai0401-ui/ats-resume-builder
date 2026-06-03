import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// User reported confusion: Mentor vs Sahaayak, JD Match vs ATS Score.
// Each page now carries a one-line bold purpose subtitle PLUS an
// inline cross-link to the page it gets confused with. These tests
// pin those subtitles down so a future refactor that strips the copy
// can't silently regress the UX clarity fix.

const root = path.resolve(__dirname, '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

test('Sahaayak page tells users what it is and is NOT', () => {
  const src = read('app/sahaayak/SahaayakClient.tsx');
  // The "companion for the hard days" framing is the elevator pitch.
  assert.match(src, /companion for the hard days/i);
  // Must point at the OTHER pages it gets confused with so users
  // don't end up on Sahaayak when they wanted career strategy.
  assert.match(src, /Not the same as Mentor/i);
  assert.match(src, /ATS \/ JD Match/);
});

test('Mentor page leads with "career strategy" and links to Sahaayak', () => {
  const src = read('app/mentor/MentorClient.tsx');
  assert.match(src, /Career strategy/i);
  // Must offer the emotional-support sibling for users who landed
  // here looking for someone to listen, not advise.
  assert.match(src, /Sahaayak/);
  assert.match(src, /href="\/sahaayak"/);
});

test('JD Match page leads with "this specific job" and links to ATS Score', () => {
  const src = read('app/jd-match/JdMatchClient.tsx');
  assert.match(src, /this specific job/i);
  // The "format vs keyword match" distinction is the whole point.
  assert.match(src, /ATS Score/i);
  assert.match(src, /format/i);
  assert.match(src, /href="\/resume\/ats"/);
});

test('ATS Review page leads with "parse correctly" and links to JD Match', () => {
  const src = read('app/resume/ats/ResumeAtsClient.tsx');
  assert.match(src, /parse/i);
  assert.match(src, /JD Match/i);
  // Must explicitly say JD is OPTIONAL here, since the same JD box
  // also appears on JD Match where it's required.
  assert.match(src, /optional/i);
  assert.match(src, /href="\/jd-match"/);
});

test('every subtitle is plain prose — no Tailwind / framework-class noise', () => {
  // The app has no Tailwind (uses globals.css). A subtitle written
  // with utility classes (e.g. "text-slate-700 font-semibold") would
  // render unstyled. Guard against that regression.
  const tailwindyPatterns = /\btext-(slate|gray|zinc)-\d{3}\b|\bfont-semibold\b/;
  for (const p of [
    'app/sahaayak/SahaayakClient.tsx',
    'app/mentor/MentorClient.tsx',
    'app/jd-match/JdMatchClient.tsx',
    'app/resume/ats/ResumeAtsClient.tsx',
  ]) {
    const src = read(p);
    // Only the new subtitle block — bounded by the page heading
    // (h1 / h2) and the first <textarea> / form element.
    const subtitleRegion = src.slice(0, src.indexOf('<textarea') > 0 ? src.indexOf('<textarea') : src.length);
    assert.doesNotMatch(subtitleRegion, tailwindyPatterns, `${p}: subtitle uses Tailwind classes the app doesn't ship`);
  }
});
