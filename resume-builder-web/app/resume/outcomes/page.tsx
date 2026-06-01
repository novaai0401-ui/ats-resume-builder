'use client';

import AuthGate from '@/src/components/AuthGate';
import OutcomesView from './OutcomesView';

export default function OutcomesPage() {
  return (
    <AuthGate>
      <OutcomesView />
    </AuthGate>
  );
}
