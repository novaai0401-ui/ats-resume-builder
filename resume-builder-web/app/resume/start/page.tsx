import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import ResumeStartClient from './ResumeStartClient';

export const dynamic = 'force-dynamic';

export default function ResumeStartPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="card">Loading resume start...</div>}>
        <ResumeStartClient />
      </Suspense>
    </AuthGate>
  );
}
