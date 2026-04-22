import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import TemplatePreviewPageClient from './TemplatePreviewPageClient';

export const dynamic = 'force-dynamic';

export default function TemplatesPreviewPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="card">Loading template preview...</div>}>
        <TemplatePreviewPageClient />
      </Suspense>
    </AuthGate>
  );
}
