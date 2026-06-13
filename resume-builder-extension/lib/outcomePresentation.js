/**
 * Extension mirror of resume-builder-shared/src/outcome-presentation.ts.
 *
 * The canonical logic + unit tests live in the shared package; the extension
 * ships as plain ES modules with no bundler, so this is a deliberate thin copy
 * kept byte-aligned with the shared thresholds/colors. Change one, change both.
 */

const VERDICT_PRESENTATION = {
  advance: { label: 'Advance', color: '#147a3a', background: 'rgba(22,163,74,0.12)', blurb: 'The AI screen would forward you to a human.' },
  maybe: { label: 'Borderline', color: '#b07906', background: 'rgba(176,121,6,0.12)', blurb: 'On the fence — a recruiter would have to take a closer look.' },
  reject: { label: 'Reject', color: '#a8412c', background: 'rgba(168,65,44,0.12)', blurb: 'The AI screen would likely filter you out for this role.' },
};

export function presentVerdict(verdict) {
  return VERDICT_PRESENTATION[verdict] ?? VERDICT_PRESENTATION.maybe;
}

export const CALLBACK_MIN_SAMPLE = 5;

export function formatCallbackRate(rate, applied) {
  if (!Number.isFinite(rate) || applied < CALLBACK_MIN_SAMPLE) return '—';
  const pct = Math.round(Math.max(0, Math.min(1, rate)) * 100);
  return `${pct}%`;
}

export function callbackRateColor(rate, applied) {
  if (!Number.isFinite(rate) || applied < CALLBACK_MIN_SAMPLE) return '#7a8aa0';
  const pct = rate * 100;
  if (pct >= 20) return '#147a3a';
  if (pct >= 8) return '#b07906';
  return '#a8412c';
}
