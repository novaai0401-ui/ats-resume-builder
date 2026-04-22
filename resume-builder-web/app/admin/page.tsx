'use client';

import AuthGate from '@/src/components/AuthGate';
import AdminDashboardView from './AdminDashboardView';

export default function AdminHomePage() {
  return (
    <AuthGate>
      <AdminDashboardView />
    </AuthGate>
  );
}
