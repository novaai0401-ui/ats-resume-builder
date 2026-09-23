import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * R-125 — no resume-shaped documents under `public/`.
 *
 * Eight PDFs of a real, named user — `seemaalmasyunusshaikh_28Feb_44.pdf`
 * through `_51.pdf`, carrying her name in the PDF title and her phone number
 * in a `tel:` link — sat in `public/assets/templates/` from commit 9b1c580
 * until R-125. Nothing referenced them: grep across ts/tsx/css/json/js for the
 * filenames and for the string `assets/templates` returned nothing. They were
 * staged there while debugging the unstyled-export bug and never removed.
 *
 * Everything under `public/` is served verbatim by Next, so each one was
 * fetchable unauthenticated at `/assets/templates/<name>.pdf` — while
 * `/privacy` promised resume content lives in the user's account, encrypted.
 * That is C-003: copy the code does not deliver.
 *
 * The rule pinned here is about FORMATS, not about whether a file is
 * referenced. `public/` is served by convention, so "no grep hit" cannot prove
 * an asset is unused, and a guard that flags live assets gets switched off the
 * first time it cries wolf. A .pdf/.doc/.docx under `public/` has no
 * legitimate use in this app either way — the real template previews are SVG.
 */

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const FORBIDDEN_EXT = new Set(['.pdf', '.doc', '.docx']);

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, found);
    } else if (FORBIDDEN_EXT.has(path.extname(entry).toLowerCase())) {
      found.push(path.relative(PUBLIC_DIR, full));
    }
  }
  return found;
}

test('public/ serves no PDF or Word documents', () => {
  const offenders = walk(PUBLIC_DIR);
  assert.deepEqual(
    offenders,
    [],
    'Files under public/ are served unauthenticated at their path. These must ' +
      'not be documents — a user resume staged here is a privacy incident, not ' +
      'a static asset:\n  ' +
      offenders.join('\n  '),
  );
});

test('the specific files R-125 removed are gone', () => {
  // Named explicitly so a revert that re-adds them fails with the reason,
  // not just a generic extension match.
  const offenders = walk(PUBLIC_DIR).filter((p) => /seemaalmas/i.test(p));
  assert.deepEqual(offenders, [], 'R-125 removed these; they are one user’s real resumes.');
});
