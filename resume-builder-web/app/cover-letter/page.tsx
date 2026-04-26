import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import CoverLetterClient from './CoverLetterClient';

export const dynamic = 'force-dynamic';

export default function CoverLetterPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="card">Loading Cover Letter Studio...</div>}>
        <CoverLetterClient />
      </Suspense>
    </AuthGate>
  );
}
