'use client';

import AuthGate from '@/src/components/AuthGate';
import AtsSimulateView from './AtsSimulateView';

export default function AtsSimulatePage() {
  return (
    <AuthGate>
      <AtsSimulateView />
    </AuthGate>
  );
}
