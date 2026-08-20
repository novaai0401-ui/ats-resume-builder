'use client';

import { getSampleResumeForIndustry } from '@/src/lib/sample-resume-data';
import { TemplatePreview, type TemplateId } from '@/src/components/TemplatePreview';
import { TEMPLATE_PAGE_HEIGHT, TEMPLATE_PAGE_WIDTH, TemplatePreviewFrame } from '@/src/components/TemplatePreviewFrame';

/**
 * A template rendered with sample data for PUBLIC pages — no account, no
 * fetch, no auth. External critique (correctly) flagged that we promise 33
 * templates while the SEO landing pages showed only descriptions: a visitor
 * could not SEE a template before signing up. This closes that gap with the
 * same render pipeline the app uses, so the public preview is the real
 * template, not a screenshot that drifts.
 *
 * Client component, but Next SSRs its initial HTML, so crawlers and
 * first-paint both get the full rendered resume.
 */
export default function PublicTemplatePreview({
  templateId,
  industryId,
  mode = 'thumbnail',
}: {
  templateId: string;
  /** Picks the sample resume whose content suits the field; IT sample otherwise. */
  industryId?: string;
  mode?: 'full' | 'thumbnail';
}) {
  const sample = getSampleResumeForIndustry(industryId);
  return (
    <div data-testid="public-template-preview" data-template-id={templateId}>
      <TemplatePreviewFrame mode={mode} pageWidth={TEMPLATE_PAGE_WIDTH} pageHeight={TEMPLATE_PAGE_HEIGHT}>
        <TemplatePreview templateId={templateId as TemplateId} resume={sample} />
      </TemplatePreviewFrame>
    </div>
  );
}
