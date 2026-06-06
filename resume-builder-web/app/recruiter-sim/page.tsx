'use client';

import AuthGate from '@/src/components/AuthGate';
import RecruiterSimClient from './RecruiterSimClient';

export default function RecruiterSimPage() {
  return (
    <AuthGate>
      <RecruiterSimClient />
    </AuthGate>
  );
}
