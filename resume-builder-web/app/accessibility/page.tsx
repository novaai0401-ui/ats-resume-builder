import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '@/src/lib/support';
import {
  TrustCard,
  TrustChecklist,
  TrustCta,
  TrustGrid,
  TrustHero,
  TrustPageShell,
} from '@/src/components/TrustPage';

export const metadata: Metadata = {
  title: 'Accessibility — CallbackCV',
  description:
    'CallbackCV accessibility statement: WCAG 2.1 AA target, what works today, known gaps, and how to report a barrier.',
  alternates: { canonical: '/accessibility' },
};

/**
 * Accessibility statement — premium treatment, same honest content: the target,
 * what genuinely works, and the KNOWN GAPS. A statement claiming perfection is
 * the one thing screen-reader users distrust on sight.
 */
export default function AccessibilityPage() {
  return (
    <TrustPageShell>
      <TrustHero eyebrow="Accessibility" title="Built for" accent="every job seeker">
        CallbackCV targets <strong>WCAG 2.1 AA</strong>. The interface is built on tekivex-ui
        (WAI-ARIA 1.2 patterns), and we measure contrast in both light and dark themes against the
        AA thresholds — not just eyeball it.
      </TrustHero>

      <TrustGrid>
        <TrustCard icon="✓" title="What works today">
          <TrustChecklist
            items={[
              { ok: true, text: 'Full keyboard navigation of the editor, including section reordering via labelled buttons.' },
              { ok: true, text: 'Form fields keep programmatic labels even where the visual label is hidden.' },
              { ok: true, text: 'Light and dark themes both hold AA contrast; theme follows your system and can be overridden.' },
              { ok: true, text: 'Touch targets on mobile meet the 44px minimum.' },
            ]}
          />
        </TrustCard>

        <TrustCard icon="◔" title="Known gaps — stated honestly">
          <TrustChecklist
            items={[
              { ok: false, text: 'The live resume preview is a visual rendering; the equivalent content is always available in the editor fields themselves.' },
              { ok: false, text: 'Exported PDFs are visually formatted documents and are not tagged PDFs yet.' },
            ]}
          />
          <p style={{ marginTop: 12 }}>
            We publish these rather than claim perfection — if either blocks you, the editor and
            your data remain fully usable without them.
          </p>
        </TrustCard>

        <TrustCta>
          <p><strong>Found a barrier?</strong></p>
          <p>
            Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the page and what
            happened. Accessibility reports go to the front of the queue.
          </p>
        </TrustCta>
      </TrustGrid>
    </TrustPageShell>
  );
}
