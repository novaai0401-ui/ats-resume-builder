'use client';

import AuthGate from '@/src/components/AuthGate';
import DashboardPageView from './DashboardPageView';

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardPageView />
    </AuthGate>
  );
}
