import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import VersionsClient from './VersionsClient';

export const dynamic = 'force-dynamic';

export default function ResumeVersionsPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="card">Loading version history…</div>}>
        <VersionsClient />
      </Suspense>
    </AuthGate>
  );
}
