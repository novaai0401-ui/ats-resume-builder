import assert from 'node:assert/strict';
import test from 'node:test';
import { detectIncompleteText } from '../src/lib/text-completeness';

// Bug users reported: the extracted summary ended mid-sentence with a
// trailing conjunction ("…resulting in improved stakeholder
// satisfaction and") and was saved as-is. detectIncompleteText is the
// helper the editor now uses to surface a warning in those cases.

test('flags a summary that trails off with the conjunction "and"', () => {
  const text =
    '11 years of experience in the IT industry with a strong track record of delivering high-ROI software solutions for enterprise clients in the financial sector. Successfully aligned technology initiatives with business goals, resulting in improved stakeholder satisfaction and';
  const r = detectIncompleteText(text);
  assert.equal(r.looksIncomplete, true);
  assert.match(r.reason, /Looks truncated/);
  assert.match(r.reason, /"and"/);
});

test('flags trailing prepositions like "with" / "to" / "of"', () => {
  for (const tail of ['with', 'to', 'of', 'in', 'for']) {
    const t = `Delivered analytics dashboards integrated with reporting pipelines and dashboards ${tail}`;
    const r = detectIncompleteText(t);
    assert.equal(r.looksIncomplete, true, `tail "${tail}" should flag`);
  }
});

test('flags trailing comma / semicolon at end of paragraph', () => {
  const t = 'Built data pipelines for fraud detection, churn analytics, and customer segmentation,';
  const r = detectIncompleteText(t);
  assert.equal(r.looksIncomplete, true);
  assert.match(r.reason, /comma|semicolon/i);
});

test('does NOT flag a clean sentence ending with a full stop', () => {
  const r = detectIncompleteText(
    'Senior software engineer with 11 years of experience building distributed payment systems for enterprise clients.',
  );
  assert.equal(r.looksIncomplete, false);
  assert.equal(r.reason, '');
});

test('does NOT flag a question or exclamation', () => {
  assert.equal(detectIncompleteText('Looking for a senior IC role that combines architecture and hands-on coding!').looksIncomplete, false);
  assert.equal(detectIncompleteText('Could a single engineer ship this end to end? Yes — I have.').looksIncomplete, false);
});

test('short texts are not flagged — that is a different validator', () => {
  // Below 60 chars the "summary is too short" length validator owns
  // the messaging. We should not double-warn.
  assert.equal(detectIncompleteText('Built things and').looksIncomplete, false);
  assert.equal(detectIncompleteText('').looksIncomplete, false);
  assert.equal(detectIncompleteText('   ').looksIncomplete, false);
});

test('quoted / parenthesised endings are accepted as complete', () => {
  const t = 'Led a 12-person team across four time zones to deliver the platform "Aegis."';
  assert.equal(detectIncompleteText(t).looksIncomplete, false);
});

test('case-insensitive: trailing "AND" / "Or" still flag', () => {
  assert.equal(
    detectIncompleteText('Delivered a strong record of payments infrastructure across India, US, UK AND').looksIncomplete,
    true,
  );
  assert.equal(
    detectIncompleteText('Led teams across multiple geographies including India, US, UK, Singapore Or').looksIncomplete,
    true,
  );
});
