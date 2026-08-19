import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guards the responsive grid against silent horizontal overflow.
 *
 * `html, body { overflow-x: hidden }` means an over-wide row never produces a
 * scrollbar — it just slices content off the right edge. So this class of bug
 * is invisible in desktop testing and only shows up as "text is cut off" on a
 * real phone, which is how it reached users on /templates/preview and the
 * account page.
 *
 * The specific failure: the mobile breakpoint reduces .grid to 6 tracks, but
 * .col-12 was left mapped to `span 12`. A span wider than the track count makes
 * the browser generate implicit columns, so the row rendered about twice the
 * viewport width.
 */

// Comments are stripped before any analysis. The rules here explain themselves
// in prose that names the very selectors being checked, so scanning raw CSS
// made a comment mentioning `.col-12` look like a rule for it — the test passed
// while the bug was present.
const CSS = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);
const TSX_ROOTS = ['app', 'src'];

/** Every `.col-N` that has a rule at the top level. */
function definedColumns(): Set<number> {
  return new Set(
    [...CSS.matchAll(/^\.col-(\d+)\s*[,{]/gm)].map((m) => Number(m[1])),
  );
}

/** The `@media (max-width: 1023.98px)` block, where columns collapse. */
function mobileBlock(): string {
  const start = CSS.indexOf('@media (max-width: 1023.98px)');
  assert.ok(start > -1, 'mobile breakpoint block not found');
  // Walk braces so nested rules are included and we stop at the right place.
  let depth = 0;
  for (let i = CSS.indexOf('{', start); i < CSS.length; i++) {
    if (CSS[i] === '{') depth++;
    else if (CSS[i] === '}') {
      depth--;
      if (depth === 0) return CSS.slice(start, i + 1);
    }
  }
  throw new Error('unterminated mobile breakpoint block');
}

test('the mobile grid track count is known, and no column may span more than it', () => {
  const block = mobileBlock();
  const tracks = block.match(/\.grid\s*\{[^}]*grid-template-columns:\s*repeat\((\d+),/);
  assert.ok(tracks, '.grid must set an explicit track count at the mobile breakpoint');
  const trackCount = Number(tracks[1]);

  // Collect the span each column is given inside the mobile block.
  const spans = new Map<number, number>();
  for (const rule of block.matchAll(/((?:\.col-\d+\s*,\s*)*\.col-\d+)\s*\{([^}]*)\}/g)) {
    const span = rule[2].match(/grid-column:\s*span\s+(\d+)/);
    if (!span) continue;
    for (const sel of rule[1].matchAll(/\.col-(\d+)/g)) {
      spans.set(Number(sel[1]), Number(span[1]));
    }
  }

  for (const [col, span] of spans) {
    assert.ok(
      span <= trackCount,
      `.col-${col} spans ${span} inside a ${trackCount}-track grid — the browser will add ` +
        'implicit columns and the row will overflow the viewport',
    );
  }
});

test('every defined column collapses at the mobile breakpoint', () => {
  const block = mobileBlock();
  const collapsed = new Set(
    [...block.matchAll(/\.col-(\d+)/g)].map((m) => Number(m[1])),
  );
  for (const col of definedColumns()) {
    assert.ok(
      collapsed.has(col),
      `.col-${col} has no mobile rule, so it keeps its desktop span on phones. ` +
        'If that span exceeds the mobile track count the row overflows and, because ' +
        'body has overflow-x: hidden, the content is clipped rather than scrollable.',
    );
  }
});

test('every column class used in the app is actually defined', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const used = new Set<number>();

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(/\bcol-(\d+)\b/g)) used.add(Number(m[1]));
    }
  };
  TSX_ROOTS.forEach((root) => {
    try {
      walk(join(process.cwd(), root));
    } catch {
      /* root may not exist in every checkout */
    }
  });

  const defined = definedColumns();
  for (const col of used) {
    assert.ok(
      defined.has(col),
      `col-${col} is used in the app but has no CSS rule, so those cells fall back to ` +
        '`grid-column: auto` and render as a single-track sliver',
    );
  }
});
