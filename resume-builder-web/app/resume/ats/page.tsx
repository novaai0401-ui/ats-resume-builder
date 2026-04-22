import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import ResumeAtsClient from './ResumeAtsClient';

export const dynamic = 'force-dynamic';

export default function ResumeAtsPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="card">Loading ATS view...</div>}>
        <ResumeAtsClient />
      </Suspense>
    </AuthGate>
  );
}
