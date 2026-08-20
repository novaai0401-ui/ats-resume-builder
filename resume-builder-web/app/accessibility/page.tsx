import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '@/src/lib/support';

export const metadata: Metadata = {
  title: 'Accessibility — CallbackCV',
  description:
    'CallbackCV accessibility statement: WCAG 2.1 AA target, what works today, known gaps, and how to report a barrier.',
  alternates: { canonical: '/accessibility' },
};

/**
 * Accessibility statement. States the target and the KNOWN GAPS honestly —
 * a statement that claims perfection is the one thing screen-reader users
 * distrust on sight.
 */
export default function AccessibilityPage() {
  return (
    <main className="container" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px' }}>
      <h1>Accessibility</h1>
      <p>
        CallbackCV targets <strong>WCAG 2.1 AA</strong>. The interface is built on tekivex-ui,
        which implements WAI-ARIA 1.2 patterns, and we test contrast in both light and dark themes
        against the AA thresholds.
      </p>
      <h2>What works today</h2>
      <ul>
        <li>Full keyboard navigation of the editor, including section reordering via labelled buttons.</li>
        <li>Form fields keep programmatic labels even where the visual label is hidden.</li>
        <li>Light and dark themes both maintain AA contrast; the theme follows your system setting
          and can be overridden.</li>
        <li>Touch targets on mobile meet the 44px minimum.</li>
      </ul>
      <h2>Known gaps</h2>
      <ul>
        <li>The live resume preview is a visual rendering; the equivalent content is available in
          the editor fields themselves.</li>
        <li>Exported PDFs are visually formatted documents and are not tagged PDFs yet.</li>
      </ul>
      <h2>Found a barrier?</h2>
      <p>
        Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the page and what
        happened. Accessibility reports go to the front of the queue.
      </p>
    </main>
  );
}
