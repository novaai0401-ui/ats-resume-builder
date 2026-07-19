import type { Metadata } from 'next';
import { Suspense } from 'react';
import TemplatePreviewPageClient from './TemplatePreviewPageClient';

export const dynamic = 'force-dynamic';

// PUBLIC page — intentionally not auth-walled. The template gallery is the #1 pre-signup
// conversion asset: logged-out visitors browse every template rendered with
// sample data; signed-in users with a selected resume get their own preview.
export const metadata: Metadata = {
  title: 'Resume Templates — ATS-Safe Designs | CallbackCV',
  description:
    'Browse every ATS-safe resume template with a live sample preview. Pick a design and start your resume free.',
};

export default function TemplatesPreviewPage() {
  return (
    <Suspense fallback={<div className="card">Loading template preview...</div>}>
      <TemplatePreviewPageClient />
    </Suspense>
  );
}
