import { Suspense } from 'react';
import AuthGate from '@/src/components/AuthGate';
import JobsTrackerClient from './JobsTrackerClient';

export const dynamic = 'force-dynamic';

export default function JobsPage() {
  return (
    <AuthGate>
      <Suspense fallback={<div className="card">Loading Job Tracker...</div>}>
        <JobsTrackerClient />
      </Suspense>
    </AuthGate>
  );
}
